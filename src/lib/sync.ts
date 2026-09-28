import type { State } from './seed';

/** Lists stored item by item, each with its own ID */
export const collections = ['batches', 'lots', 'recipes', 'products', 'routes', 'packSizes', 'suppliers', 'users', 'outputCategories', 'containers'] as const;
/** Single values stored under the "settings" kind */
export const settings = ['thresholds', 'business', 'idleMinutes', 'workflowVersion', 'idCounters'] as const;

export type CollectionName = (typeof collections)[number];
export type SettingName = (typeof settings)[number];

/** One stored item as it travels between server and browser; data null means it was removed */
export interface Item { kind: CollectionName | 'settings'; id: string; data: unknown }

/** What /api/sync and /api/commands answer: either the whole state or the items changed since a version */
export interface SyncPayload { version: number; full?: State; items?: Item[] }

type WithId = { id: string };

export function emptyState(): State {
  return {
    batches: [], lots: [], recipes: [], products: [], routes: [], packSizes: [], suppliers: [], users: [], outputCategories: [], containers: [],
    thresholds: { variancePct: {} as State['thresholds']['variancePct'], wastePct: 5, lowStockKg: 50 },
    business: { name: '', address: '', phone: '', email: '' }, idleMinutes: 10, workflowVersion: 0, idCounters: { batches: {}, lots: {} },
  };
}

/**
 * Items that differ between two states. Changes are made immutably, so an unchanged item keeps the
 * same object and comparing references finds exactly what a command touched.
 */
export function diffState(before: State, after: State): Item[] {
  const changes: Item[] = [];
  for (const kind of collections) {
    const previous = new Map((before[kind] as WithId[]).map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const item of after[kind] as WithId[]) {
      seen.add(item.id);
      if (previous.get(item.id) !== item) changes.push({ kind, id: item.id, data: item });
    }
    for (const id of previous.keys()) if (!seen.has(id)) changes.push({ kind, id, data: null });
  }
  for (const key of settings) if (before[key] !== after[key]) changes.push({ kind: 'settings', id: key, data: after[key] });
  return changes;
}

/** Applies changed items to a state, keeping list order: changed items stay in place, new ones go last */
export function applyItems(state: State, items: Item[]): State {
  if (items.length === 0) return state;
  const next = { ...state } as State;
  const touched = new Map<CollectionName, Map<string, unknown>>();
  for (const item of items) {
    if (item.kind === 'settings') {
      if ((settings as readonly string[]).includes(item.id)) (next as unknown as Record<string, unknown>)[item.id] = item.data;
      continue;
    }
    if (!touched.has(item.kind)) touched.set(item.kind, new Map());
    touched.get(item.kind)!.set(item.id, item.data);
  }
  for (const [kind, changed] of touched) {
    const list = (state[kind] as WithId[]).filter((item) => !changed.has(item.id) || changed.get(item.id) !== null)
      .map((item) => (changed.has(item.id) ? (changed.get(item.id) as WithId) : item));
    const present = new Set(list.map((item) => item.id));
    for (const [id, data] of changed) if (data !== null && !present.has(id)) list.push(data as WithId);
    (next as unknown as Record<string, unknown>)[kind] = list;
  }
  return next;
}

/** Builds a whole state from stored items (already in their stored order) */
export function stateFromItems(items: Item[]): State {
  return applyItems(emptyState(), items);
}
