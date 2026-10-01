import { percentOf, round2 } from './balance';
import { batchById, batchDisplayName, lotById, recordBalance } from './derive';
import { ownUse, storedAtMixing } from './mixing';
import { routes, type State } from './seed';
import { stationById, stationName, stations } from './stations';
import type { Balance, Batch, Destination, RecordedOutput, RouteId, StationId, StationRecord } from './types';

const startNames: Record<RouteId, string> = { beans: 'bag weight', pressing: 'nibs pressed', chocolate: 'weight mixed' };

/** What a batch's starting weight is called: the bag weight of a sack, the stored nibs pressed, or what a chocolate batch weighed into the mixer */
export const startName = (batch: Batch) => startNames[batch.route] ?? 'start weight';

/**
 * The weight every share is taken of. A chocolate batch made from store starts at 0 kg and weighs its
 * ingredients in runs, so its first record's input (everything weighed into the mixer) stands in.
 */
export const startWeight = (batch: Batch) => (batch.startInput.weight > 0 ? batch.startInput.weight : batch.records[0]?.inputWeight ?? 0);

const carriedOn = (o: RecordedOutput) => o.destination.startsWith('continue:');
const lineOrder = (station: StationId) => stations.findIndex((s) => s.id === station);
const byLineOrder = (a: StationRecord, b: StationRecord) => lineOrder(a.station) - lineOrder(b.station);

/** Station the starting weight goes into: the route's first, unless older records started elsewhere */
function startStation(batch: Batch): StationId | undefined {
  const first = routes.find((r) => r.id === batch.route)?.stations[0];
  if (!first || batch.records.length === 0 || batch.records.some((r) => r.station === first)) return first;
  return [...batch.records].sort(byLineOrder)[0].station;
}

/** Everything this batch's records sent on to a station */
const carriedInto = (batch: Batch, station: StationId) =>
  round2(batch.records.flatMap((r) => r.outputs).filter((o) => o.destination === `continue:${station}`).reduce((t, o) => t + o.weight, 0));

/**
 * Mixing takes in sugar, milk powder and other lots from store, and chocolate the mixer held from another
 * batch. When a batch's own liquor and butter are sent there, only that material belongs to its starting
 * weight: what the runs used of it, what was kept in store, and what is still waiting.
 */
const mixesOwnMaterial = (batch: Batch, record: StationRecord) => record.station === 'mixing' && startStation(batch) !== 'mixing';

/** One recorded output at a stage, as a share of that stage's input and of the batch's starting weight */
export interface StageOutput extends RecordedOutput { ofInputPct: number; ofStartPct: number }
export interface BatchStage { record: StationRecord; balance: Balance; inputOfStartPct: number; varianceOfStartPct: number; outputs: StageOutput[]; mixesOwnMaterial: boolean }

/** Every recorded stage of a batch in line order, each output measured against the stage input and the batch's starting weight */
export function batchStages(batch: Batch): BatchStage[] {
  const start = startWeight(batch);
  return [...batch.records].sort(byLineOrder).map((record) => {
    const balance = recordBalance(record);
    return {
      record, balance, mixesOwnMaterial: mixesOwnMaterial(batch, record),
      inputOfStartPct: percentOf(record.inputWeight, start),
      varianceOfStartPct: percentOf(balance.variance, start),
      outputs: record.outputs.map((o) => ({ ...o, ofInputPct: percentOf(o.weight, record.inputWeight), ofStartPct: percentOf(o.weight, start) })),
    };
  });
}

/** product: useful material that left the line (stored, sold, reworked, made into chocolate). lost: unaccounted or reweighing differences. process: waiting at a station. */
export type OutcomeGroup = 'product' | 'byproduct' | 'waste' | 'lost' | 'process';
export interface Outcome { group: OutcomeGroup; label: string; station: StationId | null; weight: number; ofStartPct: number; destination?: Destination; lotId?: string; intoChocolate?: boolean }

/**
 * Where a batch's starting weight ended up: every output that left the line, each station's unaccounted
 * weight, any difference found when material was reweighed at the next station, and what is still waiting.
 * Material sent on is counted once, where it finally left, so the weights add up to the starting weight,
 * also when the nibs split between pressing and grinding.
 */
