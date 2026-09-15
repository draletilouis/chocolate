'use client';

import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeader, Panel, RowLink } from '@/components/ui';
import { activeBatches, batchAlerts, batchDisplayName, currentStation, stationQueue } from '@/lib/derive';
import { useStore } from '@/lib/store';
import { stationGroups, stationName, stations } from '@/lib/stations';

export default function ProductionPage() {
  const store = useStore();
  const batches = activeBatches(store).sort((a, b) => (a.status === 'hold' ? 1 : 0) - (b.status === 'hold' ? 1 : 0) || a.startedAt.localeCompare(b.startedAt));

  return (
    <>
      <PageHeader eyebrow="Production line" title="Which batch needs attention?" subtitle="Continue a batch, or open your part of the line to record what you weighed."
        action={<LinkButton href="/production/new"><Plus size={16} /> New batch</LinkButton>} />

      <Panel title="Active batches" subtitle={`${batches.length} in progress`}>
        {batches.length === 0 && <Empty>No batches in progress. Start one when production begins.</Empty>}
        {batches.map((batch) => {
          const alerts = batchAlerts(store, batch);
          const onHold = batch.status === 'hold';
          return (
            <div key={batch.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0 md:grid-cols-[110px_1fr_1fr_1fr_auto] md:px-5">
              <Link href={`/production/batches/${batch.id}`} className="min-w-0 font-bold text-green hover:underline"><span className="block truncate">{batchDisplayName(batch)}</span>{batch.name && <span className="block text-[10px] font-normal text-muted">{batch.id}</span>}</Link>
              <div className="col-start-1 md:col-start-auto">
                <div className="font-medium">{batch.product}</div>
                {onHold && <Badge tone="danger">On hold</Badge>}
                {!onHold && alerts.length > 0 && <Badge tone="warn">{alerts.length} alert{alerts.length > 1 ? 's' : ''}</Badge>}
              </div>
              <div className="text-[13px]"><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">Current station</span>{stationName(currentStation(batch))}</div>
              <div className="text-[13px]"><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">Next step</span>{onHold ? `${stationName(batch.nextStation)} (on hold)` : stationName(batch.nextStation)}</div>
              <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                {onHold
                  ? <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Review hold</LinkButton>
                  : <LinkButton href={`/production/batches/${batch.id}/record/${batch.nextStation}`} aria-label={`Continue ${batchDisplayName(batch)}`}>Continue <ArrowRight size={15} /></LinkButton>}
              </div>
            </div>
          );
        })}
      </Panel>

      <Panel title="Parts of the line" subtitle="Each part has its own page with its stations. Pick yours.">
        {stationGroups.map((group, index) => {
          const partStations = stations.filter((s) => s.group === group.name);
          const waiting = partStations.reduce((n, s) => n + stationQueue(store, s.id).ready.length, 0);
          return (
            <RowLink key={group.slug} href={`/production/parts/${group.slug}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-[11px] font-bold text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{group.name}</strong>{waiting > 0 && <Badge tone="green">{waiting} waiting</Badge>}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted"><span>{group.from}</span><ArrowRight size={12} className="shrink-0" /><span>{group.to}</span><span>· {partStations.map((s) => s.name).join(', ')}</span></span>
              </span>
              <span className="hidden text-[13px] font-semibold text-green sm:inline">Open part</span>
            </RowLink>
          );
        })}
      </Panel>
    </>
  );
}
