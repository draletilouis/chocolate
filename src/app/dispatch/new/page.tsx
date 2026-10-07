'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { amountOf } from '@/lib/derive';
import { dispatchGroups, stockForDispatch, takeOldestFirst, type StockItem } from '@/lib/dispatch';
import { date } from '@/lib/format';
import { useStore } from '@/lib/store';

export default function NewDispatchPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><NewDispatch /></Suspense>;
}

/** One product going out: how much, and from which lot ('' takes the oldest lots first) */
interface Row { material: string; quantity: string; lotId: string }

const emptyRow: Row = { material: '', quantity: '', lotId: '' };

function NewDispatch() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const stock = stockForDispatch(store);
  // Opened from a lot: that lot is the first line.
  const fromLot = stock.flatMap((i) => i.lots).find((l) => l.id === params.get('lot'));
  const [customerId, setCustomerId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [fromLot ? { material: fromLot.material, quantity: '', lotId: fromLot.id } : emptyRow]);
  const [error, setError] = useState('');
  // A double tap on Save must not send the goods out twice.
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);

  // Lots are taken row by row, so two lines of the same product do not take the same pieces twice.
  const taken = new Map<string, number>();
  const plans = rows.map((row) => {
    const item = stock.find((i) => i.material === row.material);
    const quantity = Number(row.quantity);
    if (!item || !(quantity > 0)) return { item, quantity: 0, lines: [] as { lotId: string; quantity: number }[], short: 0, whole: true };
    const lots = (row.lotId ? item.lots.filter((l) => l.id === row.lotId) : item.lots).map((l) => ({ ...l, available: Math.round((l.available - (taken.get(l.id) ?? 0)) * 1000) / 1000 }));
    const { lines, short } = takeOldestFirst(lots, quantity);
    for (const l of lines) taken.set(l.lotId, (taken.get(l.lotId) ?? 0) + l.quantity);
    return { item, quantity, lines, short, whole: item.unit === 'kg' || Number.isInteger(quantity) };
  });
  const pieces = plans.filter((p) => p.item?.unit === 'units').reduce((n, p) => n + p.quantity, 0);
  const kgOut = plans.filter((p) => p.item?.unit === 'kg').reduce((n, p) => n + p.quantity, 0);

  const change = (index: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!customerId) return setError('Choose the customer.');
    if (!plans.some((p) => p.quantity > 0)) return setError('Enter what is going out.');
    const bad = plans.find((p) => p.item && (p.short > 0 || !p.whole));
    if (bad) return setError(!bad.whole ? `${bad.item!.material} goes out in whole pieces.` : `There is not enough ${bad.item!.material} in store for that line.`);
    // One line per lot: the same lot picked for two lines is sent as one.
    const byLot = new Map<string, number>();
    for (const l of plans.flatMap((p) => p.lines)) byLot.set(l.lotId, Math.round(((byLot.get(l.lotId) ?? 0) + l.quantity) * 1000) / 1000);
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    const id = await store.dispatchGoods({ customerId, reference: reference.trim() || undefined, note: note.trim() || undefined, lines: Array.from(byLot, ([lotId, quantity]) => ({ lotId, quantity })) });
    saving.current = false;
    setBusy(false);
    if (id) router.push(`/dispatch/${id}?saved=1`);
  }

  return (
    <form onSubmit={save} noValidate>
      <Back href="/dispatch" label="Dispatch" />
      <PageHeader eyebrow="Dispatch" title="Dispatch goods" subtitle="Record what leaves the factory and who it goes to. Each product is taken from the oldest lots first unless you choose the lot on the boxes." />

      <Panel title="Customer">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Customer" hint={store.customers.length ? undefined : <>No customers yet. <Link href="/setup/customers" className="font-semibold text-green">Add them in Setup</Link>.</>}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
              <option value="">Choose…</option>
              {store.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Order or invoice number"><Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder="Optional" aria-label="Order or invoice number" /></Field>
        </div>
      </Panel>

      <Panel title="Goods" subtitle={stock.length ? 'Pieces count whole pieces; everything else is weighed in kg.' : undefined}>
        {stock.length === 0 && <div className="p-5"><Notice tone="warn">Nothing the factory made is in store.</Notice></div>}
        {rows.map((row, index) => {
          const plan = plans[index];
          const item = plan.item;
          return (
            <div key={index} className="grid gap-3 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[2fr_1fr_1.4fr_auto] md:items-end">
              <Field label="Product">
                <Select value={row.material} onChange={(e) => change(index, { material: e.target.value, lotId: '' })} aria-label={`Product ${index + 1}`}>
                  <option value="">Choose…</option>
                  {dispatchGroups.map((group) => {
                    const items = stock.filter((i) => i.group === group);
                    return items.length > 0 && <optgroup key={group} label={group}>{items.map((i) => <option key={i.material} value={i.material}>{i.material} · {amountOf(i.total, i.unit)} in store</option>)}</optgroup>;
                  })}
                </Select>
              </Field>
              <Field label="Quantity">
                <UnitInput unit={item?.unit === 'units' ? 'pieces' : 'kg'} value={row.quantity} onChange={(e) => change(index, { quantity: e.target.value })} aria-label={`Quantity ${index + 1}`} step={item?.unit === 'units' ? 1 : 0.01} min={0} />
              </Field>
              <Field label="From">
                <Select value={row.lotId} onChange={(e) => change(index, { lotId: e.target.value })} aria-label={`From ${index + 1}`} disabled={!item}>
                  <option value="">Oldest lots first</option>
                  {item?.lots.map((l) => <option key={l.id} value={l.id}>{l.id} · {amountOf(l.available, l.unit)} · {date(l.receivedAt)}</option>)}
                </Select>
              </Field>
              <Button variant="ghost" className="px-2" onClick={() => setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyRow])} title="Remove this line"><X size={15} /><span className="sr-only">Remove line {index + 1}</span></Button>
              {item && plan.quantity > 0 && <LinePlan item={item} lines={plan.lines} short={plan.short} whole={plan.whole} />}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Button variant="secondary" onClick={() => setRows([...rows, emptyRow])}><Plus size={15} /> Add a product</Button>
          <span className="text-[13px] text-muted">{pieces > 0 && `${pieces} pieces`}{pieces > 0 && kgOut > 0 && ' · '}{kgOut > 0 && `${kgOut.toFixed(2)} kg`}</span>
        </div>
      </Panel>

      <Panel title="Note">
        <div className="p-5"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Optional: vehicle, driver, delivery instructions" aria-label="Dispatch note" /></div>
      </Panel>

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <LinkButton variant="secondary" href="/dispatch">Cancel</LinkButton>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : <><Check size={15} /> Save dispatch</>}</Button>
      </div>
    </form>
  );
}

/** Which lots a line takes its goods from, or why it cannot go out */
function LinePlan({ item, lines, short, whole }: { item: StockItem; lines: { lotId: string; quantity: number }[]; short: number; whole: boolean }) {
  if (!whole) return <div className="md:col-span-4"><Notice tone="warn">{item.material} goes out in whole pieces.</Notice></div>;
  if (short > 0) return <div className="md:col-span-4"><Notice tone="warn">{amountOf(short, item.unit)} more than {lines.length > 1 ? 'these lots have' : 'is in store'} for this line.</Notice></div>;
  return <div className="text-[12px] text-muted md:col-span-4">Taken from {lines.map((l) => `${l.lotId} (${amountOf(l.quantity, item.unit)})`).join(', ')}</div>;
}
