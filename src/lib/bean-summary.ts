import { percentOf, roundKg } from './balance';
import { batchById, batchSuppliers, recordBalance, recordFor } from './derive';
import type { State } from './seed';
import type { Batch, RecordedOutput } from './types';

/** One line of the sheet's USAGE part; `paper` rows are printed even when nothing was weighed */
export interface UsageLine { label: string; weight: number; paper: boolean }

/**
 * The factory's "Bean summary" for one sack, worked out from what was recorded at roasting, winnowing,
 * liquor grinding and pressing. The yields are calculated, never typed.
 */
export interface BeanSummary {
  date: string;
  suppliers: string[];
  bagWeight: number;
  /** Everything that came out of the roaster; undefined until roasting is recorded */
  afterRoasting?: number;
  unusable: number;
  husks: number;
  usage: UsageLine[];
  usageTotal: number;
  /** Usage as a share of the bag weight */
  yieldOfBag: number;
  /** What the winnower gave as nibs and peeled beans, as a share of the weight after roasting */
  yieldOfWinnower: number;
  liquor: number;
  butter: number;
  powder: number;
  nibsPressed: number;
  /** Butter as a share of the nibs pressed */
  butterYield: number;
  /** Weight the sheet has no line for: moisture driven off in the roaster, and what the scale could not explain at winnowing */
  roastingLoss: number;
  winnowingMissing: number;
  /** Rejected when the delivery was received, before the bag weight went on to roasting */
  rejected: number;
  /** Everyone who recorded a station of this sack */
  by: string[];
  notes: string[];
  /** Roasting and winnowing are both recorded, so the usage and yields are final */
  complete: boolean;
}

const sum = (outputs: RecordedOutput[]) => roundKg(outputs.reduce((t, o) => t + o.weight, 0));
const named = (outputs: RecordedOutput[], name: string) => sum(outputs.filter((o) => o.name === name));

/** The usage rows of the paper sheet and the winnowing output each one is */
const paperUsage: [label: string, output: string][] = [
  ['Crushed nibs for liquor', 'Nibs for liquor'],
  ['Crushed nibs for butter', 'Nibs for butter'],
  ['Crushed nibs for other', 'Nibs for other'],
  ['Nibs for inclusion and sale', 'Nibs for sale'],
  ['Whole peeled beans', 'Whole peeled beans'],
];

const isButter = (o: RecordedOutput) => o.kind !== 'waste' && /butter/i.test(o.name);
const isPowder = (o: RecordedOutput) => o.kind !== 'waste' && /cake|powder/i.test(o.name);

export function beanSummary(state: State, batch: Batch): BeanSummary {
  const receiving = recordFor(batch, 'receiving');
  const roasting = recordFor(batch, 'roasting');
  const winnowing = recordFor(batch, 'winnowing');
  const grinding = recordFor(batch, 'grinding');
  const pressing = recordFor(batch, 'pressing');
  const bagWeight = batch.startInput.weight;

  const roasted = roasting?.outputs ?? [];
  const winnowed = winnowing?.outputs ?? [];
  const good = winnowed.filter((o) => o.kind !== 'waste');
  const known = new Set(paperUsage.map(([, output]) => output));
  const usage: UsageLine[] = [
    ...paperUsage.map(([label, output]) => ({ label, weight: named(winnowed, output), paper: true })),
    // Rows the factory added itself at winnowing, under their own names
    ...good.filter((o) => !known.has(o.name)).map((o) => ({ label: o.name, weight: o.weight, paper: false })),
    // Whole roasted beans taken off before winnowing; the paper has no line for them and they are written in by hand
    ...roasted.filter((o) => o.kind !== 'waste' && !o.destination.startsWith('continue:')).map((o) => ({ label: `${o.name} taken`, weight: o.weight, paper: false })),
  ];
  const usageTotal = roundKg(usage.reduce((t, u) => t + u.weight, 0));

  // Butter and powder: pressed by this batch, and by batches that later pressed nibs this sack kept in store
  let butter = sum((pressing?.outputs ?? []).filter(isButter));
  let powder = sum((pressing?.outputs ?? []).filter(isPowder));
  let nibsPressed = pressing?.inputWeight ?? 0;
  const stored = state.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === batch.id && l.source.station === 'winnowing');
  for (const lot of stored) {
    for (const use of lot.uses) {
      const later = use.batchId && !use.runId && !use.madeLot ? batchById(state, use.batchId) : undefined;
      const press = later && recordFor(later, 'pressing');
      if (!later || !press || !later.startInput.lotIds.includes(lot.id) || !(later.startInput.weight > 0)) continue;
      const share = Math.min(1, use.quantity / later.startInput.weight);
      butter = roundKg(butter + sum(press.outputs.filter(isButter)) * share);
      powder = roundKg(powder + sum(press.outputs.filter(isPowder)) * share);
      nibsPressed = roundKg(nibsPressed + press.inputWeight * share);
    }
  }

  const afterRoasting = roasting ? sum(roasted) : undefined;
  const records = [receiving, roasting, winnowing, grinding, pressing].filter((r) => r !== undefined);
  return {
    date: batch.startedAt.slice(0, 10),
    suppliers: batchSuppliers(state, batch),
    bagWeight,
    afterRoasting,
    unusable: sum(roasted.filter((o) => o.kind === 'waste')),
    husks: sum(winnowed.filter((o) => o.kind === 'waste')),
    usage,
    usageTotal,
    yieldOfBag: percentOf(usageTotal, bagWeight),
    // As the factory works it out on the paper: the nibs against the weight after roasting
    yieldOfWinnower: winnowing ? percentOf(sum(good), afterRoasting ?? winnowing.inputWeight) : 0,
    liquor: sum((grinding?.outputs ?? []).filter((o) => o.kind !== 'waste')),
    butter, powder, nibsPressed,
    butterYield: percentOf(butter, nibsPressed),
    roastingLoss: roasting ? roundKg(roasting.inputWeight - (afterRoasting ?? 0)) : 0,
    winnowingMissing: winnowing ? recordBalance(winnowing).variance : 0,
    rejected: sum((receiving?.outputs ?? []).filter((o) => o.kind === 'waste')),
    by: Array.from(new Set(records.map((r) => r.recordedBy))),
    notes: records.flatMap((r) => (r.note ? [r.note] : [])),
    complete: Boolean(roasting && winnowing),
  };
}

/** Sacks: batches of beans, newest first */
export const sacks = (state: Pick<State, 'batches'>) => state.batches.filter((b) => b.route === 'beans' && b.startInput.weight > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
