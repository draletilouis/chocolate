import { calculateBalance } from './balance';
import { stationById, stationName } from './stations';
import { routes, type State } from './seed';
import type { Alert, Batch, Lot, StationId, StationRecord } from './types';

export const recordBalance = (r: StationRecord) => calculateBalance(r.inputWeight, r.outputs);

/** Operator-facing batch label with a safe fallback for older records. */
export const batchDisplayName = (batch: Pick<Batch, 'id' | 'name'>) => batch.name?.trim() || batch.id;

export const lastRecord = (batch: Batch) => batch.records.at(-1);

/** Station the batch was last recorded at */
export const currentStation = (batch: Batch): StationId | null => lastRecord(batch)?.station ?? null;

/** Material and weight that will be the input of the batch's next station */
export function nextInput(batch: Batch): { material: string; weight: number; lotIds: string[] } {
  if (!batch.nextStation) return { material: 'No material carried forward', weight: 0, lotIds: [] };

  // Find the record that explicitly feeds the next station. This stays correct when a
  // batch has a later process entered independently from its batch view.
  const carriedFrom = batch.records.filter((r) => r.outputs.some((o) => o.destination === `continue:${batch.nextStation}`)).at(-1);
  const firstStation = routes.find((route) => route.id === batch.route)?.stations[0];
  if (!carriedFrom && (batch.records.length === 0 || firstStation === batch.nextStation)) return batch.startInput;
  const carried = carriedFrom?.outputs.filter((o) => o.destination === `continue:${batch.nextStation}`) ?? [];
  if (carried.length === 0) return { material: 'No material carried forward', weight: 0, lotIds: [] };
  return {
    material: carried.map((o) => o.name).join(' + '),
    weight: Math.round(carried.reduce((sum, o) => sum + o.weight, 0) * 100) / 100,
    lotIds: [],
  };
}

export const recordFor = (batch: Batch, station: StationId) => batch.records.find((r) => r.station === station);

export const activeBatches = (state: State) => state.batches.filter((b) => b.status !== 'completed');

/** Batches whose next step is this station (ready) and batches on hold at this station */
export function stationQueue(state: State, station: StationId) {
  const ready = state.batches.filter((b) => b.status === 'active' && b.nextStation === station);
  const held = state.batches.filter((b) => b.status === 'hold' && b.nextStation === station);
  const done = state.batches.filter((b) => b.records.some((r) => r.station === station)).sort((a, b) => (recordFor(b, station)!.recordedAt.localeCompare(recordFor(a, station)!.recordedAt)));
  return { ready, held, done };
}

export function recordAlerts(state: State, batch: Batch, record: StationRecord): Alert[] {
  const balance = recordBalance(record);
  const alerts: Alert[] = [];
  const limit = state.thresholds.variancePct[record.station];
  if (Math.abs(balance.variancePct) > limit) {
    alerts.push({ id: `${batch.id}-${record.id}-variance`, kind: 'variance', message: `${batchDisplayName(batch)} · ${stationName(record.station)}: variance ${balance.variancePct.toFixed(2)}% is above the ${limit}% limit`, href: `/production/batches/${batch.id}` });
  }
  if (balance.wastePct > state.thresholds.wastePct) {
    alerts.push({ id: `${batch.id}-${record.id}-waste`, kind: 'waste', message: `${batchDisplayName(batch)} · ${stationName(record.station)}: waste ${balance.wastePct.toFixed(2)}% is above the ${state.thresholds.wastePct}% limit`, href: `/production/batches/${batch.id}` });
  }
  return alerts;
}

export function batchAlerts(state: State, batch: Batch): Alert[] {
  const alerts = batch.records.flatMap((r) => recordAlerts(state, batch, r));
  const hold = batch.holds.find((h) => !h.releasedAt);
  if (hold) alerts.push({ id: `${batch.id}-hold`, kind: 'hold', message: `${batchDisplayName(batch)} is on hold: ${hold.reason}`, href: `/production/batches/${batch.id}` });
  return alerts;
}

export function allAlerts(state: State): Alert[] {
  const batchLevel = state.batches.filter((b) => b.status !== 'completed').flatMap((b) => batchAlerts(state, b));
  const stock = state.lots
    .filter((l) => l.category === 'Raw material' && l.unit === 'kg' && l.available < state.thresholds.lowStockKg)
    .map((l): Alert => ({ id: `${l.id}-stock`, kind: 'stock', message: `${l.material} lot ${l.id} is low: ${l.available.toFixed(2)} kg left`, href: `/materials/${l.id}` }));
  return [...batchLevel, ...stock];
}

export const lotById = (state: State, id: string): Lot | undefined => state.lots.find((l) => l.id === id);
export const batchById = (state: State, id: string): Batch | undefined => state.batches.find((b) => b.id === id);
export const userName = (state: State, id: string) => state.users.find((u) => u.id === id)?.name ?? id;
export const supplierName = (state: State, id: string) => state.suppliers.find((s) => s.id === id)?.name ?? id;

/** Plain description of the step that produced a lot */
export function lotOrigin(state: State, lot: Lot) {
  const source = lot.source;
  if (source.type === 'supplier') return `Delivered by ${supplierName(state, source.supplierId)}${source.reference ? ` · ${source.reference}` : ''}`;
  const batch = state.batches.find((b) => b.id === source.batchId);
  const label = batch ? batchDisplayName(batch) : source.batchId;
  return `Made by batch ${label}${batch?.name ? ` (ID ${batch.id})` : ''} at ${stationById[source.station].name.toLowerCase()}`;
}

export function nextBatchId(state: State, prefix: string) {
  const max = state.batches.filter((b) => b.id.startsWith(`${prefix}-`)).reduce((m, b) => Math.max(m, Number(b.id.slice(prefix.length + 1)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

const lotPrefixes: Record<string, string> = {
  'Cocoa beans': 'BEAN', 'Accepted beans': 'BEAN', 'Roasted beans': 'RST', Nibs: 'NIB', 'Whole peeled beans': 'REW', Husks: 'HUSK',
  Liquor: 'LIQ', Butter: 'BUT', 'Cocoa butter': 'BUT', Powder: 'PWD', 'Cocoa cake': 'CAKE', Sugar: 'SUG', Lecithin: 'LEC', 'Milk powder': 'MLK',
  'Machine residue': 'REW', 'Recoverable chocolate': 'REW', 'Finished chocolate': 'FIN', 'Accepted units': 'FIN', 'Rejected units': 'REJ',
};

export function nextLotId(state: State, material: string, taken: string[] = []) {
  const prefix = lotPrefixes[material] ?? (material.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'LOT');
  const ids = [...state.lots.map((l) => l.id), ...taken];
  const max = ids.filter((id) => id.startsWith(`${prefix}-`)).reduce((m, id) => Math.max(m, parseInt(id.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
