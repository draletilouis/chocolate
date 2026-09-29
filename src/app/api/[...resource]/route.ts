import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession, type SessionInfo } from '@/server/auth/session';
import {
  addCorrection, addOutputCategory, addPackSize, addProduct, addRecipe, addRecipeVersion, addSupplier, completeBatch, createBatch,
  deleteLot, deleteOutputCategory, deletePackSize, deleteProduct, deleteRecipe, deleteSupplier, loadState, placeHold, receiveLot,
  releaseHold, resetDemoData, saveDestinations, saveMeasurements, savePackaging, setThresholds,
  updateLot, updateOutputCategory, updatePackSize, updateProduct, updateRecipe, updateSupplier,
} from '@/server/domain';
import { jsonError, parseBody, requestInfo, sameOrigin } from '@/server/http';
import { captureException } from '@/server/monitoring';
import type { Destination, OutputKind, StationId } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const station = z.enum(['roasting', 'winnowing', 'grinding', 'pressing', 'refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion']);
const kind = z.enum(['useful', 'byproduct', 'waste']);
const destination = z.enum(['stock', 'sale', 'rework', 'waste', 'continue:roasting', 'continue:winnowing', 'continue:grinding', 'continue:pressing', 'continue:refining', 'continue:conching', 'continue:tempering', 'continue:moulding', 'continue:packaging', 'continue:completion']);
const nonNegative = z.number().finite().nonnegative();
const outputSchema = z.object({ name: z.string().trim().min(1).max(120), kind, weight: nonNegative });
const createBatchSchema = z.object({ productId: z.string().min(1), supplierId: z.string().trim().max(120).optional(), startWeight: nonNegative, lotUses: z.array(z.object({ lotId: z.string().min(1), quantity: nonNegative })).default([]), recipeVersion: z.number().int().positive().optional(), ingredients: z.array(z.object({ name: z.string().min(1), expected: nonNegative, actual: nonNegative, lotId: z.string().optional() })).optional(), note: z.string().max(1000).optional() });
const measurementsSchema = z.object({ station, inputWeight: nonNegative, outputs: z.array(outputSchema), note: z.string().max(1000).optional() });
const packagingSchema = z.object({ inputWeight: nonNegative, packSizeId: z.string().min(1), totalUnits: z.number().int().nonnegative(), rejectedUnits: z.number().int().nonnegative(), note: z.string().max(1000).optional() });
const holdSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
const releaseSchema = z.object({ note: z.string().trim().min(1).max(1000) });
const correctionSchema = z.object({ recordId: z.string().min(1), output: z.string().min(1), corrected: nonNegative, reason: z.string().trim().min(1).max(1000) });
const lotSchema = z.object({ material: z.string().trim().min(1).max(120), category: z.enum(['Raw material', 'Intermediate', 'By-product', 'Rework', 'Finished goods']), quantity: nonNegative, unit: z.enum(['kg', 'units']), supplierId: z.string().min(1), reference: z.string().max(200).optional() });
const recipeVersionSchema = z.object({ ingredients: z.array(z.object({ name: z.string().trim().min(1).max(120), percent: nonNegative })).min(1), note: z.string().max(1000).default('') });
const recipeSchema = recipeVersionSchema.extend({ name: z.string().trim().min(1).max(120) });
const productSchema = z.object({ name: z.string().trim().min(1).max(120), prefix: z.string().trim().min(1).max(12), route: z.enum(['beans', 'pressing', 'chocolate']), recipeId: z.string().optional() });
const packSchema = z.object({ name: z.string().trim().min(1).max(120), grams: z.number().positive() });
const supplierSchema = z.object({ name: z.string().trim().min(1).max(120), supplies: z.string().trim().max(500), contact: z.string().trim().max(200) });
const outputCategorySchema = z.object({ station, name: z.string().trim().min(1).max(120), kind });
const outputCategoryUpdateSchema = z.object({ name: z.string().trim().min(1).max(120), kind });
const lotUpdateSchema = z.object({ material: z.string().trim().min(1).max(120), quantity: z.number().finite().positive(), supplierId: z.string().min(1), reference: z.string().max(200).optional() });
const thresholdSchema = z.object({ variancePct: z.record(z.string(), nonNegative).optional(), wastePct: nonNegative.optional(), lowStockKg: nonNegative.optional() });
const destinationsSchema = z.object({ destinations: z.record(z.string(), destination) });

type Context = { params: Promise<{ resource: string[] }> };
type Handler = (req: NextRequest, session: SessionInfo, parts: string[]) => Promise<NextResponse>;

function actor(session: SessionInfo) { return { id: session.user.id, name: session.user.name, role: session.user.role }; }

