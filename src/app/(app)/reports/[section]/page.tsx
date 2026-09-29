'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OutcomeBar, StageTable, WhereItWent } from '@/components/BatchFlow';
import { Badge, Empty, PageHeader, Panel, Select, Stat, SubNav, Table, UnitInput, td, tdNum } from '@/components/ui';
import { percentOf, round2 } from '@/lib/balance';
import { batchOutcomes, outcomeTotals, recordBalance, startName, supplierName, userName } from '@/lib/derive';
import { dateTime, kg, num, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName, stations } from '@/lib/stations';
import type { Batch, RouteId } from '@/lib/types';

// Stages with a weigh-in, in line order (completion has none)
const gridStations = stations.filter((s) => s.form !== 'completion');

const sections = [
  { id: 'losses', label: 'Yield by stage', href: '/reports/losses' },
  { id: 'variance', label: 'Waste & variance', href: '/reports/variance' },
  { id: 'batches', label: 'Batch history', href: '/reports/batches' },
  { id: 'corrections', label: 'Corrections', href: '/reports/corrections' },
  { id: 'holds', label: 'Holds', href: '/reports/holds' },
];

/** A weight with its share of the batch's starting weight underneath */
function KgPct({ weight, share, tone }: { weight: number; share: number; tone?: 'warn' }) {
  return <>{num(weight)}<span className={`block text-[11px] ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{pct(share)}</span></>;
}

/**
 * The average share of the starting weight that each outcome takes, over the completed batches of one route,
 * weighted by batch size, with the lowest and highest batch. This is the yield to expect from the next batch.
 */
function typicalOutcomes(batches: Batch[]) {
  const totalStart = batches.reduce((t, b) => t + b.startInput.weight, 0);
  const rows = new Map<string, { group: string; label: string; station: string; weight: number; shares: number[] }>();
  batches.forEach((batch, index) => {
    for (const o of batchOutcomes(batch)) {
      const key = `${o.station}|${o.label}`;
      const row = rows.get(key) ?? { group: o.group, label: o.label, station: stationName(o.station), weight: 0, shares: Array(batches.length).fill(0) };
      row.weight += o.weight;
      row.shares[index] += o.ofStartPct;
      rows.set(key, row);
    }
  });
  const order = ['product', 'byproduct', 'waste', 'lost', 'process'];
  return [...rows.values()]
    .map((r) => ({ ...r, avgPct: percentOf(r.weight, totalStart), minPct: Math.min(...r.shares), maxPct: Math.max(...r.shares) }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.avgPct - a.avgPct);
}

const routeTabs: { id: RouteId; label: string }[] = [{ id: 'beans', label: 'Bean sacks' }, { id: 'pressing', label: 'Pressing' }, { id: 'chocolate', label: 'Chocolate' }];

export default function ReportsPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const [stationFilter, setStationFilter] = useState('all');
  const withRecords = store.batches.filter((b) => b.records.length > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [batchId, setBatchId] = useState(withRecords[0]?.id ?? '');
  const [route, setRoute] = useState<RouteId>('beans');
  const [planWeight, setPlanWeight] = useState('');
  const current = sections.find((s) => s.id === section) ?? sections[0];

  // Loss at each process, added up over every batch that passed through it. Lost is what was binned or never weighed; by-products are kept apart.
  const byStation = stations.filter((s) => s.form === 'weights').map((station) => {
    const balances = store.batches.flatMap((b) => b.records.filter((r) => r.station === station.id).map(recordBalance));
    const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((t, b) => t + b[key], 0));
    const input = sum('input'), lost = round2(sum('waste') + sum('variance'));
    return { station, batches: balances.length, input, useful: sum('useful'), byproduct: sum('byproduct'), waste: sum('waste'), variance: sum('variance'), lost, lostPct: percentOf(lost, input) };
  }).filter((r) => r.batches > 0);

  // One batch followed from its starting weight through every recorded station.
  const followed = store.batches.find((b) => b.id === batchId);

  // What completed batches of a route usually turn into, and what that means for a batch of a chosen weight.
  const completedOfRoute = store.batches.filter((b) => b.route === route && b.status === 'completed' && b.startInput.weight > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const typical = typicalOutcomes(completedOfRoute);
  const plan = Number(planWeight) > 0 ? Number(planWeight) : completedOfRoute[0]?.startInput.weight ?? 0;
  const planName = completedOfRoute[0] ? startName(completedOfRoute[0]) : 'start weight';

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
          <Panel title="Every batch as a share of its starting weight" subtitle="Each cell is the weight that went into that stage, with its share of the batch's starting weight (the bag weight for a sack) underneath.">
            {store.batches.length === 0 ? <Empty>No batches yet.</Empty> : (
              <Table head={['Batch', 'Start', ...gridStations.map((s) => s.name), 'Products', 'Lost', 'Where the start weight went']}>
                {[...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
                  const totals = outcomeTotals(b);
                  return (
                    <tr key={b.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link>
                        <span className="block text-[11px] text-muted">{b.product}{b.status === 'hold' ? ' · on hold' : b.status === 'completed' ? ' · completed' : ''}</span>
                      </td>
                      <td className={tdNum}><KgPct weight={b.startInput.weight} share={100} /></td>
                      {gridStations.map((s) => {
                        const record = b.records.find((r) => r.station === s.id);
                        if (!record) return <td key={s.id} className={`${tdNum} text-faint`}>{b.nextStation === s.id && b.status !== 'completed' ? <span className="text-[11px] font-semibold text-green">next</span> : '—'}</td>;
                        const balance = recordBalance(record);
                        const over = Math.abs(balance.variancePct) > store.thresholds.variancePct[s.id];
                        return (
                          <td key={s.id} className={tdNum} title={`${s.name}: ${num(balance.input)} kg went in, ${pct(percentOf(balance.input, b.startInput.weight))} of the ${startName(b)}; unaccounted ${num(balance.variance)} kg (${pct(balance.variancePct)} of the stage input)`}>
                            <KgPct weight={balance.input} share={percentOf(balance.input, b.startInput.weight)} tone={over ? 'warn' : undefined} />
                          </td>
                        );
                      })}
                      <td className={`${tdNum} font-semibold`}><KgPct weight={totals.product} share={totals.pct.product} /></td>
                      <td className={`${tdNum} font-semibold`}><KgPct weight={totals.gone} share={totals.pct.gone} /></td>
                      <td className={`${td} min-w-40`}><OutcomeBar batch={b} compact /></td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <p className="px-5 py-3 text-[12px] text-muted">Weights in kg. Products are useful outputs that left the line (liquor, nibs for butter, nibs for sale, beans taken off, butter, powder, packed units). Lost is waste plus weight nobody weighed, such as moisture driven off in the roaster. By-products and material still in process make up the rest. An orange share means that stage&apos;s unaccounted variance is above its limit.</p>
          </Panel>

          <Panel title="Follow one batch down the line" subtitle="Every output at every stage, as a share of what went into that stage and of the batch's starting weight."
            action={<Select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch to follow" className="w-auto">{withRecords.map((b) => <option key={b.id} value={b.id}>{b.id} · {b.product}</option>)}</Select>}>
            {!followed ? <Empty>No batch has recorded a station yet.</Empty> : <StageTable batch={followed} />}
          </Panel>

          {followed && (
            <Panel title={`Where ${followed.id} went`} subtitle={`The ${startName(followed)} split into what came out of the line. Carried-forward material is counted once, where it finally left, so the rows add up to 100%.`}>
              <WhereItWent batch={followed} />
            </Panel>
          )}

          <Panel title="What a batch usually turns into" subtitle="Average share of the starting weight over the completed batches of one kind, weighted by batch size, with the lowest and highest batch. Enter a weight to see what to expect from it."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={route} onChange={(e) => { setRoute(e.target.value as RouteId); setPlanWeight(''); }} aria-label="Kind of batch" className="w-auto">{routeTabs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
                <span className="w-36"><UnitInput unit="kg" value={planWeight} placeholder={num(plan)} onChange={(e) => setPlanWeight(e.target.value)} aria-label="Starting weight to plan for" /></span>
              </div>
            }>
            {completedOfRoute.length === 0 ? <Empty>No completed batches of this kind yet.</Empty> : (
              <Table head={['Outcome', 'Stage', `Average % of ${planName}`, 'Lowest – highest', `From ${num(plan)} kg`]}>
                {typical.map((r) => (
                  <tr key={`${r.station}|${r.label}`}>
                    <td className={td}>{r.label} <span className="block text-[11px] text-muted">{r.group === 'product' ? 'Product' : r.group === 'byproduct' ? 'By-product' : r.group === 'waste' ? 'Waste' : 'Lost, not weighed'}</span></td>
                    <td className={`${td} text-muted`}>{r.station}</td>
                    <td className={`${tdNum} font-semibold`}>{pct(r.avgPct)}</td>
                    <td className={`${tdNum} text-muted`}>{pct(r.minPct)} – {pct(r.maxPct)}</td>
                    <td className={tdNum}>{kg(round2((plan * r.avgPct) / 100))}</td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="px-5 py-3 text-[12px] text-muted">Based on {completedOfRoute.length} completed {completedOfRoute.length === 1 ? 'batch' : 'batches'}. The more batches are recorded, the more these figures can be trusted as the factory&apos;s standard yields.</p>
          </Panel>

          <Panel title="Loss at each process, all batches" subtitle="Where the weight goes across the whole line, as a share of what went into each process. Lost is waste plus weight nobody weighed; by-products such as husks are kept apart.">
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
                    <td className={tdNum}>{num(balance.variance)}</td><td className={`${tdNum} ${Math.abs(balance.variancePct) > limit ? 'font-semibold text-warn' : ''}`}>{pct(balance.variancePct)}</td><td className={tdNum}>{limit === undefined ? '—' : `${limit}%`}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </>
      )}

      {current.id === 'batches' && (
        <Panel title="All batches">
          <Table head={['Batch', 'Product', 'Supplier', 'Started', 'Status', 'Stations', 'Start input', 'Products', 'By-products', 'Waste', 'Lost, not weighed']}>
            {[...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
              const totals = outcomeTotals(b);
              return (
                <tr key={b.id}>
                  <td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{b.id}</Link></td>
                  <td className={td}>{b.product}</td><td className={td}>{b.supplierId ? supplierName(store, b.supplierId) : <span className="text-faint">—</span>}</td><td className={td}>{dateTime(b.startedAt)}</td>
                  <td className={td}><Badge tone={b.status === 'completed' ? 'neutral' : b.status === 'hold' ? 'danger' : 'green'}>{b.status === 'completed' ? 'Completed' : b.status === 'hold' ? 'On hold' : 'In progress'}</Badge></td>
                  <td className={td}>{b.records.map((r) => stationName(r.station)).join(' → ') || '—'}{b.nextStation && b.status !== 'completed' ? ` → (${stationName(b.nextStation)})` : ''}</td>
                  <td className={tdNum}>{kg(b.startInput.weight)}</td>
                  <td className={tdNum}><KgPct weight={totals.product} share={totals.pct.product} /></td>
                  <td className={tdNum}><KgPct weight={totals.byproduct} share={totals.pct.byproduct} /></td>
                  <td className={tdNum}><KgPct weight={totals.waste} share={totals.pct.waste} /></td>
                  <td className={tdNum}><KgPct weight={totals.lost} share={totals.pct.lost} /></td>
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
