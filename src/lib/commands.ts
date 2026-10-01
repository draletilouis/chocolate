import { z } from 'zod';
import { stations } from './stations';
import type { Destination, StationId } from './types';

/**
 * Every change anyone can make, as a named command. The browser sends these to /api/commands;
 * the server validates them with these schemas and applies them in src/server/reduce.ts.
 */

const stationIds = stations.map((s) => s.id) as [StationId, ...StationId[]];
const id = z.string().trim().min(1).max(80);
const text = (max: number) => z.string().trim().max(max);
const qty = z.number().finite().min(0).max(10_000_000);
const station = z.enum(stationIds);
const destination = z.string().refine(
  (d) => ['stock', 'sale', 'rework', 'waste'].includes(d) || (d.startsWith('continue:') && (stationIds as string[]).includes(d.slice(9))),
  'Unknown destination',
) as unknown as z.ZodType<Destination>; // 'mixer' is only ever set by mixing itself, never sent
const kind = z.enum(['useful', 'byproduct', 'waste']);
const container = z.object({ name: text(80).min(1), tare: qty, gross: qty });
const output = z.object({ name: text(80).min(1), kind, weight: qty, destination, container: container.optional() });
const options = z.object({ advanceWorkflow: z.boolean().optional(), inputMaterial: text(120).optional() }).optional();
const lotCategory = z.enum(['Raw material', 'Intermediate', 'By-product', 'Rework', 'Finished goods']);
const pin = z.string().regex(/^\d{4}$/, 'The PIN must be 4 digits');
const password = z.string().min(6, 'Passwords need at least 6 characters').max(200);
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

const newBatch = z.object({
  productId: id,
  name: text(80).optional(),
  batchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startWeight: qty,
  supplierId: text(80).optional(),
  lotUses: z.array(z.object({ lotId: id, quantity: qty })).max(50),
  recipeVersion: z.number().int().positive().optional(),
  ingredients: z.array(z.object({ name: text(80).min(1), expected: qty, actual: qty, lotId: text(80).optional() })).max(50).optional(),
  note: text(1000).optional(),
});

const recipeIngredients = z.array(z.object({ name: text(80).min(1), percent: z.number().finite().min(0).max(100) })).min(1).max(30);

