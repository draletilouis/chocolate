'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Printer, Undo2 } from 'lucide-react';
import { Back, Button, Empty, Field, Notice, PageHeader, Panel, Table, Textarea, td, tdNum } from '@/components/ui';
import { amountOf, customerName, userName } from '@/lib/derive';
import { date, dateTime } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Dispatch } from '@/lib/types';

export default function DispatchNotePage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><DispatchNote /></Suspense>;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** One dispatch note: the customer, each line with the lot it came from, a printable delivery note, and cancelling it */
function DispatchNote() {
  const { id: raw } = useParams<{ id: string }>();
  const saved = useSearchParams().get('saved') === '1';
  const store = useStore();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const id = decodeURIComponent(raw).toUpperCase();
  const dispatch = store.dispatches.find((d) => d.id === id);
  if (!dispatch) return <><Back href="/dispatch" label="Dispatch" /><Empty>No dispatch has the number {id}.</Empty></>;
  const customer = store.customers.find((c) => c.id === dispatch.customerId);
  const lotOf = (lotId: string) => store.lots.find((l) => l.id === lotId);

  function print(d: Dispatch) {
    const win = window.open('', '_blank', 'width=720,height=820');
    if (!win) return;
    const business = store.business;
    const rows = d.lines.map((l) => `<tr><td>${escapeHtml(l.material)}</td><td>${escapeHtml(l.lotId)}</td><td class="num">${escapeHtml(amountOf(l.quantity, l.unit))}</td></tr>`).join('');
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`Delivery note ${d.id}`)}</title>
<style>
  body { margin: 0; padding: 28px; font-family: Montserrat, Arial, sans-serif; color: #0f172a; font-size: 13px; }
  .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
  .brand { font-size: 18px; font-weight: 800; } .muted { color: #475569; }
  h1 { font-size: 22px; margin: 0; text-align: right; } .number { font-size: 16px; font-weight: 800; text-align: right; }
  .to { margin: 18px 0; } .to strong { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #0f172a; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #cbd5e1; } .num { text-align: right; white-space: nowrap; }
  .sign { display: flex; gap: 32px; margin-top: 48px; } .sign div { flex: 1; border-top: 1px solid #0f172a; padding-top: 6px; }
</style></head><body>
<div class="top">
  <div><div class="brand">${escapeHtml(business.name)}</div><div class="muted">${escapeHtml([business.address, business.phone, business.email].filter(Boolean).join(' · '))}</div></div>
  <div><h1>Delivery note</h1><div class="number">${escapeHtml(d.id)}</div><div class="muted" style="text-align:right">${escapeHtml(date(d.at))}</div></div>
</div>
<div class="to"><div class="muted">Deliver to</div><strong>${escapeHtml(customer?.name ?? d.customerId)}</strong>${customer?.address ? `<div>${escapeHtml(customer.address)}</div>` : ''}${customer?.contact ? `<div class="muted">${escapeHtml(customer.contact)}</div>` : ''}${d.reference ? `<div style="margin-top:6px">Order / invoice: <strong>${escapeHtml(d.reference)}</strong></div>` : ''}</div>
<table><thead><tr><th>Product</th><th>Lot</th><th class="num">Quantity</th></tr></thead><tbody>${rows}</tbody></table>
${d.note ? `<p>${escapeHtml(d.note)}</p>` : ''}
<div class="sign"><div>Dispatched by: ${escapeHtml(userName(store, d.recordedBy))}</div><div>Received by (name, signature, date)</div></div>
</body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 300);
  }

  async function cancel() {
    if (!reason.trim()) return;
    if (await store.cancelDispatch(dispatch!.id, reason.trim())) setCancelling(false);
  }

  return (
    <>
      <Back href="/dispatch" label="Dispatch" />
      <PageHeader eyebrow="Dispatch note" title={`${dispatch.id} · ${customer?.name ?? customerName(store, dispatch.customerId)}`}
        subtitle={`${dateTime(dispatch.at)} · recorded by ${userName(store, dispatch.recordedBy)}${dispatch.reference ? ` · order or invoice ${dispatch.reference}` : ''}`}
        action={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => print(dispatch)}><Printer size={14} /> Print delivery note</Button>
          {!dispatch.cancelled && <Button variant="danger" onClick={() => setCancelling((v) => !v)}><Undo2 size={14} /> Cancel dispatch</Button>}
        </div>} />

      {saved && !dispatch.cancelled && <Notice>Dispatch saved. The goods are taken off their lots in the store.</Notice>}
      {dispatch.cancelled && <Notice tone="danger">Cancelled {dateTime(dispatch.cancelled.at)} by {userName(store, dispatch.cancelled.by)}: {dispatch.cancelled.reason} The goods went back to their lots.</Notice>}

      {cancelling && !dispatch.cancelled && (
        <Panel title="Cancel this dispatch" subtitle="For a dispatch entered by mistake. The goods go back to their lots; the note stays on record as cancelled.">
          <div className="grid gap-3 p-5">
            <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} aria-label="Cancel reason" /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelling(false)}>Keep it</Button><Button variant="danger" disabled={!reason.trim()} onClick={cancel}>Cancel dispatch</Button></div>
          </div>
        </Panel>
      )}

      <Panel title="Goods" subtitle="Each line came off this lot in the store. Open a lot to trace it back to the deliveries.">
        <Table head={['Product', 'Lot', 'Quantity', 'Made', 'Batch']}>
          {dispatch.lines.map((l) => {
            const lot = lotOf(l.lotId);
            const batchId = lot?.source.type === 'batch' ? lot.source.batchId : undefined;
            return (
              <tr key={l.lotId}>
                <td className={td}>{l.material}</td>
                <td className={td}><Link href={`/trace/${l.lotId}`} className="font-semibold text-green">{l.lotId}</Link></td>
                <td className={`${tdNum} font-semibold`}>{amountOf(l.quantity, l.unit)}</td>
                <td className={td}>{lot ? date(lot.receivedAt) : '—'}</td>
                <td className={td}>{batchId ? <Link href={`/production/batches/${batchId}`} className="font-semibold text-green">{batchId}</Link> : '—'}</td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <Panel title="Customer">
        <div className="grid gap-1 p-5 text-[14px]">
          <strong>{customer?.name ?? dispatch.customerId}</strong>
          {customer?.address && <span>{customer.address}</span>}
          {customer?.contact && <span className="text-muted">{customer.contact}</span>}
          {dispatch.note && <span className="mt-2 text-muted">Note: {dispatch.note}</span>}
        </div>
      </Panel>
    </>
  );
}
