'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { UnitInput } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { kg, num, pct } from '@/lib/format';
import { stationById } from '@/lib/stations';
import type { Balance, Destination, Station } from '@/lib/types';

/** The scale reading as the operator typed it */
export type WeightValue = string;

export const emptyWeight: WeightValue = '';

/** The typed reading in kg, 0 when empty */
export function netWeight(value: WeightValue): number {
  return round2(Number(value) || 0);
}

/** Turns a saved weight back into what the operator typed, so an edit starts from it */
export function weightFrom(weight: number | undefined): WeightValue {
  return weight === undefined ? emptyWeight : String(weight);
}

export function WeightField({ value, onChange, label, autoFocus }: { value: WeightValue; onChange: (value: WeightValue) => void; label: string; autoFocus?: boolean }) {
  return <UnitInput unit="kg" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} autoFocus={autoFocus} />;
}

/** Where an output can go from this station, in plain words */
export function destinationOptions(station: Station, current?: Destination): { value: Destination; label: string }[] {
  const options: { value: Destination; label: string }[] = [
    ...station.next.map((n) => ({ value: `continue:${n}` as Destination, label: `→ ${stationById[n].name}` })),
    { value: 'stock', label: 'Keep in store' },
    { value: 'sale', label: 'For sale' },
    { value: 'rework', label: 'Rework' },
    { value: 'waste', label: 'Waste bin' },
  ];
  // Older records may point somewhere the station no longer offers; keep that choice visible.
  if (current && !options.some((o) => o.value === current)) options.unshift({ value: current, label: current.startsWith('continue:') ? `→ ${stationById[current.slice(9) as keyof typeof stationById]?.name ?? current.slice(9)}` : current });
  return options;
}

export function DestinationSelect({ station, value, onChange, label }: { station: Station; value: Destination; onChange: (value: Destination) => void; label: string }) {
  const tone = value === 'waste' ? 'is-waste' : value === 'sale' ? 'is-sale' : value.startsWith('continue:') ? 'is-next' : 'is-store';
  return (
    <select className={`dest-chip ${tone}`} value={value} onChange={(e) => onChange(e.target.value as Destination)} aria-label={`${label} destination`}>
      {destinationOptions(station, value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

type Tone = 'neutral' | 'ok' | 'warn';

/** One plain sentence about the balance, shared by the live bar and the saved view */
function verdict(balance: Balance, limit: number, live: boolean): { tone: Tone; headline: string; detail: string } {
  if (balance.input <= 0) return { tone: 'neutral', headline: 'Enter the input weight', detail: '' };
  if (balance.measured <= 0) return { tone: 'neutral', headline: `${kg(balance.input)} to account for`, detail: 'Enter the weights.' };
  if (balance.measured > balance.input) return { tone: 'warn', headline: `${kg(round2(balance.measured - balance.input))} more than went in`, detail: 'Check the scale.' };
  if (Math.abs(balance.variancePct) > limit) {
    return live
      ? { tone: 'warn', headline: `${kg(balance.variance)} left to assign (${pct(balance.variancePct)})`, detail: `Weigh anything not entered yet, or check the scale. The limit is ${num(limit)}%.` }
      : { tone: 'warn', headline: `${kg(balance.variance)} missing (${pct(balance.variancePct)})`, detail: `More than the ${num(limit)}% allowed. Check the scale and tare.` };
  }
  if (balance.variance === 0) return { tone: 'ok', headline: 'Everything accounted for', detail: '' };
  return { tone: 'ok', headline: `Balance OK · ${kg(balance.variance)} missing (${pct(balance.variancePct)})`, detail: `Within the ${num(limit)}% limit.` };
}

/** Running check while weights are typed: what is left to assign, turning orange when it is off */
export function LiveBalance({ balance, limit, wasteLimit }: { balance: Balance; limit: number; wasteLimit: number }) {
  const v = verdict(balance, limit, true);
  const Icon = v.tone === 'warn' ? AlertTriangle : CheckCircle2;
  return (
    <div className={`live-balance is-${v.tone}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        {v.tone !== 'neutral' && <Icon size={16} className="mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <strong>{v.headline}</strong>{v.detail && <span className="block text-[12px] opacity-90">{v.detail}</span>}
          {balance.wastePct > wasteLimit && <span className="waste-note block text-[12px]">Waste is {pct(balance.wastePct)} of the input (limit {num(wasteLimit)}%).</span>}
        </div>
      </div>
      {balance.input > 0 && <span className="live-balance-total">Entered {num(balance.measured)} of {kg(balance.input)}</span>}
    </div>
  );
}

/** Saved result in one line, with the full figures for supervisors behind "Show details" */
export function BalanceVerdict({ balance, limit, wasteLimit }: { balance: Balance; limit: number; wasteLimit: number }) {
  const [open, setOpen] = useState(false);
  const v = verdict(balance, limit, false);
  const Icon = v.tone === 'warn' ? AlertTriangle : CheckCircle2;
  const line = (label: string, value: string, strong?: boolean) => (
    <div className="flex justify-between gap-3 border-b border-line px-5 py-2 last:border-b-0"><span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span><span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span></div>
  );
  return (
    <section className={`verdict is-${v.tone}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
        <Icon size={18} className="shrink-0" />
        <div className="min-w-0 flex-1"><strong className="text-[15px]">{v.headline}</strong>{v.detail && <span className="block text-[13px] opacity-90">{v.detail}</span>}{balance.wastePct > wasteLimit && <span className="waste-note block text-[13px]">Waste is {pct(balance.wastePct)} of the input (limit {num(wasteLimit)}%).</span>}</div>
        <button type="button" className="verdict-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Show details'} <ChevronDown size={14} className={open ? 'rotate-180' : ''} /></button>
      </div>
      {open && (
        <div className="grid bg-white text-[13px] text-ink md:grid-cols-2">
          <div>{line('Went in', kg(balance.input))}{line('Weighed out', kg(balance.measured), true)}{line('Good output', kg(balance.useful))}{line('By-products', kg(balance.byproduct))}{line('Waste', kg(balance.waste))}</div>
          <div className="md:border-l md:border-line">{line('Missing weight', kg(balance.variance), true)}{line('Missing %', pct(balance.variancePct))}{line('Allowed missing', `${num(limit)}%`)}{line('Yield', pct(balance.yieldPct))}{line('Waste %', pct(balance.wastePct))}</div>
        </div>
      )}
    </section>
  );
}
