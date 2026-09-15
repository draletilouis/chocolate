'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, GitBranch } from 'lucide-react';
import { Back, Badge, Empty, LinkButton, PageHeader, Panel, RowLink, SubNav } from '@/components/ui';
import { activeBatches, nextInput, stationQueue } from '@/lib/derive';
import { kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { groupBySlug, stationGroups, stationName, stations } from '@/lib/stations';

export default function PartPage() {
  const { part } = useParams<{ part: string }>();
  const store = useStore();
  const group = groupBySlug(part);
  if (!group) return <Empty>Unknown part of the line.</Empty>;

  const index = stationGroups.indexOf(group);
  const partStations = stations.filter((s) => s.group === group.name);
  const ids = partStations.map((s) => s.id);
  const batches = activeBatches(store).filter((b) => b.nextStation && ids.includes(b.nextStation));
  const previous = stationGroups[index - 1];
  const next = stationGroups[index + 1];

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow={`Part ${index + 1} of 4 · Production line`} title={group.name}
        subtitle={<><strong className="text-ink">{group.from}</strong> <ArrowRight size={12} className="inline" /> <strong className="text-ink">{group.to}</strong> · {group.note}</>} />

      {/* Part switcher for small screens; the sidebar covers this on desktop */}
      <div className="md:hidden">
        <SubNav items={stationGroups.map((g) => ({ id: g.slug, label: g.name, href: `/production/parts/${g.slug}` }))} current={group.slug} />
      </div>

      <Panel title="Batches in this part" subtitle={batches.length ? 'Ready to record at one of these stations.' : undefined}>
        {batches.length === 0 && <Empty>No batches are waiting in {group.name.toLowerCase()} right now.</Empty>}
        {batches.map((batch) => {
          const input = nextInput(batch);
          const onHold = batch.status === 'hold';
          return (
            <div key={batch.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-5">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2"><Link href={`/production/batches/${batch.id}`} className="font-bold text-green hover:underline">{batch.id}</Link><span>{batch.product}</span>{onHold && <Badge tone="danger">On hold</Badge>}</span>
                <span className="block text-[12px] text-muted">Next: {stationName(batch.nextStation)}{batch.nextStation !== 'completion' ? (input.weight > 0 ? ` · ${kg(input.weight)} ${input.material.toLowerCase()} ready` : ' · input to be confirmed') : ''}</span>
              </span>
              {onHold
                ? <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Review hold</LinkButton>
                : <LinkButton href={`/production/batches/${batch.id}/record/${batch.nextStation}`} aria-label={`Continue ${batch.id}`}>{batch.nextStation === 'completion' ? 'Complete' : `Record ${stationName(batch.nextStation).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>}
            </div>
          );
        })}
      </Panel>

      {group.slug === 'pressing' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-paper px-4 py-2.5 text-[12px] text-muted">
          <GitBranch size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>Branch from grinding: <strong className="text-ink">cocoa liquor</strong> splits into <strong className="text-ink">cocoa butter</strong> (continues to mixing or is stored) and <strong className="text-ink">cocoa cake</strong> (stored as its own lot). Liquor not pressed goes straight to mixing.</span>
        </div>
      )}

      <Panel title="Stations" subtitle="Process → input → output. Open a station to see its queue.">
        {partStations.map((station, i) => {
          const waiting = stationQueue(store, station.id).ready.length;
          return (
            <RowLink key={station.id} href={`/production/stations/${station.id}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper text-[11px] font-bold text-muted">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{station.name}</strong>{waiting > 0 && <Badge tone="green">{waiting} waiting</Badge>}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted"><span>{station.input}</span><ArrowRight size={12} className="shrink-0" /><span>{station.output}</span></span>
              </span>
              <span className="hidden text-[13px] font-semibold text-green sm:inline">Open station</span>
            </RowLink>
          );
        })}
      </Panel>

      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
        {previous ? <Link href={`/production/parts/${previous.slug}`} className="inline-flex items-center gap-1 font-semibold text-green"><ArrowLeft size={14} /> Part {index}: {previous.name}</Link> : <span />}
        {next && <Link href={`/production/parts/${next.slug}`} className="inline-flex items-center gap-1 font-semibold text-green">Part {index + 2}: {next.name} <ArrowRight size={14} /></Link>}
      </div>
    </>
  );
}
