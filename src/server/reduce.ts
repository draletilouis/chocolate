import { round2 } from '@/lib/balance';
import type { Command } from '@/lib/commands';
import { batchDisplayName, isReadyAt, issuedNumbers, nextBatchId, nextInput, nextLotId, pendingStations, recordFor, recordStamp, waitingAt } from '@/lib/derive';
import { kg } from '@/lib/format';
import { piecesKg } from '@/lib/pieces';
import { batchMaterialAtMixing, changeover, ingredientsOf, mixerStamp, mixingTotals, storedAtMixing, versionOf } from '@/lib/mixing';
import { demoCredentials, retiredChocolateTypes, seedState, type State } from '@/lib/seed';
import { stationById, stationName } from '@/lib/stations';
import type { Batch, Lot, LotCategory, LotUse, Mixer, MixingRun, OutputCategory, Recipe, RecipeIngredient, RecordedOutput, RunIngredient, StationId, StationRecord, User } from '@/lib/types';

/** A command that cannot be applied; the message is shown to the person who tried */
export class CommandError extends Error {}

export interface CommandContext {
  /** Who the change is recorded against (a manager may record on someone's behalf) */
  userId: string;
  /** Who is signed in */
  actorId: string;
  now: string;
  newId: () => string;
}

export interface Outcome { state: State; result?: unknown }

