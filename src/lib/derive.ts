import { calculateBalance, outputYield, percentOf, round2 } from './balance';
import { stationById, stationName } from './stations';
import type { State } from './seed';
import type { Alert, Balance, Batch, Destination, Lot, RecordedOutput, RouteId, StationId, StationRecord } from './types';

export const recordBalance = (r: StationRecord) => calculateBalance(r.inputWeight, r.outputs);

const startNames: Record<RouteId, string> = { beans: 'bag weight', pressing: 'nibs pressed', chocolate: 'batch weight' };

/** What a batch's starting weight is called on the paper forms: the bag weight of a sack, the nibs pressed, the weight of a chocolate batch */
export const startName = (batch: Batch) => startNames[batch.route] ?? 'start weight';

const carriedOn = (o: RecordedOutput) => o.destination.startsWith('continue:');

/** One recorded output at a stage, as a share of that stage's input and of the batch's starting weight */
export interface StageOutput extends RecordedOutput { ofInputPct: number; ofStartPct: number }
export interface BatchStage { record: StationRecord; balance: Balance; inputOfStartPct: number; varianceOfStartPct: number; outputs: StageOutput[] }

/** Every recorded stage of a batch, with each output measured against the stage input and the batch's starting weight */
export function batchStages(batch: Batch): BatchStage[] {
  const start = batch.startInput.weight;
  return batch.records.map((record) => {
    const balance = recordBalance(record);
    return {
      record, balance,
      inputOfStartPct: percentOf(record.inputWeight, start),
      varianceOfStartPct: percentOf(balance.variance, start),
      outputs: record.outputs.map((o) => ({ ...o, ofInputPct: percentOf(o.weight, record.inputWeight), ofStartPct: percentOf(o.weight, start) })),
    };
  });
}

/** product: useful material that left the line (stored, sold, reworked). lost: unaccounted or reweighing differences. process: waiting at the next station. */
export type OutcomeGroup = 'product' | 'byproduct' | 'waste' | 'lost' | 'process';
export interface Outcome { group: OutcomeGroup; label: string; station: StationId | null; weight: number; ofStartPct: number; destination?: Destination; lotId?: string }

/**
 * Where a batch's starting weight ended up: every output that left the line, each station's unaccounted weight,
 * any difference found when material was reweighed between stations, and what is still waiting at the next
 * station. Carried-forward outputs are not counted twice, so the weights add up to the starting weight.
 */
export function batchOutcomes(batch: Batch): Outcome[] {
  const start = batch.startInput.weight;
  const outcomes: Outcome[] = [];
  const add = (o: Omit<Outcome, 'ofStartPct'>) => {
    if (Math.abs(o.weight) >= 0.005) outcomes.push({ ...o, weight: round2(o.weight), ofStartPct: percentOf(o.weight, start) });
  };
  let arriving = start;
  let next: StationId | null = batch.nextStation;
  for (const record of batch.records) {
    add({ group: 'lost', label: `Difference when reweighed before ${stationName(record.station).toLowerCase()}`, station: record.station, weight: arriving - record.inputWeight });
    for (const o of record.outputs.filter((o) => !carriedOn(o))) {
      add({ group: o.kind === 'useful' ? 'product' : o.kind, label: o.name, station: record.station, weight: o.weight, destination: o.destination, lotId: o.lotId });
    }
    add({ group: 'lost', label: stationById[record.station]?.lossLabel ?? 'Unaccounted', station: record.station, weight: recordBalance(record).variance });
    const carried = record.outputs.filter(carriedOn);
    arriving = carried.reduce((t, o) => t + o.weight, 0);
    next = carried.length ? carried[0].destination.slice(9) as StationId : batch.nextStation;
  }
  add({ group: 'process', label: `Waiting at ${stationName(next).toLowerCase()}`, station: next, weight: arriving });
  return outcomes;
}

/** Outcome weights added up by group, each also as a share of the batch's starting weight */
export function outcomeTotals(batch: Batch, outcomes = batchOutcomes(batch)) {
  const sum = (group: OutcomeGroup) => round2(outcomes.filter((o) => o.group === group).reduce((t, o) => t + o.weight, 0));
  const totals = { product: sum('product'), byproduct: sum('byproduct'), waste: sum('waste'), lost: sum('lost'), process: sum('process') };
  const start = batch.startInput.weight;
  const pctOf = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, percentOf(v, start)])) as Record<OutcomeGroup, number>;
  return { ...totals, gone: round2(totals.waste + totals.lost), pct: { ...pctOf, gone: percentOf(totals.waste + totals.lost, start) } };
}

/**
 * What pressing made from a stored lot, as the bean summary's derivatives: each pressing batch that drew on the lot,
 * with its butter and powder scaled to the share of its nibs that came from this lot.
 */
export function pressedFrom(state: State, lotId: string | undefined) {
  const lot = lotId ? lotById(state, lotId) : undefined;
  if (!lot) return { lot, pressings: [] };
  const pressings = lot.uses.flatMap((use) => {
    const batch = batchById(state, use.batchId);
    const record = batch?.records.find((r) => r.station === 'pressing');
    if (!batch || !record || !(batch.startInput.weight > 0)) return [];
    const share = Math.min(1, use.quantity / batch.startInput.weight);
    return [{ batch, quantity: use.quantity, outputs: record.outputs.map((o) => ({ name: o.name, weight: round2(o.weight * share), ofPressedPct: percentOf(o.weight, record.inputWeight) })) }];
  });
  return { lot, pressings };
}

