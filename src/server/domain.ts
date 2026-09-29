import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { calculatePackaging, round2 } from '@/lib/balance';
import { nextBatchId, nextLotId } from '@/lib/derive';
import { seedState, type State } from '@/lib/seed';
import { defaultDestination, destinationOptions, stationById } from '@/lib/stations';
import type {
  Batch, Destination, Ingredient, Lot, LotCategory, OutputKind, PackSize, Product, Recipe, RecipeIngredient,
  RecordedOutput, Route, StationId, StationRecord, Supplier, Thresholds,
} from '@/lib/types';
import { recordAudit, type AuditEvent } from './auth/audit';
import { ensureSchema, getPool, query, queryOne } from './db';

type Actor = { id: number; name: string; role: string };
type RequestContext = { method?: string; path?: string; ip?: string | null; userAgent?: string | null };

const now = () => new Date().toISOString().slice(0, 19);
const json = (value: unknown) => JSON.stringify(value ?? null);
const number = (value: unknown) => Number(value ?? 0);
const timestamp = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function missing(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 404 });
}

function invalid(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 });
}

function conflict(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 409 });
}

function actorFor(actor: Actor) {
  return { id: actor.id, name: actor.name, role: actor.role };
}

async function audited(event: Omit<AuditEvent, 'actor'>, actor: Actor, request?: RequestContext) {
  await recordAudit({ ...event, actor: actorFor(actor), request });
}

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function stateForIds(batchIds: string[], lotIds: string[]) {
  return { batches: batchIds.map((id) => ({ id })), lots: lotIds.map((id) => ({ id })) } as State;
}

type BatchRow = {
  id: string; product_id: string; product: string; route_id: string; started_at: string | Date; supplier_id: string | null;
  status: Batch['status']; next_station: StationId | null; start_input: Batch['startInput']; recipe_id: string | null;
  recipe_version: number | null; ingredients: Ingredient[] | null; records: StationRecord[]; holds: Batch['holds'];
  corrections: Batch['corrections']; completed_at: string | Date | null; note: string | null;
};

function mapBatch(row: BatchRow): Batch {
  return {
    id: row.id, productId: row.product_id, product: row.product, route: row.route_id as Batch['route'],
    startedAt: timestamp(row.started_at), status: row.status, supplierId: row.supplier_id ?? undefined, nextStation: row.next_station,
    startInput: row.start_input, recipeId: row.recipe_id ?? undefined, recipeVersion: row.recipe_version ?? undefined,
    ingredients: row.ingredients ?? undefined, records: row.records ?? [], holds: row.holds ?? [],
    corrections: row.corrections ?? [], completedAt: row.completed_at ? timestamp(row.completed_at) : undefined,
    note: row.note ?? undefined,
  };
}

function mapLot(row: { id: string; material: string; category: LotCategory; received: unknown; available: unknown; unit: Lot['unit']; source: Lot['source']; received_at: string | Date; uses: Lot['uses'] }): Lot {
  return { id: row.id, material: row.material, category: row.category, received: number(row.received), available: number(row.available), unit: row.unit, source: row.source, receivedAt: timestamp(row.received_at), uses: row.uses ?? [] };
}

function mapRecipe(row: { id: string; name: string; product_id: string; current_version: number; versions: Recipe['versions'] }): Recipe {
  return { id: row.id, name: row.name, productId: row.product_id, currentVersion: row.current_version, versions: row.versions ?? [] };
}

let seedPromise: Promise<void> | undefined;