function fail(message: string): never { throw new CommandError(message); }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const initials = (name: string) => name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/** An ID built from a readable base, with a number added when it is taken */
function uniqueId(taken: { id: string }[], base: string) {
  let id = base;
  for (let n = 2; taken.some((item) => item.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

const findBatch = (s: State, id: string) => s.batches.find((b) => b.id === id) ?? fail('That batch was not found. It may have been removed.');
const replaceBatch = (s: State, next: Batch): State => ({ ...s, batches: s.batches.map((b) => (b.id === next.id ? next : b)) });

type NewBatch = Extract<Command, { type: 'createBatch' }>['input'];

function createBatch(s: State, input: NewBatch, ctx: CommandContext): { state: State; id: string } {
  const product = s.products.find((p) => p.id === input.productId) ?? fail('That product no longer exists.');
  const route = s.routes.find((r) => r.id === product.route) ?? fail('This product has no route. Check it in Setup → Products.');
  // A batch that starts at mixing (chocolate from stored liquor and butter) weighs its ingredients in runs instead.
  if (!(input.startWeight > 0) && route.stations[0] !== 'mixing') fail('Enter the starting weight.');
  if (input.supplierId && !s.suppliers.some((x) => x.id === input.supplierId)) fail('That supplier was not found.');
  for (const use of input.lotUses) if (!s.lots.some((l) => l.id === use.lotId)) fail(`Lot ${use.lotId} was not found.`);
  const id = nextBatchId(s, product.prefix);
  const stamp = input.batchDate ? `${input.batchDate}T12:00:00` : ctx.now;
  const batch: Batch = {
    id, name: input.name?.trim() || undefined, productId: product.id, product: product.name, route: route.id, startedAt: stamp, status: 'active',
    nextStation: route.stations[0],
    startInput: { material: route.startMaterial, weight: round2(input.startWeight), lotIds: input.lotUses.map((u) => u.lotId) },
    supplierId: input.supplierId || undefined,
    recipeId: product.recipeId, recipeVersion: input.recipeVersion, ingredients: input.ingredients?.map((i) => ({ ...i, lotId: i.lotId || undefined })),
    records: [], holds: [], corrections: [], note: input.note || undefined,
  };
  const lots = s.lots.map((lot) => {
    const use = input.lotUses.find((u) => u.lotId === lot.id && u.quantity > 0);
    if (!use) return lot;
    // The scale weight is recorded as-is; a lot record can only be drawn down to zero.
    return { ...lot, available: Math.max(0, round2(lot.available - use.quantity)), uses: [...lot.uses, { batchId: id, quantity: use.quantity, station: route.stations[0], at: stamp }] };
  });
  return { state: { ...s, batches: [...s.batches, batch], lots }, id };
}

/**
 * Puts a finished station record on its batch: creates a lot for every output stored, kept for sale
 * or sent to rework, and moves the batch to the first station with material waiting. Re-saving a
 * station keeps the lot IDs it created before, so printed labels stay valid. A lot it no longer
 * stores is removed, and its number is never given to another lot.
 */
function commitRecord(s: State, batchId: string, draft: StationRecord, advance: boolean, now: string): State {
  const batch = findBatch(s, batchId);
  const previous = batch.records.find((r) => r.station === draft.station);
  const fromThisStation = (l: Lot) => l.source.type === 'batch' && l.source.batchId === batchId && l.source.station === draft.station;
  const kept = s.lots.filter((l) => !fromThisStation(l));
  const made: Lot[] = [];
  const outputs = draft.outputs.map((o): RecordedOutput => {
    if (o.destination !== 'stock' && o.destination !== 'sale' && o.destination !== 'rework') return { ...o, lotId: undefined };
    const isUnits = draft.station === 'packaging' && o.name === 'Accepted units';
    const quantity = isUnits ? draft.packaging!.acceptedUnits : o.weight;
    const category: LotCategory = o.destination === 'rework' ? 'Rework' : isUnits || o.destination === 'sale' ? 'Finished goods' : o.kind === 'byproduct' ? 'By-product' : 'Intermediate';
    const material = isUnits ? `${batch.product} · ${s.packSizes.find((p) => p.id === draft.packaging!.packSizeId)?.name ?? ''}` : o.name;
    const earlier = s.lots.find((l) => fromThisStation(l) && l.id === previous?.outputs.find((e) => e.name === o.name)?.lotId);
    if (earlier) {
      const used = round2(earlier.received - earlier.available);
      made.push({ ...earlier, material, category, received: quantity, available: Math.max(0, round2(quantity - used)) });
      return { ...o, lotId: earlier.id };
    }
    // s.lots still holds the lots this save drops, so a new lot cannot take one of their numbers.
    const id = nextLotId(s, o.name, made.map((l) => l.id));
    made.push({ id, material, category, received: quantity, available: quantity, unit: isUnits ? 'units' : 'kg', source: { type: 'batch', batchId, station: draft.station }, receivedAt: now, uses: [] });
    return { ...o, lotId: id };
  });
  const record: StationRecord = { ...draft, outputs, destinationsSaved: true };
  const records = previous ? batch.records.map((r) => (r.station === record.station ? record : r)) : [...batch.records, record];
  const updated = { ...batch, records };
  const next = advance ? { ...updated, nextStation: pendingStations(updated)[0] ?? ('completion' as StationId) } : updated;
  return { ...s, batches: s.batches.map((b) => (b.id === batchId ? next : b)), lots: [...kept, ...made] };
}

/** Shared checks before a station is saved: the right batch state, nobody else saved or corrected it meanwhile */
function checkStation(b: Batch, station: StationId, expectRecord: string | null | undefined, early: boolean) {
  const existing = b.records.find((r) => r.station === station);
  const name = stationById[station].name;
  if (expectRecord !== undefined && recordStamp(b, station) !== expectRecord) fail(`${name} for ${batchDisplayName(b)} was just saved on another device. Nothing was changed: look at their weights first.`);
  if (b.status === 'completed') fail(`${batchDisplayName(b)} is completed. Correct weights from the batch page.`);
  if (b.status === 'hold' && !existing) fail(`${batchDisplayName(b)} is on hold. Release the hold before recording.`);
  if (!existing && !early && !isReadyAt(b, station)) fail(`${batchDisplayName(b)} is not waiting at ${name.toLowerCase()}.`);
  return existing;
}

type SaveRecord = Extract<Command, { type: 'saveRecord' }>;

function saveRecord(s: State, cmd: SaveRecord, ctx: CommandContext): State {
  const b = findBatch(s, cmd.batchId);
  const station = stationById[cmd.station];
  if (station.form !== 'weights') fail(`${station.name} is not a weighing station.`);
  const early = cmd.options?.advanceWorkflow === false;
  const existing = checkStation(b, cmd.station, cmd.expectRecord, early);
  if (!(cmd.input.weight > 0)) fail('Enter the input weight.');
  const outputs = cmd.outputs.filter((o) => o.weight > 0);
  if (outputs.length === 0) fail('Enter at least one weight.');
  const names = new Set<string>();
  for (const o of outputs) {
    if (names.has(o.name)) fail(`Two outputs are called “${o.name}”. Give each a different name.`);
    names.add(o.name);
    if (o.destination.startsWith('continue:') && !station.next.includes(o.destination.slice(9) as StationId) && !existing?.outputs.some((e) => e.destination === o.destination)) {
      fail(`${o.name} cannot go from ${station.name.toLowerCase()} to ${stationName(o.destination.slice(9) as StationId).toLowerCase()}.`);
    }
  }
  const carried = nextInput(b, cmd.station);
  const draft: StationRecord = {
    id: existing?.id ?? `${cmd.station}-${ctx.now}`, station: cmd.station,
    inputMaterial: existing?.inputMaterial ?? cmd.options?.inputMaterial ?? (carried.weight > 0 ? carried.material : station.input),
    inputWeight: round2(cmd.input.weight), inputContainer: cmd.input.container,
    inputLotIds: existing?.inputLotIds ?? (cmd.options?.inputMaterial ? [] : b.records.length ? [] : b.startInput.lotIds),
    outputs: outputs.map((o) => ({ name: o.name, kind: o.kind, weight: round2(o.weight), destination: o.destination, container: o.container })),
    recordedAt: ctx.now, recordedBy: ctx.userId, rev: ctx.newId(), note: cmd.note || undefined, destinationsSaved: true,
  };
  return commitRecord(s, b.id, draft, !early, ctx.now);
}

type SaveMixingRun = Extract<Command, { type: 'saveMixingRun' }>;

/** A batch whose mixing can still take runs: not completed or on hold, waiting at mixing, not finished */
function mixingBatch(s: State, batchId: string) {
  const b = findBatch(s, batchId);
  const name = batchDisplayName(b);
  if (b.status === 'completed') fail(`${name} is completed.`);
  if (b.status === 'hold') fail(`${name} is on hold. Release the hold before mixing.`);
  const record = recordFor(b, 'mixing');
  if (record?.destinationsSaved) fail(`Mixing for ${name} is finished. Start a “Chocolate from store” batch to mix more.`);
  if (!record && !isReadyAt(b, 'mixing')) fail(`${name} is not waiting at mixing.`);
  return { b, name, record };
}

/** Puts the mixing record, worked out from its runs, on the batch; a record with no runs left is removed */
function withMixingRecord(s: State, b: Batch, runs: MixingRun[], ctx: CommandContext, previous?: StationRecord): State {
  const record: StationRecord | undefined = runs.length === 0 ? undefined : {
    id: previous?.id ?? `mixing-${ctx.now}`, station: 'mixing', inputMaterial: 'Chocolate ingredients', ...mixingTotals(runs),
    inputLotIds: Array.from(new Set(runs.flatMap((r) => r.ingredients.flatMap((i) => (i.lotId ? [i.lotId] : []))))),
    runs, recordedAt: runs.at(-1)!.recordedAt, recordedBy: runs.at(-1)!.recordedBy, rev: ctx.newId(), note: previous?.note, destinationsSaved: false,
  };
  const records = [...b.records.filter((r) => r.station !== 'mixing'), ...(record ? [record] : [])];
  return replaceBatch(s, { ...b, records });
}

/**
 * One chocolate type made at mixing. The run is made on top of what the mixer holds: the ingredients to
 * add follow the changeover sheet, and a run that cannot reach the recipe on top of it is refused. The
 * chocolate taken out becomes a lot; what is kept in the mixer is held for the next run, whichever batch
 * it belongs to.
 */
function saveMixingRun(s: State, cmd: SaveMixingRun, ctx: CommandContext): Outcome {
  const { b, name, record } = mixingBatch(s, cmd.batchId);
  if (mixerStamp(s.mixer) !== cmd.expectMixer) fail('Someone else just used the mixer. Check what it holds now, then enter the run again.');
  const recipe = s.recipes.find((r) => r.id === cmd.recipeId) ?? fail('That chocolate type was not found.');
  const version = versionOf(recipe) ?? fail(`${recipe.name} has no current recipe.`);
  if (!(cmd.toRun > 0)) fail('Enter how many kg to run.');
  const held = s.mixer.holds && s.mixer.holds.kg > 0 ? s.mixer.holds : undefined;
  const plan = changeover(version.ingredients, cmd.toRun, held && { kg: held.kg, ingredients: ingredientsOf(s, held.recipeId, held.recipeVersion) });
  if (held && plan.blocked.length) fail(`The mixer holds ${kg(held.kg)} of ${held.type}, which has ${plan.blocked.join(' and ').toLowerCase()}. ${recipe.name} has none: take the chocolate out of the mixer first.`);
  if (held && plan.lines.some((l) => l.add < -0.005)) fail(`With ${kg(held.kg)} of ${held.type} in the mixer, run at least ${kg(plan.minRun)} of ${recipe.name}.`);

  const left = new Map(batchMaterialAtMixing(b).map((m) => [m.name, m.left]));
  const seen = new Set<string>();
  for (const given of cmd.ingredients) {
    if (!version.ingredients.some((i) => i.name === given.name)) fail(`${given.name} is not in ${recipe.name}.`);
    if (seen.has(given.name)) fail(`${given.name} is listed twice.`);
    seen.add(given.name);
    if (given.lotId) {
      const lot = s.lots.find((l) => l.id === given.lotId) ?? fail(`Lot ${given.lotId} was not found.`);
      if (lot.material !== given.name) fail(`Lot ${lot.id} is ${lot.material.toLowerCase()}, not ${given.name.toLowerCase()}.`);
    } else if (given.actual > (left.get(given.name) ?? 0) + 0.005) {
      fail(`Only ${kg(left.get(given.name) ?? 0)} of ${given.name.toLowerCase()} from ${name} is left. Take the rest from a lot.`);
    }
  }
  const toAdd = new Map(plan.lines.map((l) => [l.name, Math.max(0, l.add)]));
  const ingredients: RunIngredient[] = version.ingredients.map((i) => {
    const given = cmd.ingredients.find((g) => g.name === i.name);
    return { name: i.name, expected: toAdd.get(i.name) ?? 0, actual: round2(given?.actual ?? 0), lotId: given?.lotId || undefined };
  });
  if (!(ingredients.reduce((sum, i) => sum + i.actual, 0) > 0)) fail('Enter the ingredients weighed in.');
  if (!(cmd.made > 0)) fail('Enter the chocolate taken out.');

  const runId = `run-${ctx.newId()}`;
  const lotId = nextLotId(s, recipe.name);
  const run: MixingRun = { id: runId, recipeId: recipe.id, type: recipe.name, recipeVersion: version.version, toRun: round2(cmd.toRun), held, ingredients, made: round2(cmd.made), kept: round2(cmd.kept), lotId, recordedAt: ctx.now, recordedBy: ctx.userId };
  // The scale weight is recorded as-is; a lot record can only be drawn down to zero.
  const lots = s.lots.map((lot) => {
    const drawn = ingredients.filter((i) => i.lotId === lot.id && i.actual > 0);
    if (!drawn.length) return lot;
    const quantity = drawn.reduce((sum, i) => sum + i.actual, 0);
    return { ...lot, available: Math.max(0, round2(lot.available - quantity)), uses: [...lot.uses, ...drawn.map((i) => ({ batchId: b.id, quantity: i.actual, station: 'mixing' as const, at: ctx.now, runId }))] };
  });
  const chocolate: Lot = { id: lotId, material: recipe.name, category: 'Intermediate', received: run.made, available: run.made, unit: 'kg', source: { type: 'batch', batchId: b.id, station: 'mixing' }, receivedAt: ctx.now, uses: [], chocolate: { type: recipe.name, recipeId: recipe.id, recipeVersion: version.version, runId } };
  const mixer: Mixer = { holds: run.kept > 0 ? { kg: run.kept, type: recipe.name, recipeId: recipe.id, recipeVersion: version.version, batchId: b.id, runId, lotId } : null, lastRunId: runId };
  const next = withMixingRecord({ ...s, lots: [...lots, chocolate], mixer }, b, [...(record?.runs ?? []), run], ctx, record);
  return { state: next, result: lotId };
}

/** Takes back the last run made on the mixer, while its chocolate is untouched and mixing is not finished */
function undoMixingRun(s: State, batchId: string, runId: string, ctx: CommandContext): State {
  const { b, record } = mixingBatch(s, batchId);
  const run = record?.runs?.find((r) => r.id === runId) ?? fail('That run was not found.');
  if (s.mixer.lastRunId !== run.id) fail('Only the last run made on the mixer can be undone.');
  const chocolate = s.lots.find((l) => l.id === run.lotId);
  if (chocolate && (chocolate.uses.length || chocolate.available !== chocolate.received)) fail(`Lot ${chocolate.id} from this run is already in use.`);
  const lots = s.lots.filter((l) => l.id !== run.lotId).map((lot) => {
    const returned = lot.uses.filter((u) => u.runId === run.id).reduce((sum, u) => sum + u.quantity, 0);
    return returned ? { ...lot, available: Math.min(lot.received, round2(lot.available + returned)), uses: lot.uses.filter((u) => u.runId !== run.id) } : lot;
  });
  return withMixingRecord({ ...s, lots, mixer: { holds: run.held ?? null, lastRunId: null } }, b, record!.runs!.filter((r) => r.id !== run.id), ctx, record);
}

/**
 * The chocolate in the mixer is taken out, for example before a type that cannot be made on top of it.
 * It becomes a lot of that chocolate, traced to the batch whose run left it there.
 */
function emptyMixer(s: State, expectMixer: string | null, ctx: CommandContext): Outcome {
  if (mixerStamp(s.mixer) !== expectMixer) fail('Someone else just used the mixer. Check what it holds now.');
  const held = s.mixer.holds ?? fail('The mixer is already empty.');
  const id = nextLotId(s, held.type);
  const lot: Lot = { id, material: held.type, category: 'Intermediate', received: held.kg, available: held.kg, unit: 'kg', source: { type: 'batch', batchId: held.batchId, station: 'mixing' }, receivedAt: ctx.now, uses: [], chocolate: { type: held.type, recipeId: held.recipeId, recipeVersion: held.recipeVersion, runId: held.runId } };
  // The run that kept it now shows the lot instead of chocolate left in the mixer, even on a completed batch.
  const batches = s.batches.map((b) => {
    const record = recordFor(b, 'mixing');
    if (!record?.runs?.some((r) => r.id === held.runId)) return b;
    const runs = record.runs.map((r) => (r.id === held.runId ? { ...r, takenOut: id } : r));
    const totals = mixingTotals(runs, storedAtMixing(record.outputs, record.runs));
    return { ...b, records: b.records.map((r) => (r.station === 'mixing' ? { ...record, ...totals, runs } : r)) };
  });
  return { state: { ...s, batches, lots: [...s.lots, lot], mixer: { holds: null, lastRunId: null } }, result: id };
}

/**
 * Closes mixing for a batch. Liquor or cocoa butter it sent to mixing that no run used is kept in store
 * as a lot, so nothing goes missing from the balance, and the batch moves on (usually to completion).
 */
function finishMixing(s: State, batchId: string, note: string | undefined, ctx: CommandContext): State {
  const { b, name, record } = mixingBatch(s, batchId);
  const runs = record?.runs ?? [];
  const unused = batchMaterialAtMixing(b).filter((m) => m.left > 0.005);
  if (runs.length === 0 && unused.length === 0) fail(`Nothing was mixed for ${name}. Record a run first.`);
  const made: Lot[] = [];
  const stored = unused.map((m): RecordedOutput => {
    const id = nextLotId(s, m.name, made.map((l) => l.id));
    made.push({ id, material: m.name, category: 'Intermediate', received: m.left, available: m.left, unit: 'kg', source: { type: 'batch', batchId: b.id, station: 'mixing' }, receivedAt: ctx.now, uses: [] });
    return { name: `${m.name} kept in store`, kind: 'useful', weight: m.left, destination: 'stock', lotId: id };
  });
  const finished: StationRecord = {
    id: record?.id ?? `mixing-${ctx.now}`, station: 'mixing', inputMaterial: 'Chocolate ingredients', ...mixingTotals(runs, stored),
    inputLotIds: record?.inputLotIds ?? [], runs, recordedAt: ctx.now, recordedBy: ctx.userId, rev: ctx.newId(), note: note || record?.note, destinationsSaved: true,
  };
  const updated = { ...b, records: [...b.records.filter((r) => r.station !== 'mixing'), finished] };
  return replaceBatch({ ...s, lots: [...s.lots, ...made] }, { ...updated, nextStation: pendingStations(updated)[0] ?? 'completion' });
}

type RecordPieces = Extract<Command, { type: 'recordPieces' }>;

/**
 * Good pieces of each size made from a chocolate lot. Each size becomes a lot counted in pieces, traced
 * to the chocolate lot and the batch that mixed it; the chocolate lot is drawn down by their weight.
 */
function recordPieces(s: State, cmd: RecordPieces, ctx: CommandContext): Outcome {
  const chocolate = s.lots.find((l) => l.id === cmd.lotId) ?? fail('That lot was not found.');
  if (!chocolate.chocolate || chocolate.source.type !== 'batch') fail(`Lot ${chocolate.id} is not chocolate made at mixing.`);
  const { batchId } = chocolate.source;
  const entries = cmd.pieces.filter((p) => p.count > 0);
  if (entries.length === 0) fail('Enter how many pieces were made.');
  if (new Set(entries.map((e) => e.packSizeId)).size !== entries.length) fail('Each size can be entered once.');
  const made: Lot[] = [];
  const uses: LotUse[] = [];
  for (const entry of entries) {
    const pack = s.packSizes.find((p) => p.id === entry.packSizeId) ?? fail('That piece size no longer exists.');
    // Pieces are numbered with the finished-units prefix: FIN-0001.
    const id = nextLotId(s, 'Accepted units', made.map((l) => l.id));
    made.push({
      id, material: `${chocolate.chocolate.type} · ${pack.name}`, category: 'Finished goods', received: entry.count, available: entry.count, unit: 'units',
      source: { type: 'batch', batchId, station: 'packaging' }, receivedAt: ctx.now, uses: [],
      pieces: { type: chocolate.chocolate.type, recipeId: chocolate.chocolate.recipeId, packSizeId: pack.id, size: pack.name, grams: pack.grams, fromLotId: chocolate.id, recordedBy: ctx.userId },
    });
    uses.push({ batchId, quantity: piecesKg(entry.count, pack.grams), station: 'packaging', at: ctx.now, madeLot: id });
  }
  const used = Math.round(uses.reduce((sum, u) => sum + u.quantity, 0) * 1000) / 1000;
  if (used > chocolate.available + 0.005) fail(`That is ${kg(used)} of chocolate, but lot ${chocolate.id} has ${kg(chocolate.available)} left.`);
  const lots = s.lots.map((l) => (l.id === chocolate.id ? { ...l, available: Math.max(0, Math.round((l.available - used) * 1000) / 1000), uses: [...l.uses, ...uses] } : l));
  return { state: { ...s, lots: [...lots, ...made] }, result: made.map((l) => l.id) };
}

/** Takes back a lot of pieces entered by mistake, while none of it is used; the chocolate goes back to its lot */
function removePieces(s: State, lotId: string): State {
  const lot = s.lots.find((l) => l.id === lotId) ?? fail('That lot was not found.');
  const pieces = lot.pieces ?? fail(`Lot ${lot.id} is not a lot of pieces.`);
  if (lot.uses.length || lot.available !== lot.received) fail(`Pieces from lot ${lot.id} are already in use.`);
  const lots = s.lots.filter((l) => l.id !== lot.id).map((l) => {
    if (l.id !== pieces.fromLotId) return l;
    const returned = l.uses.filter((u) => u.madeLot === lot.id).reduce((sum, u) => sum + u.quantity, 0);
    return { ...l, available: Math.min(l.received, Math.round((l.available + returned) * 1000) / 1000), uses: l.uses.filter((u) => u.madeLot !== lot.id) };
  });
  return { ...s, lots };
}

/** A recipe's ingredients must have different names and add up to 100% */
function checkIngredients(ingredients: RecipeIngredient[]) {
  const names = new Set<string>();
  for (const i of ingredients) {
    if (names.has(i.name.toLowerCase())) fail(`${i.name} is listed twice. Give it one line.`);
    names.add(i.name.toLowerCase());
  }
  const total = ingredients.reduce((sum, i) => sum + i.percent, 0);
  if (Math.abs(total - 100) > 0.01) fail(`The ingredients add up to ${round2(total)}%. They must add up to 100%.`);
}

function usedInAudit(s: State, userId: string) {
  return s.batches.some((b) => b.records.some((r) => r.recordedBy === userId) || b.holds.some((h) => h.placedBy === userId) || b.corrections.some((c) => c.correctedBy === userId));
}

function checkUser(s: State, user: { email: string; stations: StationId[] }, exceptId?: string) {
  if (s.users.some((u) => u.id !== exceptId && u.email.toLowerCase() === user.email.toLowerCase())) fail('Another person already uses that email address.');
}

/** Whether a chocolate type was ever made: in a mixing run, by an older chocolate batch, or it is in the mixer now */
const wasMade = (s: State, recipeId: string) =>
  s.batches.some((b) => b.recipeId === recipeId || b.records.some((r) => r.runs?.some((run) => run.recipeId === recipeId))) || s.mixer.holds?.recipeId === recipeId;

/**
 * Applies one command. The ID counters then cover every batch and lot number from before and after
 * it, so a number this command removed (a deleted lot or batch, a lot dropped by a re-save, records
 * replaced by an upload) stays taken and is never issued again.
 */
export function applyCommand(s: State, cmd: Command, ctx: CommandContext): Outcome {
  const outcome = runCommand(s, cmd, ctx);
  const idCounters = issuedNumbers(outcome.state, s);
  return idCounters === outcome.state.idCounters ? outcome : { ...outcome, state: { ...outcome.state, idCounters } };
}

function runCommand(s: State, cmd: Command, ctx: CommandContext): Outcome {
  switch (cmd.type) {
    case 'createBatch': {
      const { state, id } = createBatch(s, cmd.input, ctx);
      return { state, result: id };
    }
    case 'receiveDelivery': {
      const { state, id } = createBatch(s, cmd.batch, ctx);
      const withRecord = saveRecord(state, { type: 'saveRecord', batchId: id, station: 'receiving', input: cmd.input, outputs: cmd.outputs, note: cmd.note, expectRecord: null }, ctx);
      return { state: withRecord, result: id };
    }
    case 'saveRecord': return { state: saveRecord(s, cmd, ctx) };
    case 'saveMixingRun': return saveMixingRun(s, cmd, ctx);
    case 'undoMixingRun': return { state: undoMixingRun(s, cmd.batchId, cmd.runId, ctx) };
    case 'emptyMixer': return emptyMixer(s, cmd.expectMixer, ctx);
    case 'finishMixing': return { state: finishMixing(s, cmd.batchId, cmd.note, ctx) };
    case 'setMixerKeeps': return { state: { ...s, mixerKeepsKg: round2(cmd.kg) } };
    case 'recordPieces': return recordPieces(s, cmd, ctx);
    case 'setPlan': {
      const seen = new Set<string>();
      for (const line of cmd.lines) {
        const recipe = s.recipes.find((r) => r.id === line.recipeId) ?? fail('A chocolate type in the plan was not found.');
        const size = s.packSizes.find((p) => p.id === line.packSizeId) ?? fail('A piece size in the plan was not found.');
        if (seen.has(`${line.recipeId}|${line.packSizeId}`)) fail(`${recipe.name} · ${size.name} is in the plan twice. Give it one line.`);
        seen.add(`${line.recipeId}|${line.packSizeId}`);
      }
      return { state: { ...s, plan: { lines: cmd.lines.filter((l) => l.pieces > 0), from: cmd.from, note: cmd.note || undefined, updatedAt: ctx.now, updatedBy: ctx.userId } } };
    }
    case 'removePieces': return { state: removePieces(s, cmd.lotId) };
    case 'completeBatch': {
      const b = findBatch(s, cmd.batchId);
      if (b.status === 'completed') fail(`${batchDisplayName(b)} is already completed.`);
      if (b.status === 'hold') fail(`${batchDisplayName(b)} is on hold. Release the hold first.`);
      const unfinished = b.records.filter((r) => !r.destinationsSaved);
      if (unfinished.length) fail(`${unfinished.map((r) => stationName(r.station)).join(', ')} was not finished.`);
      const waiting = waitingAt(b).filter((st) => st !== 'completion');
      if (waiting.length) fail(`Material is still waiting at ${waiting.map((st) => stationName(st).toLowerCase()).join(' and ')}.`);
      return { state: replaceBatch(s, { ...b, status: 'completed', nextStation: null, completedAt: ctx.now, note: cmd.note || b.note }) };
    }
    case 'updateBatchDetails': {
      const b = findBatch(s, cmd.batchId);
      return { state: replaceBatch(s, { ...b, name: cmd.name?.trim() || undefined, note: cmd.note?.trim() || undefined }) };
    }
    case 'deleteBatch': {
      const b = findBatch(s, cmd.batchId);
      // A batch with production history is an audit record. A blank batch can be removed, returning the lot quantities it reserved.
      if (b.records.length || b.holds.length || b.corrections.length || s.lots.some((l) => l.source.type === 'batch' && l.source.batchId === b.id)) fail('A batch with recorded history cannot be deleted.');
      const lots = s.lots.map((lot) => {
        const uses = lot.uses.filter((use) => use.batchId !== b.id);
        const returned = lot.uses.filter((use) => use.batchId === b.id).reduce((sum, use) => sum + use.quantity, 0);
        return uses.length === lot.uses.length ? lot : { ...lot, available: round2(lot.available + returned), uses };
      });
      return { state: { ...s, batches: s.batches.filter((x) => x.id !== b.id), lots } };
    }
    case 'placeHold': {
      const b = findBatch(s, cmd.batchId);
      if (b.status !== 'active') fail(`${batchDisplayName(b)} cannot be put on hold now.`);
      return { state: replaceBatch(s, { ...b, status: 'hold', holds: [...b.holds, { id: `h-${ctx.newId()}`, reason: cmd.reason, placedAt: ctx.now, placedBy: ctx.userId, station: b.nextStation }] }) };
    }
    case 'releaseHold': {
      const b = findBatch(s, cmd.batchId);
      if (b.status !== 'hold') fail(`${batchDisplayName(b)} is not on hold.`);
      return { state: replaceBatch(s, { ...b, status: 'active', holds: b.holds.map((h) => (h.releasedAt ? h : { ...h, releasedAt: ctx.now, releaseNote: cmd.note })) }) };
    }
    case 'addCorrection': {
      const b = findBatch(s, cmd.batchId);
      const record = b.records.find((r) => r.id === cmd.recordId) ?? fail('That record was not found.');
      const target = record.outputs.find((o) => o.name === cmd.output) ?? fail(`${cmd.output} was not found on that record.`);
      if (record.packaging) fail('Packaging counts are corrected by saving packaging again.');
      if (record.runs) fail('Mixing runs are changed by undoing the last run and entering it again, before mixing is finished.');
      const corrected = round2(cmd.corrected);
      const delta = round2(corrected - target.weight);
      const records = b.records.map((r) => (r.id === record.id ? { ...r, outputs: r.outputs.map((o) => (o.name === cmd.output ? { ...o, weight: corrected } : o)) } : r));
      const correction = { id: `c-${ctx.newId()}`, recordId: record.id, station: record.station, output: cmd.output, previous: target.weight, corrected, reason: cmd.reason, correctedAt: ctx.now, correctedBy: ctx.userId };
      const next = replaceBatch(s, { ...b, records, corrections: [...b.corrections, correction] });
      if (!target.lotId) return { state: next };
      return { state: { ...next, lots: next.lots.map((l) => (l.id === target.lotId ? { ...l, received: round2(l.received + delta), available: Math.max(0, round2(l.available + delta)) } : l)) } };
    }
    case 'receiveLot': {
      if (!s.suppliers.some((x) => x.id === cmd.input.supplierId)) fail('Choose a supplier.');
      if (!(cmd.input.quantity > 0)) fail('Enter the weight you measured on delivery.');
      const id = nextLotId(s, cmd.input.material);
      const lot: Lot = { id, material: cmd.input.material, category: cmd.input.category, received: round2(cmd.input.quantity), available: round2(cmd.input.quantity), unit: cmd.input.unit, source: { type: 'supplier', supplierId: cmd.input.supplierId, reference: cmd.input.reference || undefined, supplierBatch: cmd.input.supplierBatch?.trim() || undefined }, receivedAt: ctx.now, uses: [] };
      return { state: { ...s, lots: [...s.lots, lot] }, result: id };
    }
    case 'updateLot': {
      const lot = s.lots.find((l) => l.id === cmd.lotId) ?? fail('That lot was not found.');
      if (lot.source.type !== 'supplier') fail('Lots made by production are corrected from their batch.');
      if (cmd.supplierId && !s.suppliers.some((x) => x.id === cmd.supplierId)) fail('That supplier was not found.');
      const source = lot.source;
      const next: Lot = { ...lot, material: cmd.material, category: cmd.category, source: { ...source, supplierId: cmd.supplierId || source.supplierId, reference: cmd.reference || undefined, supplierBatch: cmd.supplierBatch?.trim() || undefined } };
      return { state: { ...s, lots: s.lots.map((l) => (l.id === lot.id ? next : l)) } };
    }
    case 'deleteLot': {
      const lot = s.lots.find((l) => l.id === cmd.lotId) ?? fail('That lot was not found.');
      const referenced = s.batches.some((b) => b.startInput.lotIds.includes(lot.id) || b.records.some((r) => r.inputLotIds.includes(lot.id) || r.outputs.some((o) => o.lotId === lot.id)));
      if (lot.source.type !== 'supplier' || lot.uses.length || lot.available !== lot.received || referenced) fail('Only unused supplier lots can be deleted.');
      return { state: { ...s, lots: s.lots.filter((l) => l.id !== lot.id) } };
    }
    case 'addRecipeVersion': {
      const recipe = s.recipes.find((r) => r.id === cmd.recipeId) ?? fail('That recipe was not found.');
      checkIngredients(cmd.ingredients);
      const version = recipe.versions.length + 1;
      const next = { ...recipe, currentVersion: version, versions: [...recipe.versions, { version, createdAt: ctx.now, ingredients: cmd.ingredients, note: cmd.note }] };
      return { state: { ...s, recipes: s.recipes.map((r) => (r.id === recipe.id ? next : r)) } };
    }
    case 'addChocolateType': {
      const name = cmd.name.trim();
      if (s.recipes.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) fail(`There is already a chocolate type called “${name}”.`);
      // Ingredients left at 0% are not part of the recipe.
      const ingredients = cmd.ingredients.filter((i) => i.percent > 0);
      checkIngredients(ingredients);
      const recipe: Recipe = { id: uniqueId(s.recipes, `R-${slug(name).toUpperCase()}`), name, currentVersion: 1, versions: [{ version: 1, createdAt: ctx.now, ingredients, note: cmd.note || undefined }] };
      return { state: { ...s, recipes: [...s.recipes, recipe] }, result: recipe.id };
    }
    case 'updateRecipe': {
      const recipe = s.recipes.find((r) => r.id === cmd.recipeId) ?? fail('That chocolate type was not found.');
      const name = cmd.name.trim();
      if (s.recipes.some((r) => r.id !== recipe.id && r.name.trim().toLowerCase() === name.toLowerCase())) fail(`There is already a chocolate type called “${name}”.`);
      // Runs and lots keep the name they were made under.
      return { state: { ...s, recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, name } : r)) } };
    }
    case 'deleteRecipe': {
      const recipe = s.recipes.find((r) => r.id === cmd.recipeId) ?? fail('That chocolate type was not found.');
      if (wasMade(s, recipe.id)) fail('Chocolate types already made cannot be deleted.');
      // Products from before chocolate was made in runs keep existing without the recipe.
      return { state: { ...s, recipes: s.recipes.filter((r) => r.id !== recipe.id), products: s.products.map((p) => (p.recipeId === recipe.id ? { ...p, recipeId: undefined } : p)) } };
    }
    case 'addProduct':
    case 'updateProduct': {
      const product = cmd.product;
      if (!s.routes.some((r) => r.id === product.route)) fail('Choose a route.');
      if (product.recipeId && !s.recipes.some((r) => r.id === product.recipeId)) fail('That recipe was not found.');
      if (cmd.type === 'addProduct') return { state: { ...s, products: [...s.products, { ...product, recipeId: product.recipeId || undefined, id: uniqueId(s.products, `P-${slug(product.name).toUpperCase()}`) }] } };
      if (!s.products.some((p) => p.id === cmd.productId)) fail('That product was not found.');
      return { state: { ...s, products: s.products.map((p) => (p.id === cmd.productId ? { ...product, recipeId: product.recipeId || undefined, id: p.id } : p)) } };
    }
    case 'deleteProduct':
      if (s.batches.some((b) => b.productId === cmd.productId) || s.recipes.some((r) => r.productId === cmd.productId)) fail('Products used by recipes or batches cannot be deleted.');
      return { state: { ...s, products: s.products.filter((p) => p.id !== cmd.productId) } };
    case 'addPackSize':
      return { state: { ...s, packSizes: [...s.packSizes, { ...cmd.pack, id: uniqueId(s.packSizes, `PK-${cmd.pack.grams}`) }] } };
    case 'updatePackSize':
      return { state: { ...s, packSizes: s.packSizes.map((p) => (p.id === cmd.packSizeId ? { ...cmd.pack, id: p.id } : p)) } };
    case 'deletePackSize':
      if (s.batches.some((b) => b.records.some((r) => r.packaging?.packSizeId === cmd.packSizeId)) || s.lots.some((l) => l.pieces?.packSizeId === cmd.packSizeId)) fail('Piece sizes already made cannot be deleted.');
      return { state: { ...s, packSizes: s.packSizes.filter((p) => p.id !== cmd.packSizeId) } };
    case 'addSupplier':
      return { state: { ...s, suppliers: [...s.suppliers, { ...cmd.supplier, id: uniqueId(s.suppliers, `S-${slug(cmd.supplier.name).toUpperCase()}`) }] } };
    case 'updateSupplier':
      return { state: { ...s, suppliers: s.suppliers.map((x) => (x.id === cmd.supplierId ? { ...cmd.supplier, id: x.id } : x)) } };
    case 'deleteSupplier':
      if (s.lots.some((l) => l.source.type === 'supplier' && l.source.supplierId === cmd.supplierId) || s.batches.some((b) => b.supplierId === cmd.supplierId)) fail('Suppliers referenced by lots or batches cannot be deleted.');
      return { state: { ...s, suppliers: s.suppliers.filter((x) => x.id !== cmd.supplierId) } };
    case 'addUser': {
      const { password: _password, pin: _pin, ...fields } = cmd.user;
      checkUser(s, fields);
      const user: User = { ...fields, id: `U-${ctx.newId()}`, initials: initials(fields.name) };
      return { state: { ...s, users: [...s.users, user] }, result: user.id };
    }
    case 'updateUser': {
      const current = s.users.find((u) => u.id === cmd.userId) ?? fail('That person was not found.');
      const { password: _password, pin: _pin, ...fields } = cmd.user;
      checkUser(s, fields, current.id);
      const users = s.users.map((u) => (u.id === current.id ? { ...fields, id: current.id, initials: initials(fields.name) } : u));
      if (!users.some((u) => u.access === 'manager')) fail('At least one person must keep manager access.');
      return { state: { ...s, users }, result: current.id };
    }
    case 'deleteUser': {
      const user = s.users.find((u) => u.id === cmd.userId) ?? fail('That person was not found.');
      if (user.id === ctx.actorId) fail('You cannot delete yourself.');
      if (usedInAudit(s, user.id)) fail('People in the audit history cannot be deleted.');
      if (user.access === 'manager' && s.users.filter((u) => u.access === 'manager').length === 1) fail('The last manager cannot be deleted.');
      return { state: { ...s, users: s.users.filter((u) => u.id !== user.id) } };
    }
    case 'updateRoute':
      return { state: { ...s, routes: s.routes.map((r) => (r.id === cmd.routeId ? { ...r, ...cmd.route } : r)) } };
    case 'deleteRoute':
      if (s.products.some((p) => p.route === cmd.routeId) || s.batches.some((b) => b.route === cmd.routeId)) fail('Routes used by products or batches cannot be deleted.');
      return { state: { ...s, routes: s.routes.filter((r) => r.id !== cmd.routeId) } };
    case 'setBusinessDetails':
      return { state: { ...s, business: cmd.business } };
    case 'setThresholds':
      return { state: { ...s, thresholds: { ...s.thresholds, ...(cmd.wastePct !== undefined ? { wastePct: cmd.wastePct } : {}), ...(cmd.lowStockKg !== undefined ? { lowStockKg: cmd.lowStockKg } : {}) } } };
    case 'setStationVariance':
      return { state: { ...s, thresholds: { ...s.thresholds, variancePct: { ...s.thresholds.variancePct, [cmd.station]: cmd.value } } } };
    case 'addOutputCategory': {
      const category: OutputCategory = { id: uniqueId(s.outputCategories, `${cmd.station}:${slug(cmd.name)}`), station: cmd.station, name: cmd.name, kind: cmd.kind, custom: true };
      return { state: { ...s, outputCategories: [...s.outputCategories, category] } };
    }
    case 'updateOutputCategory':
      return { state: { ...s, outputCategories: s.outputCategories.map((c) => (c.id === cmd.categoryId ? { ...c, station: cmd.station, name: cmd.name, kind: cmd.kind } : c)) } };
    case 'deleteOutputCategory':
      return { state: { ...s, outputCategories: s.outputCategories.filter((c) => c.id !== cmd.categoryId) } };
    case 'addContainer':
      return { state: { ...s, containers: [...s.containers, { ...cmd.container, id: `C-${ctx.newId()}` }] } };
    case 'updateContainer':
      return { state: { ...s, containers: s.containers.map((c) => (c.id === cmd.containerId ? { ...cmd.container, id: c.id } : c)) } };
    case 'deleteContainer':
      // Records keep their own copy of the container name and tare, so removing one never changes history.
      return { state: { ...s, containers: s.containers.filter((c) => c.id !== cmd.containerId) } };
    case 'setIdleMinutes':
      return { state: { ...s, idleMinutes: cmd.minutes } };
    case 'importBrowserData':
      return importBrowserData(s, cmd.data, ctx);
  }
}

