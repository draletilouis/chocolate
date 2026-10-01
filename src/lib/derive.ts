import { calculateBalance } from './balance';
import { stationById, stationName, stations } from './stations';
import { routes, type State } from './seed';
import type { Alert, Batch, Destination, IdCounters, Lot, OutputKind, StationId, StationRecord } from './types';

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
 * is not recorded yet, or its record is not finished (mixing while runs are still being made).
 * A split (nibs to both pressing and grinding) leaves several waiting at once.
 */
export const pendingStations = (batch: Batch): StationId[] =>
  stations.map((s) => s.id).filter((id) => {
    if (id === 'completion') return false;
    const record = recordFor(batch, id);
    return record ? !record.destinationsSaved : carriedTo(batch, id).length > 0;
  });

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

/**
 * Identifies one saved state of a station's record, or null when there is none yet. It changes when
 * anyone saves the station again or corrects one of its weights, so a form can tell whether the
 * record it was opened on is still the latest.
 */
export function recordStamp(batch: Batch, station: StationId): string | null {
  const record = recordFor(batch, station);
  if (!record) return null;
  return `${record.id}@${record.rev ?? record.recordedAt}#${batch.corrections.filter((c) => c.recordId === record.id).length}`;
}

export const activeBatches = (state: State) => state.batches.filter((b) => b.status !== 'completed');

/** Batches whose next step is this station (ready) and batches on hold at this station */
export function stationQueue(state: State, station: StationId) {
  const ready = state.batches.filter((b) => b.status === 'active' && isReadyAt(b, station));
  const held = state.batches.filter((b) => b.status === 'hold' && isReadyAt(b, station));
  const done = state.batches.filter((b) => b.records.some((r) => r.station === station)).sort((a, b) => (recordFor(b, station)!.recordedAt.localeCompare(recordFor(a, station)!.recordedAt)));
  return { ready, held, done };
}

/** Chocolate lots with chocolate still to make into pieces, oldest first */
export const chocolateWaiting = (state: Pick<State, 'lots'>) =>
  state.lots.filter((l) => l.chocolate && l.available > 0.004).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/** What waits at a station: batches, or at Pieces the chocolate lots not yet made into pieces */
export const waitingCount = (state: State, station: StationId) =>
  stationById[station].form === 'pieces' ? chocolateWaiting(state).length : stationQueue(state, station).ready.length;

