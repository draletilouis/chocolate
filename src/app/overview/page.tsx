'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Target } from 'lucide-react';
import { Empty, LinkButton, PageHeader, Panel, RowLink, Stat } from '@/components/ui';
import { percentOf, round2 } from '@/lib/balance';
import { startName, startWeight } from '@/lib/outcomes';
import type { Balance, Batch, StationRecord } from '@/lib/types';
import { activeBatches, allAlerts, batchDisplayName, recordBalance } from '@/lib/derive';
import { kg, pct } from '@/lib/format';
import { planProgress } from '@/lib/plan';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

/**
 * One recorded station in a line: its input and good outputs as shares of the batch's starting weight.
 * Mixing also weighs in sugar and milk powder from store, so a sack's mixing is shown in kg.
 */
function recentLine(batch: Batch, record: StationRecord, balance: Balance) {
  const start = startWeight(batch);
  if (record.station === 'mixing' && batch.startInput.weight > 0) return `input ${kg(balance.input)} with ingredients from store · variance ${pct(balance.variancePct)}`;
  const outputs = record.outputs.filter((o) => o.kind === 'useful').map((o) => `${o.name.toLowerCase()} ${pct(percentOf(o.weight, start))}`).join(' · ') || 'no good output';
  return `input ${kg(balance.input)} (${pct(percentOf(balance.input, start))} of the ${startName(batch)}) · ${outputs} · unaccounted ${pct(percentOf(balance.variance, start))}`;
}

export default function OverviewPage() {
  const store = useStore();
  const alerts = allAlerts(store);
  const active = activeBatches(store);
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = store.batches.filter((b) => b.status === 'completed' && b.completedAt?.startsWith(today)).length;
  const records = store.batches.flatMap((b) => b.records.map((r) => ({ batch: b, record: r, balance: recordBalance(r) })));
  const totals = records.reduce((t, r) => ({ input: t.input + r.balance.input, waste: t.waste + r.balance.waste, variance: t.variance + r.balance.variance }), { input: 0, waste: 0, variance: 0 });
  const recent = records.sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt)).slice(0, 6);
  const plan = planProgress(store);

  return (
    <>
      <PageHeader eyebrow="Overview" title="How production is doing" subtitle="Live totals from every recorded station." action={<LinkButton href="/production">Open production line <ArrowRight size={15} /></LinkButton>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active batches" value={active.length} hint={`${active.filter((b) => b.status === 'hold').length} on hold`} />
        <Stat label="Alerts" value={alerts.length} tone={alerts.length ? 'warn' : undefined} hint="Variance, waste, holds, stock" />
        <Stat label="Completed today" value={completedToday} hint={`${store.batches.filter((b) => b.status === 'completed').length} completed in total`} />
        <Stat label="Unaccounted variance" value={kg(round2(totals.variance))} hint={`${pct(totals.input ? round2((totals.variance / totals.input) * 100) : 0)} of all station input`} />
      </div>

      <Panel title="Production plan" subtitle={plan ? `Pieces made from ${plan.plan.from}${plan.plan.note ? ` · ${plan.plan.note}` : ''}` : 'How many pieces of each chocolate type and size to make.'}
        action={<LinkButton variant="secondary" href="/plan"><Target size={15} /> {plan ? 'Open the plan' : 'Set the plan'}</LinkButton>}>
        {!plan ? <Empty>No plan set yet.</Empty> : (
          <>
            <div className="px-5 py-3 text-[14px]"><strong className="tabular-nums">{plan.made}</strong> of <strong className="tabular-nums">{plan.planned}</strong> pieces made · <strong className="tabular-nums">{plan.left}</strong> left</div>
            {plan.lines.filter((l) => l.left > 0).slice(0, 5).map((l) => (
              <div key={`${l.recipeId}-${l.packSizeId}`} className="flex justify-between gap-3 border-t border-line px-5 py-2 text-[13px]"><span>{l.type} · {l.size}</span><span className="tabular-nums text-muted">{l.made} of {l.pieces} · <strong className="text-ink">{l.left} left</strong></span></div>
            ))}
          </>
        )}
      </Panel>

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
            <span className="flex-1 text-[13px]"><strong>{batchDisplayName(batch)}</strong>{batch.name && <span className="ml-2 text-[11px] text-muted">ID {batch.id}</span>} · {stationName(record.station)} <span className="block text-muted">{recentLine(batch, record, balance)}</span></span>
          </RowLink>
        ))}
      </Panel>
      <p className="text-[12px] text-muted">Need the full picture? See <Link href="/reports" className="font-semibold text-green">Reports</Link>.</p>
    </>
  );
}