/** The yield a station reports: its one named output where the paper forms ask for that (butter from the nibs pressed), otherwise all useful output */
export function stationYield(r: StationRecord): { label: string; pct: number } {
  const yieldOf = stationById[r.station]?.yieldOf;
  return yieldOf ? { label: yieldOf.label, pct: outputYield(r.inputWeight, r.outputs, yieldOf.output) } : { label: 'Yield', pct: recordBalance(r).yieldPct };
}

export const lastRecord = (batch: Batch) => batch.records.at(-1);

/** Station the batch was last recorded at */
export const currentStation = (batch: Batch): StationId | null => lastRecord(batch)?.station ?? null;

/** Material and weight that will be the input of the batch's next station */
export function nextInput(batch: Batch): { material: string; weight: number; lotIds: string[] } {
  // While a station's destinations are still unsaved, that record is not the previous step yet.
  const settled = batch.records.filter((r) => r.station !== batch.nextStation);
  const last = settled.at(-1);
  if (!last) return batch.startInput;
  const carried = last.outputs.filter((o) => o.destination === `continue:${batch.nextStation}`);
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
    alerts.push({ id: `${batch.id}-${record.id}-variance`, kind: 'variance', message: `${batch.id} · ${stationName(record.station)}: variance ${balance.variancePct.toFixed(2)}% is above the ${limit}% limit`, href: `/production/batches/${batch.id}` });
  }
  if (balance.wastePct > state.thresholds.wastePct) {
    alerts.push({ id: `${batch.id}-${record.id}-waste`, kind: 'waste', message: `${batch.id} · ${stationName(record.station)}: waste ${balance.wastePct.toFixed(2)}% is above the ${state.thresholds.wastePct}% limit`, href: `/production/batches/${batch.id}` });
  }
  return alerts;
}

export function batchAlerts(state: State, batch: Batch): Alert[] {
  const alerts = batch.records.flatMap((r) => recordAlerts(state, batch, r));
  const hold = batch.holds.find((h) => !h.releasedAt);
  if (hold) alerts.push({ id: `${batch.id}-hold`, kind: 'hold', message: `${batch.id} is on hold: ${hold.reason}`, href: `/production/batches/${batch.id}` });
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

/** Supplier the cocoa in a lot came from: whoever delivered it, or the supplier of the batch that made it. */
export function lotSupplierId(state: State, lot: Lot | undefined): string | undefined {
  if (!lot) return undefined;
  return lot.source.type === 'supplier' ? lot.source.supplierId : batchById(state, lot.source.batchId)?.supplierId;
}

/** Plain description of the step that produced a lot */
export function lotOrigin(state: State, lot: Lot) {
  if (lot.source.type === 'supplier') return `Delivered by ${supplierName(state, lot.source.supplierId)}${lot.source.reference ? ` · ${lot.source.reference}` : ''}`;
  const supplierId = lotSupplierId(state, lot);
  return `Made by batch ${lot.source.batchId} at ${stationName(lot.source.station).toLowerCase()}${supplierId ? ` · cocoa from ${supplierName(state, supplierId)}` : ''}`;
}

export function nextBatchId(state: State, prefix: string) {
  const max = state.batches.filter((b) => b.id.startsWith(`${prefix}-`)).reduce((m, b) => Math.max(m, Number(b.id.slice(prefix.length + 1)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

const lotPrefixes: Record<string, string> = {
  'Cocoa beans': 'BEAN', 'Raw beans': 'BEAN', 'Accepted beans': 'BEAN', 'Roasted beans': 'RST', 'Beans taken off': 'RST',
  'Crushed nibs for liquor': 'NIB', 'Crushed nibs for butter': 'NIB', 'Crushed nibs for other': 'NIB', 'Nibs for inclusion and sale': 'NIB',
  Nibs: 'NIB', 'Nibs for butter': 'NIB', 'Nibs for sale': 'NIB', 'Whole peeled beans': 'REW', 'Husks and rubbish': 'HUSK', Husks: 'HUSK',
  Liquor: 'LIQ', Butter: 'BUT', 'Cocoa butter': 'BUT', Powder: 'PWD', 'Cocoa cake': 'CAKE', Sugar: 'SUG', Lecithin: 'LEC', 'Milk powder': 'MLK',
  'Machine residue': 'REW', 'Recoverable chocolate': 'REW', 'Finished chocolate': 'FIN', 'Accepted units': 'FIN', 'Rejected units': 'REJ',
};

export function nextLotId(state: State, material: string, taken: string[] = []) {
  const prefix = lotPrefixes[material] ?? (material.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'LOT');
  const ids = [...state.lots.map((l) => l.id), ...taken];
  const max = ids.filter((id) => id.startsWith(`${prefix}-`)).reduce((m, id) => Math.max(m, parseInt(id.slice(prefix.length + 1), 10) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
