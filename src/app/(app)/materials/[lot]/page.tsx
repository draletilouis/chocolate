'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { EditForm, RowActions } from '@/components/RowActions';
import { Back, Badge, Empty, Field, Input, PageHeader, Panel, Select, Stat, UnitInput } from '@/components/ui';
import { batchById, lotOrigin, recordBalance, supplierName } from '@/lib/derive';
import { dateTime, kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

export default function LotPage() {
  const { lot: id } = useParams<{ lot: string }>();
  const router = useRouter();
  const store = useStore();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const lot = store.lots.find((l) => l.id === id);
  if (!lot) return <Empty>Lot {id} was not found.</Empty>;
  // Only a delivery nothing has drawn from can change; everything else is corrected through its batch
  const delivery = lot.source.type === 'supplier' ? lot.source : undefined;
  const drawnBy = lot.uses.length;

  const sourceBatch = lot.source.type === 'batch' ? batchById(store, lot.source.batchId) : undefined;
  const sourceRecord = sourceBatch?.records.find((r) => r.outputs.some((o) => o.lotId === lot.id));
  const supplier = lot.source.type === 'supplier' ? store.suppliers.find((s) => s.id === (lot.source as { supplierId: string }).supplierId) : undefined;
  const upstreamLots = sourceBatch ? Array.from(new Set([...sourceBatch.startInput.lotIds, ...sourceBatch.records.flatMap((r) => r.inputLotIds)])) : [];
  const downstream = lot.uses.map((use) => ({ use, batch: batchById(store, use.batchId) }));
  const madeLots = downstream.flatMap((d) => store.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === d.use.batchId));

  return (
    <>
      <Back href="/materials" label="Materials" />
      <PageHeader eyebrow={lot.category} title={`${lot.id} · ${lot.material}`} subtitle={`${lotOrigin(store, lot)} · received ${dateTime(lot.receivedAt)}`} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Received" value={`${lot.received} ${lot.unit}`} />
        <Stat label="Used" value={`${Math.round((lot.received - lot.available) * 100) / 100} ${lot.unit}`} />
        <Stat label="Available" value={`${lot.available} ${lot.unit}`} tone={lot.category === 'Raw material' && lot.available < store.thresholds.lowStockKg ? 'warn' : undefined} />
      </div>

      {user.role === 'admin' && delivery && (
        <Panel title="Delivery" subtitle={drawnBy ? undefined : 'Nothing has drawn from this lot yet, so the delivery can still be corrected or deleted.'}
          action={!editing ? <RowActions name={lot.id} onEdit={drawnBy ? undefined : () => setEditing(true)} onDelete={async () => { await store.deleteLot(lot.id); router.push('/materials'); }}
            blocked={drawnBy ? `${lot.id} has already been drawn from by ${drawnBy} batch${drawnBy === 1 ? '' : 'es'}, so it can't be changed.` : undefined} /> : undefined}>
          {editing ? (
            <div className="p-5">
              <EditForm onCancel={() => setEditing(false)} onSubmit={async (d) => {
                await store.updateLot(lot.id, { material: String(d.get('material')), quantity: Number(d.get('quantity')), supplierId: String(d.get('supplier')), reference: String(d.get('reference') ?? '') || undefined });
                setEditing(false);
              }}>
                <Field label="Material"><Input name="material" defaultValue={lot.material} required autoFocus /></Field>
                <Field label="Supplier"><Select name="supplier" defaultValue={delivery.supplierId}>{store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                <Field label="Delivery note or invoice"><Input name="reference" defaultValue={delivery.reference ?? ''} placeholder="Optional" /></Field>
                <Field label="Measured weight"><UnitInput unit="kg" name="quantity" defaultValue={String(lot.received)} required aria-label="Measured weight" /></Field>
              </EditForm>
            </div>
          ) : (
            <div className="px-5 py-3 text-[13px]">{lot.material} · {kg(lot.received)} from <strong>{supplierName(store, delivery.supplierId)}</strong>{delivery.reference && <span className="text-muted"> · {delivery.reference}</span>}</div>
          )}
        </Panel>
      )}

      <Panel title="Traceability" subtitle="Where this lot came from and where it went.">
        <ol className="px-5 py-3 text-[13px]">
          <li className="py-2">
            <span className="text-[11px] font-bold tracking-wide text-faint uppercase">Came from</span>
            {lot.source.type === 'supplier' ? (
              <div>Delivered by <strong>{supplier?.name}</strong>{lot.source.reference && <span className="text-muted"> · {lot.source.reference}</span>}</div>
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
