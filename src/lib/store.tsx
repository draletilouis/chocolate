'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { calculatePackaging, round2 } from './balance';
import { nextBatchId, nextLotId } from './derive';
import { seedState, type State } from './seed';
import { stationById } from './stations';
import type {
  Batch, Destination, Ingredient, Lot, LotCategory, OutputKind, PackSize, Product, RecipeIngredient, RecordedOutput,
  StationId, StationRecord, Supplier, Thresholds, User,
} from './types';

const STORAGE_KEY = 'cocoa-production-v1';
const SESSION_KEY = 'cocoa-session';

export interface MeasuredOutput { name: string; kind: OutputKind; weight: number }

export interface NewBatchInput {
  productId: string;
  name?: string;
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
  saveMeasurements: (batchId: string, station: StationId, inputWeight: number, outputs: MeasuredOutput[], note?: string) => string;
  savePackaging: (batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note?: string) => string;
  saveDestinations: (batchId: string, recordId: string, destinations: Record<string, Destination>) => void;
  completeBatch: (batchId: string, note?: string) => void;
  placeHold: (batchId: string, reason: string) => void;
  releaseHold: (batchId: string, note: string) => void;
  addCorrection: (batchId: string, recordId: string, output: string, corrected: number, reason: string) => void;
  receiveLot: (input: NewLotInput) => string;
  addRecipeVersion: (recipeId: string, ingredients: RecipeIngredient[], note: string) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  addPackSize: (pack: Omit<PackSize, 'id'>) => void;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  addUser: (user: Omit<User, 'id' | 'initials'>) => void;
  setCurrentUser: (id: string) => void;
  setThresholds: (patch: Partial<Thresholds>) => void;
  setStationVariance: (station: StationId, value: number) => void;
  addOutputCategory: (station: StationId, name: string, kind: OutputKind) => void;
  resetData: () => void;
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
  return {
    ...seed,
    ...stored,
    users,
    // Keep user-created entries, while adding new paper-derived seed entries to an older browser profile.
    products: [...seed.products, ...(stored.products ?? []).filter((item) => !seed.products.some((seedItem) => seedItem.id === item.id))],
    // The old demo seeded 100 g and 250 g packs; the supplied forms use 7 g, 45 g, 80 g, 200 g and 1 kg.
    packSizes: [...seed.packSizes, ...(stored.packSizes ?? []).filter((item) => !seed.packSizes.some((seedItem) => seedItem.id === item.id) && !['PK-100', 'PK-250'].includes(item.id))],
    paperCatalog: stored.paperCatalog ?? seed.paperCatalog,
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
        const stamp = now();
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

    saveMeasurements(batchId, station, inputWeight, outputs, note) {
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
          id: existing?.id ?? recordId, station, inputMaterial: existing?.inputMaterial ?? (b.records.length ? b.records.at(-1)!.outputs.filter((o) => o.destination === `continue:${station}`).map((o) => o.name).join(' + ') || stationById[station].input : b.startInput.material),
          inputWeight: round2(inputWeight), inputLotIds: existing?.inputLotIds ?? (b.records.length ? [] : b.startInput.lotIds),
          outputs: recorded, recordedAt: now(), recordedBy: state.currentUserId, note, destinationsSaved: false,
        };
        const records = existing ? b.records.map((r) => (r.station === station ? record : r)) : [...b.records, record];
        return { ...b, records };
      });
      return recordId;
    },

    savePackaging(batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note) {
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
          id: existing?.id ?? recordId, station: 'packaging', inputMaterial: 'Finished chocolate', inputWeight: round2(inputWeight), inputLotIds: [],
          outputs, packaging: { packSizeId, packGrams: pack.grams, totalUnits, rejectedUnits, acceptedUnits, acceptedWeight },
          recordedAt: now(), recordedBy: state.currentUserId, note, destinationsSaved: false,
        };
        return { ...b, records: existing ? b.records.map((r) => (r.station === 'packaging' ? record : r)) : [...b.records, record] };
      });
      return recordId;
    },

    saveDestinations(batchId, recordId, destinations) {
      const stamp = now();
      updateBatch(batchId, (b) => {
        const record = b.records.find((r) => r.id === recordId);
        if (!record) return b;
        const outputs = record.outputs.map((o) => ({ ...o, destination: destinations[o.name] ?? o.destination, lotId: undefined }));
        const continued = outputs.map((o) => o.destination).find((d): d is `continue:${StationId}` => d.startsWith('continue:'));
        const nextStation: StationId = continued ? (continued.slice(9) as StationId) : 'completion';
        return { ...b, nextStation, records: b.records.map((r) => (r.id === recordId ? { ...r, outputs, destinationsSaved: true } : r)) };
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

    addProduct(product) { setState((s) => ({ ...s, products: [...s.products, { ...product, id: `P-${slug(product.name).toUpperCase()}` }] })); },
    addPackSize(pack) { setState((s) => ({ ...s, packSizes: [...s.packSizes, { ...pack, id: `PK-${pack.grams}-${s.packSizes.length}` }] })); },
    addSupplier(supplier) { setState((s) => ({ ...s, suppliers: [...s.suppliers, { ...supplier, id: `S-${slug(supplier.name).toUpperCase()}` }] })); },
    addUser(user) {
      setState((s) => ({ ...s, users: [...s.users, { ...user, id: `U-${Date.now()}`, initials: user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }] }));
    },
    setCurrentUser(id) { setState((s) => ({ ...s, currentUserId: id })); },
    setThresholds(patch) { setState((s) => ({ ...s, thresholds: { ...s.thresholds, ...patch } })); },
    setStationVariance(station, value) { setState((s) => ({ ...s, thresholds: { ...s.thresholds, variancePct: { ...s.thresholds.variancePct, [station]: value } } })); },
    addOutputCategory(station, name, kind) { setState((s) => ({ ...s, outputCategories: [...s.outputCategories, { station, name, kind, custom: true }] })); },
    resetData() { setState(seedState()); },

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