/**
 * Brings data started by an older version up to the current line configuration. Batches, lots and
 * what the factory added itself are kept.
 *
 * Before version 3 the line had other routes and output rows, and a product for each chocolate type:
 * those become the current ones, and a type's product stays only where a batch was made of it.
 *
 * The chocolate types become those of the factory's recipes table. A type that was already made keeps
 * its versions and gets the table's recipe as a new one; a type never made is replaced by the table's,
 * and one the table does not have is removed.
 */
export function upgradeConfiguration(s: State, now: string): State {
  const seed = seedState();
  if (s.workflowVersion >= seed.workflowVersion) return s;
  const withStored = <T extends { id: string }>(current: T[], stored: T[]) => [...current, ...stored.filter((x) => !current.some((c) => c.id === x.id))];
  const line = s.workflowVersion >= 3 ? {} : {
    routes: withStored(seed.routes, s.routes),
    products: withStored(seed.products, s.products.filter((p) => !p.recipeId || s.batches.some((b) => b.productId === p.id))),
    outputCategories: withStored(seed.outputCategories, s.outputCategories.filter((c) => c.custom && c.station in seed.thresholds.variancePct)),
  };

  const sameRecipe = (a: RecipeIngredient[], b: RecipeIngredient[]) => a.length === b.length && a.every((i) => b.some((j) => j.name === i.name && j.percent === i.percent));
  const retired = (r: Recipe) => retiredChocolateTypes.includes(r.id) && !wasMade(s, r.id) && !s.plan?.lines.some((l) => l.recipeId === r.id);
  const own = s.recipes.filter((r) => !seed.recipes.some((type) => type.id === r.id) && !retired(r));
  const types = seed.recipes.flatMap((type): Recipe[] => {
    const stored = s.recipes.find((r) => r.id === type.id);
    const current = stored && versionOf(stored);
    const upToDate = Boolean(current && sameRecipe(current.ingredients, type.versions[0].ingredients));
    // Names are unique: one of the factory's own types with the table's name keeps it.
    const nameTaken = own.some((r) => r.name.trim().toLowerCase() === type.name.toLowerCase());
    if (stored && wasMade(s, stored.id)) {
      const name = nameTaken ? stored.name : type.name;
      if (upToDate) return [name === stored.name ? stored : { ...stored, name }];
      const version = stored.versions.length + 1;
      return [{ ...stored, name, currentVersion: version, versions: [...stored.versions, { ...type.versions[0], version, createdAt: now }] }];
    }
    if (nameTaken) return [];
    return [stored && upToDate && stored.name === type.name && stored.versions.length === 1 ? stored : type];
  });
  return { ...s, ...line, recipes: [...types, ...own], workflowVersion: seed.workflowVersion };
}

