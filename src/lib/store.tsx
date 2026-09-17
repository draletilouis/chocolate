'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { calculatePackaging, round2 } from './balance';
import { nextBatchId, nextLotId } from './derive';
import { seedState, type State } from './seed';
import { stationById } from './stations';
import type {
  Batch, Destination, Ingredient, Lot, LotCategory, OutputKind, PackSize, Product, RecipeIngredient, RecordedOutput,
  Route, StationId, StationRecord, Supplier, Thresholds, User, BusinessDetails,
} from './types';

const STORAGE_KEY = 'cocoa-production-v1';
const SESSION_KEY = 'cocoa-session';

export interface MeasuredOutput { name: string; kind: OutputKind; weight: number }

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
  saveMeasurements: (batchId: string, station: StationId, inputWeight: number, outputs: MeasuredOutput[], note?: string, options?: RecordOptions) => string;
  savePackaging: (batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note?: string, options?: RecordOptions) => string;
  saveDestinations: (batchId: string, recordId: string, destinations: Record<string, Destination>, options?: RecordOptions) => void;
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
  updateUser: (userId: string, patch: Omit<User, 'id' | 'initials'>) => void;
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
  signOut: () => void;
}

interface Session { sessionUserId: string | null }

const StoreContext = createContext<(State & Actions & Session & { hydrated: boolean }) | null>(null);

const now = () => new Date().toISOString().slice(0, 19);