async function insertSeed(client: PoolClient, state: State) {
  for (const route of state.routes) {
    await client.query(
      `INSERT INTO routes(id, name, stations, start_material, note, sort_order) VALUES ($1, $2, $3::jsonb, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [route.id, route.name, json(route.stations), route.startMaterial, route.note, state.routes.indexOf(route) + 1],
    );
  }
  for (const product of state.products) {
    await client.query(
      `INSERT INTO products(id, name, prefix, route_id, recipe_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [product.id, product.name, product.prefix, product.route, product.recipeId ?? null, state.products.indexOf(product) + 1],
    );
  }
  for (const pack of state.packSizes) {
    await client.query(`INSERT INTO pack_sizes(id, name, grams, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`, [pack.id, pack.name, pack.grams, state.packSizes.indexOf(pack) + 1]);
  }
  for (const supplier of state.suppliers) {
    await client.query(`INSERT INTO suppliers(id, name, supplies, contact, sort_order) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [supplier.id, supplier.name, supplier.supplies, supplier.contact, state.suppliers.indexOf(supplier) + 1]);
  }
  for (const output of state.outputCategories) {
    await client.query(
      `INSERT INTO output_categories(station, name, kind, custom) VALUES ($1, $2, $3, $4) ON CONFLICT (station, name, kind) DO NOTHING`,
      [output.station, output.name, output.kind, output.custom ?? false],
    );
  }
  await client.query(
    `INSERT INTO thresholds(id, variance_pct, waste_pct, low_stock_kg) VALUES ('default', $1::jsonb, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [json(state.thresholds.variancePct), state.thresholds.wastePct, state.thresholds.lowStockKg],
  );
  for (const recipe of state.recipes) {
    await client.query(
      `INSERT INTO recipes(id, name, product_id, current_version, versions, sort_order) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (id) DO NOTHING`,
      [recipe.id, recipe.name, recipe.productId, recipe.currentVersion, json(recipe.versions), state.recipes.indexOf(recipe) + 1],
    );
  }
  for (const lot of state.lots) {
    await client.query(
      `INSERT INTO lots(id, material, category, received, available, unit, source, received_at, uses) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb) ON CONFLICT (id) DO NOTHING`,
      [lot.id, lot.material, lot.category, lot.received, lot.available, lot.unit, json(lot.source), lot.receivedAt, json(lot.uses)],
    );
  }
  for (const batch of state.batches) {
    await client.query(
      `INSERT INTO batches(id, product_id, product, route_id, started_at, status, next_station, start_input, recipe_id, recipe_version, ingredients, records, holds, corrections, completed_at, note, supplier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17) ON CONFLICT (id) DO NOTHING`,
      [batch.id, batch.productId, batch.product, batch.route, batch.startedAt, batch.status, batch.nextStation, json(batch.startInput), batch.recipeId ?? null,
        batch.recipeVersion ?? null, json(batch.ingredients ?? null), json(batch.records), json(batch.holds), json(batch.corrections), batch.completedAt ?? null, batch.note ?? null, batch.supplierId ?? null],
    );
  }
}

/** Seed only an empty domain; authentication users remain managed separately. */
export async function ensureDomainSeeded() {
  if (!seedPromise) {
    seedPromise = transaction(async (client) => {
      const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM batches');
      if (Number(count.rows[0]?.count ?? 0) === 0) await insertSeed(client, seedState());
    }).catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  return seedPromise;
}

export async function loadState(actorId: number): Promise<State> {
  await ensureDomainSeeded();
  // One round-trip for the state payload is materially faster than opening
  // ten pool queries for every full page load. Each aggregate still uses its
  // explicit worker-facing order.
  const aggregate = (await query<{
    batches: BatchRow[]; lots: unknown[]; recipes: unknown[]; products: unknown[]; routes: unknown[]; pack_sizes: unknown[];
    suppliers: unknown[]; output_categories: unknown[]; thresholds: { variance_pct: Thresholds['variancePct']; waste_pct: unknown; low_stock_kg: unknown } | null; users: unknown[];
  }>(`
    SELECT
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT * FROM batches ORDER BY started_at DESC) x), '[]'::json) AS batches,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT * FROM lots ORDER BY received_at DESC) x), '[]'::json) AS lots,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT * FROM recipes ORDER BY sort_order, name) x), '[]'::json) AS recipes,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, name, prefix, route_id, recipe_id FROM products ORDER BY sort_order, name) x), '[]'::json) AS products,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, name, stations, start_material, note FROM routes ORDER BY sort_order, name) x), '[]'::json) AS routes,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, name, grams FROM pack_sizes ORDER BY sort_order, grams) x), '[]'::json) AS pack_sizes,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, name, supplies, contact FROM suppliers ORDER BY sort_order, name) x), '[]'::json) AS suppliers,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, station, name, kind, custom FROM output_categories ORDER BY id) x), '[]'::json) AS output_categories,
      (SELECT to_jsonb(x) FROM (SELECT variance_pct, waste_pct, low_stock_kg FROM thresholds WHERE id = 'default') x) AS thresholds,
      COALESCE((SELECT json_agg(to_jsonb(x)) FROM (SELECT id, name, role, role_label, email, is_active, password_reset_required, last_login_at FROM users ORDER BY name) x), '[]'::json) AS users
  `)).rows[0];
  const threshold = aggregate.thresholds;
  return {
    batches: aggregate.batches.map(mapBatch),
    lots: aggregate.lots.map((row) => mapLot(row as never)),
    recipes: aggregate.recipes.map((row) => mapRecipe(row as never)),
    products: aggregate.products.map((row) => ({ id: (row as { id: string }).id, name: (row as { name: string }).name, prefix: (row as { prefix: string }).prefix, route: (row as { route_id: string }).route_id, recipeId: (row as { recipe_id: string | null }).recipe_id ?? undefined } as Product)),
    routes: aggregate.routes.map((row) => ({ id: (row as { id: string }).id, name: (row as { name: string }).name, stations: (row as { stations: StationId[] }).stations, startMaterial: (row as { start_material: string }).start_material, note: (row as { note: string }).note } as Route)),
    packSizes: aggregate.pack_sizes.map((row) => ({ id: (row as { id: string }).id, name: (row as { name: string }).name, grams: number((row as { grams: unknown }).grams) } as PackSize)),
    suppliers: aggregate.suppliers.map((row) => ({ id: (row as { id: string }).id, name: (row as { name: string }).name, supplies: (row as { supplies: string }).supplies, contact: (row as { contact: string }).contact } as Supplier)),
    users: aggregate.users.map((row) => ({ id: `db-${(row as { id: number }).id}`, name: (row as { name: string }).name, role: (row as { role_label: string | null; role: string }).role_label || (row as { role: string }).role, initials: (row as { name: string }).name.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(), email: (row as { email: string }).email })),
    currentUserId: `db-${actorId}`,
    thresholds: { variancePct: threshold?.variance_pct ?? seedState().thresholds.variancePct, wastePct: number(threshold?.waste_pct), lowStockKg: number(threshold?.low_stock_kg) },
    outputCategories: aggregate.output_categories.map((row) => ({
      id: Number((row as { id: unknown }).id),
      station: (row as { station: StationId }).station,
      name: (row as { name: string }).name,
      kind: (row as { kind: OutputKind }).kind,
      custom: (row as { custom: boolean }).custom,
    })),
  };
}

export async function createBatch(input: { productId: string; supplierId?: string; startWeight: number; lotUses: { lotId: string; quantity: number }[]; recipeVersion?: number; ingredients?: Ingredient[]; note?: string }, actor: Actor) {
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cocoa-batch-id'))`);
    const product = (await client.query<{ id: string; name: string; prefix: string; route_id: string; recipe_id: string | null }>('SELECT * FROM products WHERE id = $1', [input.productId])).rows[0];
    if (!product) throw missing('Product not found');
    const route = (await client.query<{ stations: StationId[] }>('SELECT stations FROM routes WHERE id = $1', [product.route_id])).rows[0];
    if (!route?.stations?.length) throw invalid('Product route has no starting station');
    // Every batch is assigned to a supplier: bean batches choose one, the others inherit it from their starting lot.
    if (!input.supplierId) throw invalid('Choose the supplier for this batch.');
    if (!(await client.query('SELECT 1 FROM suppliers WHERE id = $1', [input.supplierId])).rowCount) throw missing('Supplier not found');
    const ids = (await client.query<{ id: string }>('SELECT id FROM batches')).rows.map((row) => row.id);
    const id = nextBatchId(stateForIds(ids, []), product.prefix);
    const stamp = now();
    for (const use of input.lotUses.filter((item) => item.quantity > 0)) {
      const lot = (await client.query<{ available: unknown; uses: Lot['uses'] }>('SELECT available, uses FROM lots WHERE id = $1 FOR UPDATE', [use.lotId])).rows[0];
      if (!lot) throw missing(`Lot ${use.lotId} not found`);
      // The scale is the truth: the batch keeps the weight actually used, and a lot
      // whose record shows less than that is drawn down to zero rather than rejected.
      const drawn = round2(Math.min(number(lot.available), use.quantity));
      await client.query('UPDATE lots SET available = available - $2, uses = uses || $3::jsonb, updated_at = NOW() WHERE id = $1', [use.lotId, drawn, json([{ batchId: id, quantity: drawn, station: route.stations[0], at: stamp }])]);
    }
    await client.query(
      `INSERT INTO batches(id, product_id, product, route_id, started_at, status, next_station, start_input, recipe_id, recipe_version, ingredients, records, holds, corrections, note, created_by, supplier_id)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb, $8, $9, $10::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $11, $12, $13)`,
      [id, product.id, product.name, product.route_id, stamp, route.stations[0], json({ material: (await client.query<{ start_material: string }>('SELECT start_material FROM routes WHERE id = $1', [product.route_id])).rows[0]?.start_material ?? '', weight: round2(input.startWeight), lotIds: input.lotUses.map((use) => use.lotId) }), product.recipe_id, input.recipeVersion ?? null, json(input.ingredients ?? null), input.note ?? null, actor.id, input.supplierId],
    );
    return id;
  });
}

async function loadBatchForUpdate(client: PoolClient, batchId: string) {
  const row = (await client.query<BatchRow>('SELECT * FROM batches WHERE id = $1 FOR UPDATE', [batchId])).rows[0];
  if (!row) throw missing(`Batch ${batchId} not found`);
  return row;
}

export async function saveMeasurements(batchId: string, station: StationId, inputWeight: number, outputs: { name: string; kind: OutputKind; weight: number }[], note: string | undefined, actor: Actor) {
  return transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const existing = (row.records ?? []).find((record) => record.station === station);
    const def = stationById[station];
    const recorded: RecordedOutput[] = outputs.filter((output) => output.weight > 0).map((output, index) => {
      const previous = existing?.outputs.find((item) => item.name === output.name)?.destination;
      const destination = previous && destinationOptions(def, output.name).includes(previous) ? previous : defaultDestination(station, output, index);
      return { name: output.name, kind: output.kind, weight: round2(output.weight), destination };
    });
    if (def.strictBalance) {
      const measured = round2(recorded.reduce((sum, output) => sum + output.weight, 0));
      if (Math.abs(round2(inputWeight) - measured) > 0.01) throw invalid(`${def.name} outputs must add up to the input exactly: outputs total ${measured} kg but the input is ${round2(inputWeight)} kg.`);
    }
    const record: StationRecord = {
      id: existing?.id ?? `${station}-${now()}`, station, inputMaterial: existing?.inputMaterial ?? ((row.records?.length ?? 0) ? row.records.at(-1)!.outputs.filter((output) => output.destination === `continue:${station}`).map((output) => output.name).join(' + ') || stationById[station].input : row.start_input.material),
      inputWeight: round2(inputWeight), inputLotIds: existing?.inputLotIds ?? ((row.records?.length ?? 0) ? [] : row.start_input.lotIds), outputs: recorded,
      recordedAt: now(), recordedBy: `db-${actor.id}`, note, destinationsSaved: false,
    };
    const records = existing ? row.records.map((item) => item.station === station ? record : item) : [...(row.records ?? []), record];
    await client.query('UPDATE batches SET records = $2::jsonb, updated_at = NOW() WHERE id = $1', [batchId, json(records)]);
    return record.id;
  });
}