export function batchOutcomes(batch: Batch): Outcome[] {
  const start = startWeight(batch);
  const first = startStation(batch);
  const outcomes: Outcome[] = [];
  const add = (o: Omit<Outcome, 'ofStartPct'>) => {
    if (Math.abs(o.weight) >= 0.005) outcomes.push({ ...o, weight: round2(o.weight), ofStartPct: percentOf(o.weight, start) });
  };
  const expected = (station: StationId) => round2(carriedInto(batch, station) + (station === first ? start : 0));

  for (const record of [...batch.records].sort(byLineOrder)) {
    const station = record.station;
    if (mixesOwnMaterial(batch, record)) {
      const runs = record.runs ?? [];
      const own = ownUse(runs);
      for (const name of Array.from(new Set(own.map((i) => i.name)))) {
        add({ group: 'product', label: `${name} made into chocolate`, station, weight: own.filter((i) => i.name === name).reduce((t, i) => t + i.kg, 0), intoChocolate: true });
      }
      const stored = storedAtMixing(record.outputs, runs);
      for (const o of stored) add({ group: 'product', label: o.name, station, weight: o.weight, destination: o.destination, lotId: o.lotId });
      const rest = expected(station) - own.reduce((t, i) => t + i.kg, 0) - stored.reduce((t, o) => t + o.weight, 0);
      add(record.destinationsSaved ? { group: 'lost', label: 'Not used at mixing', station, weight: rest } : { group: 'process', label: 'Waiting at mixing', station, weight: rest });
      continue;
    }
    add({ group: 'lost', label: `Difference when reweighed at ${stationName(station).toLowerCase()}`, station, weight: expected(station) - record.inputWeight });
    for (const o of record.outputs.filter((o) => !carriedOn(o))) {
      add({ group: o.kind === 'useful' ? 'product' : o.kind, label: o.name, station, weight: o.weight, destination: o.destination, lotId: o.lotId });
    }
    add({ group: 'lost', label: stationById[station]?.lossLabel ?? 'Unaccounted', station, weight: recordBalance(record).variance });
  }

  // Material sent on to a station that has not recorded it yet, and a batch not started at all
  const recorded = new Set(batch.records.map((r) => r.station));
  for (const s of stations) {
    if (!recorded.has(s.id) && s.id !== 'completion') add({ group: 'process', label: `Waiting at ${s.name.toLowerCase()}`, station: s.id, weight: expected(s.id) });
  }
  return outcomes;
}

/** Outcome weights added up by group, each also as a share of the batch's starting weight */
export function outcomeTotals(batch: Batch, outcomes = batchOutcomes(batch)) {
  const sum = (group: OutcomeGroup) => round2(outcomes.filter((o) => o.group === group).reduce((t, o) => t + o.weight, 0));
  const totals = { product: sum('product'), byproduct: sum('byproduct'), waste: sum('waste'), lost: sum('lost'), process: sum('process') };
  const start = startWeight(batch);
  const shares = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, percentOf(v, start)])) as Record<OutcomeGroup, number>;
  const gone = round2(totals.waste + totals.lost);
  return { ...totals, gone, pct: { ...shares, gone: percentOf(gone, start) } };
}

/**
 * What became of a lot this batch stored: batches that started from it (stored nibs pressed later), with
 * their products scaled to the share of their start that came from the lot, and chocolate batches that
 * weighed it in at mixing. What is left in store is listed last. These rows break the lot down; they are
 * not added to the batch's total again.
 */
export function lotFate(state: State, lotId: string | undefined) {
  const lot = lotId ? lotById(state, lotId) : undefined;
  if (!lot || lot.uses.length === 0) return [];
  const batchHref = (id: string) => `/production/batches/${id}`;
  const rows = lot.uses.flatMap((use) => {
    const batch = batchById(state, use.batchId);
    if (!batch) return [];
    if (!batch.startInput.lotIds.includes(lot.id) || !(batch.startInput.weight > 0)) {
      if (use.madeLot) return [{ label: 'Made into pieces', where: `${use.madeLot} · ${lotById(state, use.madeLot)?.material ?? batchDisplayName(batch)}`, href: `/materials/${use.madeLot}`, weight: round2(use.quantity) }];
      const label = use.station === 'mixing' ? 'Made into chocolate' : `Used at ${stationName(use.station).toLowerCase()}`;
      return [{ label, where: `${stationName(use.station)} in ${batchDisplayName(batch)}`, href: batchHref(batch.id), weight: round2(use.quantity) }];
    }
    const share = Math.min(1, use.quantity / batch.startInput.weight);
    return batchOutcomes(batch).filter((o) => o.group === 'product' || o.group === 'process')
      .map((o) => ({ label: o.label, where: `${o.station ? `${stationName(o.station)} in ` : ''}${batchDisplayName(batch)}`, href: batchHref(batch.id), weight: round2(o.weight * share) }));
  });
  return lot.available > 0.004 ? [...rows, { label: 'Still in store', where: lot.id, href: `/materials/${lot.id}`, weight: round2(lot.available) }] : rows;
}
