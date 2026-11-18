'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, Circle, FileText, Package, Pause, Truck, PenLine, Pencil, Play, Trash2, Waypoints } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, Textarea, UnitInput } from '@/components/ui';
import { PrintLabelButton } from '@/components/BatchLabel';
import { WhereItWent } from '@/components/BatchFlow';
import { percentOf } from '@/lib/balance';
import { startName, startWeight } from '@/lib/outcomes';
import { batchById, batchDisplayName, batchSuppliers, customerName, nextInput, recordBalance, recordFor, userName, waitingAt } from '@/lib/derive';
import { kindLabels, openDiscrepancies } from '@/lib/discrepancies';
import { dateTime, destinationLabel, kg, num, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationById, stationName, stations } from '@/lib/stations';
import type { Batch, StationId } from '@/lib/types';

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const batch = batchById(store, id);
  const [panel, setPanel] = useState<'hold' | 'release' | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [reason, setReason] = useState('');
  if (!batch) return <Empty>Batch {id} was not found.</Empty>;

  // What does not add up on this batch and is still open, as the register lists it
  const flags = openDiscrepancies(store, new Date().toISOString().slice(0, 10)).filter((d) => d.batchId === batch.id && d.kind !== 'hold');
  const activeHold = batch.holds.find((h) => !h.releasedAt);
  const waiting = waitingAt(batch);
  const firstWaiting = waiting[0];
  const suppliers = batchSuppliers(store, batch);
  const canDelete = batch.records.length === 0 && batch.holds.length === 0 && batch.corrections.length === 0 && !store.lots.some((lot) => lot.source.type === 'batch' && lot.source.batchId === batch.id);

  async function submitHold(event: FormEvent) {
    event.preventDefault();
    const saved = panel === 'hold' ? await store.placeHold(batch!.id, reason) : await store.releaseHold(batch!.id, reason);
    if (saved) { setPanel(null); setReason(''); }
  }

  const statusBadge = batch.status === 'completed' ? <Badge tone="green">Completed</Badge> : batch.status === 'hold' ? <Badge tone="danger">On hold</Badge> : <Badge tone="green">In progress</Badge>;

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow={`Batch ${batch.id}`} title={`${batchDisplayName(batch)} · ${batch.product}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{statusBadge}<span>ID {batch.id}</span><span>Started {dateTime(batch.startedAt)}</span>{suppliers.length > 0 && <span>· Supplier {suppliers.join(', ')}</span>}{batch.recipeId && <span>· Recipe {batch.recipeId} v{batch.recipeVersion}</span>}</span>}
        action={(
          <div className="flex flex-wrap justify-end gap-2">
            {batch.status === 'active' && firstWaiting && <LinkButton href={`/production/batches/${batch.id}/record/${firstWaiting}`}>{firstWaiting === 'completion' ? 'Review & complete' : `Record ${stationName(firstWaiting).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>}
            {batch.startInput.weight > 0 && <PrintLabelButton batch={batch} material={batch.product} quantity={kg(batch.startInput.weight)} madeAt={batch.startedAt}>Print batch card</PrintLabelButton>}
            <LinkButton variant="secondary" href={`/trace/${batch.id}`}><Waypoints size={14} /> Trace</LinkButton>
            <Button variant="secondary" onClick={() => setEditingDetails((value) => !value)}><Pencil size={14} /> Edit details</Button>
            {canDelete && <Button variant="danger" onClick={async () => { if (window.confirm(`Delete blank batch ${batch.id}?`) && await store.deleteBatch(batch.id)) router.push('/production'); }}><Trash2 size={14} /> Delete</Button>}
          </div>
        )} />

      {activeHold && <Notice tone="danger" icon={Pause}><strong>On hold</strong> since {dateTime(activeHold.placedAt)} by {userName(store, activeHold.placedBy)}: {activeHold.reason}</Notice>}
      {flags.map((d) => <Notice key={d.id} tone={d.severity === 'high' ? 'danger' : 'warn'} icon={AlertTriangle}><strong>{d.title}.</strong> {d.detail} <Link href="/discrepancies" className="font-semibold underline">{kindLabels[d.kind]} · open in Discrepancies</Link></Notice>)}

      {editingDetails && <Panel title="Edit batch details" subtitle="The name is printed on labels. Weights, holds and corrections stay as recorded.">
        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (await store.updateBatchDetails(batch.id, { name: String(form.get('name')), note: String(form.get('note')) })) setEditingDetails(false); }}>
          <Field label="Batch name"><Input name="name" defaultValue={batch.name ?? ''} placeholder={batch.id} /></Field>
          <Field label="Note" className="md:col-span-2"><Textarea name="note" defaultValue={batch.note ?? ''} rows={2} placeholder="Optional production note" /></Field>
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setEditingDetails(false)}>Cancel</Button><Button type="submit">Save changes</Button></div>
        </form>
      </Panel>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          {batch.route === 'beans' && (
            <Panel title="Documents" subtitle="The factory's sheets for this sack, ready to print.">
              <Link href={`/production/batches/${batch.id}/inspection`} className="row-link">
                <FileText size={16} className="shrink-0 text-green" />
                <span className="min-w-0 flex-1 text-[13px]"><strong className="block text-[14px]">Receiving and inspection report</strong><span className="text-muted">{!batch.inspection ? 'Inspection not entered yet' : batch.approvals?.inspection ? `Signed by ${userName(store, batch.approvals.inspection.by)}` : 'Waiting for the production manager to sign'}</span></span>
              </Link>
              <Link href={`/production/batches/${batch.id}/summary`} className="row-link">
                <FileText size={16} className="shrink-0 text-green" />
                <span className="min-w-0 flex-1 text-[13px]"><strong className="block text-[14px]">Bean summary</strong><span className="text-muted">{batch.approvals?.summary ? `Signed by ${userName(store, batch.approvals.summary.by)}` : recordFor(batch, 'winnowing') ? 'Waiting for the production manager to sign' : 'Fills in as the stations are recorded'}</span></span>
              </Link>
            </Panel>
          )}

          <Steps batch={batch} />
          {batch.records.length > 0 && (
            <Panel title="Where the batch went" subtitle={`Every output that left the line, as a share of the ${startName(batch)}. The rows add up to 100%.`}>
              <WhereItWent batch={batch} />
            </Panel>
          )}
        </div>

        <div>
          <Panel title="Actions">
            <div className="flex flex-wrap gap-2 p-4">
              {batch.status === 'active' && <Button variant="secondary" onClick={() => setPanel(panel === 'hold' ? null : 'hold')}><Pause size={14} /> Put on hold</Button>}
              {batch.status === 'hold' && store.signedInUser?.access === 'manager' && <Button variant="secondary" onClick={() => setPanel(panel === 'release' ? null : 'release')}><Play size={14} /> Release hold</Button>}
              {batch.status === 'hold' && store.signedInUser?.access !== 'manager' && <span className="text-[13px] text-muted">A manager releases the hold.</span>}
              {batch.status === 'completed' && <span className="text-[13px] text-muted">Completed. Weights can still be corrected from the steps.</span>}
            </div>
            {(panel === 'hold' || panel === 'release') && (
              <form onSubmit={submitHold} className="border-t border-line p-4">
                <Field label={panel === 'hold' ? 'Why is the batch on hold?' : 'Release note'}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required aria-label={panel === 'hold' ? 'Hold reason' : 'Release note'} /></Field>
                <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPanel(null)}>Cancel</Button><Button type="submit">{panel === 'hold' ? 'Place hold' : 'Release'}</Button></div>
              </form>
            )}
          </Panel>

          {batch.ingredients && (
            <Panel title="Recipe: expected vs actual">
              <table className="w-full text-[13px]">
                <tbody>
                  {batch.ingredients.map((i) => (
                    <tr key={i.name} className="border-b border-line last:border-b-0"><td className="px-4 py-2">{i.name}{i.lotId && <Link href={`/materials/${i.lotId}`} className="ml-1 text-[11px] font-semibold text-green">{i.lotId}</Link>}</td><td className="px-2 py-2 text-right text-muted tabular-nums">{num(i.expected)}</td><td className={`px-4 py-2 text-right font-semibold tabular-nums ${i.actual !== i.expected ? 'text-warn' : ''}`}>{num(i.actual)} kg</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          {batch.holds.length > 0 && (
            <Panel title="Holds">
              {batch.holds.map((h) => <div key={h.id} className="border-b border-line px-4 py-2.5 text-[13px] last:border-b-0"><div>{h.reason}</div><div className="text-[12px] text-muted">{dateTime(h.placedAt)} · {userName(store, h.placedBy)} · at {stationName(h.station).toLowerCase()}{h.releasedAt ? ` · released ${dateTime(h.releasedAt)}${h.releaseNote ? `: ${h.releaseNote}` : ''}` : ''}</div></div>)}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/** Every step of the batch in line order: done (with details), waiting, or later */
function Steps({ batch }: { batch: Batch }) {
  const store = useStore();
  const waiting = waitingAt(batch);
  const route = store.routes.find((r) => r.id === batch.route);
  // Only the stations this batch went through or waits at. Which others it reaches depends on where each output is sent.
  const used = new Set<StationId>([...batch.records.map((r) => r.station), ...waiting]);
  used.delete('completion');
  const steps = stations.map((s) => s.id).filter((id) => used.has(id));
  const stillMoving = batch.status !== 'completed' && waiting.some((s) => s !== 'completion');
  const later = stillMoving ? (route?.stations ?? []).filter((s) => s !== 'completion' && !used.has(s)) : [];
  const [showEarly, setShowEarly] = useState(false);
  const recorded = steps.filter((s) => recordFor(batch, s)).length;
  const waitingHere = steps.length - recorded;
  const [open, setOpen] = useState<StationId | null>(null);
  const [fixing, setFixing] = useState<{ recordId: string; output: string } | null>(null);
  const [fix, setFix] = useState({ weight: '', reason: '' });
  const start = startWeight(batch);
  const of = startName(batch);

  async function saveFix(event: FormEvent) {
    event.preventDefault();
    if (!fixing || !(Number(fix.weight) >= 0) || !fix.reason.trim()) return;
    if (await store.addCorrection(batch.id, fixing.recordId, fixing.output, Number(fix.weight), fix.reason.trim())) { setFixing(null); setFix({ weight: '', reason: '' }); }
  }

  return (
    <Panel title="The batch from start to finish" subtitle="Every station it went through, what is waiting now, and where what it made ended up. Open a step for its weights." action={<span className="text-[12px] font-semibold text-muted">{recorded} recorded{waitingHere > 0 ? ` · ${waitingHere} waiting` : ''}</span>}>
      <ol>
        <li className="step-row">
          <span className="step-icon is-done"><Check size={13} /></span>
          <div className="min-w-0 flex-1 text-[13px]">
            <strong className="text-[14px]">Started</strong> <span className="text-muted">· {dateTime(batch.startedAt)}</span>
            <div className="text-muted">{batch.startInput.material}{batch.startInput.weight > 0 && <>: <strong className="text-ink tabular-nums">{kg(batch.startInput.weight)}</strong></>}{batch.startInput.lotIds.length > 0 && <> from {batch.startInput.lotIds.map((l, i) => <span key={l}>{i > 0 && ', '}<Link href={`/materials/${l}`} className="font-semibold text-green">{l}</Link></span>)}</>}</div>
          </div>
        </li>
        {steps.map((stationId, index) => {
          const record = recordFor(batch, stationId);
          const isWaiting = waiting.includes(stationId);
          const expanded = open === stationId;
          if (record) {
            const balance = recordBalance(record);
            const limit = store.thresholds.variancePct[stationId] ?? 0;
            const over = Math.abs(balance.variancePct) > limit;
            const fixes = batch.corrections.filter((c) => c.recordId === record.id);
            // Mixing also weighs in sugar, milk powder and other lots, so its weights are not shares of a sack
            const mixesStore = stationId === 'mixing' && batch.startInput.weight > 0;
            return (
              <li key={stationId} className="step-row">
                <span className={`step-icon ${record.destinationsSaved ? 'is-done' : 'is-warn'}`}>{record.destinationsSaved ? <Check size={13} /> : '!'}</span>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{stationName(stationId)}</strong>{!record.destinationsSaved && (record.runs ? <Badge tone="green">In progress · {record.runs.length} run{record.runs.length === 1 ? '' : 's'}</Badge> : <Badge tone="warn">Not finished</Badge>)}</span>
                    <button type="button" className="verdict-toggle text-green" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : stationId)}>{expanded ? 'Hide' : 'Details'} <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} /></button>
                  </div>
                  <div className={over ? 'text-warn' : 'text-muted'}>In {kg(balance.input)}{!mixesStore && ` (${pct(percentOf(balance.input, start))} of the ${of})`} → out {kg(balance.measured)} · {balance.variance < 0 ? `${kg(-balance.variance)} more out than in` : `${stationById[stationId].lossLabel?.toLowerCase() ?? 'missing'} ${kg(balance.variance)}`} ({pct(Math.abs(balance.variancePct))}){over ? ` · above the ${limit}% limit` : ''}</div>
                  {!expanded && !mixesStore && <div className="text-[12px] text-muted tabular-nums">{record.outputs.map((o) => `${o.name} ${pct(percentOf(o.weight, start))}`).join(' · ')}</div>}
                  {fixes.length > 0 && !expanded && <div className="text-muted"><PenLine size={12} className="inline" /> {fixes.length} correction{fixes.length > 1 ? 's' : ''}</div>}
                  {expanded && (
                    <div className="mt-2 grid gap-2">
                      <div className="text-muted">Recorded {dateTime(record.recordedAt)} by {userName(store, record.recordedBy)} · input {record.inputMaterial.toLowerCase()}</div>
                      <ul className="grid gap-1.5">
                        {record.outputs.map((o) => {
                          const isFixing = fixing?.recordId === record.id && fixing.output === o.name;
                          return (
                            <li key={o.name} className="rounded-md bg-paper px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span><strong>{o.name}</strong> <span className="tabular-nums">{record.packaging ? `${o.name === 'Accepted units' ? record.packaging.acceptedUnits : record.packaging.rejectedUnits} units` : kg(o.weight)}</span> <span className="text-[12px] text-muted tabular-nums">{pct(percentOf(o.weight, record.inputWeight))} of this input{!mixesStore && ` · ${pct(percentOf(o.weight, start))} of the ${of}`}</span></span>
                                {!record.packaging && !record.runs && <button type="button" className="btn-text inline-flex min-h-[44px] items-center gap-1" onClick={() => { setFixing(isFixing ? null : { recordId: record.id, output: o.name }); setFix({ weight: String(o.weight), reason: '' }); }} aria-label={`Correct ${o.name}`}><Pencil size={13} /> Correct</button>}
                              </div>
                              <div className="text-[12px] text-muted">{destinationLabel(o.destination, (s) => stationName(s as StationId))}{o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">{o.lotId}</Link></>}</div>
                              {isFixing && (
                                <form onSubmit={saveFix} className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                                  <Field label="Correct weight"><UnitInput unit="kg" value={fix.weight} onChange={(e) => setFix({ ...fix, weight: e.target.value })} aria-label="Corrected weight" required autoFocus /></Field>
                                  <Field label="Why?"><Input value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} aria-label="Correction reason" placeholder="e.g. bin tare was not taken off" required /></Field>
                                  <Button type="submit">Save correction</Button>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {record.note && <div className="text-muted">Note: {record.note}</div>}
                      {record.varianceReason && <div className="text-muted">Why the weights do not add up: {record.varianceReason}</div>}
                      {(record.edits ?? []).map((e) => <div key={e.at} className="flex items-start gap-1 text-muted"><PenLine size={12} className="mt-1 shrink-0" /> <span>Weights changed {dateTime(e.at)} by {userName(store, e.by)} ({e.reason}). Before: input {num(e.inputWeight)} kg · {e.outputs.map((o) => `${o.name} ${num(o.weight)} kg`).join(' · ')}</span></div>)}
                      {fixes.map((c) => <div key={c.id} className="flex items-center gap-1 text-muted"><PenLine size={12} /> Corrected {c.output}: {num(c.previous)} → {num(c.corrected)} kg ({c.reason}) · {userName(store, c.correctedBy)}</div>)}
                      <Link href={`/production/batches/${batch.id}/record/${stationId}`} className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-green">Open {stationName(stationId).toLowerCase()} record{batch.status !== 'completed' ? ' to edit' : ''}</Link>
                    </div>
                  )}
                </div>
              </li>
            );
          }
          const ready = isWaiting ? nextInput(batch, stationId) : undefined;
          return (
            <li key={stationId} className={`step-row ${isWaiting ? '' : 'is-later'}`}>
              <span className={`step-icon ${isWaiting ? (batch.status === 'hold' ? 'is-hold' : 'is-next') : 'is-later'}`}>{isWaiting ? (batch.status === 'hold' ? <Pause size={11} /> : <Play size={11} />) : <Circle size={10} />}</span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-[13px]">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{stationName(stationId)}</strong>{isWaiting ? <Badge tone={batch.status === 'hold' ? 'danger' : 'green'}>{batch.status === 'hold' ? 'On hold' : 'Waiting'}</Badge> : <span className="text-[12px] text-faint">{batch.status === 'completed' ? 'not used' : `step ${index + 1} · later`}</span>}</span>
                  {ready && <div className="text-muted">Ready: <strong className="text-ink tabular-nums">{kg(ready.weight)}</strong> {ready.material.toLowerCase()}</div>}
                </div>
                {batch.status === 'active' && (isWaiting || stationById[stationId].form === 'weights') && (isWaiting
                  ? <LinkButton href={`/production/batches/${batch.id}/record/${stationId}`} aria-label={`Record ${stationName(stationId)} weights for ${batchDisplayName(batch)}`}>Record <ArrowRight size={14} /></LinkButton>
                  : <LinkButton variant="ghost" href={`/production/batches/${batch.id}/record/${stationId}?mode=independent`} aria-label={`Enter ${stationName(stationId)} weights early for ${batchDisplayName(batch)}`}>Enter early</LinkButton>)}
              </div>
            </li>
          );
        })}
        {later.length > 0 && (
          <li className="step-row">
            <span className="step-icon is-later"><Circle size={10} /></span>
            <div className="min-w-0 flex-1 text-[13px]">
              <strong className="text-[14px]">May come later</strong>
              <div className="text-muted">{later.map((s) => stationName(s)).join(' · ')}. Which of these the batch reaches depends on where each output is sent.</div>
              {batch.status === 'active' && (showEarly
                ? <div className="mt-2 flex flex-wrap gap-2">{later.filter((s) => stationById[s].form === 'weights').map((s) => <LinkButton key={s} variant="secondary" href={`/production/batches/${batch.id}/record/${s}?mode=independent`} aria-label={`Enter ${stationName(s)} weights early for ${batchDisplayName(batch)}`}>{stationName(s)}</LinkButton>)}</div>
                : <Button variant="secondary" className="mt-2" onClick={() => setShowEarly(true)}>Enter a station early</Button>)}
            </div>
          </li>
        )}
        <JourneyTail batch={batch} />
        <li className="step-row">
          {batch.status === 'completed'
            ? <><span className="step-icon is-done"><Check size={13} /></span><div className="text-[13px]"><strong className="text-[14px]">Completed</strong> <span className="text-muted">· {batch.completedAt && dateTime(batch.completedAt)}{batch.completedBy ? ` by ${userName(store, batch.completedBy)}` : ''}</span>{batch.note && <div className="text-muted">{batch.note}</div>}</div></>
            : <><span className={`step-icon ${batch.nextStation === 'completion' ? 'is-next' : 'is-later'}`}>{batch.nextStation === 'completion' ? <Play size={11} /> : <Circle size={10} />}</span><div className="flex flex-1 flex-wrap items-center justify-between gap-2 text-[13px]"><span><strong className="text-[14px]">Completion</strong> <span className="text-[12px] text-faint">{batch.nextStation === 'completion' ? 'ready' : 'when nothing is waiting'}</span></span>{batch.status === 'active' && batch.nextStation === 'completion' && <LinkButton href={`/production/batches/${batch.id}/record/completion`}>Review & complete <ArrowRight size={14} /></LinkButton>}</div></>}
        </li>
      </ol>
    </Panel>
  );
}

/**
 * Where what the batch made ended up, after its last station: the chocolate made into pieces, the batch
 * number the pieces carry, what was dispatched and to whom, and everything else it kept in store or sold.
 */
function JourneyTail({ batch }: { batch: Batch }) {
  const store = useStore();
  const manager = store.signedInUser?.access === 'manager';
  const made = store.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === batch.id);
  const chocolate = made.filter((l) => l.chocolate);
  const pieces = store.lots.filter((l) => l.pieces && chocolate.some((c) => c.id === l.pieces!.fromLotId));
  const other = made.filter((l) => !l.chocolate && !l.pieces);
  const sentOf = (lotId: string) => store.lots.find((l) => l.id === lotId)?.uses.filter((u) => u.dispatchId) ?? [];
  const where = (dispatchId: string) => { const d = store.dispatches.find((x) => x.id === dispatchId); return d ? customerName(store, d.customerId) : 'a customer'; };
  const toMake = chocolate.filter((l) => l.available > 0.004);
  const inStore = pieces.reduce((n, l) => n + l.available, 0);
  const sent = pieces.reduce((n, l) => n + sentOf(l.id).reduce((t, u) => t + u.quantity, 0), 0);
  const unnumbered = pieces.filter((l) => !l.pieces!.batchNumber);
  if (made.length === 0) return null;

  return (
    <>
      {chocolate.length > 0 && (
        <li className="step-row">
          <span className={`step-icon ${toMake.length ? 'is-next' : 'is-done'}`}>{toMake.length ? <Play size={11} /> : <Check size={13} />}</span>
          <div className="min-w-0 flex-1 text-[13px]">
            <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">Pieces</strong>{toMake.length > 0 ? <Badge tone="green">Chocolate waiting</Badge> : <span className="text-muted">all the chocolate is made into pieces</span>}</span>
            <ul className="mt-1 grid gap-1.5">
              {chocolate.map((c) => (
                <li key={c.id} className="rounded-md bg-paper px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{c.chocolate!.type}</strong> <span className="tabular-nums">{kg(c.received)}</span> <Link href={`/materials/${c.id}`} className="text-[12px] font-semibold text-green">{c.id}</Link>{c.available > 0.004 && <span className="text-muted"> · {kg(c.available)} still to make into pieces</span>}</span>
                    {c.available > 0.004 && <LinkButton href={`/production/pieces/${c.id}`} aria-label={`Record pieces for ${c.id}`}>Record pieces <ArrowRight size={14} /></LinkButton>}
                  </div>
                  {pieces.filter((p) => p.pieces!.fromLotId === c.id).map((p) => (
                    <div key={p.id} className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                      <Package size={12} /> <strong className="text-ink tabular-nums">{p.received}</strong> × {p.pieces!.size} <Link href={`/materials/${p.id}`} className="font-semibold text-green">{p.id}</Link>
                      {p.pieces!.batchNumber ? <span>batch number <strong className="text-ink">{p.pieces!.batchNumber}</strong></span> : <Link href={`/materials/${p.id}`} className="font-semibold text-warn">add the batch number</Link>}
                      <span>· {p.available} in store</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </li>
      )}
      {pieces.length > 0 && (
        <li className="step-row">
          <span className={`step-icon ${inStore > 0 ? 'is-next' : 'is-done'}`}>{inStore > 0 ? <Truck size={12} /> : <Check size={13} />}</span>
          <div className="min-w-0 flex-1 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong className="text-[14px]">Dispatch</strong> <span className="text-muted">· {sent} pieces sent out · {inStore} still in store{unnumbered.length ? ` · ${unnumbered.length} lot${unnumbered.length === 1 ? '' : 's'} without a batch number` : ''}</span></span>
              {manager && inStore > 0 && <LinkButton variant="secondary" href="/dispatch/new"><Truck size={14} /> Dispatch goods</LinkButton>}
            </div>
            {pieces.flatMap((p) => sentOf(p.id).map((u, i) => (
              <div key={`${p.id}-${u.dispatchId}-${i}`} className="text-muted"><Link href={`/dispatch/${u.dispatchId}`} className="font-semibold text-green">{u.dispatchId}</Link> · {u.quantity} × {p.pieces!.type} {p.pieces!.size} to {where(u.dispatchId!)} · {dateTime(u.at)}</div>
            )))}
          </div>
        </li>
      )}
      {other.length > 0 && (
        <li className="step-row">
          <span className="step-icon is-done"><Check size={13} /></span>
          <div className="min-w-0 flex-1 text-[13px]">
            <strong className="text-[14px]">Kept in store or for sale</strong>
            {other.map((l) => (
              <div key={l.id} className="text-muted">
                <Link href={`/trace/${l.id}`} className="font-semibold text-green">{l.id}</Link> · {l.material} <span className="tabular-nums">{kg(l.received)}</span> · {l.available > 0.004 ? `${kg(l.available)} still in store` : 'all used or sent out'}
                {sentOf(l.id).map((u, i) => <span key={i}> · {kg(u.quantity)} to {where(u.dispatchId!)}</span>)}
              </div>
            ))}
          </div>
        </li>
      )}
    </>
  );
}