export async function savePackaging(batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note: string | undefined, actor: Actor) {
  return transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const pack = (await client.query<{ id: string; name: string; grams: unknown }>('SELECT * FROM pack_sizes WHERE id = $1', [packSizeId])).rows[0];
    if (!pack) throw missing('Pack size not found');
    const { acceptedUnits, acceptedWeight } = calculatePackaging(totalUnits, rejectedUnits, number(pack.grams));
    const existing = (row.records ?? []).find((record) => record.station === 'packaging');
    const outputs: RecordedOutput[] = [
      { name: 'Accepted units', kind: 'useful', weight: acceptedWeight, destination: 'stock' } as RecordedOutput,
      { name: 'Rejected units', kind: 'waste', weight: round2((rejectedUnits * number(pack.grams)) / 1000), destination: 'waste' } as RecordedOutput,
    ].filter((output) => output.weight > 0 || output.name === 'Accepted units');
    const record: StationRecord = { id: existing?.id ?? `packaging-${now()}`, station: 'packaging', inputMaterial: 'Finished chocolate', inputWeight: round2(inputWeight), inputLotIds: [], outputs, packaging: { packSizeId, packGrams: number(pack.grams), totalUnits, rejectedUnits, acceptedUnits, acceptedWeight }, recordedAt: now(), recordedBy: `db-${actor.id}`, note, destinationsSaved: false };
    const records = existing ? row.records.map((item) => item.station === 'packaging' ? record : item) : [...(row.records ?? []), record];
    await client.query('UPDATE batches SET records = $2::jsonb, updated_at = NOW() WHERE id = $1', [batchId, json(records)]);
    return record.id;
  });
}

