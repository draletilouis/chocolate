'use client';

import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { Button, Notice, Panel } from '@/components/ui';
import { batchDisplayName, batchSuppliers } from '@/lib/derive';
import { dateTime } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Batch } from '@/lib/types';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** QR code (as SVG markup) that opens this batch or lot when scanned with a phone camera */
export function useScanQr(code: string) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(`${window.location.origin}/scan/${encodeURIComponent(code)}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((markup) => { if (live) setSvg(markup); })
      .catch(() => { /* the label still prints without a code */ });
    return () => { live = false; };
  }, [code]);
  return svg;
}

interface LabelProps {
  batch: Batch;
  /** Product line on the label, e.g. "Cocoa liquor" or the batch product for a batch card */
  material: string;
  quantity: string;
  madeAt: string;
  lotId?: string;
}

function useLabel({ batch, material, quantity, madeAt, lotId }: LabelProps) {
  const store = useStore();
  const suppliers = batchSuppliers(store, batch);
  const qr = useScanQr(lotId ?? batch.id);
  const lines: [string, string][] = [
    ['Batch ID', batch.id],
    ['Supplier', suppliers.join(', ') || 'Not recorded'],
    [lotId ? 'Net weight' : 'Start weight', quantity],
    [lotId ? 'Made' : 'Started', dateTime(madeAt)],
    ...(lotId ? [['Lot', lotId] as [string, string]] : []),
  ];

  function print() {
    const win = window.open('', '_blank', 'width=480,height=560');
    if (!win) return;
    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(`${material} · ${batchDisplayName(batch)}`)}</title>
<style>
  body { margin: 0; padding: 18px; font-family: Montserrat, Arial, sans-serif; color: #0f172a; }
  .label { display: flex; gap: 14px; border: 2px solid #0f172a; border-radius: 8px; padding: 16px 18px; max-width: 420px; }
  .text { flex: 1; min-width: 0; }
  .qr { width: 118px; flex: 0 0 118px; } .qr svg { width: 118px; height: 118px; }
  .brand { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
  .material { font-size: 18px; font-weight: 800; margin: 6px 0 2px; }
  .batch { font-size: 24px; font-weight: 800; margin: 2px 0 10px; line-height: 1.1; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 2px 0; vertical-align: top; } td:first-child { color: #475569; width: 40%; } td:last-child { font-weight: 700; }
  .scan { margin-top: 4px; font-size: 9px; color: #475569; text-align: center; }
</style></head><body>
<div class="label">
  <div class="text">
    <div class="brand">${escapeHtml(store.business.name)}</div>
    <div class="material">${escapeHtml(material)}</div>
    <div class="batch">${escapeHtml(batchDisplayName(batch))}</div>
    <table>${lines.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
  </div>
  ${qr ? `<div class="qr">${qr}<div class="scan">Scan to open</div></div>` : ''}
</div></body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 300);
  }

  return { store, suppliers, qr, lines, print };
}

/** A print button on its own, for page headers */
export function PrintLabelButton({ children, variant = 'secondary', ...props }: LabelProps & { children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const { print } = useLabel(props);
  return <Button variant={variant} onClick={print}><Printer size={14} /> {children}</Button>;
}

/**
 * Label for material made by a batch, or a batch card that travels with the beans. It carries the batch
 * name so the material traces back to its supplier, and a QR code that opens the record when scanned.
 */
export function BatchLabel({ title = 'Label', ...props }: LabelProps & { title?: string }) {
  const { store, suppliers, qr, lines, print } = useLabel(props);
  const { batch, material } = props;
  return (
    <Panel title={title} subtitle="Carries the batch name so the material traces back to its supplier. Scan the code with a phone camera to open this record." action={<Button variant="secondary" onClick={print}><Printer size={14} /> Print {props.lotId ? 'label' : 'batch card'}</Button>}>
      <div className="p-5">
        <div className="flex max-w-md flex-col gap-3 rounded-lg border-2 border-ink px-4 py-3 sm:flex-row sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-wide text-muted uppercase">{store.business.name}</div>
            <div className="mt-1 text-[16px] font-extrabold">{material}</div>
            <div className="text-[20px] font-extrabold leading-tight" data-testid="label-batch-name">{batchDisplayName(batch)}</div>
            <dl className="mt-2 grid grid-cols-[92px_1fr] gap-y-1 text-[13px]">
              {lines.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
          </div>
          {qr && <div className="label-qr" aria-label="QR code to open this record" role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
        </div>
        {!batch.name && <div className="mt-3"><Notice tone="warn">This batch has no name, so the label shows its ID. Give the batch a name from its page to put it on the label.</Notice></div>}
        {suppliers.length === 0 && <div className="mt-3"><Notice tone="warn">No supplier is recorded for this batch.</Notice></div>}
      </div>
    </Panel>
  );
}
