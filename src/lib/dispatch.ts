import type { State } from './seed';
import type { Dispatch, Lot } from './types';

/** The parts of the store goods are dispatched from, in the order the dispatch form offers them */
export const dispatchGroups = ['Finished pieces', 'Products for sale', 'Other stored products'] as const;
export type DispatchGroup = (typeof dispatchGroups)[number];

/** One product in store as the dispatch form offers it: all its lots with stock, oldest first */
export interface StockItem { material: string; group: DispatchGroup; unit: Lot['unit']; lots: Lot[]; total: number }

const inStock = (lot: Lot) => (lot.unit === 'units' ? lot.available >= 1 : lot.available > 0.004);

/**
 * What the factory can send out: everything it made that is in store, by product. Bought raw materials
 * stay for production. Pieces first, then what was kept for sale, then everything else the line stored.
 */
export function stockForDispatch(state: Pick<State, 'lots'>): StockItem[] {
  const groupOf = (lot: Lot): DispatchGroup => (lot.pieces ? 'Finished pieces' : lot.category === 'Finished goods' ? 'Products for sale' : 'Other stored products');
  const items = new Map<string, StockItem>();
  for (const lot of state.lots.filter((l) => l.category !== 'Raw material' && inStock(l))) {
    const item = items.get(lot.material) ?? { material: lot.material, group: groupOf(lot), unit: lot.unit, lots: [], total: 0 };
    item.lots.push(lot);
    item.total = Math.round((item.total + lot.available) * 1000) / 1000;
    items.set(lot.material, item);
  }
  for (const item of items.values()) item.lots.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  return Array.from(items.values()).sort((a, b) => dispatchGroups.indexOf(a.group) - dispatchGroups.indexOf(b.group) || a.material.localeCompare(b.material, undefined, { numeric: true }));
}

/** A quantity taken from lots oldest first, as the goods are picked; `short` is what the lots do not have */
export function takeOldestFirst(lots: Lot[], quantity: number): { lines: { lotId: string; quantity: number }[]; short: number } {
  const lines: { lotId: string; quantity: number }[] = [];
  let rest = quantity;
  for (const lot of lots) {
    if (rest <= 0.0005) break;
    const take = Math.min(rest, lot.available);
    if (take <= 0) continue;
    lines.push({ lotId: lot.id, quantity: lot.unit === 'units' ? Math.floor(take) : Math.round(take * 100) / 100 });
    rest = Math.round((rest - take) * 1000) / 1000;
  }
  return { lines, short: Math.max(0, rest) };
}

/** Dispatches that went out (not cancelled) between two dates, YYYY-MM-DD, either end open */
export const dispatchesBetween = (dispatches: Dispatch[], from?: string, to?: string) =>
  dispatches.filter((d) => !d.cancelled && (!from || d.at.slice(0, 10) >= from) && (!to || d.at.slice(0, 10) <= to));

/** What left the factory, added up by product, with the customers it went to */
export function dispatchedByProduct(dispatches: Dispatch[]) {
  const totals = new Map<string, { material: string; unit: Lot['unit']; quantity: number; dispatches: Set<string>; customers: Set<string> }>();
  for (const d of dispatches.filter((x) => !x.cancelled)) {
    for (const line of d.lines) {
      const row = totals.get(line.material) ?? { material: line.material, unit: line.unit, quantity: 0, dispatches: new Set<string>(), customers: new Set<string>() };
      row.quantity = Math.round((row.quantity + line.quantity) * 1000) / 1000;
      row.dispatches.add(d.id);
      row.customers.add(d.customerId);
      totals.set(line.material, row);
    }
  }
  return Array.from(totals.values()).sort((a, b) => (a.unit === b.unit ? 0 : a.unit === 'units' ? -1 : 1) || a.material.localeCompare(b.material, undefined, { numeric: true }));
}

/** One line summing up what a dispatch took, each product once however many lots it came from, for lists */
export function dispatchSummary(d: Dispatch) {
  const products = new Map<string, { quantity: number; unit: Lot['unit'] }>();
  for (const l of d.lines) {
    const p = products.get(l.material) ?? { quantity: 0, unit: l.unit };
    p.quantity = Math.round((p.quantity + l.quantity) * 1000) / 1000;
    products.set(l.material, p);
  }
  return Array.from(products, ([material, p]) => (p.unit === 'units' ? `${p.quantity} × ${material}` : `${p.quantity.toFixed(2)} kg ${material}`)).join(' · ');
}