export async function saveDestinations(batchId: string, recordId: string, destinations: Record<string, Destination>, actor: Actor) {
  return transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const current = (row.records ?? []).find((record) => record.id === recordId);
    if (!current) throw missing('Station record not found');
    const outputs: RecordedOutput[] = current.outputs.map((output) => ({ ...output, destination: destinations[output.name] ?? output.destination, lotId: undefined } as RecordedOutput));
    const def = stationById[current.station];
    for (const output of outputs) {
      if (def && !destinationOptions(def, output.name).includes(output.destination)) throw invalid(`${output.name} cannot go to "${output.destination}" at ${def.name.toLowerCase()}.`);
    }
    const continued = outputs.map((output) => output.destination).find((destination): destination is `continue:${StationId}` => destination.startsWith('continue:'));
    const nextStation: StationId | null = continued ? continued.slice(9) as StationId : 'completion';
    const record = { ...current, outputs, destinationsSaved: true };
    const records = (row.records ?? []).map((item) => item.id === recordId ? record : item);
    const oldGenerated = (await client.query<{ id: string; uses: Lot['uses'] }>(`SELECT id, uses FROM lots WHERE source->>'type' = 'batch' AND source->>'batchId' = $1 AND source->>'station' = $2`, [batchId, current.station])).rows;
    for (const old of oldGenerated) if (!(old.uses?.length)) await client.query('DELETE FROM lots WHERE id = $1', [old.id]);
    // Keep IDs of previously generated lots that are already consumed; they
    // remain part of traceability and must not be re-used by the next lot.
    const lotIds = (await client.query<{ id: string }>('SELECT id FROM lots')).rows.map((item) => item.id);
    const created: Lot[] = [];
    for (const output of outputs) {
      if (output.destination !== 'stock' && output.destination !== 'rework' && output.destination !== 'sale') continue;
      const isUnits = current.station === 'packaging' && output.name === 'Accepted units';
      const id = nextLotId(stateForIds([], lotIds.concat(created.map((lot) => lot.id))), output.name);
      lotIds.push(id);
      const category: LotCategory = output.destination === 'rework' ? 'Rework' : output.destination === 'sale' || isUnits ? 'Finished goods' : output.kind === 'byproduct' ? 'By-product' : 'Intermediate';
      const quantity = isUnits ? current.packaging!.acceptedUnits : output.weight;
      created.push({ id, material: isUnits ? `${row.product} · ${(await client.query<{ name: string }>('SELECT name FROM pack_sizes WHERE id = $1', [current.packaging!.packSizeId])).rows[0]?.name ?? ''}` : output.name, category, received: quantity, available: quantity, unit: isUnits ? 'units' : 'kg', source: { type: 'batch', batchId, station: current.station }, receivedAt: now(), uses: [] });
      output.lotId = id;
    }
    const finalRecords = records.map((item) => item.id === recordId ? { ...item, outputs } : item);
    await client.query('UPDATE batches SET records = $2::jsonb, next_station = $3, updated_at = NOW() WHERE id = $1', [batchId, json(finalRecords), nextStation]);
    for (const lot of created) {
      await client.query('INSERT INTO lots(id, material, category, received, available, unit, source, received_at, uses) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)', [lot.id, lot.material, lot.category, lot.received, lot.available, lot.unit, json(lot.source), lot.receivedAt, json(lot.uses)]);
    }
  });
}

export async function completeBatch(batchId: string, note: string | undefined, actor: Actor, request?: RequestContext) {
  await transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    await client.query('UPDATE batches SET status = \'completed\', next_station = NULL, completed_at = NOW(), note = COALESCE($2, note), updated_at = NOW() WHERE id = $1', [batchId, note || row.note]);
  });
  await audited({ category: 'system', action: 'batch.completed', entityType: 'batch', entityId: batchId, description: `Batch ${batchId} completed`, metadata: { note } }, actor, request);
}

export async function placeHold(batchId: string, reason: string, actor: Actor, request?: RequestContext) {
  const holdId = randomUUID();
  await transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const hold = { id: holdId, reason, placedAt: now(), placedBy: `db-${actor.id}`, station: row.next_station };
    await client.query('UPDATE batches SET status = \'hold\', holds = $2::jsonb, updated_at = NOW() WHERE id = $1', [batchId, json([...(row.holds ?? []), hold])]);
  });
  await audited({ category: 'system', action: 'batch.hold.placed', entityType: 'batch', entityId: batchId, description: reason, severity: 'warning', metadata: { holdId, reason } }, actor, request);
}

export async function releaseHold(batchId: string, note: string, actor: Actor, request?: RequestContext) {
  await transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const stamp = now();
    const holds = (row.holds ?? []).map((hold) => hold.releasedAt ? hold : { ...hold, releasedAt: stamp, releaseNote: note });
    await client.query('UPDATE batches SET status = \'active\', holds = $2::jsonb, updated_at = NOW() WHERE id = $1', [batchId, json(holds)]);
  });
  await audited({ category: 'system', action: 'batch.hold.released', entityType: 'batch', entityId: batchId, description: note, metadata: { note } }, actor, request);
}

