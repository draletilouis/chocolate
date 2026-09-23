'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Empty, LinkButton, PageHeader, Panel, RowLink, Stat } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { activeBatches, allAlerts, recordBalance } from '@/lib/derive';
import { kg, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

export default function OverviewPage() {
  const store = useStore();
  const alerts = allAlerts(store);
  const active = activeBatches(store);
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = store.batches.filter((b) => b.status === 'completed' && b.completedAt?.startsWith(today)).length;
  const records = store.batches.flatMap((b) => b.records.map((r) => ({ batch: b, record: r, balance: recordBalance(r) })));
  const totals = records.reduce((t, r) => ({ input: t.input + r.balance.input, waste: t.waste + r.balance.waste, variance: t.variance + r.balance.variance }), { input: 0, waste: 0, variance: 0 });
  const recent = records.sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt)).slice(0, 6);

  return (
    <>
      <PageHeader eyebrow="Overview" title="How production is doing" subtitle="Live totals from every recorded station." action={<LinkButton href="/production">Open production line <ArrowRight size={15} /></LinkButton>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active batches" value={active.length} hint={`${active.filter((b) => b.status === 'hold').length} on hold`} />
        <Stat label="Alerts" value={alerts.length} tone={alerts.length ? 'warn' : undefined} hint="Variance, waste, holds, stock" />
        <Stat label="Completed today" value={completedToday} hint={`${store.batches.filter((b) => b.status === 'completed').length} completed in total`} />
        <Stat label="Unaccounted variance" value={kg(round2(totals.variance))} hint={`${pct(totals.input ? round2((totals.variance / totals.input) * 100) : 0)} of all station input`} />
      </div>

      <Panel title="Alerts" subtitle="Anything that needs a second look.">
        {alerts.length === 0 && <Empty>No alerts right now.</Empty>}
        {alerts.map((a) => (
          <RowLink key={a.id} href={a.href}>
            <AlertTriangle size={16} className={a.kind === 'hold' ? 'text-danger' : 'text-warn'} />
            <span className="text-[13px]">{a.message}</span>
          </RowLink>
        ))}
      </Panel>

      <Panel title="Recently recorded">
        {recent.map(({ batch, record, balance }) => (
          <RowLink key={record.id} href={`/production/batches/${batch.id}`}>
            <span className="flex-1 text-[13px]"><strong>{batch.id}</strong> · {stationName(record.station)} <span className="block text-muted">input {kg(balance.input)} · useful {kg(balance.useful)} · variance {pct(balance.variancePct)}</span></span>
          </RowLink>
        ))}
      </Panel>
      <p className="text-[12px] text-muted">Need the full picture? See <Link href="/reports" className="font-semibold text-green">Reports</Link>.</p>
    </>
  );
}
