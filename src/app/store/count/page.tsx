'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Back, Button, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, UnitInput } from '@/components/ui';
import { roundKg } from '@/lib/balance';
import { userName } from '@/lib/derive';
import { dateTime } from '@/lib/format';
import { amountText, dayOf, differenceText, differences, expectedStock, sheetRows, type StockRow } from '@/lib/stock';
import { useStore } from '@/lib/store';

/**
 * The daily stock count: for every row of the stock sheet, and every finished product, what the records
 * say should be there and what was counted. Rows left empty were not counted that day.
 */
export default function StockCountPage() {
  const store = useStore();
  const today = dayOf(new Date());
  const [day, setDay] = useState(today);
  const saved = store.stockCounts.find((c) => c.day === day);
  return (
    <>
      <Back href="/store" label="Store" />
      <PageHeader eyebrow="Store" title="Count the stock" subtitle="Weigh the materials, count the finished pieces, and enter each next to what the records expect. Leave a row empty if it was not counted."
        action={<LinkButton variant="secondary" href={`/store/sheet?day=${day}`}>Weekly stock sheet</LinkButton>} />
      <Panel>
        <div className="grid gap-4 p-5 md:grid-cols-[220px_1fr] md:items-end">
          <Field label="Day counted"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value || today)} aria-label="Day counted" /></Field>
          <p className="text-[13px] text-muted">{saved ? `Counted ${dateTime(saved.countedAt)} by ${userName(store, saved.countedBy)}. Saving again replaces that count.` : 'No count is saved for this day yet.'}{day !== today && ' The expected figures are what the records show now, not on that day.'}</p>
        </div>
      </Panel>
      {/* A new form for each day, starting from that day's saved count */}
      <CountForm key={day} day={day} />
    </>
  );
}

