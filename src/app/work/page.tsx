'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Pause, ScanLine, Target, Truck } from 'lucide-react';
import { Badge, Button, Empty, Input, LinkButton, PageHeader, Panel } from '@/components/ui';
import { batchDisplayName, chocolateWaiting, nextInput, stationQueue } from '@/lib/derive';
import { kg } from '@/lib/format';
import { planProgress } from '@/lib/plan';
import { useStore } from '@/lib/store';
import { lineStations, stationById, stationName } from '@/lib/stations';

/** Each person's home: the batches waiting at their own stations, one tap from recording */
export default function WorkPage() {
  const store = useStore();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const user = store.users.find((u) => u.id === store.currentUserId);
  const mine = user?.stations ?? [];
  const everything = mine.length === 0;
  const queues = lineStations
    .filter((s) => (everything ? true : mine.includes(s.id)))
    .map((station) => ({ station, ...stationQueue(store, station.id) }));
  // Pieces are made from chocolate lots, not batches
  const chocolate = lineStations.some((s) => s.form === 'pieces' && (everything || mine.includes(s.id))) ? chocolateWaiting(store) : [];
  const busy = queues.filter((q) => q.ready.length > 0 || q.held.length > 0);
  const quiet = queues.filter((q) => q.ready.length === 0 && q.held.length === 0 && (q.station.form !== 'pieces' || chocolate.length === 0));
  const total = busy.reduce((n, q) => n + q.ready.length, 0) + chocolate.length;
  const receives = everything || mine.includes('receiving');
  // Mixing and pieces work to the plan, so it is one tap away for them
  const plan = mine.some((s) => s === 'mixing' || s === 'packaging') || everything ? planProgress(store) : null;

  function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <>
      <PageHeader
        eyebrow={everything ? 'Everything waiting' : `My work · ${user?.name ?? ''}`}
        title={total ? `${total} ${total === 1 ? 'thing is' : 'things are'} waiting` : 'Nothing is waiting right now'}
        subtitle={everything ? 'All stations. Give people their stations in Setup → Users and each person sees only their own.' : `Your stations: ${mine.map((s) => stationName(s)).join(', ')}`}
        action={receives ? <LinkButton href="/production/new"><Truck size={16} /> Receive a delivery</LinkButton> : undefined} />

      <form className="search-form mb-2" onSubmit={search} role="search">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a batch or lot: name, ID or supplier" aria-label="Find a batch or lot" />
        <Button type="submit" variant="secondary">Find</Button>
      </form>
      <p className="mb-5 flex items-center gap-1.5 text-[12px] text-muted"><ScanLine size={14} /> Or scan the QR code on a batch card or label with your phone camera.</p>

      {plan && (
        <Link href="/plan" className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-[14px]" aria-label={`Production plan, ${plan.left} pieces left`}>
          <Target size={18} className="shrink-0 text-green" />
          <span className="min-w-0 flex-1"><strong>Production plan</strong> <span className="text-muted">· {plan.made} of {plan.planned} pieces made · {plan.left} left</span></span>
          <ArrowRight size={16} className="shrink-0 text-muted" />
        </Link>
      )}

      {busy.map(({ station, ready, held }) => (
        <Panel key={station.id} title={station.name} subtitle={`${ready.length} waiting${held.length ? ` · ${held.length} on hold` : ''} · ${station.group}`}>
          {ready.map((batch) => {
            const input = nextInput(batch, station.id);
            return (
              <div key={batch.id} className="work-card">
                <div className="min-w-0">
                  <div className="work-card-name">{batchDisplayName(batch)}</div>
                  <div className="text-[13px] text-muted">{batch.name ? `ID ${batch.id} · ` : ''}{batch.product}</div>
                  <div className="mt-1 text-[14px]">
                    {station.form === 'completion' ? `${batch.records.length} stations recorded · ready to close`
                      : input.weight > 0 ? <><strong className="tabular-nums">{kg(input.weight)}</strong> {input.material.toLowerCase()} ready</> : station.form === 'mixing' ? 'Mix from liquor and cocoa butter in store' : 'Weigh the input to start'}
                  </div>
                </div>
                <LinkButton href={`/production/batches/${batch.id}/record/${station.id}`} aria-label={`Record ${station.name} for ${batchDisplayName(batch)}`}>
                  {station.form === 'completion' ? 'Review & complete' : `Record ${station.name.toLowerCase()}`} <ArrowRight size={16} />
                </LinkButton>
              </div>
            );
          })}
          {held.map((batch) => (
            <div key={batch.id} className="work-card">
              <div className="min-w-0">
                <div className="work-card-name">{batchDisplayName(batch)} <Badge tone="danger">On hold</Badge></div>
                <div className="text-[13px] text-danger"><Pause size={12} className="inline" /> {batch.holds.find((h) => !h.releasedAt)?.reason}</div>
              </div>
              <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Open batch</LinkButton>
            </div>
          ))}
        </Panel>
      ))}

      {chocolate.length > 0 && (
        <Panel title={stationById.packaging.name} subtitle={`${chocolate.length} lot${chocolate.length === 1 ? '' : 's'} of chocolate to make into pieces · ${stationById.packaging.group}`}>
          {chocolate.map((lot) => (
            <div key={lot.id} className="work-card">
              <div className="min-w-0">
                <div className="work-card-name">{lot.chocolate!.type}</div>
                <div className="text-[13px] text-muted">{lot.id}{lot.source.type === 'batch' ? ` · mixed by ${lot.source.batchId}` : ''}</div>
                <div className="mt-1 text-[14px]"><strong className="tabular-nums">{kg(lot.available)}</strong> ready for pieces</div>
              </div>
              <LinkButton href={`/production/pieces/${lot.id}`} aria-label={`Record pieces for ${lot.id}`}>Record pieces <ArrowRight size={16} /></LinkButton>
            </div>
          ))}
        </Panel>
      )}

      {busy.length === 0 && chocolate.length === 0 && <Panel><Empty>Nothing is waiting at {everything ? 'any station' : 'your stations'}. {receives ? 'Start with a new delivery when beans arrive.' : 'New work appears here as soon as the station before you saves.'}</Empty></Panel>}
      {!everything && quiet.length > 0 && busy.length > 0 && <p className="text-[12px] text-muted">Nothing waiting at: {quiet.map((q) => q.station.name.toLowerCase()).join(', ')}.</p>}
    </>
  );
}
