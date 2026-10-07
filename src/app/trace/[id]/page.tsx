'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Back, Empty, LinkButton, Notice, PageHeader, Panel, Stat } from '@/components/ui';
import { Deliveries, Shipments, TraceTree } from '@/components/Trace';
import { batchDisplayName, lotOrigin } from '@/lib/derive';
import { dateTime, kg } from '@/lib/format';
import { piecesKg } from '@/lib/pieces';
import { useStore } from '@/lib/store';
import { allSteps, batchDelivery, batchMadeFrom, batchWentInto, deliveriesBehind, shipmentsAhead, traceBack, wentInto } from '@/lib/trace';
import type { Batch, Lot } from '@/lib/types';

/** How a batch or lot happened: everything that went into it, and everything it went into */
export default function TraceDetailPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw).toUpperCase();
  const store = useStore();
  const lot = store.lots.find((l) => l.id.toUpperCase() === id);
  const batch = store.batches.find((b) => b.id.toUpperCase() === id);
  if (lot) return <LotTrace lot={lot} alsoBatch={batch} />;
  if (batch) return <BatchTrace batch={batch} />;
  return <><Back href="/trace" label="Batch tracing" /><Empty>No batch or lot has the number {id}.</Empty></>;
}

function LotTrace({ lot, alsoBatch }: { lot: Lot; alsoBatch?: Batch }) {
  const store = useStore();
  const back = traceBack(store, lot);
  const onward = wentInto(store, lot);
  const delivered = lot.source.type === 'supplier';
  const products = allSteps(onward).filter((s) => s.lot?.pieces);
  const shipments = shipmentsAhead(onward, lot);
  const unit = lot.pieces ? 'pieces' : lot.unit;

  return (
    <>
      <Back href="/trace" label="Batch tracing" />
      <PageHeader eyebrow={lot.pieces ? 'Finished pieces' : lot.chocolate ? 'Chocolate' : delivered ? 'Delivery' : lot.category} title={`${lot.id} · ${lot.material}`}
        subtitle={`${lotOrigin(store, lot)} · ${dateTime(lot.receivedAt)}`} action={<LinkButton variant="secondary" href={`/materials/${lot.id}`}>Open lot record</LinkButton>} />
      {alsoBatch && <Notice tone="neutral">A production batch has the same number: <Link href={`/production/batches/${alsoBatch.id}`} className="font-semibold text-green">open batch {alsoBatch.id}</Link>.</Notice>}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={lot.pieces ? 'Made' : delivered ? 'Received' : 'Made'} value={`${lot.received} ${unit}`} hint={lot.pieces ? `${kg(piecesKg(lot.received, lot.pieces.grams))} of ${lot.pieces.type}` : undefined} />
        <Stat label={lot.pieces ? 'Dispatched' : 'Used'} value={`${Math.round((lot.received - lot.available) * 1000) / 1000} ${unit}`} />
        <Stat label={lot.pieces ? 'In store' : 'Left'} value={`${lot.available} ${unit}`} />
      </div>

      {!delivered && (
        <>
          <Panel title="Deliveries behind it" subtitle="Every purchased batch that went into it.">
            <Deliveries deliveries={deliveriesBehind([back])} />
          </Panel>
          <Panel title="How it was made" subtitle="Each line is what went into the line above it, with the weight used.">
            <TraceTree steps={back.steps} empty="Nothing is recorded as going into it." />
          </Panel>
        </>
      )}

      <Panel title="Customers it reached" subtitle={shipments.length ? `Every dispatch that took ${lot.pieces ? 'these pieces' : 'something made from it'}: ${new Set(shipments.map((s) => s.dispatch?.customerId)).size} customer${new Set(shipments.map((s) => s.dispatch?.customerId)).size === 1 ? '' : 's'}.` : 'The dispatches that took it, or anything made from it, out of the factory.'}>
        <Shipments shipments={shipments} empty={lot.available > 0 ? 'Nothing from it has left the factory yet.' : 'No dispatch is recorded for it.'} />
      </Panel>

      {!lot.pieces && (
        <Panel title="Where it went" subtitle={products.length ? `It is in ${products.length} lot${products.length === 1 ? '' : 's'} of finished pieces: ${products.map((p) => p.lotId).join(', ')}.` : 'Each line is what the line above it went into.'}>
          <TraceTree steps={onward} forward empty={lot.available > 0 ? 'Not used yet.' : 'Nothing is recorded as made from it.'} />
        </Panel>
      )}
    </>
  );
}

function BatchTrace({ batch }: { batch: Batch }) {
  const store = useStore();
  const back = batchMadeFrom(store, batch);
  const onward = batchWentInto(store, batch);
  const own = batchDelivery(batch);
  const deliveries = [...(own ? [own] : []), ...deliveriesBehind(back)];
  const products = allSteps(onward).filter((s) => s.lot?.pieces);
  const shipments = shipmentsAhead(onward);

  return (
    <>
      <Back href="/trace" label="Batch tracing" />
      <PageHeader eyebrow={`Batch ${batch.id}`} title={`${batchDisplayName(batch)} · ${batch.product}`}
        subtitle={`Started ${dateTime(batch.startedAt)}${batch.completedAt ? ` · completed ${dateTime(batch.completedAt)}` : ''}`} action={<LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Open batch record</LinkButton>} />

      <Panel title="Deliveries behind it" subtitle="Every purchased batch that went into it.">
        <Deliveries deliveries={deliveries} />
      </Panel>
      <Panel title="What went into it" subtitle={batch.startInput.weight > 0 ? `It started with ${kg(batch.startInput.weight)} of ${batch.startInput.material.toLowerCase()}. Each line is what went into the line above it.` : 'Each line is what went into the line above it, with the weight used.'}>
        <TraceTree steps={back} empty={own ? 'It started from the delivery above; nothing came from store.' : 'Nothing is recorded as going into it yet.'} />
      </Panel>
      <Panel title="What it made, and where that went" subtitle={products.length ? `It is in ${products.length} lot${products.length === 1 ? '' : 's'} of finished pieces: ${products.map((p) => p.lotId).join(', ')}.` : 'Every lot it made, each followed on to the finished pieces.'}>
        <TraceTree steps={onward} forward empty="It has not made a lot yet. The weights of each step are on the batch record." />
      </Panel>
      <Panel title="Customers it reached" subtitle="Every dispatch that took something this batch made, or made into pieces, out of the factory.">
        <Shipments shipments={shipments} empty="Nothing it made has left the factory yet." />
      </Panel>
    </>
  );
}
