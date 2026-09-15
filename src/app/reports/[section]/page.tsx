'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Empty, PageHeader, Panel, Select, Stat, SubNav, Table, td, tdNum } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { recordBalance, userName } from '@/lib/derive';
import { dateTime, kg, num, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName, stations } from '@/lib/stations';

// Stages with a weigh-in, in line order (completion has none)
const gridStations = stations.filter((s) => s.form !== 'completion');

const sections = [
  { id: 'losses', label: 'Weight loss by process', href: '/reports/losses' },
  { id: 'variance', label: 'Waste & variance', href: '/reports/variance' },
  { id: 'batches', label: 'Batch history', href: '/reports/batches' },
  { id: 'corrections', label: 'Corrections', href: '/reports/corrections' },
  { id: 'holds', label: 'Holds', href: '/reports/holds' },
];

/** Share of the starting weight still in useful material, as a bar */
function LeftBar({ pct: value }: { pct: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-28 overflow-hidden rounded bg-paper"><span className="block h-full bg-green" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
      <span className="tabular-nums">{pct(value)}</span>
    </span>
  );
}

export default function ReportsPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const [stationFilter, setStationFilter] = useState('all');
  const withRecords = store.batches.filter((b) => b.records.length > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [batchId, setBatchId] = useState(withRecords[0]?.id ?? '');
  const current = sections.find((s) => s.id === section) ?? sections[0];

  // Loss at each process, added up over every batch that passed through it.
  const byStation = stations.filter((s) => s.form === 'weights').map((station) => {
    const balances = store.batches.flatMap((b) => b.records.filter((r) => r.station === station.id).map(recordBalance));
    const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((t, b) => t + b[key], 0));
    const input = sum('input'), useful = sum('useful');
    return { station, batches: balances.length, input, useful, byproduct: sum('byproduct'), waste: sum('waste'), variance: sum('variance'), lost: round2(input - useful), lostPct: input ? round2(((input - useful) / input) * 100) : 0 };
  }).filter((r) => r.batches > 0);

  // One batch followed from its starting weight through every recorded station.
  const followed = store.batches.find((b) => b.id === batchId);
  const steps = followed ? followed.records.map((record) => {
    const balance = recordBalance(record);
    return { record, balance, lost: round2(balance.input - balance.useful), leftPct: followed.startInput.weight ? round2((balance.useful / followed.startInput.weight) * 100) : 0 };
  }) : [];

  const rows = store.batches.flatMap((batch) => batch.records.map((record) => ({ batch, record, balance: recordBalance(record), limit: store.thresholds.variancePct[record.station] })))
    .filter((r) => stationFilter === 'all' || r.record.station === stationFilter)
    .sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt));
  const totals = rows.reduce((t, r) => ({ input: t.input + r.balance.input, useful: t.useful + r.balance.useful, waste: t.waste + r.balance.waste, byproduct: t.byproduct + r.balance.byproduct, variance: t.variance + r.balance.variance }), { input: 0, useful: 0, waste: 0, byproduct: 0, variance: 0 });

  return (
    <>
      <PageHeader eyebrow="Reports" title={current.label} />
      <SubNav items={sections} current={current.id} />

      {current.id === 'losses' && (
        <>
          <Panel title="Weigh-in at each stage, every batch" subtitle="Each cell is the weight that went into that stage. The small figure below it is the useful weight that came out.">
            {store.batches.length === 0 ? <Empty>No batches yet.</Empty> : (
              <Table head={['Batch', 'Start', ...gridStations.map((s) => s.name), 'Lost so far']}>
                {[...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
                  const last = b.records.at(-1);
                  const lostSoFar = last ? round2(b.startInput.weight - recordBalance(last).useful) : 0;
                  return (
                    <tr key={b.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link>
                        <span className="block text-[11px] text-muted">{b.product}{b.status === 'hold' ? ' · on hold' : b.status === 'completed' ? ' · completed' : ''}</span>
                      </td>
                      <td className={tdNum}>{num(b.startInput.weight)}</td>
                      {gridStations.map((s) => {
                        const record = b.records.find((r) => r.station === s.id);
                        if (!record) return <td key={s.id} className={`${tdNum} text-faint`}>{b.nextStation === s.id && b.status !== 'completed' ? <span className="text-[11px] font-semibold text-green">next</span> : '—'}</td>;
                        const balance = recordBalance(record);
                        const over = Math.abs(balance.variancePct) > store.thresholds.variancePct[s.id];
                        return (
                          <td key={s.id} className={tdNum} title={`${s.name}: in ${num(balance.input)} kg, useful out ${num(balance.useful)} kg, unaccounted ${num(balance.variance)} kg`}>
                            <strong>{num(balance.input)}</strong>
                            <span className={`block text-[11px] ${over ? 'text-warn' : 'text-muted'}`}>→ {num(balance.useful)}</span>
                          </td>
                        );
                      })}
                      <td className={`${tdNum} font-semibold`}>{num(lostSoFar)} <span className="font-normal text-muted">({pct(b.startInput.weight ? round2((lostSoFar / b.startInput.weight) * 100) : 0)})</span></td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="px-5 py-3 text-[12px] text-muted">Weights in kg. An orange figure means the unaccounted variance at that stage is above its limit. Packaging shows the finished chocolate weighed in and the nominal weight of accepted units.</p>
          </Panel>

          <Panel title="Follow one batch down the line" subtitle="What went in at each process, what useful material came out, and how much of the starting weight is left."
            action={<Select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch to follow" className="w-auto">{withRecords.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product}</option>)}</Select>}>
            {!followed ? <Empty>No batch has recorded a station yet.</Empty> : (
              <Table head={['Process', 'Went in', 'Useful out', 'By-product', 'Waste', 'Unaccounted', 'Lost this step', 'Left of start']}>
                <tr>
                  <td className={`${td} whitespace-nowrap`}><strong>Start</strong> <span className="text-muted">{followed.startInput.material.toLowerCase()}</span></td>
                  <td className={tdNum}>—</td><td className={tdNum}>{num(followed.startInput.weight)}</td><td className={tdNum}>—</td><td className={tdNum}>—</td><td className={tdNum}>—</td><td className={tdNum}>—</td>
                  <td className={td}><LeftBar pct={100} /></td>
                </tr>
                {steps.map(({ record, balance, lost, leftPct }) => (
                  <tr key={record.id}>
                    <td className={`${td} whitespace-nowrap`}><strong>{stationName(record.station)}</strong> <span className="block text-[11px] text-muted">{record.inputMaterial.toLowerCase()} → {record.outputs.filter((o) => o.kind === 'useful').map((o) => o.name.toLowerCase()).join(' + ') || '—'}</span></td>
                    <td className={tdNum}>{num(balance.input)}</td>
                    <td className={tdNum}>{num(balance.useful)}</td>
                    <td className={tdNum}>{num(balance.byproduct)}</td>
                    <td className={tdNum}>{num(balance.waste)}</td>
                    <td className={`${tdNum} ${Math.abs(balance.variancePct) > store.thresholds.variancePct[record.station] ? 'font-semibold text-warn' : ''}`}>{num(balance.variance)}</td>
                    <td className={`${tdNum} font-semibold`}>{num(lost)} <span className="font-normal text-muted">({pct(balance.input ? round2((lost / balance.input) * 100) : 0)})</span></td>
                    <td className={td}><LeftBar pct={leftPct} /></td>
                  </tr>
                ))}
                {steps.length > 0 && (
                  <tr className="bg-paper">
                    <td className={td}><strong>Whole batch</strong></td>
                    <td className={tdNum}>{num(followed.startInput.weight)}</td>
                    <td className={tdNum}>{num(steps.at(-1)!.balance.useful)}</td>
                    <td className={tdNum}>{num(round2(steps.reduce((t, s) => t + s.balance.byproduct, 0)))}</td>
                    <td className={tdNum}>{num(round2(steps.reduce((t, s) => t + s.balance.waste, 0)))}</td>
                    <td className={tdNum}>{num(round2(steps.reduce((t, s) => t + s.balance.variance, 0)))}</td>
                    <td className={`${tdNum} font-semibold`}>{num(round2(followed.startInput.weight - steps.at(-1)!.balance.useful))} <span className="font-normal text-muted">({pct(round2(100 - steps.at(-1)!.leftPct))})</span></td>
                    <td className={td}><LeftBar pct={steps.at(-1)!.leftPct} /></td>
                  </tr>
                )}
              </Table>
            )}
            <p className="px-5 py-3 text-[12px] text-muted">Lost this step = went in − useful out (by-product + waste + unaccounted). Useful material stored or sent to rework still counts as useful; only what is carried forward becomes the next input, so a split (for example nibs and peeled beans) shows as a drop in the next row.</p>
          </Panel>

          <Panel title="Loss at each process, all batches" subtitle="Where the weight goes across the whole line. Use it to see which process loses the most.">
            {byStation.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
              <Table head={['Process', 'Batches', 'Went in', 'Useful out', 'By-product', 'Waste', 'Unaccounted', 'Lost', 'Lost %']}>
                {byStation.map((r) => (
                  <tr key={r.station.id}>
                    <td className={`${td} whitespace-nowrap`}><strong>{r.station.name}</strong> <span className="block text-[11px] text-muted">{r.station.group}</span></td>
                    <td className={tdNum}>{r.batches}</td>
                    <td className={tdNum}>{num(r.input)}</td><td className={tdNum}>{num(r.useful)}</td><td className={tdNum}>{num(r.byproduct)}</td><td className={tdNum}>{num(r.waste)}</td><td className={tdNum}>{num(r.variance)}</td>
                    <td className={`${tdNum} font-semibold`}>{num(r.lost)}</td>
                    <td className={td}><span className="flex items-center gap-2"><span className="h-2 w-24 overflow-hidden rounded bg-paper"><span className="block h-full bg-warn" style={{ width: `${Math.min(100, r.lostPct)}%` }} /></span><span className="tabular-nums">{pct(r.lostPct)}</span></span></td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}

      {current.id === 'variance' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Station input" value={kg(round2(totals.input))} />
            <Stat label="Recorded waste" value={kg(round2(totals.waste))} hint={pct(totals.input ? round2((totals.waste / totals.input) * 100) : 0)} />
            <Stat label="By-products" value={kg(round2(totals.byproduct))} />
            <Stat label="Unaccounted variance" value={kg(round2(totals.variance))} hint={pct(totals.input ? round2((totals.variance / totals.input) * 100) : 0)} tone={totals.variance > 0 ? 'warn' : undefined} />
          </div>
          <Panel title="By station and batch" subtitle="Variance is what the scale could not explain. It is never counted as waste." action={<Select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} aria-label="Station filter" className="w-auto"><option value="all">All stations</option>{stations.filter((s) => s.form !== 'completion').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}>
            {rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
              <Table head={['Batch', 'Station', 'Input', 'Useful', 'Waste', 'By-product', 'Variance', 'Variance %', 'Limit']}>
                {rows.map(({ batch, record, balance, limit }) => (
                  <tr key={record.id} className={Math.abs(balance.variancePct) > limit ? 'bg-warn-soft/60' : ''}>
                    <td className={td}><Link href={`/production/batches/${batch.id}`} className="font-semibold text-green">{batch.id}</Link></td>
                    <td className={td}>{stationName(record.station)}</td>
                    <td className={tdNum}>{num(balance.input)}</td><td className={tdNum}>{num(balance.useful)}</td><td className={tdNum}>{num(balance.waste)}</td><td className={tdNum}>{num(balance.byproduct)}</td>
                    <td className={tdNum}>{num(balance.variance)}</td><td className={`${tdNum} ${Math.abs(balance.variancePct) > limit ? 'font-semibold text-warn' : ''}`}>{pct(balance.variancePct)}</td><td className={tdNum}>{limit}%</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}

      {current.id === 'batches' && (
        <Panel title="All batches">
          <Table head={['Batch', 'Product', 'Started', 'Status', 'Stations', 'Start input', 'Last useful output', 'Total variance']}>
            {[...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
              const last = b.records.at(-1);
              const variance = round2(b.records.reduce((s, r) => s + recordBalance(r).variance, 0));
              return (
                <tr key={b.id}>
                  <td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link></td>
                  <td className={td}>{b.product}</td><td className={td}>{dateTime(b.startedAt)}</td>
                  <td className={td}><Badge tone={b.status === 'completed' ? 'neutral' : b.status === 'hold' ? 'danger' : 'green'}>{b.status === 'completed' ? 'Completed' : b.status === 'hold' ? 'On hold' : 'In progress'}</Badge></td>
                  <td className={td}>{b.records.map((r) => stationName(r.station)).join(' → ') || '—'}{b.nextStation && b.status !== 'completed' ? ` → (${stationName(b.nextStation)})` : ''}</td>
                  <td className={tdNum}>{kg(b.startInput.weight)}</td><td className={tdNum}>{last ? kg(recordBalance(last).useful) : '—'}</td><td className={tdNum}>{kg(variance)}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      )}

      {current.id === 'corrections' && (
        <Panel title="Corrections" subtitle="Every changed weight, with the reason and who changed it.">
          {store.batches.every((b) => b.corrections.length === 0) ? <Empty>No corrections recorded.</Empty> : (
            <Table head={['When', 'Batch', 'Station', 'Output', 'Before', 'After', 'Reason', 'By']}>
              {store.batches.flatMap((b) => b.corrections.map((c) => ({ b, c }))).sort((x, y) => y.c.correctedAt.localeCompare(x.c.correctedAt)).map(({ b, c }) => (
                <tr key={c.id}><td className={td}>{dateTime(c.correctedAt)}</td><td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link></td><td className={td}>{stationName(c.station)}</td><td className={td}>{c.output}</td><td className={tdNum}>{num(c.previous)} kg</td><td className={tdNum}>{num(c.corrected)} kg</td><td className={td}>{c.reason}</td><td className={td}>{userName(store, c.correctedBy)}</td></tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      {current.id === 'holds' && (
        <Panel title="Holds" subtitle="Batches stopped for a reason, and when they were released.">
          {store.batches.every((b) => b.holds.length === 0) ? <Empty>No holds recorded.</Empty> : (
            <Table head={['Placed', 'Batch', 'At station', 'Reason', 'By', 'Released']}>
              {store.batches.flatMap((b) => b.holds.map((h) => ({ b, h }))).sort((x, y) => y.h.placedAt.localeCompare(x.h.placedAt)).map(({ b, h }) => (
                <tr key={h.id}><td className={td}>{dateTime(h.placedAt)}</td><td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link></td><td className={td}>{stationName(h.station)}</td><td className={td}>{h.reason}</td><td className={td}>{userName(store, h.placedBy)}</td><td className={td}>{h.releasedAt ? `${dateTime(h.releasedAt)}${h.releaseNote ? ` · ${h.releaseNote}` : ''}` : <Badge tone="danger">Still on hold</Badge>}</td></tr>
              ))}
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
