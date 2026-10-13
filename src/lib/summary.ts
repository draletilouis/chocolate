import { percentOf, round2 } from './balance';
import { allAlerts, batchDisplayName, recordBalance } from './derive';
import { outcomeTotals, startWeight } from './outcomes';
import { piecesKg, piecesLots } from './pieces';
import type { State } from './seed';
import { stationById, stationName } from './stations';
import type { Batch, StationId, StationRecord } from './types';

/** The days a summary covers, as YYYY-MM-DD; no `from` or `to` means open at that end */
export interface SummaryPeriod { from?: string; to?: string; label: string }

/** The parts of the line the owner sees: the three bean stations on their own, the rest by part */
export const summaryPhases: { id: string; name: string; stations: StationId[] }[] = [
  { id: 'receiving', name: 'Receiving', stations: ['receiving'] },
  { id: 'roasting', name: 'Roasting', stations: ['roasting'] },
  { id: 'winnowing', name: 'Winnowing', stations: ['winnowing'] },
  { id: 'butter-powder', name: 'Butter & powder', stations: ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing'] },
  { id: 'liquor', name: 'Liquor grinding', stations: ['grinding'] },
  { id: 'mixing', name: 'Mixing', stations: ['mixing'] },
];

/** How many days back the usual range of a phase is taken from */
export const USUAL_DAYS = 90;
/** Fewer batches than this through a phase and no usual range is given */
const USUAL_MIN_BATCHES = 5;

export type PhaseState = 'normal' | 'high' | 'low' | 'unknown';

/**
 * What a phase lost in the period, split three ways: waste that was weighed (husks, rejected beans),
 * weight the station expects to lose without weighing it (moisture driven off in the roaster), and
 * weight nobody can explain.
 */
export interface PhaseLoss {
  id: string;
  name: string;
  records: number;
  input: number;
  /** Waste outputs by name, heaviest first */
  wasteItems: { name: string; weight: number }[];
  waste: number;
  /** Unweighed loss the station expects, such as roaster moisture */
  expected: number;
  expectedLabel?: string;
  missing: number;
  loss: number;
  lossPct: number;
  /** The middle 80% of the factory's own batches through this phase over the last USUAL_DAYS days */
  usual?: { low: number; high: number; batches: number };
  state: PhaseState;
}

export interface AttentionItem { tone: 'danger' | 'warn' | 'neutral'; title: string; detail: string; href: string }

export interface Summary {
  period: SummaryPeriod;
  headline: string;
  beans: { kg: number; sacks: number; suppliers: number };
  /** Completed bean sacks in the period: products and waste per 100 kg of bag weight */
  sacks: { finished: number; productsPer100: number; gonePer100: number };
  chocolateKg: number;
  pieces: { count: number; kg: number };
  missing: { kg: number; worstPhase?: string };
  phases: PhaseLoss[];
  attention: AttentionItem[];
}

const day = (iso: string) => iso.slice(0, 10);
const inPeriod = (iso: string, p: SummaryPeriod) => (!p.from || day(iso) >= p.from) && (!p.to || day(iso) <= p.to);

function shiftDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The value below which `share` of the sorted values fall, between neighbouring values */
function percentile(sorted: number[], share: number) {
  const at = (sorted.length - 1) * share;
  const below = Math.floor(at);
  return sorted[below] + (sorted[Math.min(below + 1, sorted.length - 1)] - sorted[below]) * (at - below);
}

const phaseOf = (station: StationId) => summaryPhases.find((p) => p.stations.includes(station));

function lossOf(records: StationRecord[]) {
  let input = 0, waste = 0, expected = 0, missing = 0;
  const items = new Map<string, number>();
  for (const record of records) {
    const balance = recordBalance(record);
    input += balance.input;
    waste += balance.waste;
    if (stationById[record.station]?.lossLabel) expected += balance.variance;
    else missing += balance.variance;
    for (const o of record.outputs.filter((o) => o.kind === 'waste')) items.set(o.name, (items.get(o.name) ?? 0) + o.weight);
  }
  const loss = round2(waste + expected + missing);
  return {
    input: round2(input), waste: round2(waste), expected: round2(expected), missing: round2(missing), loss, lossPct: percentOf(loss, input),
    wasteItems: [...items].map(([name, weight]) => ({ name, weight: round2(weight) })).sort((a, b) => b.weight - a.weight),
  };
}

/** Each batch's loss through one phase, as a share of what went in, over the days the usual range is taken from */
function usualRange(batches: Batch[], phase: (typeof summaryPhases)[number], from: string, to: string) {
  const shares = batches
    .map((b) => b.records.filter((r) => phase.stations.includes(r.station) && day(r.recordedAt) >= from && day(r.recordedAt) <= to))
    .filter((records) => records.length > 0)
    .map((records) => lossOf(records))
    .filter((l) => l.input > 0)
    .map((l) => l.lossPct)
    .sort((a, b) => a - b);
  if (shares.length < USUAL_MIN_BATCHES) return undefined;
  return { low: round2(percentile(shares, 0.1)), high: round2(percentile(shares, 0.9)), batches: shares.length };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Weights as the owner reads them: whole kg from 100 kg up, one decimal below */
export const kgText = (value: number) => `${value.toLocaleString('en-GB', { minimumFractionDigits: value >= 100 ? 0 : 1, maximumFractionDigits: value >= 100 ? 0 : 1 })} kg`;
export const pctText = (value: number) => `${value.toFixed(1)}%`;

/**
 * The owner's one-page summary of a period: what came in, what was made, where weight was lost at each
 * phase compared with the factory's usual range, and what needs a look. `today` is the factory's date.
 */
export function buildSummary(state: State, period: SummaryPeriod, today: string): Summary {
  const records = state.batches.flatMap((batch) => batch.records.filter((r) => inPeriod(r.recordedAt, period)).map((record) => ({ batch, record })));

  // Beans that came onto the line
  const received = records.filter((r) => r.record.station === 'receiving');
  const beans = {
    kg: round2(received.reduce((t, r) => t + r.record.inputWeight, 0)),
    sacks: received.length,
    suppliers: new Set(received.map((r) => r.batch.supplierId).filter(Boolean)).size,
  };

  // Bean sacks finished in the period: what their bag weight became
  const finished = state.batches.filter((b) => b.route === 'beans' && b.status === 'completed' && b.completedAt && inPeriod(b.completedAt, period) && startWeight(b) > 0);
  const bagKg = finished.reduce((t, b) => t + startWeight(b), 0);
  const totals = finished.map((b) => outcomeTotals(b));
  const sacks = {
    finished: finished.length,
    productsPer100: percentOf(totals.reduce((t, x) => t + x.product, 0), bagKg),
    gonePer100: percentOf(totals.reduce((t, x) => t + x.gone, 0), bagKg),
  };

  const chocolateKg = round2(state.lots.filter((l) => l.chocolate && inPeriod(l.receivedAt, period)).reduce((t, l) => t + l.received, 0));
  const piecesMade = piecesLots(state).filter((l) => inPeriod(l.receivedAt, period));
  const pieces = { count: piecesMade.reduce((t, l) => t + l.received, 0), kg: round2(piecesMade.reduce((t, l) => t + piecesKg(l.received, l.pieces!.grams), 0)) };

  // Loss at each phase, against the usual range of the days up to the end of the period
  const usualTo = period.to ?? today;
  const usualFrom = shiftDays(usualTo, -USUAL_DAYS);
  const phases = summaryPhases.flatMap((phase): PhaseLoss[] => {
    const own = records.filter((r) => phase.stations.includes(r.record.station)).map((r) => r.record);
    if (own.length === 0) return [];
    const loss = lossOf(own);
    const usual = usualRange(state.batches, phase, usualFrom, usualTo);
    const standing: PhaseState = !usual || loss.input <= 0 ? 'unknown' : loss.lossPct > usual.high ? 'high' : loss.lossPct < usual.low ? 'low' : 'normal';
    const expectedLabel = phase.stations.map((s) => stationById[s].lossLabel).find(Boolean);
    return [{ id: phase.id, name: phase.name, records: own.length, ...loss, expectedLabel, usual, state: standing }];
  });

  const missingKg = round2(phases.reduce((t, p) => t + p.missing, 0));
  const worst = [...phases].sort((a, b) => b.missing - a.missing)[0];
  const missing = { kg: missingKg, worstPhase: worst && worst.missing > 0 ? worst.name : undefined };

  // What needs a look: holds now, phases above their usual range, weights that do not add up, low stock, corrections
  const attention: AttentionItem[] = [];
  for (const batch of state.batches.filter((b) => b.status === 'hold')) {
    const hold = batch.holds.find((h) => !h.releasedAt);
    attention.push({ tone: 'danger', title: `${batchDisplayName(batch)} is on hold${hold?.station ? ` at ${stationName(hold.station).toLowerCase()}` : ''}.`, detail: hold?.reason ?? '', href: `/production/batches/${batch.id}` });
  }
  for (const p of phases.filter((x) => x.state === 'high')) {
    attention.push({ tone: 'warn', title: `${p.name} lost ${pctText(p.lossPct)}, more than usual.`, detail: `Usually ${pctText(p.usual!.low)} to ${pctText(p.usual!.high)} of what goes in.`, href: '/reports/variance' });
  }
  for (const { batch, record } of records) {
    const balance = recordBalance(record);
    const limit = state.thresholds.variancePct[record.station];
    if (limit === undefined || Math.abs(balance.variancePct) <= limit) continue;
    const what = balance.variance > 0 ? `${kgText(balance.variance)} missing` : `${kgText(-balance.variance)} more came out than went in`;
    attention.push({ tone: 'warn', title: `${stationName(record.station)} on ${batchDisplayName(batch)}: ${what}.`, detail: `${pctText(Math.abs(balance.variancePct))} of the input, above the ${limit}% limit.`, href: `/production/batches/${batch.id}` });
  }
  for (const alert of allAlerts(state).filter((a) => a.kind === 'stock')) {
    attention.push({ tone: 'warn', title: alert.message.replace(/: .*$/, '.'), detail: `${alert.message.replace(/^.*?: /, '')}, below the ${state.thresholds.lowStockKg} kg warning.`, href: alert.href });
  }
  const corrections = state.batches.flatMap((b) => b.corrections).filter((c) => inPeriod(c.correctedAt, period)).length;
  if (corrections > 0) attention.push({ tone: 'neutral', title: `${plural(corrections, 'weight was', 'weights were')} corrected.`, detail: 'Each with the reason and who changed it.', href: '/reports/corrections' });

  return { period, headline: headlineOf(beans, sacks, phases, missing, attention.length), beans, sacks, chocolateKg, pieces, missing, phases, attention };
}

/** The answer in plain words, written from the same numbers as the rest of the page */
function headlineOf(beans: Summary['beans'], sacks: Summary['sacks'], phases: PhaseLoss[], missing: Summary['missing'], needs: number) {
  if (phases.length === 0 && beans.sacks === 0) return 'Nothing was weighed in this period.';
  const parts: string[] = [];
  if (beans.sacks > 0) parts.push(`${kgText(beans.kg)} of beans came in, in ${plural(beans.sacks, 'sack')}.`);
  if (sacks.finished > 0) parts.push(`${plural(sacks.finished, 'finished sack')} gave ${sacks.productsPer100.toFixed(1)} kg of products for every 100 kg of beans.`);
  const losses = phases.flatMap((p) => [
    ...p.wasteItems.map((w) => ({ name: w.name.toLowerCase(), weight: w.weight })),
    ...(p.expected > 0 ? [{ name: p.expectedLabel?.toLowerCase().startsWith('moisture') ? 'roaster moisture' : `${p.name.toLowerCase()} loss`, weight: p.expected }] : []),
  ]).sort((a, b) => b.weight - a.weight).slice(0, 2);
  if (losses.length > 0) parts.push(`${losses.length === 1 ? 'The biggest loss was' : 'The biggest losses were'} ${losses.map((l) => `${l.name} (${kgText(l.weight)})`).join(' and ')}.`);
  parts.push(missing.kg > 0.05 ? `${kgText(missing.kg)} went missing without being weighed${missing.worstPhase ? `, most of it at ${missing.worstPhase.toLowerCase()}` : ''}.` : 'No weight went missing that the scales could not explain.');
  parts.push(needs > 0 ? `${plural(needs, 'thing needs', 'things need')} a look.` : 'Nothing needs a look.');
  return parts.join(' ');
}
