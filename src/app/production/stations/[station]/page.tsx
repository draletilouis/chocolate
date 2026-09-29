'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { Back, Badge, Empty, LinkButton, Notice, PageHeader, Panel, RowLink } from '@/components/ui';
import { batchDisplayName, chocolateWaiting, nextInput, recordBalance, recordFor, stationQueue } from '@/lib/derive';
import { piecesLots } from '@/lib/pieces';
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
  if (station.form === 'pieces') return <PiecesQueue />;

  return (
    <>
      <Back href={`/production/parts/${groupOf(station.id).slug}`} label={station.group} />
      <PageHeader eyebrow={station.group} title={station.name} subtitle={<>{station.input} <ArrowRight size={12} className="inline" /> {station.output}</>}
        action={station.id === 'receiving' ? <LinkButton href="/production/new"><Plus size={16} /> Receive a delivery</LinkButton> : station.form === 'mixing' ? <LinkButton variant="secondary" href="/production/new?chocolate=1"><Plus size={16} /> Mix from store</LinkButton> : undefined} />

      {station.retired && <Notice tone="neutral">{station.name} is no longer part of the line: chocolate is made in mixing runs. Older batches still show it.</Notice>}
      {station.form === 'mixing' && <Notice tone="neutral">The mixer holds {store.mixer.holds ? <strong>{kg(store.mixer.holds.kg)} of {store.mixer.holds.type}</strong> : <strong>nothing</strong>}{store.mixer.holds ? ` (left by ${store.mixer.holds.batchId})` : ''}. The next run is made on top of it.</Notice>}
      <Panel title={station.form === 'completion' ? 'Ready to complete' : `Ready to record ${station.name.toLowerCase()}`} subtitle={station.help}>
        {queue.ready.length === 0 && <Empty>No batches are waiting at {station.name.toLowerCase()}.</Empty>}
        {queue.ready.map((batch) => {
          const input = nextInput(batch, station.id);
          return (
            <RowLink key={batch.id} href={`/production/batches/${batch.id}/record/${station.id}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong>{batchDisplayName(batch)}</strong>{batch.name && <span className="text-[11px] text-muted">ID {batch.id}</span>}<span className="text-muted">{batch.product}</span></span>
                <span className="text-[12px] text-muted">{station.form === 'completion' ? `${batch.records.length} stations recorded` : input.weight > 0 ? `Input ready: ${kg(input.weight)} ${input.material.toLowerCase()}` : station.form === 'mixing' ? 'Mix from liquor and cocoa butter in store' : 'Weigh the input to start'}</span>
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
              <span className="flex-1"><strong>{batchDisplayName(batch)}</strong>{batch.name && <span className="ml-2 text-[11px] text-muted">ID {batch.id}</span>} <span className="text-muted">{batch.product}</span><span className="block text-[12px] text-danger">{batch.holds.find((h) => !h.releasedAt)?.reason}</span></span>
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
                <span className="flex-1"><strong>{batchDisplayName(batch)}</strong>{batch.name && <span className="ml-2 text-[11px] text-muted">ID {batch.id}</span>} <span className="text-muted">{batch.product}</span><span className="block text-[12px] text-muted">{dateTime(record.recordedAt)} · in {kg(record.inputWeight)} · good output {kg(balance.useful)} · missing {kg(balance.variance)}</span></span>
              </RowLink>
            );
          })}
        </Panel>
      )}
      <p className="text-[12px] text-muted">Looking for another station? <Link href="/production" className="font-semibold text-green">Back to the production line</Link>.</p>
    </>
  );
}

/** Pieces are made from chocolate lots, whenever they are moulded: the queue is the chocolate not yet made into pieces */
function PiecesQueue() {
  const store = useStore();
  const station = stationById.packaging;
  const waiting = chocolateWaiting(store);
  const recent = piecesLots(store).slice(0, 8);
  return (
    <>
      <Back href={`/production/parts/${groupOf(station.id).slug}`} label={station.group} />
      <PageHeader eyebrow={station.group} title={station.name} subtitle={<>{station.input} <ArrowRight size={12} className="inline" /> {station.output}</>} />
      <Panel title="Chocolate to make into pieces" subtitle={station.help}>
        {waiting.length === 0 && <Empty>No chocolate is waiting. Chocolate appears here as soon as a mixing run saves it.</Empty>}
        {waiting.map((lot) => (
          <RowLink key={lot.id} href={`/production/pieces/${lot.id}`}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><strong>{lot.chocolate!.type}</strong><span className="text-[12px] text-muted">{lot.id}</span></span>
              <span className="text-[12px] text-muted"><strong className="text-ink tabular-nums">{kg(lot.available)}</strong> left of {kg(lot.received)} · mixed by {lot.source.type === 'batch' ? lot.source.batchId : ''} · {dateTime(lot.receivedAt)}</span>
            </span>
            <span className="text-[13px] font-semibold text-green">Record pieces</span>
          </RowLink>
        ))}
      </Panel>
      {recent.length > 0 && (
        <Panel title="Pieces made recently">
          {recent.map((lot) => (
            <RowLink key={lot.id} href={`/materials/${lot.id}`}>
              <span className="flex-1 text-[13px]"><strong className="tabular-nums">{lot.received}</strong> × {lot.pieces!.size} <span className="text-muted">of {lot.pieces!.type} · {lot.id} · {dateTime(lot.receivedAt)}</span></span>
            </RowLink>
          ))}
        </Panel>
      )}
      <p className="text-[12px] text-muted">The total by type and size is in <Link href="/reports/pieces" className="font-semibold text-green">Reports → Pieces made</Link>.</p>
    </>
  );
}
