'use client';

import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button, Notice, Panel } from '@/components/ui';
import { batchDisplayName, batchSuppliers } from '@/lib/derive';
import { dateTime } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Batch } from '@/lib/types';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

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
  .label { border: 2px solid #0f172a; border-radius: 8px; padding: 16px 18px; max-width: 420px; }
  .brand { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #475569; }
  .material { font-size: 18px; font-weight: 800; margin: 6px 0 2px; }
  .batch { font-size: 24px; font-weight: 800; margin: 2px 0 10px; line-height: 1.1; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 2px 0; vertical-align: top; } td:first-child { color: #475569; width: 40%; } td:last-child { font-weight: 700; }
</style></head><body>
<div class="label">
  <div class="brand">${escapeHtml(store.business.name)}</div>
  <div class="material">${escapeHtml(material)}</div>
  <div class="batch">${escapeHtml(batchDisplayName(batch))}</div>
  <table>${lines.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
</div></body></html>`);
    win.document.close();
    win.focus();
    win.setTimeout(() => win.print(), 300);
  }

  return { store, suppliers, lines, print };
}

/** A print button on its own, for page headers */
export function PrintLabelButton({ children, variant = 'secondary', ...props }: LabelProps & { children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const { print } = useLabel(props);
  return <Button variant={variant} onClick={print}><Printer size={14} /> {children}</Button>;
}

/**
 * Label for material made by a batch, or a batch card that travels with the beans. It carries the batch
 * name so the material traces back to its supplier.
 */
export function BatchLabel({ title = 'Label', ...props }: LabelProps & { title?: string }) {
  const { store, suppliers, lines, print } = useLabel(props);
  const { batch, material } = props;
  return (
    <Panel title={title} subtitle="Carries the batch name so the material traces back to its supplier." action={<Button variant="secondary" onClick={print}><Printer size={14} /> Print {props.lotId ? 'label' : 'batch card'}</Button>}>
      <div className="p-5">
        <div className="max-w-md rounded-lg border-2 border-ink px-4 py-3">
          <div className="text-[11px] font-bold tracking-wide text-muted uppercase">{store.business.name}</div>
          <div className="mt-1 text-[16px] font-extrabold">{material}</div>
          <div className="text-[20px] font-extrabold leading-tight" data-testid="label-batch-name">{batchDisplayName(batch)}</div>
          <dl className="mt-2 grid grid-cols-[92px_1fr] gap-y-1 text-[13px]">
            {lines.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
        </div>
        {!batch.name && <div className="mt-3"><Notice tone="warn">This batch has no name, so the label shows its ID. Give the batch a name from its page to put it on the label.</Notice></div>}
        {suppliers.length === 0 && <div className="mt-3"><Notice tone="warn">No supplier is recorded for this batch.</Notice></div>}
      </div>
    </Panel>
  );
}
