import { round2 } from './balance';
import { carriedTo, recordFor } from './derive';
import type { State } from './seed';
import type { Batch, Mixer, MixingRun, Recipe, RecipeIngredient, RecordedOutput, RunSource } from './types';

/** Identifies what the mixer holds right now, so a run entered on an outdated screen is refused */
export const mixerStamp = (mixer: Mixer) => `${mixer.lastRunId ?? '-'}|${mixer.holds?.runId ?? '-'}|${mixer.holds?.kg ?? 0}`;

export const versionOf = (recipe: Recipe, version = recipe.currentVersion) => recipe.versions.find((v) => v.version === version);

/** The ingredients of the chocolate a run made, from the recipe version it used */
export function ingredientsOf(state: Pick<State, 'recipes'>, recipeId: string, version: number): RecipeIngredient[] {
  const recipe = state.recipes.find((r) => r.id === recipeId);
  return (recipe && versionOf(recipe, version)?.ingredients) ?? [];
}

/** Where an ingredient of a run came from, one entry per place: a lot, or the batch's own material (no lot) */
export const sourcesOf = (i: { actual: number; lotId?: string; sources?: RunSource[] }): RunSource[] => i.sources ?? [{ lotId: i.lotId, kg: i.actual }];

/** What runs took of their batch's own liquor or cocoa butter, one entry per ingredient use */
export const ownUse = (runs: MixingRun[]) => runs.flatMap((r) => r.ingredients.flatMap((i) => sourcesOf(i).filter((s) => !s.lotId).map((s) => ({ name: i.name, kg: s.kg }))));

/** The lots weighed into runs */
export const runLotIds = (runs: MixingRun[]) => Array.from(new Set(runs.flatMap((r) => r.ingredients.flatMap((i) => sourcesOf(i).flatMap((s) => (s.lotId ? [s.lotId] : []))))));

export interface ChangeoverLine { name: string; percent: number; need: number; inMixer: number; add: number }

/**
 * The changeover sheet's calculation: a run of `toRun` kg of fresh ingredients on top of the chocolate
 * the mixer holds makes `toRun + held` kg of the new type. Each ingredient needed for that total, less
 * what the held chocolate already brings, is what to add.
 *
 * An ingredient the held chocolate has more of than the new type cannot be taken out again, so there
 * is a smallest run (`minRun`) below which the recipe cannot be reached. Ingredients the new type has
 * none of at all (`blocked`, e.g. milk powder when changing to a dark chocolate) mean the mixer must be
 * emptied first.
 */
export function changeover(target: RecipeIngredient[], toRun: number, held?: { kg: number; ingredients: RecipeIngredient[] }) {
  const heldKg = held?.kg ?? 0;
  const total = round2(toRun + heldKg);
  const percentIn = (list: RecipeIngredient[], name: string) => list.find((i) => i.name === name)?.percent ?? 0;
  const names = Array.from(new Set([...target.map((i) => i.name), ...(held?.ingredients ?? []).map((i) => i.name)]));
  const lines: ChangeoverLine[] = names.map((name) => {
    const percent = percentIn(target, name);
    const inMixer = round2((heldKg * percentIn(held?.ingredients ?? [], name)) / 100);
    const need = round2((total * percent) / 100);
    return { name, percent, need, inMixer, add: round2(need - inMixer) };
  }).filter((l) => l.percent > 0 || l.inMixer > 0);
  const blocked = lines.filter((l) => l.percent === 0).map((l) => l.name);
  // The run at which the most over-supplied ingredient needs nothing added, rounded up to the next 10 g
  const smallest = Math.max(0, ...lines.filter((l) => l.percent > 0).map((l) => (l.inMixer * 100) / l.percent - heldKg));
  const minRun = Math.ceil(Math.round(smallest * 1e6) / 1e4) / 100;
  return { total, lines, blocked, minRun };
}

/** Liquor and cocoa butter this batch sent on to mixing, by material, and how much of each runs have not used yet */
export function batchMaterialAtMixing(batch: Batch) {
  const runs = recordFor(batch, 'mixing')?.runs ?? [];
  const carried = new Map<string, number>();
  for (const o of carriedTo(batch, 'mixing')) carried.set(o.name, round2((carried.get(o.name) ?? 0) + o.weight));
  return Array.from(carried, ([name, kg]) => {
    const used = round2(ownUse(runs).filter((u) => u.name === name).reduce((sum, u) => sum + u.kg, 0));
    return { name, carried: kg, used, left: round2(kg - used) };
  });
}

/**
 * The mixing record's input and outputs, worked out from its runs so the usual balance, reports and
 * alerts apply. A run's leftover taken up by a later run of the same batch stays inside the record;
 * chocolate the mixer held from another batch counts as input, and what this batch leaves in the mixer
 * for another batch counts as output. `stored` is liquor or butter kept in store when mixing finished.
 */
export function mixingTotals(runs: MixingRun[], stored: RecordedOutput[] = []): { inputWeight: number; outputs: RecordedOutput[] } {
  const ids = new Set(runs.map((r) => r.id));
  const takenUp = new Set(runs.map((r) => r.held?.runId));
  const fresh = runs.reduce((sum, r) => sum + r.ingredients.reduce((s, i) => s + i.actual, 0), 0);
  const heldIn = runs.reduce((sum, r) => sum + (r.held && !ids.has(r.held.runId) ? r.held.kg : 0), 0);
  const leftInMixer = round2(runs.reduce((sum, r) => sum + (takenUp.has(r.id) || r.takenOut ? 0 : r.kept), 0));
  const outputs: RecordedOutput[] = [
    ...runs.map((r, i): RecordedOutput => ({ name: `${r.type} · run ${i + 1}`, kind: 'useful', weight: r.made, destination: 'stock', lotId: r.lotId })),
    ...runs.filter((r) => r.takenOut).map((r): RecordedOutput => ({ name: `${r.type} taken out of the mixer`, kind: 'useful', weight: r.kept, destination: 'stock', lotId: r.takenOut })),
    ...(leftInMixer > 0 ? [{ name: 'Left in the mixer', kind: 'useful' as const, weight: leftInMixer, destination: 'mixer' as const }] : []),
    ...stored,
  ];
  return { inputWeight: round2(fresh + heldIn + stored.reduce((sum, o) => sum + o.weight, 0)), outputs };
}

/** Liquor or cocoa butter a finished mixing record kept in store: every stored output that is not a run's chocolate */
export const storedAtMixing = (outputs: RecordedOutput[], runs: MixingRun[]) =>
  outputs.filter((o) => o.destination === 'stock' && !runs.some((r) => r.lotId === o.lotId || r.takenOut === o.lotId));

/** Every mixing run in the factory, newest first, with its batch */
export function allRuns(state: Pick<State, 'batches'>) {
  return state.batches.flatMap((batch) => (recordFor(batch, 'mixing')?.runs ?? []).map((run, index) => ({ batch, run, index })))
    .sort((a, b) => b.run.recordedAt.localeCompare(a.run.recordedAt));
}