async function guard(req: NextRequest, context: Context, handler: Handler, admin = false) {
  const session = await getSession();
  if (!session) return jsonError(401, 'Authentication required');
  if (admin && session.user.role !== 'admin') return jsonError(403, 'Admin privileges required');
  const { resource } = await context.params;
  try { return await handler(req, session, resource); } catch (error) {
    captureException(error, { method: req.method, path: req.nextUrl.pathname, userId: session.user.id });
    const status = (error as { status?: number }).status ?? 500;
    const message = status < 500 || process.env.NODE_ENV !== 'production' ? (error as Error).message : 'An error occurred';
    return jsonError(status, message);
  }
}

async function stateResponse(session: SessionInfo, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ success: true, ...extra, state: await loadState(session.user.id) }, { status });
}

export async function GET(req: NextRequest, context: Context) {
  return guard(req, context, async (_req, session, parts) => {
    if (parts[0] === 'state' && parts.length === 1) return stateResponse(session);
    if (parts[0] === 'batches' && (parts.length === 1 || parts.length === 2)) {
      const state = await loadState(session.user.id);
      return NextResponse.json({ success: true, ...(parts[1] ? { batch: state.batches.find((batch) => batch.id === parts[1]) ?? null } : { batches: state.batches }), state });
    }
    if (parts[0] === 'lots' && parts.length === 1) {
      const state = await loadState(session.user.id);
      return NextResponse.json({ success: true, lots: state.lots, state });
    }
    return jsonError(404, 'API resource not found');
  });
}

export async function POST(req: NextRequest, context: Context) {
  const { resource } = await context.params;
  const admin = resource[0] === 'config' || resource[0] === 'admin' || (resource[0] === 'batches' && resource[2] === 'corrections');
  return guard(req, { params: Promise.resolve({ resource }) }, async (request, session, parts) => {
    const info = requestInfo(request);
    if (parts[0] === 'batches' && parts.length === 1) { const parsed = await parseBody(request, createBatchSchema); if ('error' in parsed) return parsed.error; const id = await createBatch(parsed.data, actor(session)); return stateResponse(session, { id }, 201); }
    if (parts[0] === 'batches' && parts.length === 3 && parts[2] === 'records') { const parsed = await parseBody(request, measurementsSchema); if ('error' in parsed) return parsed.error; const recordId = await saveMeasurements(parts[1], parsed.data.station, parsed.data.inputWeight, parsed.data.outputs, parsed.data.note, actor(session)); return stateResponse(session, { recordId }, 201); }
    if (parts[0] === 'batches' && parts.length === 3 && parts[2] === 'packaging') { const parsed = await parseBody(request, packagingSchema); if ('error' in parsed) return parsed.error; const recordId = await savePackaging(parts[1], parsed.data.inputWeight, parsed.data.packSizeId, parsed.data.totalUnits, parsed.data.rejectedUnits, parsed.data.note, actor(session)); return stateResponse(session, { recordId }, 201); }
    if (parts[0] === 'batches' && parts.length === 3 && parts[2] === 'holds') { const parsed = await parseBody(request, holdSchema); if ('error' in parsed) return parsed.error; await placeHold(parts[1], parsed.data.reason, actor(session), info); return stateResponse(session); }
    if (parts[0] === 'batches' && parts.length === 4 && parts[2] === 'holds' && parts[3] === 'release') { const parsed = await parseBody(request, releaseSchema); if ('error' in parsed) return parsed.error; await releaseHold(parts[1], parsed.data.note, actor(session), info); return stateResponse(session); }
    if (parts[0] === 'batches' && parts.length === 3 && parts[2] === 'completion') { const parsed = await parseBody(request, z.object({ note: z.string().max(1000).optional() })); if ('error' in parsed) return parsed.error; await completeBatch(parts[1], parsed.data.note, actor(session), info); return stateResponse(session); }
    if (parts[0] === 'batches' && parts.length === 3 && parts[2] === 'corrections') { const parsed = await parseBody(request, correctionSchema); if ('error' in parsed) return parsed.error; await addCorrection(parts[1], parsed.data.recordId, parsed.data.output, parsed.data.corrected, parsed.data.reason, actor(session), info); return stateResponse(session); }
    if (parts[0] === 'lots' && parts.length === 1) { const parsed = await parseBody(request, lotSchema); if ('error' in parsed) return parsed.error; const id = await receiveLot(parsed.data, actor(session)); return stateResponse(session, { id }, 201); }
    if (parts[0] === 'recipes' && parts.length === 3 && parts[2] === 'versions') { const parsed = await parseBody(request, recipeVersionSchema); if ('error' in parsed) return parsed.error; await addRecipeVersion(parts[1], parsed.data.ingredients, parsed.data.note, actor(session)); return stateResponse(session); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'recipes') { const parsed = await parseBody(request, recipeSchema); if ('error' in parsed) return parsed.error; const id = await addRecipe(parsed.data); return stateResponse(session, { id }, 201); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'products') { const parsed = await parseBody(request, productSchema); if ('error' in parsed) return parsed.error; await addProduct(parsed.data); return stateResponse(session, {}, 201); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'pack-sizes') { const parsed = await parseBody(request, packSchema); if ('error' in parsed) return parsed.error; await addPackSize(parsed.data); return stateResponse(session, {}, 201); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'suppliers') { const parsed = await parseBody(request, supplierSchema); if ('error' in parsed) return parsed.error; await addSupplier(parsed.data); return stateResponse(session, {}, 201); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'output-categories') { const parsed = await parseBody(request, outputCategorySchema); if ('error' in parsed) return parsed.error; await addOutputCategory(parsed.data.station as StationId, parsed.data.name, parsed.data.kind as OutputKind); return stateResponse(session, {}, 201); }
    if (parts[0] === 'config' && parts.length === 2 && parts[1] === 'thresholds') { const parsed = await parseBody(request, thresholdSchema); if ('error' in parsed) return parsed.error; await setThresholds(parsed.data); return stateResponse(session); }
    if (parts[0] === 'admin' && parts.length === 2 && parts[1] === 'reset-demo') { if (!sameOrigin(request)) return jsonError(403, 'Cross-site request rejected'); await resetDemoData(actor(session), info); return stateResponse(session); }
    return jsonError(404, 'API resource not found');
  }, admin);
}

