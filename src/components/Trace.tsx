'use client';

import Link from 'next/link';
import { Empty, Table, td } from '@/components/ui';
import { batchDisplayName, supplierName, waitingAt } from '@/lib/derive';
import { date, kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import { heldRole, startLotIds, type Delivery, type TraceStep } from '@/lib/trace';
import type { Batch } from '@/lib/types';

const link = 'font-semibold text-green';

function BatchLink({ batch, batchId }: { batch?: Batch; batchId: string }) {
  if (!batch) return <>{batchId}</>;
  return <Link href={`/trace/${batch.id}`} className={link}>{batchDisplayName(batch)}</Link>;
}

/** How a step came to be, in one line */
function Origin({ step, forward }: { step: TraceStep; forward: boolean }) {
  const store = useStore();
  const { lot, origin } = step;
  if (!origin) return <>No longer on record.</>;
  if (origin.type === 'supplier') return <>Delivered by <strong className="text-ink">{supplierName(store, origin.supplierId)}</strong>{origin.supplierBatch && ` · supplier's batch ${origin.supplierBatch}`}{origin.reference && ` · ${origin.reference}`}{lot && ` · ${kg(lot.received)} received ${date(lot.receivedAt)}`}</>;
  const batch = origin.batch;
  // Beans received straight onto the line: the batch is the delivery.
  const delivered = batch?.supplierId && startLotIds(batch).length === 0 ? ` · delivered by ${supplierName(store, batch.supplierId)}` : '';
  if (!lot && forward) {
    const waiting = batch ? waitingAt(batch) : [];
    return <>{batch?.status === 'completed' ? 'Completed' : batch?.status === 'hold' ? 'On hold' : waiting.length ? `Waiting at ${waiting.map((s) => stationName(s).toLowerCase()).join(', ')}` : 'In progress'}{step.at && ` · started ${date(step.at)}`}</>;
  }
  if (!lot) return <>Made inside batch <BatchLink batch={batch} batchId={origin.batchId} />, not stored as a lot{delivered}</>;
  if (lot.pieces) return <>{lot.received} pieces counted {date(lot.receivedAt)} · batch <BatchLink batch={batch} batchId={origin.batchId} /></>;
  if (origin.run) {
    const takenOut = origin.run.takenOut === lot.id;
    return <>{takenOut ? 'Taken out of the mixer after' : 'Made in'} mixing run {(origin.runIndex ?? 0) + 1} of batch <BatchLink batch={batch} batchId={origin.batchId} /> · recipe v{origin.run.recipeVersion} · {kg(lot.received)} · {date(lot.receivedAt)}</>;
  }
  return <>Made by batch <BatchLink batch={batch} batchId={origin.batchId} />{origin.station && ` at ${stationName(origin.station).toLowerCase()}`} · {kg(lot.received)} · {date(lot.receivedAt)}{delivered}</>;
}

function Step({ step, forward }: { step: TraceStep; forward: boolean }) {
  const id = step.lotId ?? (forward && step.origin?.type === 'batch' ? step.origin.batchId : undefined);
  const known = Boolean(step.lot) || (forward && step.origin?.type === 'batch' && Boolean(step.origin.batch));
  // "Sugar: Sugar" says nothing; "Left in the mixer: 85% Dark" does.
  const name = step.role && step.role !== step.material ? `${step.role}: ${step.material}` : step.material;
  return (
    <li className="trace-step">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {step.quantity !== undefined && <strong className="tabular-nums">{kg(step.quantity)}</strong>}
        {forward && step.quantity !== undefined && <span className="text-muted">{step.role === heldRole ? 'stayed in the mixer for' : 'into'}</span>}
        {id && (known ? <Link href={`/trace/${id}`} className={link}>{id}</Link> : <span className="font-semibold">{id}</span>)}
        <span>{forward && step.role === heldRole ? step.material : name}</span>
      </div>
      <div className="text-[12px] text-muted"><Origin step={step} forward={forward} /></div>
      {step.cut && <div className="text-[12px] text-faint">{forward ? 'Later runs on top of it are not followed further.' : 'What the mixer held before that is not followed further.'} Open {step.lotId} to continue.</div>}
      {step.steps.length > 0 && <ol className="trace-tree">{step.steps.map((child) => <Step key={child.key} step={child} forward={forward} />)}</ol>}
    </li>
  );
}

/** A trace as an indented list: each step, and under it what went into it (or what it went into) */
export function TraceTree({ steps, forward = false, empty }: { steps: TraceStep[]; forward?: boolean; empty: string }) {
  if (steps.length === 0) return <Empty>{empty}</Empty>;
  return <ol className="trace-tree is-root">{steps.map((step) => <Step key={step.key} step={step} forward={forward} />)}</ol>;
}

/** The purchases behind a product, one row per delivery */
export function Deliveries({ deliveries }: { deliveries: Delivery[] }) {
  const store = useStore();
  if (deliveries.length === 0) return <Empty>No delivery is recorded behind it.</Empty>;
  return (
    <Table head={['Ingredient', 'Batch number', 'Supplier', "Supplier's batch", 'Delivery note', 'Received']}>
      {deliveries.map((d) => (
        <tr key={d.key}>
          <td className={td}>{d.material}</td>
          <td className={td}><Link href={`/trace/${d.key}`} className={link}>{d.key}</Link>{d.batch?.name && <span className="text-muted"> · {d.batch.name}</span>}</td>
          <td className={td}>{supplierName(store, d.supplierId)}</td>
          <td className={td}>{d.supplierBatch ?? <span className="text-faint">—</span>}</td>
          <td className={td}>{d.reference ?? <span className="text-faint">—</span>}</td>
          <td className={td}>{date(d.at)}</td>
        </tr>
      ))}
    </Table>
  );
}
