'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Empty, Input, PageHeader, Panel, RowLink } from '@/components/ui';
import { batchDisplayName, batchSuppliers, lotOrigin, searchRecords } from '@/lib/derive';
import { date, kg } from '@/lib/format';
import { piecesKg } from '@/lib/pieces';
import { useStore } from '@/lib/store';
import type { Batch, Lot } from '@/lib/types';

const groups = ['Finished pieces', 'Chocolate', 'Ingredients', 'Production batches'] as const;

export default function TracePage() {
  const store = useStore();
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<(typeof groups)[number]>('Finished pieces');
  const newest = (a: Lot, b: Lot) => b.receivedAt.localeCompare(a.receivedAt);
  const found = searchRecords(store, query);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = text.trim().toUpperCase();
    // A whole batch or lot number opens its trace at once.
    const exact = store.lots.find((l) => l.id.toUpperCase() === id) ?? store.batches.find((b) => b.id.toUpperCase() === id);
    if (exact) router.push(`/trace/${exact.id}`);
    else setQuery(text.trim());
  }

  const lots = query ? found.lots
    : group === 'Finished pieces' ? store.lots.filter((l) => l.pieces).sort(newest)
    : group === 'Chocolate' ? store.lots.filter((l) => l.chocolate).sort(newest)
    : group === 'Ingredients' ? store.lots.filter((l) => l.source.type === 'supplier').sort(newest)
    : [];
  const batches = query ? found.batches : group === 'Production batches' ? [...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];

  const lotRow = (l: Lot) => (
    <RowLink key={l.id} href={`/trace/${l.id}`}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><strong>{l.id}</strong><span>{l.material}</span><Badge>{l.pieces ? `${l.received} pieces · ${kg(piecesKg(l.received, l.pieces.grams))}` : kg(l.received)}</Badge></span>
        <span className="block text-[12px] text-muted">{lotOrigin(store, l)} · {date(l.receivedAt)}</span>
      </span>
    </RowLink>
  );
  const batchRow = (b: Batch) => (
    <RowLink key={b.id} href={`/trace/${b.id}`}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><strong>{batchDisplayName(b)}</strong>{b.name && <span className="text-[11px] text-muted">ID {b.id}</span>}<span className="text-muted">{b.product}</span>{b.status === 'completed' && <Badge>Completed</Badge>}{b.status === 'hold' && <Badge tone="danger">On hold</Badge>}</span>
        <span className="block text-[12px] text-muted">Started {date(b.startedAt)}{batchSuppliers(store, b).length ? ` · ${batchSuppliers(store, b).join(', ')}` : ''}</span>
      </span>
    </RowLink>
  );

  return (
    <>
      <PageHeader eyebrow="Traceability" title="Trace a batch" subtitle="Enter the number on a product, a chocolate lot, an ingredient or a production batch. Its page lists everything that went into it, back to the deliveries, and everything it went into." />
      <form className="search-form mb-5" onSubmit={submit} role="search">
        <Input value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setQuery(''); }} placeholder="e.g. FIN-0001, D70-0001, SUG-031, CH-017" aria-label="Batch or lot number" />
        <Button type="submit">Trace</Button>
      </form>

      {query ? (
        <Panel title={`Matches for “${query}”`} subtitle={`${found.batches.length + found.lots.length} found`}>
          {found.batches.length + found.lots.length === 0 && <Empty>No batch or lot matches. Check the number on the label.</Empty>}
          {lots.map(lotRow)}
          {batches.map(batchRow)}
        </Panel>
      ) : (
        <>
          <div className="sub-nav-tabs" role="group" aria-label="What to trace">
            {groups.map((g) => <button key={g} type="button" onClick={() => setGroup(g)} className={`sub-nav-btn ${g === group ? 'active' : ''}`} aria-pressed={g === group}>{g}</button>)}
          </div>
          <Panel>
            {lots.length + batches.length === 0 && <Empty>Nothing here yet.</Empty>}
            {lots.map(lotRow)}
            {batches.map(batchRow)}
          </Panel>
        </>
      )}
    </>
  );
}