export async function addCorrection(batchId: string, recordId: string, output: string, corrected: number, reason: string, actor: Actor, request?: RequestContext) {
  await transaction(async (client) => {
    const row = await loadBatchForUpdate(client, batchId);
    const record = (row.records ?? []).find((item) => item.id === recordId);
    const target = record?.outputs.find((item) => item.name === output);
    if (!record || !target) throw missing('Output record not found');
    if (stationById[record.station]?.strictBalance) {
      const correctedTotal = round2(record.outputs.reduce((sum, item) => sum + (item.name === output ? corrected : item.weight), 0));
      if (Math.abs(round2(record.inputWeight) - correctedTotal) > 0.01) throw invalid(`${stationById[record.station].name} must stay exactly balanced: the outputs would total ${correctedTotal} kg against an input of ${round2(record.inputWeight)} kg.`);
    }
    const previous = target.weight;
    const correction = { id: randomUUID(), recordId, station: record.station, output, previous, corrected: round2(corrected), reason, correctedAt: now(), correctedBy: `db-${actor.id}` };
    const records = (row.records ?? []).map((item) => item.id === recordId ? { ...item, outputs: item.outputs.map((entry) => entry.name === output ? { ...entry, weight: round2(corrected) } : entry) } : item);
    await client.query('UPDATE batches SET records = $2::jsonb, corrections = $3::jsonb, updated_at = NOW() WHERE id = $1', [batchId, json(records), json([...(row.corrections ?? []), correction])]);
    if (target.lotId) {
      const delta = round2(corrected - previous);
      const lot = (await client.query<{ available: unknown }>('SELECT available FROM lots WHERE id = $1 FOR UPDATE', [target.lotId])).rows[0];
      if (lot && number(lot.available) + delta < 0) throw conflict('Correction would make the output lot negative');
      if (lot) await client.query('UPDATE lots SET received = received + $2, available = available + $2, updated_at = NOW() WHERE id = $1', [target.lotId, delta]);
    }
  });
  await audited({ category: 'administration', action: 'batch.corrected', entityType: 'batch', entityId: batchId, description: reason, severity: 'warning', metadata: { recordId, output, corrected, reason } }, actor, request);
}

export async function receiveLot(input: { material: string; category: LotCategory; quantity: number; unit: Lot['unit']; supplierId: string; reference?: string }, actor: Actor) {
  return transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('cocoa-lot-id'))`);
    const existing = (await client.query<{ id: string }>('SELECT id FROM lots')).rows.map((row) => row.id);
    const id = nextLotId(stateForIds([], existing), input.material);
    const stamp = now();
    await client.query('INSERT INTO lots(id, material, category, received, available, unit, source, received_at, uses) VALUES ($1, $2, $3, $4, $4, $5, $6::jsonb, $7, \'[]\'::jsonb)', [id, input.material, input.category, round2(input.quantity), input.unit, json({ type: 'supplier', supplierId: input.supplierId, reference: input.reference }), stamp]);
    return id;
  });
}

export async function addRecipeVersion(recipeId: string, ingredients: RecipeIngredient[], note: string, actor: Actor) {
  await transaction(async (client) => {
    const row = (await client.query<{ versions: Recipe['versions']; current_version: number }>('SELECT versions, current_version FROM recipes WHERE id = $1 FOR UPDATE', [recipeId])).rows[0];
    if (!row) throw missing('Recipe not found');
    const version = (row.versions?.length ?? row.current_version) + 1;
    await client.query('UPDATE recipes SET current_version = $2, versions = $3::jsonb WHERE id = $1', [recipeId, version, json([...(row.versions ?? []), { version, createdAt: now(), ingredients, note }])]);
  });
}

/** A new chocolate recipe at version 1, with the product it makes */
export async function addRecipe(input: { name: string; ingredients: RecipeIngredient[]; note: string }) {
  const total = round2(input.ingredients.reduce((sum, ingredient) => sum + ingredient.percent, 0));
  if (Math.abs(total - 100) > 0.01) throw invalid(`The ingredients must add up to 100%, not ${total}%.`);
  return transaction(async (client) => {
    const name = input.name.trim();
    const code = slug(name).toUpperCase();
    const productId = `P-${code}`, recipeId = `R-${code}`;
    const taken = await client.query('SELECT 1 FROM products WHERE id = $1 OR LOWER(name) = LOWER($2) UNION ALL SELECT 1 FROM recipes WHERE id = $3', [productId, name, recipeId]);
    if (taken.rowCount) throw conflict(`There is already a product or recipe called ${name}.`);
    const nextOrder = async (table: 'products' | 'recipes') => Number((await client.query<{ next: string }>(`SELECT (COALESCE(MAX(sort_order), 0) + 1)::text AS next FROM ${table}`)).rows[0]?.next ?? 1);
    await client.query('INSERT INTO products(id, name, prefix, route_id, recipe_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6)', [productId, name, 'CH', 'chocolate', recipeId, await nextOrder('products')]);
    await client.query('INSERT INTO recipes(id, name, product_id, current_version, versions, sort_order) VALUES ($1, $2, $3, 1, $4::jsonb, $5)', [recipeId, name, productId, json([{ version: 1, createdAt: now(), ingredients: input.ingredients, note: input.note }]), await nextOrder('recipes')]);
    return recipeId;
  });
}

export async function addProduct(product: Omit<Product, 'id'>) {
  const id = `P-${slug(product.name).toUpperCase()}`;
  const order = Number((await queryOne<{ next: string }>('SELECT (COALESCE(MAX(sort_order), 0) + 1)::text AS next FROM products'))?.next ?? 1);
  await query('INSERT INTO products(id, name, prefix, route_id, recipe_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6)', [id, product.name.trim(), product.prefix.trim().toUpperCase(), product.route, product.recipeId ?? null, order]);
}

export async function addPackSize(pack: Omit<PackSize, 'id'>) {
  const next = Number((await queryOne<{ next: string }>('SELECT (COALESCE(MAX(sort_order), 0) + 1)::text AS next FROM pack_sizes'))?.next ?? 1);
  const id = `PK-${pack.grams}-${next}`;
  await query('INSERT INTO pack_sizes(id, name, grams, sort_order) VALUES ($1, $2, $3, $4)', [id, pack.name.trim(), pack.grams, next]);
}

export async function addSupplier(supplier: Omit<Supplier, 'id'>) {
  const id = `S-${slug(supplier.name).toUpperCase()}`;
  const order = Number((await queryOne<{ next: string }>('SELECT (COALESCE(MAX(sort_order), 0) + 1)::text AS next FROM suppliers'))?.next ?? 1);
  await query('INSERT INTO suppliers(id, name, supplies, contact, sort_order) VALUES ($1, $2, $3, $4, $5)', [id, supplier.name.trim(), supplier.supplies.trim(), supplier.contact.trim(), order]);
}

export async function addOutputCategory(station: StationId, name: string, kind: OutputKind) {
  await query('INSERT INTO output_categories(station, name, kind, custom) VALUES ($1, $2, $3, TRUE)', [station, name.trim(), kind]);
}

// ---------------------------------------------------------------------------
// Edit and delete, the same way for every list. Something recorded data still
// points to cannot be deleted (the reason names what uses it); it can be edited.

const countOf = async (client: PoolClient, sql: string, params: unknown[]) => Number((await client.query<{ count: string }>(sql, params)).rows[0]?.count ?? 0);

function refuseIfUsed(name: string, uses: [count: number, one: string, many: string][]) {
  const parts = uses.filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  if (parts.length) throw conflict(`${name} is used by ${parts.join(' and ')}, so it can't be deleted. You can edit it instead.`);
}

