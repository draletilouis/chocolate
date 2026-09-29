'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OutcomeBar, StageTable, WhereItWent } from '@/components/BatchFlow';
import { Badge, Empty, Input, PageHeader, Panel, Select, Stat, SubNav, Table, UnitInput, td, tdNum } from '@/components/ui';
import { getReportRange, ReportExport, type ProductionReportType, type ReportPeriod, type ReportRange } from '@/components/ReportExport';
import { percentOf, round2 } from '@/lib/balance';
import { batchById, batchDisplayName, recordBalance, userName } from '@/lib/derive';
import { dateTime, kg, num, pct } from '@/lib/format';
import { batchOutcomes, outcomeTotals, startName, startWeight } from '@/lib/outcomes';
import type { ReportExportSnapshot } from '@/lib/report-export';
import { useStore } from '@/lib/store';
import { isWeighed, stationName, stations } from '@/lib/stations';
import { piecesByTypeAndSize, piecesKg, piecesLots } from '@/lib/pieces';
import type { Batch, Lot, RouteId } from '@/lib/types';


const sections = [
  { id: 'pieces', label: 'Pieces made', href: '/reports/pieces' },
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
 * The average share of the starting weight each outcome takes over the completed batches of one kind,
 * weighted by batch size, with the lowest and highest batch: the yield to expect from the next batch.
 */
function typicalOutcomes(batches: Batch[]) {
  const totalStart = batches.reduce((t, b) => t + startWeight(b), 0);
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

const groupLabel = (group: string) => group === 'product' ? 'Product' : group === 'byproduct' ? 'By-product' : group === 'waste' ? 'Waste' : group === 'lost' ? 'Lost, not weighed' : 'Still in process';

const routeOptions: { id: RouteId; label: string }[] = [{ id: 'beans', label: 'Bean sacks' }, { id: 'pressing', label: 'Stored nibs' }, { id: 'chocolate', label: 'Chocolate from store' }];

function inReportRange(iso: string, range: ReportRange) {
  const day = iso.slice(0, 10);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

const statusLabel = (status: string) => status === 'completed' ? 'Completed' : status === 'hold' ? 'On hold' : 'In progress';

export default function ReportsPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const [stationFilter, setStationFilter] = useState('all');
  const [duration, setDuration] = useState<ReportPeriod>('all');
  const [durationFrom, setDurationFrom] = useState('');
  const [durationTo, setDurationTo] = useState('');
  const durationRange = getReportRange(duration, durationFrom, durationTo);
  const reportBatches = store.batches
    .filter((batch) => duration === 'all'
      || inReportRange(batch.startedAt, durationRange)
      || batch.records.some((record) => inReportRange(record.recordedAt, durationRange))
      || batch.corrections.some((correction) => inReportRange(correction.correctedAt, durationRange))
      || batch.holds.some((hold) => inReportRange(hold.placedAt, durationRange)))
    .map((batch) => ({
      ...batch,
      // If the batch itself was started in the selected period, keep its full history.
      // This lets a past batch entered today remain useful in historical reports.
      records: duration === 'all' || inReportRange(batch.startedAt, durationRange)
        ? batch.records
        : batch.records.filter((record) => inReportRange(record.recordedAt, durationRange)),
    }));
  const withRecords = reportBatches.filter((b) => b.records.length > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [batchId, setBatchId] = useState(withRecords[0]?.id ?? '');
  const current = sections.find((s) => s.id === section) ?? sections[0];
  // Stages with a weigh-in, in line order; retired stations only for older batches that used them
  const gridStations = stations.filter((s) => s.form !== 'completion' && (!s.retired || reportBatches.some((b) => b.records.some((r) => r.station === s.id))));

  // Loss at each process, added up over every batch that passed through it. Lost is what was binned or never weighed.
  const byStation = stations.filter(isWeighed).map((station) => {
    const balances = reportBatches.flatMap((b) => b.records.filter((r) => r.station === station.id).map(recordBalance));
    const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((t, b) => t + b[key], 0));
    const input = sum('input'), lost = round2(sum('waste') + sum('variance'));
    return { station, batches: balances.length, input, useful: sum('useful'), byproduct: sum('byproduct'), waste: sum('waste'), variance: sum('variance'), lost, lostPct: percentOf(lost, input) };
  }).filter((r) => r.batches > 0);

  // Where a batch's starting weight went is worked out from all its records, even when the period shows only some of them.
  const whole = (b: Batch) => batchById(store, b.id) ?? b;

  // One batch followed from its starting weight through every recorded station.
  const followedInPeriod = reportBatches.find((b) => b.id === batchId);
  const followed = followedInPeriod && whole(followedInPeriod);

  // What completed batches of one kind usually turn into, and what that means for a batch of a chosen weight.
  const [route, setRoute] = useState<RouteId>('beans');
  const [planWeight, setPlanWeight] = useState('');
  const completedOfRoute = reportBatches.filter((b) => b.route === route && b.status === 'completed').map(whole).filter((b) => startWeight(b) > 0).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const typical = typicalOutcomes(completedOfRoute);
  const plan = Number(planWeight) > 0 ? Number(planWeight) : completedOfRoute[0] ? startWeight(completedOfRoute[0]) : 0;
  const planName = completedOfRoute[0] ? startName(completedOfRoute[0]) : 'start weight';

  const rows = reportBatches.flatMap((batch) => batch.records.map((record) => ({ batch, record, balance: recordBalance(record), limit: store.thresholds.variancePct[record.station] })))
    .filter((r) => stationFilter === 'all' || r.record.station === stationFilter)
    .sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt));
  const totals = rows.reduce((t, r) => ({ input: t.input + r.balance.input, useful: t.useful + r.balance.useful, waste: t.waste + r.balance.waste, byproduct: t.byproduct + r.balance.byproduct, variance: t.variance + r.balance.variance }), { input: 0, useful: 0, waste: 0, byproduct: 0, variance: 0 });

  // Pieces made in the period: the factory's end result, by chocolate type and size
  const piecesInPeriod = piecesLots(store).filter((l) => duration === 'all' || inReportRange(l.receivedAt, durationRange));
  const piecesTotals = piecesByTypeAndSize(piecesInPeriod);
  const pieceRow = (l: Lot) => [dateTime(l.receivedAt), l.id, l.pieces!.type, l.pieces!.size, l.received, num(piecesKg(l.received, l.pieces!.grams)), l.pieces!.fromLotId, l.source.type === 'batch' ? l.source.batchId : '', userName(store, l.pieces!.recordedBy)];

  const buildExportSnapshot = (type: ProductionReportType, range: ReportRange): ReportExportSnapshot => {
    if (type === 'pieces') {
      const lots = piecesLots(store).filter((l) => inReportRange(l.receivedAt, range));
      const totals = piecesByTypeAndSize(lots);
      return {
        title: 'Pieces made',
        periodLabel: range.label,
        sections: [
          { title: 'By type and size', headers: ['Chocolate type', 'Size', 'Pieces', 'Chocolate (kg)'], rows: [...totals.map((t) => [t.type, t.size, t.pieces, num(t.kg)]), ['Total', '', totals.reduce((n, t) => n + t.pieces, 0), num(totals.reduce((n, t) => n + t.kg, 0))]] },
          { title: 'Lots of pieces', headers: ['Made', 'Lot', 'Chocolate type', 'Size', 'Pieces', 'Chocolate (kg)', 'From chocolate lot', 'Batch', 'By'], rows: lots.map(pieceRow) },
        ],
      };
    }
    const filteredBatches = store.batches
      .filter((batch) => inReportRange(batch.startedAt, range)
        || batch.records.some((record) => inReportRange(record.recordedAt, range))
        || batch.corrections.some((correction) => inReportRange(correction.correctedAt, range))
        || batch.holds.some((hold) => inReportRange(hold.placedAt, range)))
      .map((batch) => {
        const batchInRange = inReportRange(batch.startedAt, range);
        return {
          ...batch,
          records: batchInRange ? batch.records : batch.records.filter((record) => inReportRange(record.recordedAt, range)),
        };
      });
    const filteredRecords = filteredBatches.flatMap((batch) => batch.records.map((record) => ({ batch, record, balance: recordBalance(record) })));

    if (type === 'losses') {
      const processRows = stations.filter(isWeighed).map((station) => {
        const balances = filteredRecords.filter(({ record }) => record.station === station.id).map(({ balance }) => balance);
        const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((total, balance) => total + balance[key], 0));
        const input = sum('input');
        const lost = round2(sum('waste') + sum('variance'));
        return [station.name, balances.length, num(input), num(sum('useful')), num(sum('byproduct')), num(sum('waste')), num(sum('variance')), num(lost), pct(percentOf(lost, input))];
      }).filter((row) => row[1] !== 0);

      const wholeBatches = filteredBatches.map(whole);
      const batchRows = wholeBatches.map((batch) => {
        const t = outcomeTotals(batch);
        return [batchDisplayName(batch), batch.id, batch.product, dateTime(batch.startedAt), statusLabel(batch.status), batch.records.map((record) => stationName(record.station)).join(' → ') || '—', num(startWeight(batch)), num(t.product), pct(t.pct.product), num(t.byproduct), pct(t.pct.byproduct), num(t.gone), pct(t.pct.gone), num(t.process), pct(t.pct.process)];
      });

      const outcomeRows = wholeBatches.flatMap((batch) => batchOutcomes(batch).map((o) => [batchDisplayName(batch), batch.id, groupLabel(o.group), o.label, stationName(o.station), num(o.weight), pct(o.ofStartPct), o.lotId ?? '']));

      const detailRows = filteredRecords.map(({ batch, record, balance }) => {
        const start = startWeight(whole(batch));
        return [batchDisplayName(batch), stationName(record.station), dateTime(record.recordedAt), num(balance.input), pct(percentOf(balance.input, start)), record.outputs.map((o) => `${o.name} ${num(o.weight)} kg (${pct(percentOf(o.weight, start))})`).join('; '), num(balance.byproduct), num(balance.waste), num(balance.variance)];
      });

      return {
        title: 'Yield by stage',
        periodLabel: range.label,
        sections: [
          { title: 'Batch overview (shares of each batch’s starting weight)', headers: ['Batch', 'Batch ID', 'Product', 'Started', 'Status', 'Recorded stations', 'Start (kg)', 'Products (kg)', 'Products %', 'By-products (kg)', 'By-products %', 'Waste and lost (kg)', 'Waste and lost %', 'In process (kg)', 'In process %'], rows: batchRows },
          { title: 'Where each batch went', headers: ['Batch', 'Batch ID', 'Group', 'Outcome', 'Stage', 'Weight (kg)', '% of start', 'Lot'], rows: outcomeRows },
          { title: 'Loss at each process (waste and unaccounted)', headers: ['Process', 'Batches', 'Went in (kg)', 'Useful out (kg)', 'By-product (kg)', 'Waste (kg)', 'Unaccounted (kg)', 'Lost (kg)', 'Lost %'], rows: processRows },
          { title: 'Recorded stage detail', headers: ['Batch', 'Process', 'Recorded', 'Input (kg)', 'Input % of start', 'Outputs (kg, % of start)', 'By-product (kg)', 'Waste (kg)', 'Unaccounted (kg)'], rows: detailRows },
        ],
      };
    }

    if (type === 'variance') {
      const varianceRows = filteredRecords
        .filter(({ record }) => stationFilter === 'all' || record.station === stationFilter)
        .sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt))
        .map(({ batch, record, balance }) => [batchDisplayName(batch), stationName(record.station), dateTime(record.recordedAt), num(balance.input), num(balance.useful), num(balance.waste), num(balance.byproduct), num(balance.variance), pct(balance.variancePct), `${store.thresholds.variancePct[record.station]}%`]);
      const exportTotals = filteredRecords.reduce((total, item) => ({ input: total.input + item.balance.input, useful: total.useful + item.balance.useful, waste: total.waste + item.balance.waste, byproduct: total.byproduct + item.balance.byproduct, variance: total.variance + item.balance.variance }), { input: 0, useful: 0, waste: 0, byproduct: 0, variance: 0 });
      return {
        title: 'Waste & variance',
        periodLabel: range.label,
        sections: [
          { title: 'Summary', headers: ['Measure', 'Amount (kg)', 'Share of input'], rows: [['Station input', num(round2(exportTotals.input)), '100%'], ['Useful output', num(round2(exportTotals.useful)), pct(exportTotals.input ? round2((exportTotals.useful / exportTotals.input) * 100) : 0)], ['Recorded waste', num(round2(exportTotals.waste)), pct(exportTotals.input ? round2((exportTotals.waste / exportTotals.input) * 100) : 0)], ['By-products', num(round2(exportTotals.byproduct)), pct(exportTotals.input ? round2((exportTotals.byproduct / exportTotals.input) * 100) : 0)], ['Unaccounted variance', num(round2(exportTotals.variance)), pct(exportTotals.input ? round2((exportTotals.variance / exportTotals.input) * 100) : 0)]], },
          { title: 'By station and batch', headers: ['Batch', 'Station', 'Recorded', 'Input (kg)', 'Useful (kg)', 'Waste (kg)', 'By-product (kg)', 'Variance (kg)', 'Variance %', 'Limit'], rows: varianceRows },
        ],
      };
    }

    if (type === 'batches') {
      const batchRows = [...filteredBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(whole).map((batch) => {
        const t = outcomeTotals(batch);
        return [batchDisplayName(batch), batch.id, batch.product, dateTime(batch.startedAt), statusLabel(batch.status), batch.records.map((record) => stationName(record.station)).join(' → ') || '—', kg(startWeight(batch)), kg(t.product), pct(t.pct.product), kg(t.byproduct), pct(t.pct.byproduct), kg(t.waste), pct(t.pct.waste), kg(t.lost), pct(t.pct.lost)];
      });
      return { title: 'Batch history', periodLabel: range.label, sections: [{ title: 'All batches', headers: ['Batch', 'Batch ID', 'Product', 'Started', 'Status', 'Stations', 'Start input', 'Products', 'Products %', 'By-products', 'By-products %', 'Waste', 'Waste %', 'Lost, not weighed', 'Lost %'], rows: batchRows }] };
    }

    if (type === 'corrections') {
      const correctionRows = filteredBatches.flatMap((batch) => batch.corrections.filter((correction) => inReportRange(correction.correctedAt, range)).map((correction) => [dateTime(correction.correctedAt), batchDisplayName(batch), batch.id, stationName(correction.station), correction.output, `${num(correction.previous)} kg`, `${num(correction.corrected)} kg`, correction.reason, userName(store, correction.correctedBy)]));
      return { title: 'Corrections', periodLabel: range.label, sections: [{ title: 'Correction history', headers: ['When', 'Batch', 'Batch ID', 'Station', 'Output', 'Before', 'After', 'Reason', 'By'], rows: correctionRows }] };
    }

    const holdRows = filteredBatches.flatMap((batch) => batch.holds.filter((hold) => inReportRange(hold.placedAt, range)).map((hold) => [dateTime(hold.placedAt), batchDisplayName(batch), batch.id, stationName(hold.station), hold.reason, userName(store, hold.placedBy), hold.releasedAt ? `${dateTime(hold.releasedAt)}${hold.releaseNote ? ` · ${hold.releaseNote}` : ''}` : 'Still on hold']));
    return { title: 'Holds', periodLabel: range.label, sections: [{ title: 'Hold history', headers: ['Placed', 'Batch', 'Batch ID', 'At station', 'Reason', 'By', 'Released'], rows: holdRows }] };
  };

  return (
    <>
      <PageHeader eyebrow="Reports" title={current.label} action={(
        <div className="reports-header-actions">
          <div className="report-duration-filter">
            <label className="report-duration-field">
              <span className="form-label">Duration</span>
              <Select value={duration} onChange={(event) => setDuration(event.target.value as ReportPeriod)} aria-label="Report duration">
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
                <option value="custom">Custom range</option>
              </Select>
            </label>
            {duration === 'custom' && (
              <>
                <label className="report-duration-field"><span className="form-label">From</span><Input type="date" value={durationFrom} onChange={(event) => setDurationFrom(event.target.value)} aria-label="Report start date" /></label>
                <label className="report-duration-field"><span className="form-label">To</span><Input type="date" value={durationTo} onChange={(event) => setDurationTo(event.target.value)} aria-label="Report end date" /></label>
              </>
            )}
          </div>
          <ReportExport current={current.id as ProductionReportType} business={store.business} buildSnapshot={buildExportSnapshot} />
        </div>
      )} />
      <SubNav items={sections} current={current.id} />

      {current.id === 'losses' && (
        <>
          <Panel title="Every batch as a share of its starting weight" subtitle="Each cell is the weight that went into that stage, with its share of the batch's starting weight (the bag weight for a sack) underneath.">
            {reportBatches.length === 0 ? <Empty>No batches in this period.</Empty> : (<>
              {/* Phones: one card per batch instead of a table wider than the screen */}
              <div className="md:hidden">
                {[...reportBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
                  const start = startWeight(whole(b));
                  const totals = outcomeTotals(whole(b));
                  return (
                    <div key={b.id} className="border-b border-line px-4 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>
                        <span className="text-[12px] text-muted">{b.product}{b.status === 'hold' ? ' · on hold' : b.status === 'completed' ? ' · completed' : ''}</span>
                      </div>
                      <div className="mt-1 grid gap-0.5 text-[12px] tabular-nums">
                        <div className="flex justify-between"><span className="text-muted">Start</span><span>{start > 0 ? `${num(start)} kg · 100%` : 'nothing weighed yet'}</span></div>
                        {b.records.map((r) => {
                          const balance = recordBalance(r);
                          const over = Math.abs(balance.variancePct) > store.thresholds.variancePct[r.station];
                          return <div key={r.id} className="flex justify-between gap-2"><span className="text-muted">{stationName(r.station)}</span><span className={over ? 'text-warn' : ''}>{num(balance.input)} kg · {pct(percentOf(balance.input, start))}</span></div>;
                        })}
                        <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>Products</span><span>{num(totals.product)} kg · {pct(totals.pct.product)}</span></div>
                        <div className="flex justify-between font-semibold"><span>Waste and lost</span><span>{num(totals.gone)} kg · {pct(totals.pct.gone)}</span></div>
                        <div className="mt-1"><OutcomeBar batch={whole(b)} compact /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block">
              <Table head={['Batch', 'Start', ...gridStations.map((s) => s.name), 'Products', 'Waste and lost', 'Where the start weight went']}>
                {[...reportBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
                  const start = startWeight(whole(b));
                  const totals = outcomeTotals(whole(b));
                  return (
                    <tr key={b.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>
                        {b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}
                        <span className="block text-[11px] text-muted">{b.product}{b.status === 'hold' ? ' · on hold' : b.status === 'completed' ? ' · completed' : ''}</span>
                      </td>
                      <td className={tdNum}>{start > 0 ? <KgPct weight={start} share={100} /> : <span className="text-faint">—</span>}</td>
                      {gridStations.map((s) => {
                        const record = b.records.find((r) => r.station === s.id);
                        if (!record) return <td key={s.id} className={`${tdNum} text-faint`}>{b.nextStation === s.id && b.status !== 'completed' ? <span className="text-[11px] font-semibold text-green">next</span> : '—'}</td>;
                        const balance = recordBalance(record);
                        const over = Math.abs(balance.variancePct) > store.thresholds.variancePct[s.id];
                        return (
                          <td key={s.id} className={tdNum} title={`${s.name}: ${num(balance.input)} kg went in, ${pct(percentOf(balance.input, start))} of the ${startName(b)}; unaccounted ${num(balance.variance)} kg (${pct(balance.variancePct)} of the stage input)`}>
                            <KgPct weight={balance.input} share={percentOf(balance.input, start)} tone={over ? 'warn' : undefined} />
                          </td>
                        );
                      })}
                      <td className={`${tdNum} font-semibold`}><KgPct weight={totals.product} share={totals.pct.product} /></td>
                      <td className={`${tdNum} font-semibold`}><KgPct weight={totals.gone} share={totals.pct.gone} /></td>
                      <td className={`${td} min-w-40`}><OutcomeBar batch={whole(b)} compact /></td>
                    </tr>
                  );
                })}
              </Table>
              </div>
            </>)}
            <p className="px-5 py-3 text-[12px] text-muted">Weights in kg. Products are good outputs that left the line: stored, sold, reworked, or liquor and butter made into chocolate. Waste and lost is what was binned (husks included) plus weight nobody weighed, such as moisture driven off in the roaster. By-products and material still in process make up the rest. An orange share means that stage&apos;s unaccounted variance is above its limit. Mixing also takes in sugar and milk powder from store, so its input can be more than the batch sent there.</p>
          </Panel>

          <Panel title="Follow one batch down the line" subtitle="Every output at every stage, as a share of what went into that stage and of the batch's starting weight."
            action={<Select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch to follow" className="w-auto">{withRecords.map((b) => <option key={b.id} value={b.id}>{batchDisplayName(b)}{b.name ? ` · ${b.id}` : ''} · {b.product}</option>)}</Select>}>
            {!followed ? <Empty>No batch has recorded a station yet.</Empty> : <StageTable batch={followed} />}
          </Panel>

          {followed && (
            <Panel title={`Where ${batchDisplayName(followed)} went`} subtitle={`The ${startName(followed)} split into what came out of the line. Material sent on is counted once, where it finally left, so the rows add up to 100%.`}>
              <WhereItWent batch={followed} />
            </Panel>
          )}

          <Panel title="What a batch usually turns into" subtitle="Average share of the starting weight over the completed batches of one kind in this period, weighted by batch size, with the lowest and highest batch. Enter a weight to see what to expect from it."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={route} onChange={(e) => { setRoute(e.target.value as RouteId); setPlanWeight(''); }} aria-label="Kind of batch" className="w-auto">{routeOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
                <span className="w-36"><UnitInput unit="kg" value={planWeight} placeholder={num(plan)} onChange={(e) => setPlanWeight(e.target.value)} aria-label="Starting weight to plan for" /></span>
              </div>
            }>
            {completedOfRoute.length === 0 ? <Empty>No completed batches of this kind in this period.</Empty> : (
              <Table head={['Outcome', 'Stage', `Average % of ${planName}`, 'Lowest – highest', `From ${num(plan)} kg`]}>
                {typical.map((r) => (
                  <tr key={`${r.station}|${r.label}`}>
                    <td className={td}>{r.label} <span className="block text-[11px] text-muted">{groupLabel(r.group)}</span></td>
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

          <Panel title="Loss at each process, all batches" subtitle="Where the weight goes across the whole line, as a share of what went into each process. Lost is waste plus weight nobody weighed.">
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
          <Panel title="By station and batch" subtitle="Variance is what the scale could not explain. It is never counted as waste." action={<Select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} aria-label="Station filter" className="w-auto"><option value="all">All stations</option>{gridStations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}>
            {rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
              <Table head={['Batch', 'Station', 'Input', 'Useful', 'Waste', 'By-product', 'Variance', 'Variance %', 'Limit']}>
                {rows.map(({ batch, record, balance, limit }) => (
                  <tr key={record.id} className={Math.abs(balance.variancePct) > limit ? 'bg-warn-soft/60' : ''}>
                    <td className={td}><Link href={`/production/batches/${batch.id}`} className="font-semibold text-green">{batchDisplayName(batch)}</Link>{batch.name && <span className="block text-[11px] text-faint">ID {batch.id}</span>}</td>
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
          <Table head={['Batch', 'Product', 'Started', 'Status', 'Stations', 'Start input', 'Products', 'By-products', 'Waste', 'Lost, not weighed']}>
            {[...reportBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
              const totals = outcomeTotals(whole(b));
              return (
                <tr key={b.id}>
                  <td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>{b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}</td>
                  <td className={td}>{b.product}</td><td className={td}>{dateTime(b.startedAt)}</td>
                  <td className={td}><Badge tone={b.status === 'completed' ? 'neutral' : b.status === 'hold' ? 'danger' : 'green'}>{b.status === 'completed' ? 'Completed' : b.status === 'hold' ? 'On hold' : 'In progress'}</Badge></td>
                  <td className={td}>{b.records.map((r) => stationName(r.station)).join(' → ') || '—'}{b.nextStation && b.status !== 'completed' ? ` → (${stationName(b.nextStation)})` : ''}</td>
                  <td className={tdNum}>{kg(startWeight(whole(b)))}</td>
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

      {current.id === 'pieces' && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Pieces made" value={piecesTotals.reduce((n, t) => n + t.pieces, 0)} />
            <Stat label="Chocolate in pieces" value={kg(piecesTotals.reduce((n, t) => n + t.kg, 0))} />
            <Stat label="Chocolate types" value={new Set(piecesTotals.map((t) => t.type)).size} />
          </div>
          <Panel title="By type and size" subtitle="Good pieces made in this period.">
            {piecesTotals.length === 0 ? <Empty>No pieces made in this period.</Empty> : (
              <Table head={['Chocolate type', 'Size', 'Pieces', 'Chocolate']}>
                {piecesTotals.map((t) => <tr key={`${t.type}-${t.size}`}><td className={td}>{t.type}</td><td className={td}>{t.size}</td><td className={`${tdNum} font-semibold`}>{t.pieces}</td><td className={tdNum}>{num(t.kg)} kg</td></tr>)}
              </Table>
            )}
          </Panel>
          {piecesInPeriod.length > 0 && (
            <Panel title="Lots of pieces" subtitle="Each count entered at Pieces, with the chocolate it was made from.">
              <Table head={['Made', 'Lot', 'Chocolate type', 'Size', 'Pieces', 'From', 'Batch', 'By']}>
                {piecesInPeriod.map((l) => <tr key={l.id}><td className={td}>{dateTime(l.receivedAt)}</td><td className={td}><Link href={`/materials/${l.id}`} className="font-semibold text-green">{l.id}</Link></td><td className={td}>{l.pieces!.type}</td><td className={td}>{l.pieces!.size}</td><td className={tdNum}>{l.received}</td><td className={td}><Link href={`/materials/${l.pieces!.fromLotId}`} className="font-semibold text-green">{l.pieces!.fromLotId}</Link></td><td className={td}>{l.source.type === 'batch' && <Link href={`/production/batches/${l.source.batchId}`} className="font-semibold text-green">{l.source.batchId}</Link>}</td><td className={td}>{userName(store, l.pieces!.recordedBy)}</td></tr>)}
              </Table>
            </Panel>
          )}
        </>
      )}

      {current.id === 'corrections' && (
        <Panel title="Corrections" subtitle="Every changed weight, with the reason and who changed it.">
          {reportBatches.every((b) => b.corrections.filter((c) => inReportRange(c.correctedAt, durationRange)).length === 0) ? <Empty>No corrections in this period.</Empty> : (
            <Table head={['When', 'Batch', 'Station', 'Output', 'Before', 'After', 'Reason', 'By']}>
              {reportBatches.flatMap((b) => b.corrections.filter((c) => inReportRange(c.correctedAt, durationRange)).map((c) => ({ b, c }))).sort((x, y) => y.c.correctedAt.localeCompare(x.c.correctedAt)).map(({ b, c }) => (
                <tr key={c.id}><td className={td}>{dateTime(c.correctedAt)}</td><td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>{b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}</td><td className={td}>{stationName(c.station)}</td><td className={td}>{c.output}</td><td className={tdNum}>{num(c.previous)} kg</td><td className={tdNum}>{num(c.corrected)} kg</td><td className={td}>{c.reason}</td><td className={td}>{userName(store, c.correctedBy)}</td></tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      {current.id === 'holds' && (
        <Panel title="Holds" subtitle="Batches stopped for a reason, and when they were released.">
          {reportBatches.every((b) => b.holds.filter((h) => inReportRange(h.placedAt, durationRange)).length === 0) ? <Empty>No holds in this period.</Empty> : (
            <Table head={['Placed', 'Batch', 'At station', 'Reason', 'By', 'Released']}>
              {reportBatches.flatMap((b) => b.holds.filter((h) => inReportRange(h.placedAt, durationRange)).map((h) => ({ b, h }))).sort((x, y) => y.h.placedAt.localeCompare(x.h.placedAt)).map(({ b, h }) => (
                <tr key={h.id}><td className={td}>{dateTime(h.placedAt)}</td><td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>{b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}</td><td className={td}>{stationName(h.station)}</td><td className={td}>{h.reason}</td><td className={td}>{userName(store, h.placedBy)}</td><td className={td}>{h.releasedAt ? `${dateTime(h.releasedAt)}${h.releaseNote ? ` · ${h.releaseNote}` : ''}` : <Badge tone="danger">Still on hold</Badge>}</td></tr>
              ))}
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