const product = z.object({ name: text(80).min(1), prefix: text(3).min(1).transform((p) => p.toUpperCase()), route: z.enum(['beans', 'pressing', 'chocolate']), recipeId: text(80).optional() });
const userFields = { name: text(80).min(1), role: text(80).min(1), email, access: z.enum(['operator', 'manager']), stations: z.array(station).max(stationIds.length) };

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('createBatch'), input: newBatch }),
  z.object({ type: z.literal('receiveDelivery'), batch: newBatch, input: z.object({ weight: qty, container: container.optional() }), outputs: z.array(output).min(1).max(30), note: text(1000).optional() }),
  // expectRecord: recordStamp() of the record the form was opened on (null for a new one), so two people cannot overwrite each other unseen.
  z.object({ type: z.literal('saveRecord'), batchId: id, station, input: z.object({ weight: qty, container: container.optional() }), outputs: z.array(output).max(30), note: text(1000).optional(), options, expectRecord: z.string().max(200).nullable().optional() }),
  // Mixing: one chocolate type per run, made on top of what the mixer holds (expectMixer: mixerStamp() the form was opened on).
  z.object({ type: z.literal('saveMixingRun'), batchId: id, recipeId: id, toRun: qty, ingredients: z.array(z.object({ name: text(80).min(1), actual: qty, lotId: text(80).optional() })).min(1).max(20), made: qty, kept: qty, expectMixer: z.string().max(200) }),
  z.object({ type: z.literal('undoMixingRun'), batchId: id, runId: id }),
  z.object({ type: z.literal('emptyMixer'), expectMixer: z.string().max(200) }),
  z.object({ type: z.literal('finishMixing'), batchId: id, note: text(1000).optional() }),
  z.object({ type: z.literal('setMixerKeeps'), kg: z.number().finite().min(0).max(10_000) }),
  // Pieces: good pieces of each size made from a chocolate lot, and undoing an unused lot of pieces.
  z.object({ type: z.literal('recordPieces'), lotId: id, pieces: z.array(z.object({ packSizeId: id, count: z.number().int().min(0).max(10_000_000) })).min(1).max(30) }),
  z.object({ type: z.literal('removePieces'), lotId: id }),
  // The production plan in pieces; managers only.
  z.object({ type: z.literal('setPlan'), lines: z.array(z.object({ recipeId: id, packSizeId: id, pieces: z.number().int().min(0).max(100_000_000) })).max(100), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: text(500).optional() }),
  z.object({ type: z.literal('completeBatch'), batchId: id, note: text(1000).optional() }),
  z.object({ type: z.literal('updateBatchDetails'), batchId: id, name: text(80).optional(), note: text(1000).optional() }),
  z.object({ type: z.literal('deleteBatch'), batchId: id }),
  z.object({ type: z.literal('placeHold'), batchId: id, reason: text(500).min(1) }),
  z.object({ type: z.literal('releaseHold'), batchId: id, note: text(500).min(1) }),
  z.object({ type: z.literal('addCorrection'), batchId: id, recordId: id, output: text(80).min(1), corrected: qty, reason: text(500).min(1) }),
  z.object({ type: z.literal('receiveLot'), input: z.object({ material: text(80).min(1), category: lotCategory, quantity: qty, unit: z.enum(['kg', 'units']), supplierId: id, reference: text(120).optional(), supplierBatch: text(80).optional() }) }),
  z.object({ type: z.literal('updateLot'), lotId: id, material: text(80).min(1), category: lotCategory, supplierId: text(80).optional(), reference: text(120).optional(), supplierBatch: text(80).optional() }),
  z.object({ type: z.literal('deleteLot'), lotId: id }),
  z.object({ type: z.literal('addRecipeVersion'), recipeId: id, ingredients: recipeIngredients, note: text(500) }),
  // A new chocolate type: its product and the first version of its recipe, made together.
  z.object({ type: z.literal('addChocolateType'), name: text(80).min(1), ingredients: recipeIngredients, note: text(500).optional() }),
  z.object({ type: z.literal('updateRecipe'), recipeId: id, name: text(80).min(1) }),
  z.object({ type: z.literal('deleteRecipe'), recipeId: id }),
  z.object({ type: z.literal('addProduct'), product }),
  z.object({ type: z.literal('updateProduct'), productId: id, product }),
  z.object({ type: z.literal('deleteProduct'), productId: id }),
  z.object({ type: z.literal('addPackSize'), pack: z.object({ name: text(80).min(1), grams: z.number().finite().positive().max(1_000_000) }) }),
  z.object({ type: z.literal('updatePackSize'), packSizeId: id, pack: z.object({ name: text(80).min(1), grams: z.number().finite().positive().max(1_000_000) }) }),
  z.object({ type: z.literal('deletePackSize'), packSizeId: id }),
  z.object({ type: z.literal('addSupplier'), supplier: z.object({ name: text(120).min(1), supplies: text(200).min(1), contact: text(200) }) }),
  z.object({ type: z.literal('updateSupplier'), supplierId: id, supplier: z.object({ name: text(120).min(1), supplies: text(200).min(1), contact: text(200) }) }),
  z.object({ type: z.literal('deleteSupplier'), supplierId: id }),
  z.object({ type: z.literal('addUser'), user: z.object({ ...userFields, password, pin }) }),
  z.object({ type: z.literal('updateUser'), userId: id, user: z.object({ ...userFields, password: password.optional(), pin: pin.optional() }) }),
  z.object({ type: z.literal('deleteUser'), userId: id }),
  z.object({ type: z.literal('updateRoute'), routeId: id, route: z.object({ name: text(120).min(1), startMaterial: text(120).min(1), note: text(500) }) }),
  z.object({ type: z.literal('deleteRoute'), routeId: id }),
  z.object({ type: z.literal('setBusinessDetails'), business: z.object({ name: text(100).min(1), address: text(160), phone: text(40), email: text(120) }) }),
  z.object({ type: z.literal('setThresholds'), wastePct: z.number().finite().min(0).max(100).optional(), lowStockKg: qty.optional() }),
  z.object({ type: z.literal('setStationVariance'), station, value: z.number().finite().min(0).max(100) }),
  z.object({ type: z.literal('addOutputCategory'), station, name: text(80).min(1), kind }),
  z.object({ type: z.literal('updateOutputCategory'), categoryId: id, station, name: text(80).min(1), kind }),
  z.object({ type: z.literal('deleteOutputCategory'), categoryId: id }),
  z.object({ type: z.literal('addContainer'), container: z.object({ name: text(80).min(1), tare: qty }) }),
  z.object({ type: z.literal('updateContainer'), containerId: id, container: z.object({ name: text(80).min(1), tare: qty }) }),
  z.object({ type: z.literal('deleteContainer'), containerId: id }),
  z.object({ type: z.literal('setIdleMinutes'), minutes: z.number().int().min(0).max(24 * 60) }),
  // Records a browser kept before the move to the server, uploaded once by a manager.
  z.object({ type: z.literal('importBrowserData'), data: z.record(z.unknown()) }),
]);

export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];

/** Commands an operator may run. Everything else needs manager access. */
export const operatorCommands = new Set<CommandType>([
  'createBatch', 'receiveDelivery', 'saveRecord', 'saveMixingRun', 'undoMixingRun', 'emptyMixer', 'finishMixing', 'recordPieces', 'removePieces', 'completeBatch', 'updateBatchDetails', 'deleteBatch', 'placeHold', 'addCorrection',
]);

export const signInSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('pin'), userId: id, pin }),
  z.object({ method: z.literal('password'), email, password: z.string().min(1).max(200), trustDevice: z.boolean().optional(), deviceName: text(80).optional() }),
]);

export const firstManagerSchema = z.object({ name: text(80).min(1), role: text(80).optional(), email, password, pin, deviceName: text(80).optional() });
