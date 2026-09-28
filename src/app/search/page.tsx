'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Empty, Input, PageHeader, Panel, RowLink } from '@/components/ui';
import { batchDisplayName, batchSuppliers, lotOrigin, searchRecords, waitingAt } from '@/lib/derive';
import { date } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

export default function SearchPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><SearchResults /></Suspense>;
}

function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const store = useStore();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  useEffect(() => { setText(q); }, [q]);
  const { batches, lots } = searchRecords(store, q);

  function submit(event: FormEvent) {
    event.preventDefault();
    router.replace(`/search?q=${encodeURIComponent(text.trim())}`);
  }

  return (
    <>
      <PageHeader eyebrow="Search" title={q ? `Results for “${q}”` : 'Find a batch or lot'} subtitle="Search by batch name, batch ID, product, lot ID, material or supplier." />
      <form className="search-form mb-5" onSubmit={submit} role="search">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Kuapa, CB-025, LIQ-024" aria-label="Search text" autoFocus={!q} />
        <Button type="submit">Search</Button>
      </form>
      {q && (
        <>
          <Panel title="Batches" subtitle={`${batches.length} found`}>
            {batches.length === 0 && <Empty>No batch matches.</Empty>}
            {batches.map((b) => {
              const waiting = waitingAt(b);
              return (
                <RowLink key={b.id} href={`/production/batches/${b.id}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><strong>{batchDisplayName(b)}</strong>{b.name && <span className="text-[11px] text-muted">ID {b.id}</span>}<span className="text-muted">{b.product}</span>{b.status === 'hold' && <Badge tone="danger">On hold</Badge>}{b.status === 'completed' && <Badge>Completed</Badge>}</span>
                    <span className="block text-[12px] text-muted">Started {date(b.startedAt)}{batchSuppliers(store, b).length ? ` · ${batchSuppliers(store, b).join(', ')}` : ''}{waiting.length ? ` · waiting at ${waiting.map((s) => stationName(s).toLowerCase()).join(', ')}` : ''}</span>
                  </span>
                </RowLink>
              );
            })}
          </Panel>
          <Panel title="Lots" subtitle={`${lots.length} found`}>
            {lots.length === 0 && <Empty>No lot matches.</Empty>}
            {lots.map((l) => (
              <RowLink key={l.id} href={`/materials/${l.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><strong>{l.id}</strong><span>{l.material}</span><Badge tone={l.available > 0 ? 'green' : 'neutral'}>{l.available > 0 ? `${l.available} ${l.unit} available` : 'Used up'}</Badge></span>
                  <span className="block text-[12px] text-muted">{l.category} · {lotOrigin(store, l)}</span>
                </span>
              </RowLink>
            ))}
          </Panel>
        </>
      )}
    </>
  );
}
