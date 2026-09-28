'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calculatePackaging, round2 } from './balance';
import { nextBatchId, nextInput, nextLotId, pendingStations } from './derive';
import { seedState, type State } from './seed';
import { stationById } from './stations';
import type {
  Batch, Container, ContainerUse, Destination, Ingredient, Lot, LotCategory, OutputKind, PackSize, Product, RecipeIngredient, RecordedOutput,
  Route, StationId, StationRecord, Supplier, Thresholds, User, BusinessDetails,
} from './types';

const STORAGE_KEY = 'cocoa-production-v1';
const SESSION_KEY = 'cocoa-session';
/** Last time someone used this device; a fresh sign-in resets it so the idle check starts over */
export const ACTIVE_KEY = 'cocoa-last-active';

/** One weighed output and where it goes, saved together in a single step */
export interface OutputEntry { name: string; kind: OutputKind; weight: number; destination: Destination; container?: ContainerUse }

/** Optional controls used when a process is recorded from the batch view. */
export interface RecordOptions {
  /** Keep the batch's normal next station unchanged for an out-of-order entry. */
  advanceWorkflow?: boolean;
  /** Explicit material label for an independently entered process. */
  inputMaterial?: string;
}

export interface NewBatchInput {
  productId: string;
  name?: string;
  /** Calendar date on which the batch was started; defaults to today for older callers. */
  batchDate?: string;
  startWeight: number;
  /** Supplier of the delivered beans, for traceability on labels */
  supplierId?: string;
  lotUses: { lotId: string; quantity: number }[];
  recipeVersion?: number;
  ingredients?: Ingredient[];
  note?: string;
}

export interface NewLotInput {
  material: string;
  category: LotCategory;
  quantity: number;
  unit: 'kg' | 'units';
  supplierId: string;
  reference?: string;
}

interface Actions {
  createBatch: (input: NewBatchInput) => string;
  /** Saves a station's input, weights and destinations at once, creates lots and moves the batch on */
  saveRecord: (batchId: string, station: StationId, input: { weight: number; container?: ContainerUse }, outputs: OutputEntry[], note?: string, options?: RecordOptions) => void;
  savePackaging: (batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note?: string, options?: RecordOptions) => void;
  completeBatch: (batchId: string, note?: string) => void;
  updateBatchDetails: (batchId: string, patch: { name?: string; note?: string }) => void;
  deleteBatch: (batchId: string) => void;
  placeHold: (batchId: string, reason: string) => void;
  releaseHold: (batchId: string, note: string) => void;
  addCorrection: (batchId: string, recordId: string, output: string, corrected: number, reason: string) => void;
  receiveLot: (input: NewLotInput) => string;
  updateLot: (lotId: string, patch: { material: string; category: LotCategory; supplierId?: string; reference?: string }) => void;
  deleteLot: (lotId: string) => void;
  addRecipeVersion: (recipeId: string, ingredients: RecipeIngredient[], note: string) => void;
  updateRecipe: (recipeId: string, patch: { name: string }) => void;
  deleteRecipe: (recipeId: string) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (productId: string, patch: Omit<Product, 'id'>) => void;
  deleteProduct: (productId: string) => void;
  addPackSize: (pack: Omit<PackSize, 'id'>) => void;
  updatePackSize: (packSizeId: string, patch: Omit<PackSize, 'id'>) => void;
  deletePackSize: (packSizeId: string) => void;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateSupplier: (supplierId: string, patch: Omit<Supplier, 'id'>) => void;
  deleteSupplier: (supplierId: string) => void;
  addUser: (user: Omit<User, 'id' | 'initials'>) => void;
  /** Returns false when the change would leave nobody with manager access */
  updateUser: (userId: string, patch: Omit<User, 'id' | 'initials'>) => boolean;
  deleteUser: (userId: string) => void;
  updateRoute: (routeId: string, patch: Pick<Route, 'name' | 'startMaterial' | 'note'>) => void;
  deleteRoute: (routeId: string) => void;
  setCurrentUser: (id: string) => void;
  setBusinessDetails: (patch: Partial<BusinessDetails>) => void;
  setThresholds: (patch: Partial<Thresholds>) => void;
  setStationVariance: (station: StationId, value: number) => void;
  addOutputCategory: (station: StationId, name: string, kind: OutputKind) => void;
  updateOutputCategory: (index: number, patch: { station: StationId; name: string; kind: OutputKind }) => void;
  deleteOutputCategory: (index: number) => void;
  /** Signs in with a staff email and password; returns false when they do not match */
  signIn: (email: string, password: string) => boolean;
  /** Quick sign-in on a shared device: pick your name, enter your PIN */
  signInWithPin: (userId: string, pin: string) => boolean;
  addContainer: (container: Omit<Container, 'id'>) => void;
  updateContainer: (containerId: string, patch: Omit<Container, 'id'>) => void;
  deleteContainer: (containerId: string) => void;
  setIdleMinutes: (minutes: number) => void;
  signOut: () => void;
}

