import { recordFor } from './derive';
import { ownUse, sourcesOf } from './mixing';
import { piecesKg } from './pieces';
import type { State } from './seed';
import type { Batch, Lot, MixingRun, StationId } from './types';

type Data = Pick<State, 'batches' | 'lots'>;

/** How a traced material came to be: a supplier's delivery, or a batch (at a station, or in one mixing run) */
export type TraceOrigin =
  | { type: 'supplier'; supplierId: string; reference?: string; supplierBatch?: string }
  | { type: 'batch'; batchId: string; batch?: Batch; station?: StationId; run?: MixingRun; runIndex?: number };

/**
 * One material in a trace. Read backwards its steps are what went into it; read forwards they are what
 * it went into.
 */
export interface TraceStep {
  key: string;
  /** Absent for material that is not a lot: liquor a batch ground and then mixed itself, or a batch on the way forwards */
  lot?: Lot;
  lotId?: string;
  material: string;
  /** kg of this that went into the step before it (backwards), or of the step before that went into this (forwards) */
  quantity?: number;
  /** What it was in a mixing run: the recipe's ingredient, or the chocolate the mixer still held */
  role?: string;
  /** Absent when the lot is no longer on record */
  origin?: TraceOrigin;
  at?: string;
  steps: TraceStep[];
  /** The mixer's earlier contents are not followed further than this */
  cut?: boolean;
}

/** A purchase a trace goes back to: a supplier's lot, or beans received straight onto the line as a batch */
export interface Delivery { key: string; material: string; lot?: Lot; batch?: Batch; supplierId: string; reference?: string; supplierBatch?: string; at: string }

/** Chocolate left in the mixer links every run to the one before; it is followed this many runs */
const HELD_RUNS = 3;
export const heldRole = 'Left in the mixer';

const batchOf = (state: Data, id: string) => state.batches.find((b) => b.id === id);
const sum = (values: number[]) => Math.round(values.reduce((total, n) => total + n, 0) * 1000) / 1000;

/** The mixing run that made a chocolate lot, with its batch */
function runOf(state: Data, lot: Lot) {
  if (!lot.chocolate || lot.source.type !== 'batch') return undefined;
  const batch = batchOf(state, lot.source.batchId);
  const runs = (batch && recordFor(batch, 'mixing')?.runs) ?? [];
  const index = runs.findIndex((r) => r.id === lot.chocolate!.runId);
  return batch && index >= 0 ? { batch, run: runs[index], index } : undefined;
}

function originOf(state: Data, lot: Lot): TraceOrigin {
  if (lot.source.type === 'supplier') return { type: 'supplier', supplierId: lot.source.supplierId, reference: lot.source.reference, supplierBatch: lot.source.supplierBatch };
  const made = runOf(state, lot);
  return { type: 'batch', batchId: lot.source.batchId, batch: batchOf(state, lot.source.batchId), station: lot.source.station, run: made?.run, runIndex: made?.index };
}

/** Lots a batch started from. Lots weighed into its mixing runs belong to the runs, not to the start. */
export const startLotIds = (batch: Batch) => Array.from(new Set([...batch.startInput.lotIds, ...batch.records.filter((r) => !r.runs).flatMap((r) => r.inputLotIds)]));

type Follow = (lot: Lot, held: number, path: Set<string>) => TraceStep[];

/** A lot as a step, followed further unless it was already met on the way (a lot cannot go into itself) */
function lotStep(state: Data, lot: Lot, extra: Pick<TraceStep, 'quantity' | 'role'>, follow: Follow, held: number, path: Set<string>, parent = ''): TraceStep {
  return {
    key: `${parent}>${lot.id}:${extra.role ?? ''}`, lot, lotId: lot.id, material: lot.material, ...extra, origin: originOf(state, lot), at: lot.receivedAt,
    steps: path.has(lot.id) ? [] : follow(lot, held, new Set(path).add(lot.id)),
  };
}

function startSteps(state: Data, batch: Batch, held: number, path: Set<string>): TraceStep[] {
  return startLotIds(batch).map((id): TraceStep => {
    const lot = state.lots.find((l) => l.id === id);
    if (!lot) return { key: `${batch.id}>${id}`, lotId: id, material: batch.startInput.material, steps: [] };
    const taken = sum(lot.uses.filter((u) => u.batchId === batch.id && !u.runId && !u.madeLot).map((u) => u.quantity));
    return lotStep(state, lot, { quantity: taken || undefined }, (l, h, p) => madeFrom(state, l, h, p), held, path, batch.id);
  });
}