async function auditChange(actor: Actor, action: string, entityType: string, entityId: string | number, description: string, metadata?: Record<string, unknown>) {
  await audited({ category: 'administration', action, entityType, entityId, description, severity: action.endsWith('.deleted') ? 'warning' : 'info', metadata }, actor);
}

export async function updateProduct(id: string, patch: Omit<Product, 'id'>, actor: Actor) {
  const name = patch.name.trim();
  await transaction(async (client) => {
    const row = (await client.query<{ name: string; route_id: string }>('SELECT name, route_id FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Product not found');
    if ((await client.query('SELECT 1 FROM products WHERE LOWER(name) = LOWER($1) AND id <> $2', [name, id])).rowCount) throw conflict(`There is already a product called ${name}.`);
    if (patch.route !== row.route_id && await countOf(client, 'SELECT COUNT(*) FROM batches WHERE product_id = $1', [id])) throw conflict(`${row.name} already has batches, so its route can't change.`);
    await client.query('UPDATE products SET name = $2, prefix = $3, route_id = $4, recipe_id = $5 WHERE id = $1', [id, name, patch.prefix.trim().toUpperCase(), patch.route, patch.recipeId || null]);
    // A chocolate and its recipe share one name
    await client.query('UPDATE recipes SET name = $2 WHERE product_id = $1', [id, name]);
  });
  await auditChange(actor, 'product.updated', 'product', id, `Product ${name} updated`, { ...patch });
}

export async function deleteProduct(id: string, actor: Actor) {
  let name = id;
  await transaction(async (client) => {
    const row = (await client.query<{ name: string }>('SELECT name FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Product not found');
    name = row.name;
    refuseIfUsed(row.name, [[await countOf(client, 'SELECT COUNT(*) FROM batches WHERE product_id = $1', [id]), 'batch', 'batches']]);
    const shared = (await client.query<{ name: string }>('SELECT p.name FROM products p JOIN recipes r ON r.id = p.recipe_id WHERE r.product_id = $1 AND p.id <> $1', [id])).rows[0];
    if (shared) throw conflict(`${row.name}'s recipe is also used by ${shared.name}, so it can't be deleted.`);
    // The recipe only exists to make this product, so it goes with it
    await client.query('DELETE FROM recipes WHERE product_id = $1', [id]);
    await client.query('DELETE FROM products WHERE id = $1', [id]);
  });
  await auditChange(actor, 'product.deleted', 'product', id, `Product ${name} deleted`);
}

export async function updatePackSize(id: string, pack: Omit<PackSize, 'id'>, actor: Actor) {
  const result = await query('UPDATE pack_sizes SET name = $2, grams = $3 WHERE id = $1', [id, pack.name.trim(), pack.grams]);
  if (!result.rowCount) throw missing('Pack size not found');
  await auditChange(actor, 'pack_size.updated', 'pack_size', id, `Pack size ${pack.name.trim()} updated`, { ...pack });
}

export async function deletePackSize(id: string, actor: Actor) {
  let name = id;
  await transaction(async (client) => {
    const row = (await client.query<{ name: string }>('SELECT name FROM pack_sizes WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Pack size not found');
    name = row.name;
    refuseIfUsed(row.name, [[await countOf(client, `SELECT COUNT(*) FROM batches b, jsonb_array_elements(b.records) AS r WHERE r->'packaging'->>'packSizeId' = $1`, [id]), 'packaging record', 'packaging records']]);
    await client.query('DELETE FROM pack_sizes WHERE id = $1', [id]);
  });
  await auditChange(actor, 'pack_size.deleted', 'pack_size', id, `Pack size ${name} deleted`);
}

export async function updateSupplier(id: string, supplier: Omit<Supplier, 'id'>, actor: Actor) {
  const name = supplier.name.trim();
  await transaction(async (client) => {
    if ((await client.query('SELECT 1 FROM suppliers WHERE LOWER(name) = LOWER($1) AND id <> $2', [name, id])).rowCount) throw conflict(`There is already a supplier called ${name}.`);
    const result = await client.query('UPDATE suppliers SET name = $2, supplies = $3, contact = $4 WHERE id = $1', [id, name, supplier.supplies.trim(), supplier.contact.trim()]);
    if (!result.rowCount) throw missing('Supplier not found');
  });
  await auditChange(actor, 'supplier.updated', 'supplier', id, `Supplier ${name} updated`, { ...supplier });
}

export async function deleteSupplier(id: string, actor: Actor) {
  let name = id;
  await transaction(async (client) => {
    const row = (await client.query<{ name: string }>('SELECT name FROM suppliers WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Supplier not found');
    name = row.name;
    refuseIfUsed(row.name, [
      [await countOf(client, 'SELECT COUNT(*) FROM batches WHERE supplier_id = $1', [id]), 'batch', 'batches'],
      [await countOf(client, `SELECT COUNT(*) FROM lots WHERE source->>'type' = 'supplier' AND source->>'supplierId' = $1`, [id]), 'delivered lot', 'delivered lots'],
    ]);
    await client.query('DELETE FROM suppliers WHERE id = $1', [id]);
  });
  await auditChange(actor, 'supplier.deleted', 'supplier', id, `Supplier ${name} deleted`);
}

/** Output rows the app ships with are part of the process: only their type can change. Rows added on site can change freely. */
export async function updateOutputCategory(id: number, patch: { name: string; kind: OutputKind }, actor: Actor) {
  const name = patch.name.trim();
  await transaction(async (client) => {
    const row = (await client.query<{ station: StationId; name: string; custom: boolean }>('SELECT station, name, custom FROM output_categories WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Output row not found');
    if (!row.custom && name !== row.name) throw invalid(`${row.name} is part of the process at ${stationById[row.station]?.name.toLowerCase() ?? row.station}, so only its type can change.`);
    if ((await client.query('SELECT 1 FROM output_categories WHERE station = $1 AND LOWER(name) = LOWER($2) AND id <> $3', [row.station, name, id])).rowCount) throw conflict(`${stationById[row.station]?.name ?? row.station} already has a row called ${name}.`);
    await client.query('UPDATE output_categories SET name = $2, kind = $3 WHERE id = $1', [id, name, patch.kind]);
  });
  await auditChange(actor, 'output_category.updated', 'output_category', id, `Output row ${name} updated`, { ...patch });
}

export async function deleteOutputCategory(id: number, actor: Actor) {
  let name = String(id);
  await transaction(async (client) => {
    const row = (await client.query<{ station: StationId; name: string; custom: boolean }>('SELECT station, name, custom FROM output_categories WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Output row not found');
    name = row.name;
    if (!row.custom) throw conflict(`${row.name} is part of the process at ${stationById[row.station]?.name.toLowerCase() ?? row.station}, so it can't be deleted.`);
    // Recorded weights keep their own output names, so history is unaffected
    await client.query('DELETE FROM output_categories WHERE id = $1', [id]);
  });
  await auditChange(actor, 'output_category.deleted', 'output_category', id, `Output row ${name} deleted`);
}

const sameIngredients = (a: RecipeIngredient[], b: RecipeIngredient[]) =>
  JSON.stringify(a.map((i) => [i.name.trim(), round2(i.percent)])) === JSON.stringify(b.map((i) => [i.name.trim(), round2(i.percent)]));

/**
 * Renames a recipe (and its product) and saves new figures. The figures change the current
 * version in place while no batch has used it; once a batch has, they become a new current
 * version so that batch keeps what it was made with.
 */
export async function updateRecipe(id: string, input: { name: string; ingredients: RecipeIngredient[]; note: string }, actor: Actor) {
  const total = round2(input.ingredients.reduce((sum, ingredient) => sum + ingredient.percent, 0));
  if (Math.abs(total - 100) > 0.01) throw invalid(`The ingredients must add up to 100%, not ${total}%.`);
  const name = input.name.trim();
  const result = await transaction(async (client) => {
    const row = (await client.query<{ product_id: string; versions: Recipe['versions']; current_version: number }>('SELECT product_id, versions, current_version FROM recipes WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Recipe not found');
    const taken = await client.query('SELECT 1 FROM recipes WHERE LOWER(name) = LOWER($1) AND id <> $2 UNION ALL SELECT 1 FROM products WHERE LOWER(name) = LOWER($1) AND id <> $3', [name, id, row.product_id]);
    if (taken.rowCount) throw conflict(`There is already a product or recipe called ${name}.`);
    const versions = [...(row.versions ?? [])];
    const index = versions.findIndex((v) => v.version === row.current_version);
    const current = versions[index];
    let version = row.current_version;
    let versioned = false;
    if (!current || !sameIngredients(current.ingredients, input.ingredients)) {
      const used = await countOf(client, 'SELECT COUNT(*) FROM batches WHERE recipe_id = $1 AND recipe_version = $2', [id, row.current_version]);
      if (!current || used) {
        version = versions.length + 1;
        versions.push({ version, createdAt: now(), ingredients: input.ingredients, note: input.note || 'Edited' });
        versioned = true;
      } else {
        versions[index] = { ...current, ingredients: input.ingredients, note: input.note || current.note };
      }
    } else if (input.note && input.note !== current.note) {
      versions[index] = { ...current, note: input.note };
    }
    await client.query('UPDATE recipes SET name = $2, versions = $3::jsonb, current_version = $4 WHERE id = $1', [id, name, json(versions), version]);
    await client.query('UPDATE products SET name = $2 WHERE id = $1', [row.product_id, name]);
    return { version, versioned };
  });
  await auditChange(actor, 'recipe.updated', 'recipe', id, `Recipe ${name} ${result.versioned ? `saved as version ${result.version}` : `version ${result.version} updated`}`, { ingredients: input.ingredients });
  return result;
}

/** Deletes a recipe and the product it makes, once no batch has used it */
export async function deleteRecipe(id: string, actor: Actor) {
  let name = id;
  await transaction(async (client) => {
    const row = (await client.query<{ name: string; product_id: string }>('SELECT name, product_id FROM recipes WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!row) throw missing('Recipe not found');
    name = row.name;
    refuseIfUsed(row.name, [[await countOf(client, 'SELECT COUNT(*) FROM batches WHERE recipe_id = $1 OR product_id = $2', [id, row.product_id]), 'batch', 'batches']]);
    const other = (await client.query<{ name: string }>('SELECT name FROM products WHERE recipe_id = $1 AND id <> $2', [id, row.product_id])).rows[0];
    if (other) throw conflict(`${row.name} is also the recipe of ${other.name}, so it can't be deleted.`);
    await client.query('DELETE FROM recipes WHERE id = $1', [id]);
    await client.query('DELETE FROM products WHERE id = $1', [row.product_id]);
  });
  await auditChange(actor, 'recipe.deleted', 'recipe', id, `Recipe ${name} and its product deleted`);
}

/** Only a delivery nothing has drawn from yet can change; anything else is corrected through its batch */
async function editableLot(client: PoolClient, id: string) {
  const row = (await client.query<{ source: Lot['source']; uses: Lot['uses'] }>('SELECT source, uses FROM lots WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!row) throw missing(`Lot ${id} not found`);
  if (row.source.type === 'batch') throw conflict(`${id} was made by batch ${row.source.batchId}, so it changes through that batch's station record.`);
  if (row.uses?.length) throw conflict(`${id} has already been drawn from by ${row.uses.length} batch${row.uses.length === 1 ? '' : 'es'}, so it can't be changed.`);
  return row;
}

export async function updateLot(id: string, patch: { material: string; quantity: number; supplierId: string; reference?: string }, actor: Actor) {
  await transaction(async (client) => {
    await editableLot(client, id);
    if (!(await client.query('SELECT 1 FROM suppliers WHERE id = $1', [patch.supplierId])).rowCount) throw missing('Supplier not found');
    const material = patch.material.trim();
    const category: LotCategory = material === 'Liquor' ? 'Intermediate' : 'Raw material';
    await client.query('UPDATE lots SET material = $2, category = $3, received = $4, available = $4, source = $5::jsonb, updated_at = NOW() WHERE id = $1',
      [id, material, category, round2(patch.quantity), json({ type: 'supplier', supplierId: patch.supplierId, reference: patch.reference || undefined })]);
  });
  await auditChange(actor, 'lot.updated', 'lot', id, `Lot ${id} updated`, { ...patch });
}

export async function deleteLot(id: string, actor: Actor) {
  await transaction(async (client) => {
    await editableLot(client, id);
    await client.query('DELETE FROM lots WHERE id = $1', [id]);
  });
  await auditChange(actor, 'lot.deleted', 'lot', id, `Lot ${id} deleted`);
}

export async function setThresholds(patch: Partial<Thresholds>) {
  const current = await queryOne<{ variance_pct: Thresholds['variancePct']; waste_pct: unknown; low_stock_kg: unknown }>('SELECT variance_pct, waste_pct, low_stock_kg FROM thresholds WHERE id = \'default\'');
  const variancePct = { ...(current?.variance_pct ?? {}), ...(patch.variancePct ?? {}) };
  const wastePct = patch.wastePct ?? number(current?.waste_pct);
  const lowStockKg = patch.lowStockKg ?? number(current?.low_stock_kg);
  await query(`INSERT INTO thresholds(id, variance_pct, waste_pct, low_stock_kg) VALUES ('default', $1::jsonb, $2, $3)
    ON CONFLICT (id) DO UPDATE SET variance_pct = EXCLUDED.variance_pct, waste_pct = EXCLUDED.waste_pct, low_stock_kg = EXCLUDED.low_stock_kg, updated_at = NOW()`, [json(variancePct), wastePct, lowStockKg]);
}

export async function resetDemoData(actor: Actor, request?: RequestContext) {
  await transaction(async (client) => {
    await client.query('DELETE FROM batches');
    await client.query('DELETE FROM lots');
    await client.query('DELETE FROM recipes');
    await client.query('DELETE FROM output_categories');
    await client.query('DELETE FROM thresholds');
    await client.query('DELETE FROM suppliers');
    await client.query('DELETE FROM pack_sizes');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM routes');
    await insertSeed(client, seedState());
  });
  await audited({ category: 'administration', action: 'demo.reset', entityType: 'domain', entityId: 'all', description: 'Reset production data to the demo dataset', severity: 'warning' }, actor, request);
}
