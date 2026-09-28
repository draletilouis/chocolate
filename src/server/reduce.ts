import { calculatePackaging, round2 } from '@/lib/balance';
import type { Command } from '@/lib/commands';
import { batchDisplayName, isReadyAt, issuedNumbers, nextBatchId, nextInput, nextLotId, pendingStations, recordStamp, waitingAt } from '@/lib/derive';
import { demoCredentials, seedState, type State } from '@/lib/seed';
import { stationById, stationName } from '@/lib/stations';
import type { Batch, Lot, LotCategory, OutputCategory, RecordedOutput, StationId, StationRecord, User } from '@/lib/types';

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
  if (product.route === 'chocolate' && !product.recipeId) fail('This product has no recipe yet.');
  if (!(input.startWeight > 0)) fail('Enter the starting weight.');
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

type SavePackaging = Extract<Command, { type: 'savePackaging' }>;

function savePackaging(s: State, cmd: SavePackaging, ctx: CommandContext): State {
  const b = findBatch(s, cmd.batchId);
  const early = cmd.options?.advanceWorkflow === false;
  const existing = checkStation(b, 'packaging', cmd.expectRecord, early);
  const pack = s.packSizes.find((p) => p.id === cmd.packSizeId) ?? fail('That pack size no longer exists.');
  if (!(cmd.inputWeight > 0)) fail('Enter the input weight.');
  if (!(cmd.totalUnits > 0)) fail('Enter the total units made.');
  if (cmd.rejectedUnits > cmd.totalUnits) fail('Rejected units cannot be more than the total made.');
  const { acceptedUnits, acceptedWeight } = calculatePackaging(cmd.totalUnits, cmd.rejectedUnits, pack.grams);
  const outputs: RecordedOutput[] = [
    { name: 'Accepted units', kind: 'useful' as const, weight: acceptedWeight, destination: 'stock' as const },
    { name: 'Rejected units', kind: 'waste' as const, weight: round2((cmd.rejectedUnits * pack.grams) / 1000), destination: 'waste' as const },
  ].filter((o) => o.weight > 0 || o.name === 'Accepted units');
  const draft: StationRecord = {
    id: existing?.id ?? `packaging-${ctx.now}`, station: 'packaging', inputMaterial: existing?.inputMaterial ?? cmd.options?.inputMaterial ?? 'Finished chocolate', inputWeight: round2(cmd.inputWeight), inputLotIds: [],
    outputs, packaging: { packSizeId: pack.id, packGrams: pack.grams, totalUnits: cmd.totalUnits, rejectedUnits: cmd.rejectedUnits, acceptedUnits, acceptedWeight },
    recordedAt: ctx.now, recordedBy: ctx.userId, rev: ctx.newId(), note: cmd.note || undefined, destinationsSaved: true,
  };
  return commitRecord(s, b.id, draft, !early, ctx.now);
}

function usedInAudit(s: State, userId: string) {
  return s.batches.some((b) => b.records.some((r) => r.recordedBy === userId) || b.holds.some((h) => h.placedBy === userId) || b.corrections.some((c) => c.correctedBy === userId));
}

