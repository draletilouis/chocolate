'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaperSheet, PaperSignatures, PrintButton } from '@/components/PaperSheet';
import { Back, Button, LinkButton, Notice, PageHeader } from '@/components/ui';
import { roundKg } from '@/lib/balance';
import { userName } from '@/lib/derive';
import { num } from '@/lib/format';
import { dayOf, sheetRows, shiftDay, weekOf, weekSheet } from '@/lib/stock';
import { useStore } from '@/lib/store';

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const shortDate = (day: string) => { const [y, m, d] = day.split('-'); return `${Number(d)}/${Number(m)}/${y.slice(2)}`; };

export default function StockSheetPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><StockSheet /></Suspense>;
}

/** The factory's weekly stock sheet: one line per item, one column per day, filled from the daily counts */
function StockSheet() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const today = dayOf(new Date());
  const given = params.get('day') ?? '';
  const days = weekOf(/^\d{4}-\d{2}-\d{2}$/.test(given) ? given : today);
  const { counts, rows } = weekSheet(store, days);
  // The paper's rows always print; a machine row or another material prints when it was counted that week
  const shown = rows.filter((r) => (sheetRows as readonly string[]).includes(r.row) || r.cells.some(Boolean));
  const go = (d: number) => router.push(`/store/sheet?day=${shiftDay(days[0], d)}`);
  const counters = Array.from(new Set(counts.flatMap((c) => (c ? [userName(store, c.countedBy)] : []))));

  return (
    <>
      <div className="no-print">
        <Back href="/store" label="Store" />
        <PageHeader eyebrow="Store" title="Weekly stock sheet" subtitle="What was counted each day, laid out like the paper sheet. A small figure under a count is how far it was from the records."
          action={<div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => go(-7)} aria-label="Previous week"><ChevronLeft size={15} /> Earlier</Button>
            <Button variant="secondary" onClick={() => go(7)} disabled={days[6] >= today} aria-label="Next week">Later <ChevronRight size={15} /></Button>
            <PrintButton>Print sheet</PrintButton>
            <LinkButton href="/store/count">Count the stock</LinkButton>
          </div>} />
        {counts.every((c) => !c) && <Notice tone="neutral">No count was saved in this week. The sheet prints empty, ready to fill in by hand.</Notice>}
      </div>

      <PaperSheet wide title="Weekly stock sheet" subtitle={`Week of ${shortDate(days[0])} to ${shortDate(days[6])} · weights in kg`} docNumber={`ECL/SOP/PRO/ST/${days[0]}`}>
        <table className="paper-table">
          <thead>
            <tr><th>Item</th>{dayNames.map((d) => <th key={d} className="is-num">{d}</th>)}</tr>
            <tr><th>Date</th>{days.map((d) => <th key={d} className="is-num">{shortDate(d)}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.row}>
                <td><strong>{r.row}</strong></td>
                {r.cells.map((cell, i) => {
                  const diff = cell ? roundKg(cell.counted - cell.expected) : 0;
                  return <td key={days[i]} className="is-num">{cell ? num(cell.counted) : ''}{cell && diff !== 0 && <span className="is-off">{diff > 0 ? '+' : '−'}{num(Math.abs(diff))}</span>}</td>;
                })}
              </tr>
            ))}
            <tr><td>Counted by</td>{counts.map((c, i) => <td key={days[i]} className="is-num">{c ? userName(store, c.countedBy).split(' ')[0] : ''}</td>)}</tr>
          </tbody>
        </table>
        {counts.some((c) => c?.note) && <p className="paper-note">Notes: {counts.flatMap((c) => (c?.note ? [`${shortDate(c.day)}: ${c.note}`] : [])).join(' · ')}</p>}
        <PaperSignatures lines={[{ role: 'Counted by', name: counters.join(', ') || undefined }, { role: 'Production manager' }]} />
      </PaperSheet>
    </>
  );
}
