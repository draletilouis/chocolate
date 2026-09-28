import { calculateBalance } from './balance';
import { stationById, stationName, stations } from './stations';
import { routes, type State } from './seed';
import type { Alert, Batch, Lot, StationId, StationRecord } from './types';

export const recordBalance = (r: StationRecord) => calculateBalance(r.inputWeight, r.outputs);

/** Operator-facing batch label with a safe fallback for older records. */
export const batchDisplayName = (batch: Pick<Batch, 'id' | 'name'>) => batch.name?.trim() || batch.id;

export const lastRecord = (batch: Batch) => batch.records.at(-1);

/** Station the batch was last recorded at */
export const currentStation = (batch: Batch): StationId | null => lastRecord(batch)?.station ?? null;

/** Outputs from saved records that were sent on to this station of the same batch */
export const carriedTo = (batch: Batch, station: StationId) =>
  batch.records.filter((r) => r.destinationsSaved).flatMap((r) => r.outputs.filter((o) => o.destination === `continue:${station}`));

/**
 * Stations with material waiting for this batch: an output was continued there but the station
 * is not recorded yet. A split (nibs to both pressing and grinding) leaves several waiting at once.
 */
export const pendingStations = (batch: Batch): StationId[] =>
  stations.map((s) => s.id).filter((id) => id !== 'completion' && !recordFor(batch, id) && carriedTo(batch, id).length > 0);

/** Whether the batch can be recorded at this station in the normal flow */
export const isReadyAt = (batch: Batch, station: StationId) => batch.nextStation === station || pendingStations(batch).includes(station);

/** Material and weight that will be the input of a station (the batch's next station by default) */
export function nextInput(batch: Batch, station: StationId | null = batch.nextStation): { material: string; weight: number; lotIds: string[] } {
  if (!station) return { material: 'No material carried forward', weight: 0, lotIds: [] };

  // Everything sent to this station is added up, so sieved particles join the nibs at grinding.
  const carried = carriedTo(batch, station);
  const firstStation = routes.find((route) => route.id === batch.route)?.stations[0];
  if (carried.length === 0 && (batch.records.length === 0 || firstStation === station)) return batch.startInput;
  if (carried.length === 0) return { material: 'No material carried forward', weight: 0, lotIds: [] };
  return {
    material: Array.from(new Set(carried.map((o) => o.name))).join(' + '),
    weight: Math.round(carried.reduce((sum, o) => sum + o.weight, 0) * 100) / 100,
    lotIds: [],
  };
}

export const recordFor = (batch: Batch, station: StationId) => batch.records.find((r) => r.station === station);

export const activeBatches = (state: State) => state.batches.filter((b) => b.status !== 'completed');

/** Batches whose next step is this station (ready) and batches on hold at this station */
export function stationQueue(state: State, station: StationId) {
  const ready = state.batches.filter((b) => b.status === 'active' && isReadyAt(b, station));
  const held = state.batches.filter((b) => b.status === 'hold' && isReadyAt(b, station));
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

/** Suppliers a batch traces back to: its own supplier, and the suppliers behind the lots it started from */
export function batchSuppliers(state: State, batch: Batch, seen = new Set<string>()): string[] {
  if (seen.has(batch.id)) return [];
  seen.add(batch.id);
  const ids = new Set<string>(batch.supplierId ? [batch.supplierId] : []);
  const names: string[] = [];
  for (const lotId of [...batch.startInput.lotIds, ...batch.records.flatMap((r) => r.inputLotIds)]) {
    const source = lotById(state, lotId)?.source;
    if (source?.type === 'supplier') ids.add(source.supplierId);
    if (source?.type === 'batch') {
      const upstream = batchById(state, source.batchId);
      if (upstream) names.push(...batchSuppliers(state, upstream, seen));
    }
  }
  return Array.from(new Set([...[...ids].map((id) => supplierName(state, id)), ...names]));
}

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
  'Cocoa beans': 'BEAN', 'Accepted beans': 'BEAN', 'Sorted beans': 'BEAN', 'Roasted beans': 'RST', 'Whole roasted beans': 'WRB',
  Nibs: 'NIB', 'Nibs for liquor': 'NIB', 'Nibs for butter': 'NIB', 'Nibs for sale': 'NIB', 'Whole peeled beans': 'REW', Husks: 'HUSK',
  'Brown butter': 'BRB', 'Sieved butter': 'BRB', 'Sieved particles': 'PRT', 'Silk butter': 'SILK', 'Butter for sale': 'BUT',
  'Cocoa cake (powder)': 'CAKE', 'Roasted powder': 'PWD', 'Fine cocoa powder': 'PWD',
  Liquor: 'LIQ', Butter: 'BUT', 'Cocoa butter': 'BUT', Powder: 'PWD', 'Cocoa cake': 'CAKE', Sugar: 'SUG', Lecithin: 'LEC', 'Milk powder': 'MLK',
  'Machine residue': 'REW', 'Recoverable chocolate': 'REW', 'Finished chocolate': 'FIN', 'Accepted units': 'FIN', 'Rejected units': 'REJ',
};

export function nextLotId(state: State, material: string, taken: string[] = []) {
  const prefix = lotPrefixes[material] ?? (material.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'LOT');
  const ids = [...state.lots.map((l) => l.id), ...taken];
  const max = ids.filter((id) => id.startsWith(`${prefix}-`)).reduce((m, id) => Math.max(m, parseInt(id.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