export function recordAlerts(state: State, batch: Batch, record: StationRecord): Alert[] {
  const balance = recordBalance(record);
  const alerts: Alert[] = [];
  const limit = state.thresholds.variancePct[record.station];
  if (Math.abs(balance.variancePct) > limit) {
    alerts.push({ id: `${batch.id}-${record.id}-variance`, kind: 'variance', message: `${batchDisplayName(batch)} · ${stationName(record.station)}: ${balance.variancePct.toFixed(2)}% of the weight is missing, above the ${limit}% limit`, href: `/production/batches/${batch.id}` });
  }
  if (balance.wastePct > state.thresholds.wastePct) {
    alerts.push({ id: `${batch.id}-${record.id}-waste`, kind: 'waste', message: `${batchDisplayName(batch)} · ${stationName(record.station)}: waste is ${balance.wastePct.toFixed(2)}% of the input, above the ${state.thresholds.wastePct}% limit`, href: `/production/batches/${batch.id}` });
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

/**
 * Batch and lot numbers are never issued twice: the next one follows the highest number issued for the
 * prefix (state.idCounters) or in use now, whichever is higher. Removing the newest batch or lot does
 * not free its number, so an old label can never open a different record. Data saved before the
 * counters existed continues from its highest ID.
 */
export function nextBatchId(state: State, prefix: string) {
  const max = state.batches.filter((b) => b.id.startsWith(`${prefix}-`)).reduce((m, b) => Math.max(m, Number(b.id.slice(prefix.length + 1)) || 0), state.idCounters.batches[prefix] ?? 0);
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

/** Chocolate lots are numbered by type: "70% Dark" → D70, "34% White" → W34 */
const chocolateCode = (material: string) => {
  const match = /^(\d+)\s*%\s*([a-z])/i.exec(material);
  return match ? `${match[2].toUpperCase()}${match[1]}` : undefined;
};

/** The next lot ID for a material, never one issued before (see nextBatchId()); taken are IDs already chosen in the same save */
export function nextLotId(state: State, material: string, taken: string[] = []) {
  const prefix = lotPrefixes[material] ?? chocolateCode(material) ?? (material.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'LOT');
  const ids = [...state.lots.map((l) => l.id), ...taken];
  const max = ids.filter((id) => id.startsWith(`${prefix}-`)).reduce((m, id) => Math.max(m, parseInt(id.slice(prefix.length + 1), 10) || 0), state.idCounters.lots[prefix] ?? 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/**
 * The ID counters raised to cover the counters and the batch and lot IDs of every given state, read
 * the way nextBatchId() and nextLotId() read them. Returns the first state's counters unchanged when
 * nothing is higher, so an unchanged counter is not saved again.
 */
export function issuedNumbers(...states: Pick<State, 'idCounters' | 'batches' | 'lots'>[]): IdCounters {
  let counters = states[0].idCounters;
  const raise = (kind: keyof IdCounters, prefix: string, n: number) => {
    if (prefix && n > (counters[kind][prefix] ?? 0)) counters = { ...counters, [kind]: { ...counters[kind], [prefix]: n } };
  };
  for (const s of states) {
    for (const kind of ['batches', 'lots'] as const) for (const [prefix, n] of Object.entries(s.idCounters[kind])) raise(kind, prefix, n);
    // A batch ID is the product prefix, which may itself contain a dash, then the number: CB-024.
    for (const { id } of s.batches) raise('batches', id.slice(0, Math.max(0, id.lastIndexOf('-'))), Number(id.slice(id.lastIndexOf('-') + 1)));
    // A lot prefix is letters only; older lots may have a letter after the number: NIB-023B.
    for (const { id } of s.lots) raise('lots', id.slice(0, Math.max(0, id.indexOf('-'))), parseInt(id.slice(id.indexOf('-') + 1), 10));
  }
  return counters;
}

/** Every station where this batch has something to do now: its next step plus any material waiting after a split */
export function waitingAt(batch: Batch): StationId[] {
  if (batch.status === 'completed') return [];
  return Array.from(new Set([batch.nextStation, ...pendingStations(batch)].filter((s): s is StationId => Boolean(s))));
}

/** Suggested batch name from the supplier and date, e.g. "Kuapa 28 Sep", made unique with a number */
export function suggestBatchName(state: State, supplierId: string, isoDate: string) {
  const supplier = state.suppliers.find((s) => s.id === supplierId)?.name.split(' ')[0] ?? 'Delivery';
  const [, month, day] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = `${supplier} ${day && months[month - 1] ? `${day} ${months[month - 1]}` : isoDate}`;
  const taken = new Set(state.batches.map((b) => b.name?.trim()).filter(Boolean));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** The container last used for this output at this station, so the operator does not pick it every time */
export function lastContainerId(state: State, station: StationId, output: string): string {
  const records = state.batches.flatMap((b) => b.records).filter((r) => r.station === station).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  for (const r of records) {
    const used = output === '__input' ? r.inputContainer : r.outputs.find((o) => o.name === output)?.container;
    if (used) return state.containers.find((c) => c.name === used.name)?.id ?? '';
    if (output === '__input' || r.outputs.some((o) => o.name === output)) return '';
  }
  return '';
}

/** Batches and lots matching a search: name, ID, product, material or supplier */
export function searchRecords(state: State, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { batches: [] as Batch[], lots: [] as Lot[] };
  const hit = (...values: (string | undefined)[]) => values.some((v) => v?.toLowerCase().includes(q));
  return {
    batches: state.batches.filter((b) => hit(b.id, b.name, b.product, ...batchSuppliers(state, b))).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    lots: state.lots.filter((l) => hit(l.id, l.material, l.source.type === 'supplier' ? supplierName(state, l.source.supplierId) : l.source.batchId)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
  };
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
