'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Empty, Input, PageHeader, Panel, Select, Stat, SubNav, Table, td, tdNum } from '@/components/ui';
import { getReportRange, ReportExport, type ProductionReportType, type ReportPeriod, type ReportRange } from '@/components/ReportExport';
import { round2 } from '@/lib/balance';
import { batchDisplayName, recordBalance, userName } from '@/lib/derive';
import { dateTime, kg, num, pct } from '@/lib/format';
import type { ReportExportSnapshot } from '@/lib/report-export';
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

  // Loss at each process, added up over every batch that passed through it.
  const byStation = stations.filter((s) => s.form === 'weights').map((station) => {
    const balances = reportBatches.flatMap((b) => b.records.filter((r) => r.station === station.id).map(recordBalance));
    const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((t, b) => t + b[key], 0));
    const input = sum('input'), useful = sum('useful');
    return { station, batches: balances.length, input, useful, byproduct: sum('byproduct'), waste: sum('waste'), variance: sum('variance'), lost: round2(input - useful), lostPct: input ? round2(((input - useful) / input) * 100) : 0 };
  }).filter((r) => r.batches > 0);

  // One batch followed from its starting weight through every recorded station.
  const followed = reportBatches.find((b) => b.id === batchId);
  const steps = followed ? followed.records.map((record) => {
    const balance = recordBalance(record);
    return { record, balance, lost: round2(balance.input - balance.useful), leftPct: followed.startInput.weight ? round2((balance.useful / followed.startInput.weight) * 100) : 0 };
  }) : [];

  const rows = reportBatches.flatMap((batch) => batch.records.map((record) => ({ batch, record, balance: recordBalance(record), limit: store.thresholds.variancePct[record.station] })))
    .filter((r) => stationFilter === 'all' || r.record.station === stationFilter)
    .sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt));
  const totals = rows.reduce((t, r) => ({ input: t.input + r.balance.input, useful: t.useful + r.balance.useful, waste: t.waste + r.balance.waste, byproduct: t.byproduct + r.balance.byproduct, variance: t.variance + r.balance.variance }), { input: 0, useful: 0, waste: 0, byproduct: 0, variance: 0 });

  const buildExportSnapshot = (type: ProductionReportType, range: ReportRange): ReportExportSnapshot => {
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
      const processRows = stations.filter((station) => station.form === 'weights').map((station) => {
        const balances = filteredRecords.filter(({ record }) => record.station === station.id).map(({ balance }) => balance);
        const sum = (key: 'input' | 'useful' | 'byproduct' | 'waste' | 'variance') => round2(balances.reduce((total, balance) => total + balance[key], 0));
        const input = sum('input');
        const useful = sum('useful');
        const lost = round2(input - useful);
        return [station.name, balances.length, num(input), num(useful), num(sum('byproduct')), num(sum('waste')), num(sum('variance')), num(lost), pct(input ? round2((lost / input) * 100) : 0)];
      }).filter((row) => row[1] !== 0);

      const batchRows = filteredBatches.map((batch) => {
        const last = batch.records.at(-1);
        const lost = last ? round2(batch.startInput.weight - recordBalance(last).useful) : 0;
        return [batchDisplayName(batch), batch.id, batch.product, dateTime(batch.startedAt), statusLabel(batch.status), batch.records.map((record) => stationName(record.station)).join(' → ') || '—', num(lost), pct(batch.startInput.weight ? round2((lost / batch.startInput.weight) * 100) : 0)];
      });

      const detailRows = filteredRecords.map(({ batch, record, balance }) => [
        batchDisplayName(batch), stationName(record.station), dateTime(record.recordedAt), num(balance.input), num(balance.useful), num(balance.byproduct), num(balance.waste), num(balance.variance), num(round2(balance.input - balance.useful)),
      ]);

      return {
        title: 'Weight loss by process',
        periodLabel: range.label,
        sections: [
          { title: 'Batch overview', headers: ['Batch', 'Batch ID', 'Product', 'Started', 'Status', 'Recorded stations', 'Lost (kg)', 'Lost %'], rows: batchRows },
          { title: 'Loss at each process', headers: ['Process', 'Batches', 'Went in (kg)', 'Useful out (kg)', 'By-product (kg)', 'Waste (kg)', 'Unaccounted (kg)', 'Lost (kg)', 'Lost %'], rows: processRows },
          { title: 'Recorded stage detail', headers: ['Batch', 'Process', 'Recorded', 'Input (kg)', 'Useful (kg)', 'By-product (kg)', 'Waste (kg)', 'Unaccounted (kg)', 'Lost this step (kg)'], rows: detailRows },
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
      const batchRows = [...filteredBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((batch) => {
        const last = batch.records.at(-1);
        const variance = round2(batch.records.reduce((sum, record) => sum + recordBalance(record).variance, 0));
        return [batchDisplayName(batch), batch.id, batch.product, dateTime(batch.startedAt), statusLabel(batch.status), batch.records.map((record) => stationName(record.station)).join(' → ') || '—', kg(batch.startInput.weight), last ? kg(recordBalance(last).useful) : '—', kg(variance)];
      });
      return { title: 'Batch history', periodLabel: range.label, sections: [{ title: 'All batches', headers: ['Batch', 'Batch ID', 'Product', 'Started', 'Status', 'Stations', 'Start input', 'Last useful output', 'Total variance'], rows: batchRows }] };
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
          <Panel title="Weigh-in at each stage, every batch" subtitle="Each cell is the weight that went into that stage. The small figure below it is the useful weight that came out.">
            {reportBatches.length === 0 ? <Empty>No batches in this period.</Empty> : (
              <Table head={['Batch', 'Start', ...gridStations.map((s) => s.name), 'Lost so far']}>
                {[...reportBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
                  const last = b.records.at(-1);
                  const lostSoFar = last ? round2(b.startInput.weight - recordBalance(last).useful) : 0;
                  return (
                    <tr key={b.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>
                        {b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}
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
            action={<Select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Batch to follow" className="w-auto">{withRecords.map((b) => <option key={b.id} value={b.id}>{batchDisplayName(b)}{b.name ? ` · ${b.id}` : ''} · {b.product}</option>)}</Select>}>
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
          <Table head={['Batch', 'Product', 'Started', 'Status', 'Stations', 'Start input', 'Last useful output', 'Total variance']}>
            {[...reportBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((b) => {
              const last = b.records.at(-1);
              const variance = round2(b.records.reduce((s, r) => s + recordBalance(r).variance, 0));
              return (
                <tr key={b.id}>
                  <td className={td}><Link href={`/production/batches/${b.id}`} className="font-semibold text-green">{batchDisplayName(b)}</Link>{b.name && <span className="block text-[11px] text-faint">ID {b.id}</span>}</td>
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
