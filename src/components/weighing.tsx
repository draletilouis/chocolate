'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { UnitInput } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { kg, num, pct } from '@/lib/format';
import { stationById } from '@/lib/stations';
import type { Balance, Container, ContainerUse, Destination, Station } from '@/lib/types';

/** What the operator typed: the scale reading and, optionally, the container it was weighed in */
export interface WeightValue { reading: string; containerId: string }

export const emptyWeight: WeightValue = { reading: '', containerId: '' };

/** Net weight after taking off the container's empty weight */
export function netWeight(value: WeightValue, containers: Container[]): { net: number; container?: ContainerUse } {
  const reading = Number(value.reading) || 0;
  const container = containers.find((c) => c.id === value.containerId);
  if (!container || reading <= 0) return { net: round2(reading) };
  return { net: round2(Math.max(0, reading - container.tare)), container: { name: container.name, tare: container.tare, gross: round2(reading) } };
}

/** Turns a saved weight back into what the operator typed, so an edit starts from the scale reading */
export function weightFrom(net: number | undefined, used: ContainerUse | undefined, containers: Container[]): WeightValue {
  if (net === undefined) return emptyWeight;
  if (used) return { reading: String(used.gross), containerId: containers.find((c) => c.name === used.name)?.id ?? '' };
  return { reading: String(net), containerId: '' };
}

/** Scale reading with an optional container. The net weight is shown as soon as a container is chosen. */
export function WeightField({ value, onChange, containers, label, autoFocus }: { value: WeightValue; onChange: (value: WeightValue) => void; containers: Container[]; label: string; autoFocus?: boolean }) {
  const { net, container } = netWeight(value, containers);
  return (
    <div className="weight-field">
      <div className="weight-field-row">
        <UnitInput unit="kg" value={value.reading} onChange={(e) => onChange({ ...value, reading: e.target.value })} aria-label={label} autoFocus={autoFocus} />
        <select className="container-select" value={value.containerId} onChange={(e) => onChange({ ...value, containerId: e.target.value })} aria-label={`${label} container`}>
          <option value="">No container</option>
          {containers.map((c) => <option key={c.id} value={c.id}>{c.name} ({num(c.tare)} kg)</option>)}
        </select>
      </div>
      {container && <span className="weight-net">Net <strong>{kg(net)}</strong> after the {container.name.toLowerCase()} ({kg(container.tare)})</span>}
    </div>
  );
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
  if (balance.measured > balance.input) return { tone: 'warn', headline: `${kg(round2(balance.measured - balance.input))} more than went in`, detail: 'Check the scale and the container tare.' };
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
