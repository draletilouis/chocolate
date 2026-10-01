'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDown, Pencil, Trash2, Waypoints } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Stat } from '@/components/ui';
import { BatchLabel } from '@/components/BatchLabel';
import { batchById, lotOrigin, recordBalance, userName } from '@/lib/derive';
import { piecesFrom, piecesKg } from '@/lib/pieces';
import { dateTime, kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import type { LotCategory } from '@/lib/types';

export default function LotPage() {
  const { lot: id } = useParams<{ lot: string }>();
  const router = useRouter();
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const lot = store.lots.find((l) => l.id === id);
  if (!lot) return <Empty>Lot {id} was not found.</Empty>;

  const sourceBatch = lot.source.type === 'batch' ? batchById(store, lot.source.batchId) : undefined;
  const sourceRecord = sourceBatch?.records.find((r) => r.outputs.some((o) => o.lotId === lot.id));
  const supplier = lot.source.type === 'supplier' ? store.suppliers.find((s) => s.id === (lot.source as { supplierId: string }).supplierId) : undefined;
  const upstreamLots = sourceBatch ? Array.from(new Set([...sourceBatch.startInput.lotIds, ...sourceBatch.records.flatMap((r) => r.inputLotIds)])) : [];
  const downstream = lot.uses.map((use) => ({ use, batch: batchById(store, use.batchId) }));
  const madeLots = downstream.flatMap((d) => store.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === d.use.batchId));
  const referencedByBatch = store.batches.some((batch) => batch.startInput.lotIds.includes(lot.id) || batch.records.some((record) => record.inputLotIds.includes(lot.id) || record.outputs.some((output) => output.lotId === lot.id)));
  const canDelete = lot.source.type === 'supplier' && lot.uses.length === 0 && lot.available === lot.received && !referencedByBatch;
  // Liquor, cocoa butter, sugar or milk powder in store can be mixed into chocolate from a "Chocolate from store" batch.
  const unit = lot.pieces ? 'pieces' : lot.unit;
  const madePieces = lot.chocolate ? piecesFrom(store, lot.id) : [];
  const usedInRecipes = lot.unit === 'kg' && lot.available > 0 && store.recipes.some((r) => r.versions.find((v) => v.version === r.currentVersion)?.ingredients.some((i) => i.name === lot.material));
  // Beans or nibs in store start the batch that takes them; the weight used comes off this lot.
  const startsBatch = lot.unit === 'kg' && lot.available > 0 && store.products.some((p) => (lot.material === 'Cocoa beans' ? p.route === 'beans' : store.routes.find((r) => r.id === p.route)?.startMaterial === lot.material));

  return (
    <>
      <Back href="/store" label="Store" />
      <PageHeader eyebrow={lot.category} title={`${lot.id} · ${lot.material}`} subtitle={`${lotOrigin(store, lot)} · received ${dateTime(lot.receivedAt)}`} action={<div className="flex flex-wrap gap-2">{usedInRecipes && <LinkButton href={`/production/new?lot=${lot.id}`}>Mix chocolate from store</LinkButton>}{startsBatch && <LinkButton href={`/production/new?lot=${lot.id}`}>Start a batch from this lot</LinkButton>}{lot.chocolate && lot.available > 0.004 && <LinkButton href={`/production/pieces/${lot.id}`}>Record pieces</LinkButton>}<LinkButton variant="secondary" href={`/trace/${lot.id}`}><Waypoints size={14} /> Trace</LinkButton><Button variant="secondary" onClick={() => setEditing((value) => !value)}><Pencil size={14} /> Edit</Button><Button variant="danger" disabled={!canDelete} title={canDelete ? 'Delete lot' : 'Only unused supplier lots can be deleted.'} onClick={async () => { if (canDelete && window.confirm(`Delete lot ${lot.id}?`) && await store.deleteLot(lot.id)) router.push('/store'); }}><Trash2 size={14} /> Delete</Button></div>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={lot.pieces ? 'Made' : 'Received'} value={`${lot.received} ${unit}`} />
        <Stat label="Used" value={`${Math.round((lot.received - lot.available) * 1000) / 1000} ${unit}`} />
        <Stat label="Available" value={`${lot.available} ${unit}`} tone={lot.category === 'Raw material' && lot.available < store.thresholds.lowStockKg ? 'warn' : undefined} />
      </div>

      {lot.source.type === 'batch' && <Notice tone="neutral">This lot was created by production and is part of the traceability record. Its quantity and origin are protected; correct the source batch if needed.</Notice>}

      {editing && lot.source.type === 'supplier' && (
        <Panel title="Edit lot details" subtitle="Material identity and supplier reference can be corrected. Received quantity and usage history stay locked.">
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (await store.updateLot(lot.id, { material: String(form.get('material')), category: form.get('category') as LotCategory, supplierId: String(form.get('supplier')), reference: String(form.get('reference')), supplierBatch: String(form.get('supplierBatch')) })) setEditing(false); }}>
            <Field label="Material"><Input name="material" defaultValue={lot.material} required /></Field>
            <Field label="Category"><Select name="category" defaultValue={lot.category}>{(['Raw material', 'Intermediate', 'By-product', 'Rework', 'Finished goods'] as LotCategory[]).map((category) => <option key={category} value={category}>{category}</option>)}</Select></Field>
            <Field label="Supplier"><Select name="supplier" defaultValue={lot.source.supplierId}>{store.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
            <Field label="Supplier's batch number"><Input name="supplierBatch" defaultValue={lot.source.supplierBatch ?? ''} maxLength={80} placeholder="As printed on the bag or the delivery note" /></Field>
            <Field label="Reference"><Input name="reference" defaultValue={lot.source.reference ?? ''} placeholder="Delivery note or supplier reference" /></Field>
            <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit">Save changes</Button></div>
          </form>
        </Panel>
      )}

      {lot.pieces && (
        <Notice tone="neutral">{lot.received} pieces of {lot.pieces.size} ({kg(piecesKg(lot.received, lot.pieces.grams))} of {lot.pieces.type}) made from <Link href={`/materials/${lot.pieces.fromLotId}`} className="font-semibold text-green">{lot.pieces.fromLotId}</Link> by {userName(store, lot.pieces.recordedBy)}.{lot.uses.length === 0 && lot.available === lot.received ? ' Entered by mistake? Undo it from the Pieces screen of that lot.' : ''}</Notice>
      )}
      {lot.chocolate && madePieces.length > 0 && (
        <Panel title="Pieces made from this lot">
          {madePieces.map((p) => <div key={p.id} className="border-b border-line px-5 py-2.5 text-[13px] last:border-b-0"><Link href={`/materials/${p.id}`} className="font-semibold text-green">{p.id}</Link> · <strong className="tabular-nums">{p.received}</strong> × {p.pieces!.size} <span className="text-muted">· {dateTime(p.receivedAt)}</span></div>)}
        </Panel>
      )}

      {sourceBatch && <BatchLabel batch={sourceBatch} material={lot.material} quantity={`${lot.received} ${unit}`} madeAt={lot.receivedAt} lotId={lot.id} />}

      <Panel title="Traceability" subtitle="Where this lot came from and where it went.">
        <ol className="px-5 py-3 text-[13px]">
          <li className="py-2">
            <span className="text-[11px] font-bold tracking-wide text-faint uppercase">Came from</span>
            {lot.source.type === 'supplier' ? (
              <div>Delivered by <strong>{supplier?.name}</strong>{lot.source.supplierBatch && <span className="text-muted"> · supplier&apos;s batch {lot.source.supplierBatch}</span>}{lot.source.reference && <span className="text-muted"> · {lot.source.reference}</span>}</div>
            ) : (
              <div>
                Batch <Link href={`/production/batches/${lot.source.batchId}`} className="font-semibold text-green">{lot.source.batchId}</Link> at {stationName(lot.source.station).toLowerCase()}
                {sourceRecord && <span className="text-muted"> · input {sourceRecord.inputWeight.toFixed(2)} kg {sourceRecord.inputMaterial.toLowerCase()} · variance {recordBalance(sourceRecord).variancePct.toFixed(2)}%</span>}
                {upstreamLots.length > 0 && <div className="text-muted">That batch started from {upstreamLots.map((l, i) => <span key={l}>{i > 0 && ', '}<Link href={`/materials/${l}`} className="font-semibold text-green">{l}</Link></span>)}</div>}
              </div>
            )}
          </li>
          <li className="py-1 text-faint"><ArrowDown size={14} /></li>
          <li className="py-2">
            <span className="text-[11px] font-bold tracking-wide text-faint uppercase">This lot</span>
            <div><strong>{lot.id}</strong> · {lot.material} · {lot.received} {lot.unit} received, {lot.available} {lot.unit} available</div>
          </li>
          <li className="py-1 text-faint"><ArrowDown size={14} /></li>
          <li className="py-2">
            <span className="text-[11px] font-bold tracking-wide text-faint uppercase">Used by</span>
            {downstream.length === 0 && <div className="text-muted">Not used yet.</div>}
            {downstream.map(({ use, batch }) => (
              <div key={`${use.batchId}-${use.at}`} className="flex flex-wrap items-center gap-2 py-1">
                <Link href={`/production/batches/${use.batchId}`} className="font-semibold text-green">{use.batchId}</Link>
                <span>{batch?.product}</span>
                <span className="text-muted">{use.quantity} {lot.unit} at {stationName(use.station).toLowerCase()} · {dateTime(use.at)}</span>
                {batch && <Badge tone={batch.status === 'completed' ? 'neutral' : batch.status === 'hold' ? 'danger' : 'green'}>{batch.status === 'completed' ? 'Completed' : batch.status === 'hold' ? 'On hold' : 'In progress'}</Badge>}
              </div>
            ))}
            {madeLots.length > 0 && <div className="mt-1 text-muted">Those batches made {madeLots.map((l, i) => <span key={l.id}>{i > 0 && ', '}<Link href={`/materials/${l.id}`} className="font-semibold text-green">{l.id}</Link> ({l.material})</span>)}</div>}
          </li>
        </ol>
      </Panel>
    </>
  );
}
