'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowDown } from 'lucide-react';
import { Back, Badge, Empty, PageHeader, Panel, Stat } from '@/components/ui';
import { batchById, lotOrigin, recordBalance } from '@/lib/derive';
import { dateTime } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

export default function LotPage() {
  const { lot: id } = useParams<{ lot: string }>();
  const store = useStore();
  const lot = store.lots.find((l) => l.id === id);
  if (!lot) return <Empty>Lot {id} was not found.</Empty>;

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