interface Session { sessionUserId: string | null }

const StoreContext = createContext<(State & Actions & Session & { hydrated: boolean }) | null>(null);

const now = () => new Date().toISOString().slice(0, 19);

/** Upgrades data saved by earlier versions of the app (e.g. users saved before login existed). */
function migrate(stored: State): State {
  const seed = seedState();
  const users = (stored.users ?? seed.users).map((u): User => {
    const fromSeed = seed.users.find((s) => s.id === u.id);
    return {
      ...u,
      email: u.email || fromSeed?.email || `${u.name.toLowerCase().replace(/[^a-z]+/g, '.')}@cocoafactory.example`,
      password: u.password || fromSeed?.password || 'cocoa123',
      // Accounts saved before quick sign-in and roles existed keep full access until a manager changes them.
      pin: u.pin || fromSeed?.pin || '1234',
      access: u.access ?? fromSeed?.access ?? 'manager',
      stations: u.stations ?? fromSeed?.stations ?? [],
    };
  });
  const business = { ...seed.business, ...(stored.business ?? {}) };
  if (business.name === 'Cocoa Factory') business.name = seed.business.name;
  const { paperCatalog: _legacyPaperCatalog, ...storedWithoutLegacyCatalog } = stored as State & { paperCatalog?: unknown };
  // The line was reorganised (sorting, butter & powder, liquor). Built-in output rows and route
  // station lists follow the new stations once; rows a user added themselves are kept.
  const upgradeWorkflow = (stored.workflowVersion ?? 1) < seed.workflowVersion;
  const outputCategories = upgradeWorkflow
    ? [...seed.outputCategories, ...(stored.outputCategories ?? []).filter((c) => c.custom && c.station in seed.thresholds.variancePct)]
    : stored.outputCategories ?? seed.outputCategories;
  const routes = upgradeWorkflow
    ? [...seed.routes, ...(stored.routes ?? []).filter((r) => !seed.routes.some((seedRoute) => seedRoute.id === r.id))]
    : stored.routes ?? seed.routes;
  return {
    ...seed,
    ...storedWithoutLegacyCatalog,
    workflowVersion: seed.workflowVersion,
    outputCategories,
    routes,
    thresholds: { ...seed.thresholds, ...(stored.thresholds ?? {}), variancePct: { ...seed.thresholds.variancePct, ...(stored.thresholds?.variancePct ?? {}) } },
    users,
    business,
    // Keep user-created entries while adding any new seed entries to an older browser profile.
    products: [...seed.products, ...(stored.products ?? []).filter((item) => !['P-34', 'P-50', 'P-56', 'P-100'].includes(item.id) && !seed.products.some((seedItem) => seedItem.id === item.id))],
    packSizes: [...seed.packSizes, ...(stored.packSizes ?? []).filter((item) => !seed.packSizes.some((seedItem) => seedItem.id === item.id) && !['PK-100', 'PK-250'].includes(item.id))],
  };
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Puts a finished station record on its batch: creates a lot for every output stored, kept for sale
 * or sent to rework, and moves the batch to the first station with material waiting. Re-saving a
 * station keeps the lot IDs it created before, so printed labels stay valid.
 */
function commitRecord(s: State, batchId: string, draft: StationRecord, options?: RecordOptions): State {
  const batch = s.batches.find((b) => b.id === batchId);
  if (!batch) return s;
  const stamp = now();
  const previous = batch.records.find((r) => r.station === draft.station);
  const fromThisStation = (l: Lot) => l.source.type === 'batch' && l.source.batchId === batchId && l.source.station === draft.station;
  const kept = s.lots.filter((l) => !fromThisStation(l));
  const made: Lot[] = [];
  const outputs = draft.outputs.map((o): RecordedOutput => {
    if (o.destination !== 'stock' && o.destination !== 'sale' && o.destination !== 'rework') return { ...o, lotId: undefined };
    const isUnits = draft.station === 'packaging' && o.name === 'Accepted units';
    const quantity = isUnits ? draft.packaging!.acceptedUnits : o.weight;
    const category: LotCategory = o.destination === 'rework' ? 'Rework' : isUnits || o.destination === 'sale' ? 'Finished goods' : o.kind === 'byproduct' ? 'By-product' : 'Intermediate';
    const material = isUnits ? `${batch.product} · ${s.packSizes.find((p) => p.id === draft.packaging!.packSizeId)?.name ?? ''}` : o.name;
    const earlier = s.lots.find((l) => fromThisStation(l) && l.id === previous?.outputs.find((e) => e.name === o.name)?.lotId);
    if (earlier) {
      const used = round2(earlier.received - earlier.available);
      made.push({ ...earlier, material, category, received: quantity, available: Math.max(0, round2(quantity - used)) });
      return { ...o, lotId: earlier.id };
    }
    const id = nextLotId({ ...s, lots: [...kept, ...made] }, o.name);
    made.push({ id, material, category, received: quantity, available: quantity, unit: isUnits ? 'units' : 'kg', source: { type: 'batch', batchId, station: draft.station }, receivedAt: stamp, uses: [] });
    return { ...o, lotId: id };
  });
  const record: StationRecord = { ...draft, outputs, destinationsSaved: true };
  const records = previous ? batch.records.map((r) => (r.station === record.station ? record : r)) : [...batch.records, record];
  const updated = { ...batch, records };
  const next = options?.advanceWorkflow === false ? updated : { ...updated, nextStation: pendingStations(updated)[0] ?? ('completion' as StationId) };
  return { ...s, batches: s.batches.map((b) => (b.id === batchId ? next : b)), lots: [...kept, ...made] };
}

/** Suggested destination for an output: the row's own default, else by kind */
export function defaultDestination(station: StationId, name: string, kind: OutputKind, index: number): Destination {
  const suggested = stationById[station].rows.find((row) => row.name === name)?.to;
  if (suggested) return suggested;
  const next = stationById[station].next[0];
  if (kind === 'waste') return 'waste';
  if (kind === 'byproduct') return 'stock';
  return index === 0 && next ? `continue:${next}` : 'stock';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seedState);
  // Latest state for actions that must return an ID straight away (the batch page opens it next).
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(migrate(JSON.parse(raw) as State));
      setSessionUserId(window.localStorage.getItem(SESSION_KEY));
    } catch { /* keep sample data */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state, hydrated]);

  const updateBatch = useCallback((id: string, fn: (b: Batch, s: State) => Batch, extra?: (s: State, b: Batch) => Partial<State>) => {
    setState((s) => {
      const batch = s.batches.find((b) => b.id === id);
      if (!batch) return s;
      const next = fn(batch, s);
      const merged = { ...s, batches: s.batches.map((b) => (b.id === id ? next : b)) };
      return extra ? { ...merged, ...extra(merged, next) } : merged;
    });
  }, []);

  const actions: Actions = useMemo(() => ({
    createBatch(input) {
      const product = stateRef.current.products.find((p) => p.id === input.productId);
      if (!product) return '';
      const id = nextBatchId(stateRef.current, product.prefix);
      setState((s) => {
        const route = s.routes.find((r) => r.id === product.route)!;
        if (s.batches.some((b) => b.id === id)) return s;
        const stamp = /^\d{4}-\d{2}-\d{2}$/.test(input.batchDate ?? '') ? `${input.batchDate}T12:00:00` : now();
        const batch: Batch = {
          id, name: input.name?.trim() || undefined, productId: product.id, product: product.name, route: route.id, startedAt: stamp, status: 'active',
          nextStation: route.stations[0],
          startInput: { material: route.startMaterial, weight: round2(input.startWeight), lotIds: input.lotUses.map((u) => u.lotId) },
          supplierId: input.supplierId || undefined,
          recipeId: product.recipeId, recipeVersion: input.recipeVersion, ingredients: input.ingredients,
          records: [], holds: [], corrections: [], note: input.note,
        };
        const lots = s.lots.map((lot) => {
          const use = input.lotUses.find((u) => u.lotId === lot.id && u.quantity > 0);
          if (!use) return lot;
          // The scale weight is recorded as-is; a lot record can only be drawn down to zero.
          return { ...lot, available: Math.max(0, round2(lot.available - use.quantity)), uses: [...lot.uses, { batchId: id, quantity: use.quantity, station: route.stations[0], at: stamp }] };
        });
        return { ...s, batches: [...s.batches, batch], lots };
      });
      return id;
    },

    saveRecord(batchId, station, input, outputs, note, options) {
      setState((s) => {
        const b = s.batches.find((item) => item.id === batchId);
        if (!b) return s;
        const existing = b.records.find((r) => r.station === station);
        const carried = nextInput(b, station);
        const draft: StationRecord = {
          id: existing?.id ?? `${station}-${now()}`, station,
          inputMaterial: existing?.inputMaterial ?? options?.inputMaterial ?? (carried.weight > 0 ? carried.material : stationById[station].input),
          inputWeight: round2(input.weight), inputContainer: input.container,
          inputLotIds: existing?.inputLotIds ?? (options?.inputMaterial ? [] : b.records.length ? [] : b.startInput.lotIds),
          outputs: outputs.filter((o) => o.weight > 0).map((o) => ({ name: o.name, kind: o.kind, weight: round2(o.weight), destination: o.destination, container: o.container })),
          recordedAt: now(), recordedBy: stateRef.current.currentUserId, note, destinationsSaved: true,
        };
        return commitRecord(s, batchId, draft, options);
      });
    },

    savePackaging(batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note, options) {
      setState((s) => {
        const b = s.batches.find((item) => item.id === batchId);
        const pack = s.packSizes.find((p) => p.id === packSizeId);
        if (!b || !pack) return s;
        const { acceptedUnits, acceptedWeight } = calculatePackaging(totalUnits, rejectedUnits, pack.grams);
        const existing = b.records.find((r) => r.station === 'packaging');
        const outputs: RecordedOutput[] = [
          { name: 'Accepted units', kind: 'useful' as const, weight: acceptedWeight, destination: 'stock' as const },
          { name: 'Rejected units', kind: 'waste' as const, weight: round2((rejectedUnits * pack.grams) / 1000), destination: 'waste' as const },
        ].filter((o) => o.weight > 0 || o.name === 'Accepted units');
        const draft: StationRecord = {
          id: existing?.id ?? `packaging-${now()}`, station: 'packaging', inputMaterial: existing?.inputMaterial ?? options?.inputMaterial ?? 'Finished chocolate', inputWeight: round2(inputWeight), inputLotIds: [],
          outputs, packaging: { packSizeId, packGrams: pack.grams, totalUnits, rejectedUnits, acceptedUnits, acceptedWeight },
          recordedAt: now(), recordedBy: stateRef.current.currentUserId, note, destinationsSaved: true,
        };
        return commitRecord(s, batchId, draft, options);
      });
    },

    completeBatch(batchId, note) {
      updateBatch(batchId, (b) => ({ ...b, status: 'completed', nextStation: null, completedAt: now(), note: note || b.note }));
    },

    updateBatchDetails(batchId, patch) {
      updateBatch(batchId, (b) => ({
        ...b,
        name: patch.name?.trim() || undefined,
        note: patch.note?.trim() || undefined,
      }));
    },

    deleteBatch(batchId) {
      setState((s) => {
        const batch = s.batches.find((b) => b.id === batchId);
        // A batch with production history is an audit record. A blank batch can be removed,
        // including returning any starting lot quantities that it reserved.
        if (!batch || batch.records.length || batch.holds.length || batch.corrections.length || s.lots.some((l) => l.source.type === 'batch' && l.source.batchId === batchId)) return s;
        const lots = s.lots.map((lot) => {
          const uses = lot.uses.filter((use) => use.batchId !== batchId);
          const returned = lot.uses.filter((use) => use.batchId === batchId).reduce((sum, use) => sum + use.quantity, 0);
          return uses.length === lot.uses.length ? lot : { ...lot, available: round2(lot.available + returned), uses };
        });
        return { ...s, batches: s.batches.filter((b) => b.id !== batchId), lots };
      });
    },

    placeHold(batchId, reason) {
      updateBatch(batchId, (b) => ({ ...b, status: 'hold', holds: [...b.holds, { id: `h-${Date.now()}`, reason, placedAt: now(), placedBy: state.currentUserId, station: b.nextStation }] }));
    },

    releaseHold(batchId, note) {
      updateBatch(batchId, (b) => ({ ...b, status: 'active', holds: b.holds.map((h) => (h.releasedAt ? h : { ...h, releasedAt: now(), releaseNote: note })) }));
    },

    addCorrection(batchId, recordId, output, corrected, reason) {
      updateBatch(batchId, (b) => {
        const record = b.records.find((r) => r.id === recordId);
        const target = record?.outputs.find((o) => o.name === output);
        if (!record || !target) return b;
        const records = b.records.map((r) => (r.id === recordId ? { ...r, outputs: r.outputs.map((o) => (o.name === output ? { ...o, weight: round2(corrected) } : o)) } : r));
        const correction = { id: `c-${Date.now()}`, recordId, station: record.station, output, previous: target.weight, corrected: round2(corrected), reason, correctedAt: now(), correctedBy: state.currentUserId };
        return { ...b, records, corrections: [...b.corrections, correction] };
      }, (s, batch) => {
        const target = batch.records.find((r) => r.id === recordId)?.outputs.find((o) => o.name === output);
        if (!target?.lotId) return {};
        const delta = round2(corrected - (batch.corrections.at(-1)?.previous ?? corrected));
        return { lots: s.lots.map((l) => (l.id === target.lotId ? { ...l, received: round2(l.received + delta), available: round2(l.available + delta) } : l)) };
      });
    },

    receiveLot(input) {
      let id = '';
      setState((s) => {
        id = nextLotId(s, input.material);
        const lot: Lot = { id, material: input.material, category: input.category, received: round2(input.quantity), available: round2(input.quantity), unit: input.unit, source: { type: 'supplier', supplierId: input.supplierId, reference: input.reference }, receivedAt: now(), uses: [] };
        return { ...s, lots: [...s.lots, lot] };
      });
      return id;
    },

    updateLot(lotId, patch) {
      setState((s) => ({
        ...s,
        lots: s.lots.map((lot) => {
          if (lot.id !== lotId || lot.source.type !== 'supplier') return lot;
          return {
            ...lot,
            material: patch.material.trim() || lot.material,
            category: patch.category,
            source: {
              ...lot.source,
              supplierId: patch.supplierId || lot.source.supplierId,
              reference: patch.reference?.trim() || undefined,
            },
          };
        }),
      }));
    },

    deleteLot(lotId) {
      setState((s) => {
        const lot = s.lots.find((item) => item.id === lotId);
        const referenced = s.batches.some((batch) => batch.startInput.lotIds.includes(lotId) || batch.records.some((record) => record.inputLotIds.includes(lotId) || record.outputs.some((output) => output.lotId === lotId)));
        if (!lot || lot.source.type !== 'supplier' || lot.uses.length || lot.available !== lot.received || referenced) return s;
        return { ...s, lots: s.lots.filter((item) => item.id !== lotId) };
      });
    },

    addRecipeVersion(recipeId, ingredients, note) {
      setState((s) => ({
        ...s,
        recipes: s.recipes.map((r) => {
          if (r.id !== recipeId) return r;
          const version = r.versions.length + 1;
          return { ...r, currentVersion: version, versions: [...r.versions, { version, createdAt: now(), ingredients, note }] };
        }),
      }));
    },
    updateRecipe(recipeId, patch) {
      setState((s) => ({ ...s, recipes: s.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, name: patch.name.trim() || recipe.name } : recipe) }));
    },
    deleteRecipe(recipeId) {
      setState((s) => {
        if (s.batches.some((batch) => batch.recipeId === recipeId)) return s;
        return {
          ...s,
          recipes: s.recipes.filter((recipe) => recipe.id !== recipeId),
          // Keep the product as a pending product; it must be configured with a recipe before batching.
          products: s.products.map((product) => product.recipeId === recipeId ? { ...product, recipeId: undefined } : product),
        };
      });
    },

    addProduct(product) { setState((s) => ({ ...s, products: [...s.products, { ...product, id: `P-${slug(product.name).toUpperCase()}` }] })); },
    updateProduct(productId, patch) { setState((s) => ({ ...s, products: s.products.map((product) => (product.id === productId ? { ...patch, id: productId } : product)) })); },
    deleteProduct(productId) {
      setState((s) => {
        if (s.batches.some((batch) => batch.productId === productId) || s.recipes.some((recipe) => recipe.productId === productId)) return s;
        return { ...s, products: s.products.filter((product) => product.id !== productId) };
      });
    },
    addPackSize(pack) { setState((s) => ({ ...s, packSizes: [...s.packSizes, { ...pack, id: `PK-${pack.grams}-${s.packSizes.length}` }] })); },
    updatePackSize(packSizeId, patch) { setState((s) => ({ ...s, packSizes: s.packSizes.map((pack) => (pack.id === packSizeId ? { ...patch, id: packSizeId } : pack)) })); },
    deletePackSize(packSizeId) {
      setState((s) => {
        if (s.batches.some((batch) => batch.records.some((record) => record.packaging?.packSizeId === packSizeId))) return s;
        return { ...s, packSizes: s.packSizes.filter((pack) => pack.id !== packSizeId) };
      });
    },
    addSupplier(supplier) { setState((s) => ({ ...s, suppliers: [...s.suppliers, { ...supplier, id: `S-${slug(supplier.name).toUpperCase()}` }] })); },
    updateSupplier(supplierId, patch) { setState((s) => ({ ...s, suppliers: s.suppliers.map((supplier) => (supplier.id === supplierId ? { ...patch, id: supplierId } : supplier)) })); },
    deleteSupplier(supplierId) {
      setState((s) => {
        if (s.lots.some((lot) => lot.source.type === 'supplier' && lot.source.supplierId === supplierId)) return s;
        return { ...s, suppliers: s.suppliers.filter((supplier) => supplier.id !== supplierId) };
      });
    },
    addUser(user) {
      setState((s) => ({ ...s, users: [...s.users, { ...user, id: `U-${Date.now()}`, initials: user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }] }));
    },
    updateUser(userId, patch) {
      const users = stateRef.current.users.map((user) => user.id === userId
        ? { ...patch, id: userId, initials: patch.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }
        : user);
      if (!users.some((user) => user.access === 'manager')) return false;
      setState((s) => ({ ...s, users: s.users.map((user) => users.find((u) => u.id === user.id) ?? user) }));
      return true;
    },
    deleteUser(userId) {
      setState((s) => {
        const usedInAudit = s.batches.some((batch) => batch.records.some((record) => record.recordedBy === userId) || batch.holds.some((hold) => hold.placedBy === userId) || batch.corrections.some((correction) => correction.correctedBy === userId));
        const lastManager = s.users.filter((user) => user.access === 'manager').every((user) => user.id === userId);
        if (s.currentUserId === userId || usedInAudit || lastManager) return s;
        return { ...s, users: s.users.filter((user) => user.id !== userId) };
      });
    },
    updateRoute(routeId, patch) {
      setState((s) => ({ ...s, routes: s.routes.map((route) => route.id === routeId ? { ...route, ...patch } : route) }));
    },
    deleteRoute(routeId) {
      setState((s) => {
        if (s.products.some((product) => product.route === routeId) || s.batches.some((batch) => batch.route === routeId)) return s;
        return { ...s, routes: s.routes.filter((route) => route.id !== routeId) };
      });
    },
    setCurrentUser(id) { setState((s) => ({ ...s, currentUserId: id })); },
    setBusinessDetails(patch) { setState((s) => ({ ...s, business: { ...s.business, ...patch } })); },
    setThresholds(patch) { setState((s) => ({ ...s, thresholds: { ...s.thresholds, ...patch } })); },
    setStationVariance(station, value) { setState((s) => ({ ...s, thresholds: { ...s.thresholds, variancePct: { ...s.thresholds.variancePct, [station]: value } } })); },
    addOutputCategory(station, name, kind) { setState((s) => ({ ...s, outputCategories: [...s.outputCategories, { station, name, kind, custom: true }] })); },
    updateOutputCategory(index, patch) {
      setState((s) => ({ ...s, outputCategories: s.outputCategories.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
    },
    deleteOutputCategory(index) { setState((s) => ({ ...s, outputCategories: s.outputCategories.filter((_, itemIndex) => itemIndex !== index) })); },
    signIn(email, password) {
      const wanted = email.trim().toLowerCase();
      const user = state.users.find((u) => (u.email ?? '').toLowerCase() === wanted && u.password === password);
      if (!user) return false;
      setSessionUserId(user.id);
      setState((s) => ({ ...s, currentUserId: user.id }));
      try { window.localStorage.setItem(SESSION_KEY, user.id); window.localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
      return true;
    },
    signInWithPin(userId, pin) {
      const user = state.users.find((u) => u.id === userId && u.pin === pin.trim());
      if (!user) return false;
      setSessionUserId(user.id);
      setState((s) => ({ ...s, currentUserId: user.id }));
      try { window.localStorage.setItem(SESSION_KEY, user.id); window.localStorage.setItem(ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
      return true;
    },
    addContainer(container) { setState((s) => ({ ...s, containers: [...s.containers, { ...container, id: `C-${Date.now()}` }] })); },
    updateContainer(containerId, patch) { setState((s) => ({ ...s, containers: s.containers.map((c) => (c.id === containerId ? { ...patch, id: containerId } : c)) })); },
    // Records keep their own copy of the container name and tare, so removing one never changes history.
    deleteContainer(containerId) { setState((s) => ({ ...s, containers: s.containers.filter((c) => c.id !== containerId) })); },
    setIdleMinutes(minutes) { setState((s) => ({ ...s, idleMinutes: Math.max(0, Math.round(minutes)) })); },
    signOut() {
      setSessionUserId(null);
      try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    },
  }), [updateBatch, state.currentUserId, state.users]);

  const value = useMemo(() => ({ ...state, ...actions, sessionUserId, hydrated }), [state, actions, sessionUserId, hydrated]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
