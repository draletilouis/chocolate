'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeader, Panel, RowLink } from '@/components/ui';
import { lotOrigin } from '@/lib/derive';
import { date } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { LotCategory } from '@/lib/types';

const categories: ('All' | LotCategory)[] = ['All', 'Raw material', 'Intermediate', 'By-product', 'Rework', 'Finished goods'];

export default function MaterialsPage() {
  const store = useStore();
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const lots = store.lots.filter((l) => category === 'All' || l.category === category).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <>
      <PageHeader eyebrow="Materials" title="Material lots" subtitle="Every lot in the factory, where it came from and what used it." action={<LinkButton href="/materials/receive"><Plus size={16} /> Receive material</LinkButton>} />
      <div className="sub-nav-tabs" role="group" aria-label="Material groups">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={`sub-nav-btn ${c === category ? 'active' : ''}`} aria-pressed={c === category}>{c}</button>
        ))}
      </div>
      <Panel>
        {lots.length === 0 && <Empty>No lots in this group.</Empty>}
        {lots.map((lot) => (
          <RowLink key={lot.id} href={`/materials/${lot.id}`}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><strong>{lot.id}</strong><span>{lot.material}</span><Badge tone={lot.available <= 0 ? 'neutral' : lot.category === 'Raw material' && lot.available < store.thresholds.lowStockKg ? 'warn' : 'green'}>{lot.available <= 0 ? 'Used up' : `${lot.available} ${lot.unit} available`}</Badge></span>
              <span className="block text-[12px] text-muted">{lot.category} · {lotOrigin(store, lot)} · {date(lot.receivedAt)}</span>
            </span>
          </RowLink>
        ))}
      </Panel>
    </>
  );
}