type LegacyUser = Partial<User> & { password?: string; pin?: string };

/**
 * Brings records a browser kept before the move to the server into the current shape: upgrades the
 * line configuration, strips passwords and PINs out of the people (they are returned separately to be hashed).
 */
export function migrateLegacy(stored: Record<string, unknown>, now: string): { state: State; secrets: Map<string, { password?: string; pin?: string }> } {
  const seed = seedState();
  const data = stored as Omit<Partial<State>, 'users' | 'outputCategories'> & { users?: LegacyUser[]; outputCategories?: (Partial<OutputCategory> & { station: StationId; name: string })[] };
  const secrets = new Map<string, { password?: string; pin?: string }>();
  const users = (data.users ?? []).filter((u): u is LegacyUser & { id: string; name: string } => Boolean(u?.id && u?.name)).map((u): User => {
    secrets.set(u.id, { password: u.password, pin: u.pin });
    return { id: u.id, name: u.name, role: u.role ?? 'Staff', initials: u.initials ?? initials(u.name), email: (u.email || `${slug(u.name).replace(/-/g, '.')}@cocoafactory.example`).toLowerCase(), access: u.access ?? 'manager', stations: u.stations ?? [] };
  });
  const storedCategories = (data.outputCategories ?? []).map((c, i): OutputCategory => ({ ...c, kind: c.kind ?? 'useful', id: c.id ?? `${c.station}:${slug(c.name)}-${i}` }));
  const state: State = {
    batches: data.batches ?? [], lots: data.lots ?? [], recipes: data.recipes ?? seed.recipes,
    products: [...seed.products, ...(data.products ?? []).filter((p) => !seed.products.some((x) => x.id === p.id))],
    routes: data.routes ?? seed.routes, packSizes: data.packSizes ?? seed.packSizes, suppliers: data.suppliers ?? [], users,
    outputCategories: storedCategories.length ? storedCategories : seed.outputCategories,
    containers: data.containers ?? seed.containers,
    thresholds: { ...seed.thresholds, ...(data.thresholds ?? {}), variancePct: { ...seed.thresholds.variancePct, ...(data.thresholds?.variancePct ?? {}) } },
    business: { ...seed.business, ...(data.business ?? {}) }, idleMinutes: data.idleMinutes ?? seed.idleMinutes, workflowVersion: data.workflowVersion ?? 1,
    // Browsers kept no counters: numbers continue from the highest IDs, and applyCommand() keeps the server's.
    idCounters: { batches: {}, lots: {} },
    // Browsers made chocolate the older way, without mixing runs.
    mixer: { holds: null, lastRunId: null }, mixerKeepsKg: seed.mixerKeepsKg, plan: null,
  };
  return { state: upgradeConfiguration(state, now), secrets };
}

/**
 * Replaces the factory's records with a browser's older copy; people already on the server are kept.
 * The prototype's sample password and PIN are public, so they are not carried over: anyone still
 * using them gets a new one from a manager before they can sign in.
 */
function importBrowserData(s: State, data: Record<string, unknown>, ctx: CommandContext): Outcome {
  if (!Array.isArray(data.batches) || !Array.isArray(data.lots)) fail('That does not look like data from this app.');
  const { state: imported, secrets } = migrateLegacy(data, ctx.now);
  const newUsers = imported.users.filter((u) => !s.users.some((x) => x.id === u.id || x.email.toLowerCase() === u.email.toLowerCase()));
  const state: State = { ...imported, users: [...s.users, ...newUsers] };
  const people = newUsers.map((u) => {
    const { password, pin } = secrets.get(u.id) ?? {};
    return {
      id: u.id,
      password: typeof password === 'string' && password.length >= 6 && password !== demoCredentials.password ? password : undefined,
      pin: typeof pin === 'string' && /^\d{4}$/.test(pin) && pin !== demoCredentials.pin ? pin : undefined,
    };
  });
  return { state, result: people };
}
