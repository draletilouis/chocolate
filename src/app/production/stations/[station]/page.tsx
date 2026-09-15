'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { Back, Badge, Empty, LinkButton, PageHeader, Panel, RowLink } from '@/components/ui';
import { nextInput, recordBalance, recordFor, stationQueue } from '@/lib/derive';
import { dateTime, kg, kindLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { groupOf, isStationId, stationById } from '@/lib/stations';

export default function StationPage() {
  const { station: stationParam } = useParams<{ station: string }>();
  const store = useStore();
  if (!isStationId(stationParam)) return <Empty>Unknown station.</Empty>;
  const station = stationById[stationParam];
  const queue = stationQueue(store, station.id);
  const rows = store.outputCategories.filter((c) => c.station === station.id);

  return (
    <>
      <Back href={`/production/parts/${groupOf(station.id).slug}`} label={station.group} />
      <PageHeader eyebrow={station.group} title={station.name} subtitle={<>{station.input} <ArrowRight size={12} className="inline" /> {station.output}</>}
        action={station.id === 'receiving' ? <LinkButton href="/production/new"><Plus size={16} /> Start a batch from a delivery</LinkButton> : undefined} />

      <Panel title={station.form === 'completion' ? 'Ready to complete' : `Ready to record ${station.name.toLowerCase()}`} subtitle={station.help}>
        {queue.ready.length === 0 && <Empty>No batches are waiting at {station.name.toLowerCase()}.</Empty>}
        {queue.ready.map((batch) => {
          const input = nextInput(batch);
          return (
            <RowLink key={batch.id} href={`/production/batches/${batch.id}/record/${station.id}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong>{batch.id}</strong><span className="text-muted">{batch.product}</span></span>
                <span className="text-[12px] text-muted">{station.form === 'completion' ? `${batch.records.length} stations recorded` : `Input ready: ${kg(input.weight)} ${input.material.toLowerCase()}`}</span>
              </span>
              <span className="text-[13px] font-semibold text-green">{station.form === 'completion' ? 'Review & complete' : 'Record'}</span>
            </RowLink>
          );
        })}
      </Panel>

      {queue.held.length > 0 && (
        <Panel title="On hold at this station">
          {queue.held.map((batch) => (
            <RowLink key={batch.id} href={`/production/batches/${batch.id}`}>
              <span className="flex-1"><strong>{batch.id}</strong> <span className="text-muted">{batch.product}</span><span className="block text-[12px] text-danger">{batch.holds.find((h) => !h.releasedAt)?.reason}</span></span>
              <Badge tone="danger">On hold</Badge>
            </RowLink>
          ))}
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel title="What you weigh here">
          <div className="flex flex-wrap gap-2 px-5 py-3">
            {rows.map((row) => <Badge key={row.name} tone={row.kind === 'useful' ? 'green' : row.kind === 'waste' ? 'warn' : 'neutral'}>{row.name} · {kindLabel[row.kind]}</Badge>)}
          </div>
        </Panel>
      )}

      {queue.done.length > 0 && station.form !== 'completion' && (
        <Panel title="Recorded at this station">
          {queue.done.slice(0, 8).map((batch) => {
            const record = recordFor(batch, station.id)!;
            const balance = recordBalance(record);
            return (
              <RowLink key={batch.id} href={`/production/batches/${batch.id}`}>
                <span className="flex-1"><strong>{batch.id}</strong> <span className="text-muted">{batch.product}</span><span className="block text-[12px] text-muted">{dateTime(record.recordedAt)} · input {kg(record.inputWeight)} · useful output {kg(balance.useful)} · variance {kg(balance.variance)}</span></span>
              </RowLink>
            );
          })}
        </Panel>
      )}
      <p className="text-[12px] text-muted">Looking for another station? <Link href="/production" className="font-semibold text-green">Back to the production line</Link>.</p>
    </>
  );
}
