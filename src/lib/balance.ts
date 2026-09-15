import type { Balance, OutputKind } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

/**
 * Mass balance for one station. The worker only supplies observed weights;
 * every derived figure is calculated here. Unaccounted variance is reported
 * on its own and is never folded into waste.
 */
export function calculateBalance(input: number, outputs: { weight: number; kind: OutputKind }[]): Balance {
  const sum = (kind?: OutputKind) =>
    round2(outputs.filter((o) => !kind || o.kind === kind).reduce((total, o) => total + (Number.isFinite(o.weight) ? o.weight : 0), 0));
  const measured = sum();
  const useful = sum('useful');
  const byproduct = sum('byproduct');
  const waste = sum('waste');
  const variance = round2(input - measured);
  return {
    input: round2(input),
    measured,
    useful,
    byproduct,
    waste,
    recordedWaste: round2(byproduct + waste),
    variance,
    accountedPct: pct(measured, input),
    yieldPct: pct(useful, input),
    wastePct: pct(waste, input),
    variancePct: pct(variance, input),
  };
}

export function calculatePackaging(totalUnits: number, rejectedUnits: number, packGrams: number) {
  const acceptedUnits = Math.max(0, totalUnits - rejectedUnits);
  return { acceptedUnits, acceptedWeight: round2((acceptedUnits * packGrams) / 1000) };
}