/** Upgrades data saved by earlier versions of the app (e.g. users saved before login existed). */
function migrate(stored: State): State {
  const seed = seedState();
  const users = (stored.users ?? seed.users).map((u) => {
    if (u.email && u.password) return u;
    const fromSeed = seed.users.find((s) => s.id === u.id);
    return {
      ...u,
      email: u.email || fromSeed?.email || `${u.name.toLowerCase().replace(/[^a-z]+/g, '.')}@cocoafactory.example`,
      password: u.password || fromSeed?.password || 'cocoa123',
    };
  });
  const business = { ...seed.business, ...(stored.business ?? {}) };
  if (business.name === 'Cocoa Factory') business.name = seed.business.name;
  const { paperCatalog: _legacyPaperCatalog, ...storedWithoutLegacyCatalog } = stored as State & { paperCatalog?: unknown };
  return {
    ...seed,
    ...storedWithoutLegacyCatalog,
    users,
    business,
    // Keep user-created entries while adding any new seed entries to an older browser profile.
    products: [...seed.products, ...(stored.products ?? []).filter((item) => !['P-34', 'P-50', 'P-56', 'P-100'].includes(item.id) && !seed.products.some((seedItem) => seedItem.id === item.id))],
    packSizes: [...seed.packSizes, ...(stored.packSizes ?? []).filter((item) => !seed.packSizes.some((seedItem) => seedItem.id === item.id) && !['PK-100', 'PK-250'].includes(item.id))],
  };
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Default destination for each output kind when a station is first saved */
function defaultDestination(station: StationId, kind: OutputKind, index: number): Destination {
  const next = stationById[station].next[0];
  if (kind === 'waste') return 'waste';
  if (kind === 'byproduct') return 'stock';
  return index === 0 && next ? `continue:${next}` : 'stock';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seedState);
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
      let id = '';
      setState((s) => {
        const product = s.products.find((p) => p.id === input.productId);
        if (!product) return s;
        const route = s.routes.find((r) => r.id === product.route)!;
        id = nextBatchId(s, product.prefix);
        const stamp = /^\d{4}-\d{2}-\d{2}$/.test(input.batchDate ?? '') ? `${input.batchDate}T12:00:00` : now();
        const batch: Batch = {
          id, name: input.name?.trim() || undefined, productId: product.id, product: product.name, route: route.id, startedAt: stamp, status: 'active',
          nextStation: route.stations[0],
          startInput: { material: route.startMaterial, weight: round2(input.startWeight), lotIds: input.lotUses.map((u) => u.lotId) },
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

    saveMeasurements(batchId, station, inputWeight, outputs, note, options) {
      const recordId = `${station}-${now()}`;
      updateBatch(batchId, (b) => {
        const existing = b.records.find((r) => r.station === station);
        const recorded: RecordedOutput[] = outputs
          .filter((o) => o.weight > 0)
          .map((o, i) => ({
            name: o.name, kind: o.kind, weight: round2(o.weight),
            destination: existing?.outputs.find((e) => e.name === o.name)?.destination ?? defaultDestination(station, o.kind, i),
          }));
        const record: StationRecord = {
          id: existing?.id ?? recordId, station, inputMaterial: existing?.inputMaterial ?? options?.inputMaterial ?? (b.records.length ? b.records.at(-1)!.outputs.filter((o) => o.destination === `continue:${station}`).map((o) => o.name).join(' + ') || stationById[station].input : b.startInput.material),
          inputWeight: round2(inputWeight), inputLotIds: existing?.inputLotIds ?? (options?.inputMaterial ? [] : b.records.length ? [] : b.startInput.lotIds),
          outputs: recorded, recordedAt: now(), recordedBy: state.currentUserId, note, destinationsSaved: false,
        };
        const records = existing ? b.records.map((r) => (r.station === station ? record : r)) : [...b.records, record];
        return { ...b, records };
      });
      return recordId;
    },

    savePackaging(batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note, options) {
      const recordId = `packaging-${now()}`;
      updateBatch(batchId, (b, s) => {
        const pack = s.packSizes.find((p) => p.id === packSizeId)!;
        const { acceptedUnits, acceptedWeight } = calculatePackaging(totalUnits, rejectedUnits, pack.grams);
        const existing = b.records.find((r) => r.station === 'packaging');
        const all: RecordedOutput[] = [
          { name: 'Accepted units', kind: 'useful', weight: acceptedWeight, destination: 'stock' },
          { name: 'Rejected units', kind: 'waste', weight: round2((rejectedUnits * pack.grams) / 1000), destination: 'waste' },
        ];
        const outputs = all.filter((o) => o.weight > 0 || o.name === 'Accepted units');
        const record: StationRecord = {
          id: existing?.id ?? recordId, station: 'packaging', inputMaterial: existing?.inputMaterial ?? options?.inputMaterial ?? 'Finished chocolate', inputWeight: round2(inputWeight), inputLotIds: [],
          outputs, packaging: { packSizeId, packGrams: pack.grams, totalUnits, rejectedUnits, acceptedUnits, acceptedWeight },
          recordedAt: now(), recordedBy: state.currentUserId, note, destinationsSaved: false,
        };
        return { ...b, records: existing ? b.records.map((r) => (r.station === 'packaging' ? record : r)) : [...b.records, record] };
      });
      return recordId;
    },

    saveDestinations(batchId, recordId, destinations, options) {
      const stamp = now();
      updateBatch(batchId, (b) => {
        const record = b.records.find((r) => r.id === recordId);
        if (!record) return b;
        const outputs = record.outputs.map((o) => ({ ...o, destination: destinations[o.name] ?? o.destination, lotId: undefined }));
        const continued = outputs.map((o) => o.destination).find((d): d is `continue:${StationId}` => d.startsWith('continue:'));
        const nextStation: StationId = continued ? (continued.slice(9) as StationId) : 'completion';
        return { ...b, ...(options?.advanceWorkflow === false ? {} : { nextStation }), records: b.records.map((r) => (r.id === recordId ? { ...r, outputs, destinationsSaved: true } : r)) };
      }, (s, batch) => {
        const record = batch.records.find((r) => r.id === recordId)!;
        // Replace lots this record created before, then create lots for outputs stored or sent to rework.
        const kept = s.lots.filter((l) => !(l.source.type === 'batch' && l.source.batchId === batchId && l.source.station === record.station));
        const created: Lot[] = [];
        const outputs = record.outputs.map((o) => {
          if (o.destination !== 'stock' && o.destination !== 'rework') return o;
          const isUnits = record.station === 'packaging' && o.name === 'Accepted units';
          const id = nextLotId({ ...s, lots: kept }, o.name, created.map((l) => l.id));
          const category: LotCategory = o.destination === 'rework' ? 'Rework' : isUnits ? 'Finished goods' : o.kind === 'byproduct' ? 'By-product' : 'Intermediate';
          const quantity = isUnits ? record.packaging!.acceptedUnits : o.weight;
          created.push({
            id, material: isUnits ? `${batch.product} · ${s.packSizes.find((p) => p.id === record.packaging!.packSizeId)?.name ?? ''}` : o.name,
            category, received: quantity, available: quantity, unit: isUnits ? 'units' : 'kg',
            source: { type: 'batch', batchId, station: record.station }, receivedAt: stamp, uses: [],
          });
          return { ...o, lotId: id };
        });
        const batches = s.batches.map((b) => (b.id === batchId ? { ...b, records: b.records.map((r) => (r.id === recordId ? { ...r, outputs } : r)) } : b));
        return { batches, lots: [...kept, ...created] };
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
      setState((s) => ({
        ...s,
        users: s.users.map((user) => user.id === userId
          ? { ...patch, id: userId, initials: patch.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }
          : user),
      }));
    },
    deleteUser(userId) {
      setState((s) => {
        const usedInAudit = s.batches.some((batch) => batch.records.some((record) => record.recordedBy === userId) || batch.holds.some((hold) => hold.placedBy === userId) || batch.corrections.some((correction) => correction.correctedBy === userId));
        if (s.currentUserId === userId || usedInAudit) return s;
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
      try { window.localStorage.setItem(SESSION_KEY, user.id); } catch { /* ignore */ }
      return true;
    },
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
