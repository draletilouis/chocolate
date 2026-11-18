import type { Balance, OutputKind } from './types';

/** Weights are kept to the gram, as the factory's sheets are written (58.735 kg) */
export const roundKg = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Part as a percentage of whole, 0 when there is no whole */
export const percentOf = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);
const pct = percentOf;

/**
 * Mass balance for one station. The worker only supplies observed weights;
 * every derived figure is calculated here. Unaccounted variance is reported
 * on its own and is never folded into waste.
 */
export function calculateBalance(input: number, outputs: { weight: number; kind: OutputKind }[]): Balance {
  const sum = (kind?: OutputKind) =>
    roundKg(outputs.filter((o) => !kind || o.kind === kind).reduce((total, o) => total + (Number.isFinite(o.weight) ? o.weight : 0), 0));
  const measured = sum();
  const useful = sum('useful');
  const byproduct = sum('byproduct');
  const waste = sum('waste');
  const variance = roundKg(input - measured);
  return {
    input: roundKg(input),
    measured,
    useful,
    byproduct,
    waste,
    recordedWaste: roundKg(byproduct + waste),
    variance,
    accountedPct: pct(measured, input),
    yieldPct: pct(useful, input),
    wastePct: pct(waste, input),
    variancePct: pct(variance, input),
  };
}

export function calculatePackaging(totalUnits: number, rejectedUnits: number, packGrams: number) {
  const acceptedUnits = Math.max(0, totalUnits - rejectedUnits);
  return { acceptedUnits, acceptedWeight: roundKg((acceptedUnits * packGrams) / 1000) };
}