/** The chocolate a run was made on top of, followed a few runs back */
function heldStep(state: Data, run: MixingRun, held: number, path: Set<string>): TraceStep[] {
  if (!run.held) return [];
  const lot = state.lots.find((l) => l.id === run.held!.lotId);
  const base = { quantity: run.held.kg, role: heldRole };
  if (!lot) return [{ key: `${run.id}>held`, lotId: run.held.lotId, material: run.held.type, ...base, steps: [] }];
  if (held >= HELD_RUNS) return [{ ...lotStep(state, lot, base, () => [], held, path, run.id), cut: true }];
  return [lotStep(state, lot, base, (l, h, p) => madeFrom(state, l, h, p), held + 1, path, run.id)];
}

/**
 * What went into a lot, back to the deliveries: pieces come from a chocolate lot, chocolate from the
 * ingredients of its mixing run and what the mixer held, anything else from what its batch started with.
 */
export function madeFrom(state: Data, lot: Lot, held = 0, path = new Set([lot.id])): TraceStep[] {
  const back: Follow = (l, h, p) => madeFrom(state, l, h, p);
  if (lot.source.type === 'supplier') return [];
  if (lot.pieces) {
    const from = state.lots.find((l) => l.id === lot.pieces!.fromLotId);
    const quantity = piecesKg(lot.received, lot.pieces.grams);
    return [from ? lotStep(state, from, { quantity }, back, held, path, lot.id) : { key: `${lot.id}>from`, lotId: lot.pieces.fromLotId, material: lot.pieces.type, quantity, steps: [] }];
  }
  const batch = batchOf(state, lot.source.batchId);
  if (!batch) return [];
  const made = runOf(state, lot);
  if (!made) return startSteps(state, batch, held, path);
  // One step per place an ingredient came from: an ingredient split over two lots shows both.
  const ingredients = made.run.ingredients.flatMap((i) => sourcesOf(i).filter((s) => s.kg > 0).map((s): TraceStep => {
    const base = { quantity: s.kg, role: i.name };
    if (!s.lotId) return { key: `${made.run.id}>own:${i.name}`, material: i.name, ...base, origin: { type: 'batch', batchId: batch.id, batch }, at: batch.startedAt, steps: startSteps(state, batch, held, path) };
    const from = state.lots.find((l) => l.id === s.lotId);
    return from ? lotStep(state, from, base, back, held, path, made.run.id) : { key: `${made.run.id}>${s.lotId}`, lotId: s.lotId, material: i.name, ...base, steps: [] };
  }));
  return [...ingredients, ...heldStep(state, made.run, held, path)];
}

/** A lot with everything that went into it */
export const traceBack = (state: Data, lot: Lot) => lotStep(state, lot, {}, (l, h, p) => madeFrom(state, l, h, p), 0, new Set());

/** Everything that went into a batch: what it started from, the lots weighed into its mixing runs, and chocolate the mixer held from another batch */
export function batchMadeFrom(state: Data, batch: Batch): TraceStep[] {
  const back: Follow = (l, h, p) => madeFrom(state, l, h, p);
  const runs = recordFor(batch, 'mixing')?.runs ?? [];
  const weighed = new Map<string, { name: string; kg: number }>();
  for (const i of runs.flatMap((r) => r.ingredients)) {
    for (const s of sourcesOf(i)) if (s.lotId && s.kg > 0) weighed.set(s.lotId, { name: i.name, kg: sum([weighed.get(s.lotId)?.kg ?? 0, s.kg]) });
  }
  const ingredients = Array.from(weighed, ([id, { name, kg }]): TraceStep => {
    const lot = state.lots.find((l) => l.id === id);
    return lot ? lotStep(state, lot, { quantity: kg, role: name }, back, 0, new Set(), batch.id) : { key: `${batch.id}>${id}`, lotId: id, material: name, quantity: kg, role: name, steps: [] };
  });
  const held = runs.filter((r) => r.held && !runs.some((x) => x.id === r.held!.runId)).flatMap((r) => heldStep(state, r, 0, new Set()));
  return [...startSteps(state, batch, 0, new Set()), ...ingredients, ...held];
}

/** Lots a batch made itself. Pieces are reached through their chocolate lot. */
const madeBy = (state: Data, batch: Batch) => state.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === batch.id && !l.pieces);

