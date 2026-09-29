'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { Table, td, tdNum } from '@/components/ui';
import { percentOf, round2 } from '@/lib/balance';
import { batchOutcomes, batchStages, outcomeTotals, pressedFrom, startName, type OutcomeGroup } from '@/lib/derive';
import { dateTime, destinationLabel, kg, kindLabel, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationById, stationName } from '@/lib/stations';
import type { Batch, StationId } from '@/lib/types';

const toStation = (s: string) => stationName(s as StationId);

/** Groups in the order the weight is accounted for. Colours are the validated categorical set, in fixed order. */
export const outcomeGroups: { id: OutcomeGroup; label: string; note: string; color: string }[] = [
  { id: 'product', label: 'Products', note: 'Useful material that left the line: stored, sold or sent to rework', color: '#2a78d6' },
  { id: 'byproduct', label: 'By-products', note: 'Husks, machine residue, recoverable chocolate', color: '#1baf7a' },
  { id: 'waste', label: 'Waste', note: 'Weighed and binned', color: '#eda100' },
  { id: 'lost', label: 'Lost, not weighed', note: 'Moisture, dust and anything the scale could not explain', color: '#e34948' },
  { id: 'process', label: 'Still in process', note: 'Waiting at the next station', color: '#4a3aa7' },
];

