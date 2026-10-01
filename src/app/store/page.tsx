'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeader, Panel, RowLink, Stat } from '@/components/ui';
import { batchDisplayName, lotOrigin, supplierName, waitingAt } from '@/lib/derive';
import { date, kg } from '@/lib/format';
import { chocolateIngredients } from '@/lib/seed';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import { batchDelivery } from '@/lib/trace';
import type { Lot } from '@/lib/types';

const beans = 'Cocoa beans';

const sections = [
  { name: 'Ingredients', note: 'What the chocolate is made from. A lot goes down by itself when it is weighed into a mixing run or a batch is started from it.' },
  { name: 'Chocolate', note: 'Mixed, and waiting to be made into pieces.' },
  { name: 'Finished pieces', note: 'Counted pieces of each chocolate type and size.' },
  { name: 'Other stored products', note: 'Everything else the line kept: butter, powder, nibs and beans for sale, by-products and rework.' },
] as const;
type Section = (typeof sections)[number]['name'];

const amount = (n: number, unit: Lot['unit']) => (unit === 'kg' ? kg(n) : `${n} pieces`);

export default function StorePage() {
  const store = useStore();
  const [shown, setShown] = useState<'All' | Section>('All');
  const [showUsedUp, setShowUsedUp] = useState(false);

  // Ingredients: beans, what the recipes are made from, and anything else a supplier delivered.
  const known: string[] = [beans, ...chocolateIngredients];
  const bought = store.lots.filter((l) => l.source.type === 'supplier' && !l.pieces && !l.chocolate).map((l) => l.material);
  const ingredientNames = new Set([...known, ...bought]);
  const sectionOf = (lot: Lot): Section => (lot.pieces ? 'Finished pieces' : lot.chocolate ? 'Chocolate' : ingredientNames.has(lot.material) ? 'Ingredients' : 'Other stored products');

  const names = (section: Section) => {
    const found = Array.from(new Set(store.lots.filter((l) => sectionOf(l) === section).map((l) => l.material))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return section === 'Ingredients' ? [...known, ...found.filter((n) => !known.includes(n))] : found;
  };
  const items = sections.flatMap((s) => names(s.name).map((name) => {
    const lots = store.lots.filter((l) => l.material === name && sectionOf(l) === s.name).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    const unit = lots[0]?.unit ?? 'kg';
    return { section: s.name, name, unit, lots, inStore: lots.filter((l) => l.available > 0), total: Math.round(lots.reduce((sum, l) => sum + l.available, 0) * 1000) / 1000 };
  }));
  const low = (i: (typeof items)[number]) => i.section === 'Ingredients' && i.total < store.thresholds.lowStockKg;
  // Beans received on the production line start a batch at once; the batch is their batch number.
  const beanBatches = store.batches.filter((b) => b.route === 'beans' && batchDelivery(b)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const usedUp = items.reduce((n, i) => n + i.lots.length - i.inStore.length, 0);

  return (
    <>
      <PageHeader eyebrow="Store" title="Store" subtitle="Everything in store by batch number: the ingredients, the chocolate, the finished pieces and every other product the line kept. Each use is taken off its lot automatically."
        action={<LinkButton href="/materials/receive"><Plus size={16} /> Receive ingredient</LinkButton>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {items.filter((i) => i.section === 'Ingredients').map((i) => <Stat key={i.name} label={i.name} value={kg(i.total)} hint={i.inStore.length ? `${i.inStore.length} batch${i.inStore.length === 1 ? '' : 'es'} in store` : 'None in store'} tone={low(i) ? 'warn' : undefined} />)}
      </div>

      <div className="sub-nav-tabs" role="group" aria-label="Parts of the store">
        {(['All', ...sections.map((s) => s.name)] as const).map((s) => <button key={s} type="button" onClick={() => setShown(s)} className={`sub-nav-btn ${s === shown ? 'active' : ''}`} aria-pressed={s === shown}>{s}</button>)}
      </div>

      {sections.filter((s) => shown === 'All' || shown === s.name).map((s) => {
        // An ingredient always shows, so "none in store" is seen; other products show while they have stock.
        const visible = items.filter((i) => i.section === s.name && (s.name === 'Ingredients' || showUsedUp || i.inStore.length > 0));
        return (
          <section key={s.name} className="mb-6" aria-label={s.name}>
            <div className="mb-2"><h2 className="text-[16px] font-extrabold">{s.name}</h2><p className="text-[13px] text-muted">{s.note}</p></div>
            {visible.length === 0 && <Panel><Empty>Nothing in store.</Empty></Panel>}
            {visible.map((i) => {
              const lots = showUsedUp ? i.lots : i.inStore;
              return (
                <Panel key={i.name} title={i.name} subtitle={`${amount(i.total, i.unit)} in store`} action={low(i) ? <Badge tone="warn">Below {store.thresholds.lowStockKg} kg</Badge> : undefined}>
                  {lots.length === 0 && <Empty>{i.lots.length ? 'Every batch is used up.' : 'Nothing received yet.'}</Empty>}
                  {lots.map((lot) => (
                    <RowLink key={lot.id} href={`/trace/${lot.id}`}>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><strong>{lot.id}</strong><Badge tone={lot.available <= 0 ? 'neutral' : 'green'}>{lot.available <= 0 ? 'Used up' : `${amount(lot.available, lot.unit)} left`}</Badge></span>
                        <span className="block text-[12px] text-muted">{lotOrigin(store, lot)} · {date(lot.receivedAt)} · {amount(lot.received, lot.unit)} {lot.source.type === 'supplier' ? 'received' : 'made'}{lot.uses.length > 0 && ` · used by ${Array.from(new Set(lot.uses.map((u) => u.batchId))).join(', ')}`}</span>
                      </span>
                    </RowLink>
                  ))}
                  {i.name === beans && beanBatches.length > 0 && (
                    <>
                      <div className="border-t border-line bg-paper px-5 py-2 text-[11px] font-bold tracking-wide text-faint uppercase">Received straight onto the line</div>
                      {beanBatches.map((b) => {
                        const waiting = waitingAt(b);
                        return (
                          <RowLink key={b.id} href={`/trace/${b.id}`}>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2"><strong>{b.id}</strong>{b.name && <span>{b.name}</span>}<Badge tone={b.status === 'completed' ? 'neutral' : 'green'}>{b.status === 'completed' ? 'Completed' : waiting.length ? `At ${stationName(waiting[0]).toLowerCase()}` : 'In progress'}</Badge></span>
                              <span className="block text-[12px] text-muted">Delivered by {supplierName(store, b.supplierId!)} · {date(b.startedAt)} · {kg(b.startInput.weight)} received as batch {batchDisplayName(b)}</span>
                            </span>
                          </RowLink>
                        );
                      })}
                    </>
                  )}
                </Panel>
              );
            })}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
        <span>Select a batch number to see where it came from and every product it went into. <Link href="/materials" className="font-semibold text-green">Materials</Link> lists every lot, used up or not.</span>
        {usedUp > 0 && <button type="button" className="btn btn-ghost" onClick={() => setShowUsedUp((v) => !v)} aria-pressed={showUsedUp}>{showUsedUp ? 'Hide' : 'Show'} used-up batches ({usedUp})</button>}
      </div>
    </>
  );
}