function CountForm({ day }: { day: string }) {
  const store = useStore();
  const saved = store.stockCounts.find((c) => c.day === day);
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries((saved?.lines ?? []).map((l) => [l.row, String(l.counted)])));
  const [note, setNote] = useState(saved?.note ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const all = expectedStock(store);
  // Rows of the paper sheet always show; a machine row or another material shows while it has stock or a count
  const weighed = all.filter((r) => r.unit === 'kg' && ((sheetRows as readonly string[]).includes(r.row) || r.expected > 0 || typed[r.row] !== undefined));
  // A finished product shows while it is in store or was counted; the others are one tap away
  const [showGone, setShowGone] = useState(false);
  const products = all.filter((r) => r.unit === 'units');
  const finished = products.filter((r) => showGone || r.expected > 0 || typed[r.row] !== undefined);
  const gone = products.length - products.filter((r) => r.expected > 0 || typed[r.row] !== undefined).length;
  const rows = [...weighed, ...finished];
  const entered = rows.filter((r) => (typed[r.row] ?? '').trim() !== '');
  const off = saved ? differences(saved) : [];

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (entered.length === 0) return setError('Enter at least one counted row.');
    const fraction = entered.find((r) => r.unit === 'units' && !Number.isInteger(Number(typed[r.row])));
    if (fraction) return setError(`${fraction.row} is counted in whole pieces.`);
    if (saving) return;
    setSaving(true);
    const ok = await store.saveStockCount(day, entered.map((r) => ({ row: r.row, counted: Number(typed[r.row]) || 0 })), note.trim() || undefined);
    setSaving(false);
    if (ok) { setJustSaved(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  const line = (r: StockRow) => {
    const value = typed[r.row] ?? '';
    const counted = value.trim() === '' ? undefined : Number(value) || 0;
    const diff = counted === undefined ? undefined : roundKg(counted - r.expected);
    const pieces = r.unit === 'units';
    return (
      <div key={r.row} className="border-b border-line px-5 py-3 last:border-b-0">
        <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_190px_150px]">
          <div className="min-w-0">
            <strong className="text-[14px]">{r.row}</strong>
            <button type="button" className="verdict-toggle block text-muted" aria-expanded={open === r.row} onClick={() => setOpen(open === r.row ? null : r.row)} disabled={r.parts.length === 0}>
              Records: <span className="tabular-nums text-ink">{amountText(r.expected, r.unit)}</span>{r.parts.length > 0 && <ChevronDown size={13} className={`ml-1 inline ${open === r.row ? 'rotate-180' : ''}`} />}
            </button>
          </div>
          <UnitInput unit={pieces ? 'pieces' : 'kg'} step={pieces ? '1' : '0.001'} placeholder={pieces ? '0' : '0.00'} value={value} onChange={(e) => setTyped({ ...typed, [r.row]: e.target.value })} aria-label={`${r.row} counted`} />
          <span className={`text-[13px] tabular-nums ${diff ? 'font-semibold text-warn' : 'text-muted'}`}>{diff === undefined ? 'not counted' : diff === 0 ? 'matches' : differenceText(diff, r.unit)}</span>
        </div>
        {open === r.row && <ul className="mt-2 grid gap-1 text-[13px] text-muted">{r.parts.map((p) => <li key={p.label} className="flex justify-between gap-3"><Link href={p.href} className="font-semibold text-green">{p.label}</Link><span className="tabular-nums">{amountText(p.kg, r.unit)}</span></li>)}</ul>}
      </div>
    );
  };

  return (
    <form onSubmit={save} noValidate>
      {justSaved && <Notice tone="green">The count is saved and on the weekly stock sheet.</Notice>}
      {saved && off.length > 0 && (
        <Panel title="Where the count differs from the records" subtitle="Open a lot to set it to what was counted, or check the batch whose material is waiting. A manager makes the adjustment.">
          {off.map((l) => {
            const parts = all.find((r) => r.row === l.row)?.parts ?? [];
            return (
              <div key={l.row} className="border-b border-line px-5 py-3 text-[13px] last:border-b-0">
                <div className="flex flex-wrap justify-between gap-2"><strong className="text-[14px]">{l.row}</strong><span className="tabular-nums">counted {amountText(l.counted, l.unit)} · records {amountText(l.expected, l.unit)} · <strong className="text-warn">{differenceText(l.difference, l.unit)}</strong></span></div>
                {parts.length > 0 && <div className="mt-1 text-muted">{parts.map((p, i) => <span key={p.label}>{i > 0 && ' · '}<Link href={p.href} className="font-semibold text-green">{p.label}</Link> {amountText(p.kg, l.unit)}</span>)}</div>}
              </div>
            );
          })}
        </Panel>
      )}

      <Panel title="Materials and chocolate, in kg" subtitle="In the order of the stock sheet. Tap a row's expected weight to see where the records say it is.">
        {weighed.length === 0 && <Empty>Nothing to weigh.</Empty>}
        {weighed.map(line)}
      </Panel>

      <Panel title="Finished products, in pieces" subtitle="Count the bars and packs on the shelf, one row per chocolate type and size. Tap the expected number to see the batch numbers it is made up of."
        action={gone > 0 ? <button type="button" className="btn btn-secondary" onClick={() => setShowGone(!showGone)} aria-pressed={showGone}>{showGone ? 'Hide products not in store' : `Also show ${gone} not in store`}</button> : undefined}>
        {finished.length === 0 && <Empty>{products.length ? 'The records show no finished pieces in store.' : 'No pieces have been made yet.'}</Empty>}
        {finished.map(line)}
      </Panel>

      <Panel title="Note (optional)"><div className="p-5"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Anything to remember about this count?" aria-label="Note" /></div></Panel>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">{entered.length} of {rows.length} rows counted</span>
        <Button type="submit" disabled={saving}><Check size={16} /> {saving ? 'Saving…' : saved ? 'Save the count again' : 'Save the count'}</Button>
      </div>
    </form>
  );
}