/** One bar for the batch's starting weight, split by where it went */
export function OutcomeBar({ batch, compact = false }: { batch: Batch; compact?: boolean }) {
  const totals = outcomeTotals(batch);
  const shown = outcomeGroups.filter((g) => totals[g.id] > 0);
  return (
    <div>
      <div className={`flex w-full gap-[2px] overflow-hidden ${compact ? 'h-2' : 'h-4'}`} role="img" aria-label={shown.map((g) => `${g.label} ${pct(totals.pct[g.id])}`).join(', ')}>
        {shown.map((g) => (
          <span key={g.id} className="block h-full first:rounded-l last:rounded-r" style={{ width: `${totals.pct[g.id]}%`, background: g.color }} title={`${g.label}: ${kg(totals[g.id])} · ${pct(totals.pct[g.id])} of the ${startName(batch)}`} />
        ))}
      </div>
      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
          {shown.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
              <span className="text-muted">{g.label}</span> <strong className="tabular-nums">{pct(totals.pct[g.id])}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Where the batch's starting weight ended up. Every row is a share of the starting weight and the rows add up
 * to it, so nothing that left the line sideways (nibs for butter, beans taken off) is mistaken for a loss.
 */
export function WhereItWent({ batch }: { batch: Batch }) {
  const store = useStore();
  const outcomes = batchOutcomes(batch);
  const totals = outcomeTotals(batch, outcomes);
  const of = startName(batch);
  const start = batch.startInput.weight;
  const accounted = round2(outcomes.reduce((t, o) => t + o.weight, 0));
  return (
    <>
      <div className="px-5 pt-4 pb-3">
        <p className="mb-2 text-[13px] text-muted">Start: <strong className="text-ink tabular-nums">{kg(batch.startInput.weight)}</strong> {batch.startInput.material.toLowerCase()} = 100% of the {of}.</p>
        <OutcomeBar batch={batch} />
      </div>
      <Table head={['Where it went', 'Stage', 'Weight', `% of ${of}`, 'Destination']}>
        {outcomeGroups.filter((g) => outcomes.some((o) => o.group === g.id)).map((group) => (
          <Fragment key={group.id}>
            <tr className="bg-paper">
              <td className={td}><span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: group.color }} /><strong>{group.label}</strong></span><span className="block text-[11px] text-muted">{group.note}</span></td>
              <td className={td} />
              <td className={`${tdNum} font-semibold`}>{kg(totals[group.id])}</td>
              <td className={`${tdNum} font-semibold`}>{pct(totals.pct[group.id])}</td>
              <td className={td} />
            </tr>
            {outcomes.filter((o) => o.group === group.id).map((o) => {
              const { lot, pressings } = group.id === 'product' ? pressedFrom(store, o.lotId) : { lot: undefined, pressings: [] };
              return (
                <Fragment key={`${o.station}-${o.label}`}>
                  <tr>
                    <td className={`${td} pl-10`}>{o.label}</td>
                    <td className={`${td} text-muted`}>{stationName(o.station)}</td>
                    <td className={tdNum}>{kg(o.weight)}</td>
                    <td className={tdNum}>{pct(o.ofStartPct)}</td>
                    <td className={`${td} text-[13px] text-muted`}>
                      {o.destination ? destinationLabel(o.destination, toStation) : '—'}
                      {o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">{o.lotId}</Link></>}
                    </td>
                  </tr>
                  {pressings.flatMap((p) => p.outputs.map((d) => (
                    <tr key={`${p.batch.id}-${d.name}`} className="text-[13px]">
                      <td className={`${td} pl-16 text-muted`}>↳ {d.name} <span className="text-[11px]">({pct(d.ofPressedPct)} of the nibs pressed)</span></td>
                      <td className={`${td} text-muted`}>Pressed in <Link href={`/production/batches/${p.batch.id}`} className="font-semibold text-green">{p.batch.id}</Link></td>
                      <td className={`${tdNum} text-muted`}>{kg(d.weight)}</td>
                      <td className={`${tdNum} text-muted`}>{pct(percentOf(d.weight, start))}</td>
                      <td className={`${td} text-[12px] text-muted`}>Part of the {o.label.toLowerCase()} above</td>
                    </tr>
                  )))}
                  {pressings.length > 0 && lot && lot.available > 0 && (
                    <tr className="text-[13px]"><td className={`${td} pl-16 text-muted`}>↳ Not pressed yet</td><td className={`${td} text-muted`}>In stock</td><td className={`${tdNum} text-muted`}>{kg(lot.available)}</td><td className={`${tdNum} text-muted`}>{pct(percentOf(lot.available, start))}</td><td className={td} /></tr>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
        <tr>
          <td className={td}><strong>Total</strong></td><td className={td} />
          <td className={`${tdNum} font-semibold`}>{kg(accounted)}</td>
          <td className={`${tdNum} font-semibold`}>{pct(percentOf(accounted, start))}</td>
          <td className={`${td} text-[12px] text-muted`}>Adds up to the {of}</td>
        </tr>
      </Table>
    </>
  );
}

/** Each recorded stage with every output named, as a share of that stage's input and of the batch's starting weight */
export function StageTable({ batch }: { batch: Batch }) {
  const of = startName(batch);
  const stages = batchStages(batch);
  return (
    <Table head={['Stage and output', 'Weight', '% of stage input', `% of ${of}`, 'Goes to']}>
      <tr className="bg-paper">
        <td className={td}><strong>Start</strong> <span className="text-muted">{batch.startInput.material.toLowerCase()}</span></td>
        <td className={`${tdNum} font-semibold`}>{kg(batch.startInput.weight)}</td>
        <td className={tdNum}>—</td>
        <td className={`${tdNum} font-semibold`}>{pct(100)}</td>
        <td className={`${td} text-[13px] text-muted`}>{batch.startInput.lotIds.length ? batch.startInput.lotIds.map((l, i) => <span key={l}>{i > 0 && ', '}<Link href={`/materials/${l}`} className="font-semibold text-green">{l}</Link></span>) : dateTime(batch.startedAt)}</td>
      </tr>
      {stages.map(({ record, balance, inputOfStartPct, varianceOfStartPct, outputs }) => (
        <Fragment key={record.id}>
          <tr className="bg-paper">
            <td className={td}><strong>{stationName(record.station)}</strong> <span className="text-muted">went in: {record.inputMaterial.toLowerCase()}</span></td>
            <td className={`${tdNum} font-semibold`}>{kg(balance.input)}</td>
            <td className={tdNum}>{pct(100)}</td>
            <td className={`${tdNum} font-semibold`}>{pct(inputOfStartPct)}</td>
            <td className={`${td} text-[12px] text-muted`}>{dateTime(record.recordedAt)}</td>
          </tr>
          {outputs.map((o) => (
            <tr key={o.name}>
              <td className={`${td} pl-10`}>{o.name} <span className="text-[11px] text-faint">{kindLabel[o.kind]}</span></td>
              <td className={tdNum}>{record.packaging && o.name === 'Accepted units' ? <>{kg(o.weight)} <span className="text-[11px] text-muted">({record.packaging.acceptedUnits} × {record.packaging.packGrams} g)</span></> : kg(o.weight)}</td>
              <td className={tdNum}>{pct(o.ofInputPct)}</td>
              <td className={tdNum}>{pct(o.ofStartPct)}</td>
              <td className={`${td} text-[13px] text-muted`}>{destinationLabel(o.destination, toStation)}{o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">{o.lotId}</Link></>}</td>
            </tr>
          ))}
          {Math.abs(balance.variance) >= 0.005 && (
            <tr>
              <td className={`${td} pl-10 text-muted`}>{stationById[record.station]?.lossLabel ?? 'Unaccounted'} <span className="text-[11px] text-faint">not weighed</span></td>
              <td className={`${tdNum} text-muted`}>{kg(balance.variance)}</td>
              <td className={`${tdNum} text-muted`}>{pct(balance.variancePct)}</td>
              <td className={`${tdNum} text-muted`}>{pct(varianceOfStartPct)}</td>
              <td className={`${td} text-[13px] text-muted`}>input − everything weighed</td>
            </tr>
          )}
        </Fragment>
      ))}
    </Table>
  );
}