/** Setup lists and delivered lots are changed by admins only */
const adminResource = (resource: string[]) => resource[0] === 'config' || resource[0] === 'lots';

export async function PATCH(req: NextRequest, context: Context) {
  const { resource } = await context.params;
  return guard(req, { params: Promise.resolve({ resource }) }, async (request, session, parts) => {
    if (parts[0] === 'batches' && parts.length === 5 && parts[2] === 'records' && parts[4] === 'destinations') { const parsed = await parseBody(request, destinationsSchema); if ('error' in parsed) return parsed.error; await saveDestinations(parts[1], parts[3], parsed.data.destinations as Record<string, Destination>, actor(session)); return stateResponse(session); }
    if (parts[0] === 'config' && parts.length === 3) {
      const id = parts[2];
      if (parts[1] === 'products') { const parsed = await parseBody(request, productSchema); if ('error' in parsed) return parsed.error; await updateProduct(id, parsed.data, actor(session)); return stateResponse(session); }
      if (parts[1] === 'pack-sizes') { const parsed = await parseBody(request, packSchema); if ('error' in parsed) return parsed.error; await updatePackSize(id, parsed.data, actor(session)); return stateResponse(session); }
      if (parts[1] === 'suppliers') { const parsed = await parseBody(request, supplierSchema); if ('error' in parsed) return parsed.error; await updateSupplier(id, parsed.data, actor(session)); return stateResponse(session); }
      if (parts[1] === 'output-categories') { const parsed = await parseBody(request, outputCategoryUpdateSchema); if ('error' in parsed) return parsed.error; await updateOutputCategory(Number(id), { name: parsed.data.name, kind: parsed.data.kind as OutputKind }, actor(session)); return stateResponse(session); }
      if (parts[1] === 'recipes') { const parsed = await parseBody(request, recipeSchema); if ('error' in parsed) return parsed.error; const result = await updateRecipe(id, parsed.data, actor(session)); return stateResponse(session, result); }
    }
    if (parts[0] === 'lots' && parts.length === 2) { const parsed = await parseBody(request, lotUpdateSchema); if ('error' in parsed) return parsed.error; await updateLot(parts[1], parsed.data, actor(session)); return stateResponse(session); }
    return jsonError(404, 'API resource not found');
  }, adminResource(resource));
}

export async function DELETE(req: NextRequest, context: Context) {
  const { resource } = await context.params;
  return guard(req, { params: Promise.resolve({ resource }) }, async (request, session, parts) => {
    // No body to parse, so the cross-site check that parseBody does is made here
    if (!sameOrigin(request)) return jsonError(403, 'Cross-site request rejected');
    if (parts[0] === 'config' && parts.length === 3) {
      const id = parts[2];
      if (parts[1] === 'products') { await deleteProduct(id, actor(session)); return stateResponse(session); }
      if (parts[1] === 'pack-sizes') { await deletePackSize(id, actor(session)); return stateResponse(session); }
      if (parts[1] === 'suppliers') { await deleteSupplier(id, actor(session)); return stateResponse(session); }
      if (parts[1] === 'output-categories') { await deleteOutputCategory(Number(id), actor(session)); return stateResponse(session); }
      if (parts[1] === 'recipes') { await deleteRecipe(id, actor(session)); return stateResponse(session); }
    }
    if (parts[0] === 'lots' && parts.length === 2) { await deleteLot(parts[1], actor(session)); return stateResponse(session); }
    return jsonError(404, 'API resource not found');
  }, adminResource(resource));
}