/**
 * What a lot went into, on to the finished pieces: the pieces counted from it, the chocolate of the
 * runs it was weighed into (or that were made on top of it), and what the batches it started made.
 */
export function wentInto(state: Data, lot: Lot, held = 0, path = new Set([lot.id])): TraceStep[] {
  const on: Follow = (l, h, p) => wentInto(state, l, h, p);
  const steps: TraceStep[] = [];
  const starts = new Map<string, number>();
  for (const use of lot.uses) {
    if (use.madeLot) {
      const pieces = state.lots.find((l) => l.id === use.madeLot);
      if (pieces) steps.push(lotStep(state, pieces, { quantity: use.quantity }, on, held, path, lot.id));
    } else if (use.runId) {
      for (const chocolate of state.lots.filter((l) => l.chocolate?.runId === use.runId)) steps.push(lotStep(state, chocolate, { quantity: use.quantity }, on, held, path, lot.id));
    } else {
      starts.set(use.batchId, sum([starts.get(use.batchId) ?? 0, use.quantity]));
    }
  }
  for (const [batchId, quantity] of starts) {
    const batch = batchOf(state, batchId);
    if (!batch) continue;
    // Chocolate counts as made from this lot only where a run used the batch's own liquor or butter.
    const made = madeBy(state, batch).filter((l) => { const run = runOf(state, l)?.run; return !l.chocolate || (run && ownUse([run]).some((u) => u.kg > 0)); });
    steps.push({ key: `${lot.id}>${batch.id}`, material: batch.product, quantity, origin: { type: 'batch', batchId, batch }, at: batch.startedAt, steps: made.map((l) => lotStep(state, l, {}, on, held, path, batch.id)) });
  }
  // The run that made this chocolate kept some in the mixer, and the next run was made on top of it.
  const kept = runOf(state, lot);
  if (kept && kept.run.lotId === lot.id) {
    const next = state.batches.flatMap((b) => recordFor(b, 'mixing')?.runs ?? []).filter((r) => r.held?.runId === kept.run.id);
    for (const run of next) {
      const chocolate = state.lots.find((l) => l.id === run.lotId);
      if (!chocolate) continue;
      const base = { quantity: run.held!.kg, role: heldRole };
      steps.push(held >= HELD_RUNS ? { ...lotStep(state, chocolate, base, () => [], held, path, lot.id), cut: true } : lotStep(state, chocolate, base, on, held + 1, path, lot.id));
    }
  }
  return steps;
}

/** What a batch made, each lot followed on to the finished pieces */
export function batchWentInto(state: Data, batch: Batch): TraceStep[] {
  return madeBy(state, batch).map((l) => lotStep(state, l, {}, (lot, h, p) => wentInto(state, lot, h, p), 0, new Set(), batch.id));
}

/** Every step of a trace, in order, each lot once */
export function allSteps(steps: TraceStep[]): TraceStep[] {
  const seen = new Set<string>();
  const out: TraceStep[] = [];
  const walk = (list: TraceStep[]) => {
    for (const step of list) {
      const id = step.lotId ?? step.key;
      if (!seen.has(id)) { seen.add(id); out.push(step); }
      walk(step.steps);
    }
  };
  walk(steps);
  return out;
}

/** The purchases behind a trace, oldest first: every supplier lot, and every batch of beans received straight from a supplier */
export function deliveriesBehind(steps: TraceStep[]): Delivery[] {
  const found = new Map<string, Delivery>();
  for (const step of allSteps(steps)) {
    const origin = step.origin;
    if (origin?.type === 'supplier' && step.lot) {
      found.set(step.lot.id, { key: step.lot.id, material: step.lot.material, lot: step.lot, supplierId: origin.supplierId, reference: origin.reference, supplierBatch: origin.supplierBatch, at: step.lot.receivedAt });
    } else if (origin?.type === 'batch' && !origin.run && origin.batch?.supplierId && startLotIds(origin.batch).length === 0) {
      const batch = origin.batch;
      found.set(batch.id, { key: batch.id, material: batch.product, batch, supplierId: batch.supplierId!, at: batch.startedAt });
    }
  }
  return Array.from(found.values()).sort((a, b) => a.at.localeCompare(b.at));
}

/** The delivery a batch itself is, when its beans came straight from a supplier */
export function batchDelivery(batch: Batch): Delivery | undefined {
  return batch.supplierId && startLotIds(batch).length === 0 ? { key: batch.id, material: batch.product, batch, supplierId: batch.supplierId, at: batch.startedAt } : undefined;
}
