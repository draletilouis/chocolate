import { round2 } from './balance';
import { chocolateWaiting } from './derive';
import { batchMaterialAtMixing, versionOf } from './mixing';
import { piecesKg, piecesLots } from './pieces';
import type { State } from './seed';

/**
 * How the production plan stands: pieces made against planned for each line, the chocolate still to
 * mix for the pieces left (less what is already mixed and waiting for pieces), and the ingredients that
 * takes against what is in store or waiting at mixing.
 */
export function planProgress(state: State) {
  const plan = state.plan;
  if (!plan) return null;
  const made = piecesLots(state).filter((l) => l.receivedAt.slice(0, 10) >= plan.from);

  const lines = plan.lines.map((line) => {
    const recipe = state.recipes.find((r) => r.id === line.recipeId);
    const size = state.packSizes.find((p) => p.id === line.packSizeId);
    const grams = size?.grams ?? 0;
    const madePieces = made.filter((l) => l.pieces!.recipeId === line.recipeId && l.pieces!.packSizeId === line.packSizeId).reduce((n, l) => n + l.received, 0);
    const left = Math.max(0, line.pieces - madePieces);
    return { ...line, type: recipe?.name ?? line.recipeId, size: size?.name ?? line.packSizeId, grams, made: madePieces, left, leftKg: piecesKg(left, grams) };
  });

  const waiting = chocolateWaiting(state);
  const types = Array.from(new Set(lines.map((l) => l.recipeId))).map((recipeId) => {
    const leftKg = round2(lines.filter((l) => l.recipeId === recipeId).reduce((sum, l) => sum + l.leftKg, 0));
    const inLots = round2(waiting.filter((l) => l.chocolate!.recipeId === recipeId).reduce((sum, l) => sum + l.available, 0));
    return { recipeId, type: lines.find((l) => l.recipeId === recipeId)!.type, leftKg, inLots, toMix: round2(Math.max(0, leftKg - inLots)) };
  });

  const need = new Map<string, number>();
  for (const t of types) {
    const recipe = state.recipes.find((r) => r.id === t.recipeId);
    for (const i of (recipe && versionOf(recipe)?.ingredients) ?? []) need.set(i.name, (need.get(i.name) ?? 0) + (t.toMix * i.percent) / 100);
  }
  const atMixing = state.batches.filter((b) => b.status !== 'completed').flatMap(batchMaterialAtMixing);
  const ingredients = Array.from(need, ([name, kg]) => {
    const inStore = round2(state.lots.filter((l) => l.material === name && l.unit === 'kg').reduce((sum, l) => sum + l.available, 0));
    const waitingAtMixing = round2(atMixing.filter((m) => m.name === name).reduce((sum, m) => sum + m.left, 0));
    return { name, need: round2(kg), inStore, atMixing: waitingAtMixing, short: round2(Math.max(0, kg - inStore - waitingAtMixing)) };
  });

  const planned = lines.reduce((n, l) => n + l.pieces, 0);
  const madeTotal = lines.reduce((n, l) => n + Math.min(l.made, l.pieces), 0);
  return { plan, lines, types, ingredients, planned, made: madeTotal, left: planned - madeTotal };
}