function checkUser(s: State, user: { email: string; stations: StationId[] }, exceptId?: string) {
  if (s.users.some((u) => u.id !== exceptId && u.email.toLowerCase() === user.email.toLowerCase())) fail('Another person already uses that email address.');
}

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
    case 'savePackaging': return { state: savePackaging(s, cmd, ctx) };
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
      const lot: Lot = { id, material: cmd.input.material, category: cmd.input.category, received: round2(cmd.input.quantity), available: round2(cmd.input.quantity), unit: cmd.input.unit, source: { type: 'supplier', supplierId: cmd.input.supplierId, reference: cmd.input.reference || undefined }, receivedAt: ctx.now, uses: [] };
      return { state: { ...s, lots: [...s.lots, lot] }, result: id };
    }
    case 'updateLot': {
      const lot = s.lots.find((l) => l.id === cmd.lotId) ?? fail('That lot was not found.');
      if (lot.source.type !== 'supplier') fail('Lots made by production are corrected from their batch.');
      if (cmd.supplierId && !s.suppliers.some((x) => x.id === cmd.supplierId)) fail('That supplier was not found.');
      const source = lot.source;
      const next: Lot = { ...lot, material: cmd.material, category: cmd.category, source: { ...source, supplierId: cmd.supplierId || source.supplierId, reference: cmd.reference || undefined } };
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
      const total = cmd.ingredients.reduce((sum, i) => sum + i.percent, 0);
      if (Math.abs(total - 100) > 0.01) fail(`The ingredients add up to ${round2(total)}%. They must add up to 100%.`);
      const version = recipe.versions.length + 1;
      const next = { ...recipe, currentVersion: version, versions: [...recipe.versions, { version, createdAt: ctx.now, ingredients: cmd.ingredients, note: cmd.note }] };
      return { state: { ...s, recipes: s.recipes.map((r) => (r.id === recipe.id ? next : r)) } };
    }
    case 'updateRecipe': {
      const recipe = s.recipes.find((r) => r.id === cmd.recipeId) ?? fail('That recipe was not found.');
      return { state: { ...s, recipes: s.recipes.map((r) => (r.id === recipe.id ? { ...r, name: cmd.name } : r)) } };
    }
    case 'deleteRecipe': {
      if (s.batches.some((b) => b.recipeId === cmd.recipeId)) fail('Recipes used by batches cannot be deleted.');
      // Products keep existing without the recipe; they must get one before they can be batched.
      return { state: { ...s, recipes: s.recipes.filter((r) => r.id !== cmd.recipeId), products: s.products.map((p) => (p.recipeId === cmd.recipeId ? { ...p, recipeId: undefined } : p)) } };
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
      if (s.batches.some((b) => b.records.some((r) => r.packaging?.packSizeId === cmd.packSizeId))) fail('Pack sizes used by packaging records cannot be deleted.');
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

type LegacyUser = Partial<User> & { password?: string; pin?: string };

/**
 * Brings records a browser kept before the move to the server into the current shape: upgrades the
 * line layout, strips passwords and PINs out of the people (they are returned separately to be hashed).
 */
export function migrateLegacy(stored: Record<string, unknown>): { state: State; secrets: Map<string, { password?: string; pin?: string }> } {
  const seed = seedState();
  const data = stored as Omit<Partial<State>, 'users' | 'outputCategories'> & { users?: LegacyUser[]; outputCategories?: (Partial<OutputCategory> & { station: StationId; name: string })[] };
  const secrets = new Map<string, { password?: string; pin?: string }>();
  const users = (data.users ?? []).filter((u): u is LegacyUser & { id: string; name: string } => Boolean(u?.id && u?.name)).map((u): User => {
    secrets.set(u.id, { password: u.password, pin: u.pin });
    return { id: u.id, name: u.name, role: u.role ?? 'Staff', initials: u.initials ?? initials(u.name), email: (u.email || `${slug(u.name).replace(/-/g, '.')}@cocoafactory.example`).toLowerCase(), access: u.access ?? 'manager', stations: u.stations ?? [] };
  });
  const upgradeWorkflow = (data.workflowVersion ?? 1) < seed.workflowVersion;
  const storedCategories = (data.outputCategories ?? []).map((c, i): OutputCategory => ({ ...c, kind: c.kind ?? 'useful', id: c.id ?? `${c.station}:${slug(c.name)}-${i}` }));
  const outputCategories = upgradeWorkflow ? [...seed.outputCategories, ...storedCategories.filter((c) => c.custom && c.station in seed.thresholds.variancePct)] : storedCategories.length ? storedCategories : seed.outputCategories;
  const routes = upgradeWorkflow ? [...seed.routes, ...(data.routes ?? []).filter((r) => !seed.routes.some((x) => x.id === r.id))] : data.routes ?? seed.routes;
  const state: State = {
    batches: data.batches ?? [], lots: data.lots ?? [], recipes: data.recipes ?? seed.recipes,
    products: [...seed.products, ...(data.products ?? []).filter((p) => !seed.products.some((x) => x.id === p.id))],
    routes, packSizes: data.packSizes ?? seed.packSizes, suppliers: data.suppliers ?? [], users, outputCategories,
    containers: data.containers ?? seed.containers,
    thresholds: { ...seed.thresholds, ...(data.thresholds ?? {}), variancePct: { ...seed.thresholds.variancePct, ...(data.thresholds?.variancePct ?? {}) } },
    business: { ...seed.business, ...(data.business ?? {}) }, idleMinutes: data.idleMinutes ?? seed.idleMinutes, workflowVersion: seed.workflowVersion,
    // Browsers kept no counters: numbers continue from the highest IDs, and applyCommand() keeps the server's.
    idCounters: { batches: {}, lots: {} },
  };
  return { state, secrets };
}

/**
 * Replaces the factory's records with a browser's older copy; people already on the server are kept.
 * The prototype's sample password and PIN are public, so they are not carried over: anyone still
 * using them gets a new one from a manager before they can sign in.
 */
function importBrowserData(s: State, data: Record<string, unknown>, _ctx: CommandContext): Outcome {
  if (!Array.isArray(data.batches) || !Array.isArray(data.lots)) fail('That does not look like data from this app.');
  const { state: imported, secrets } = migrateLegacy(data);
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
