'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, Circle, Pause, PenLine, Pencil, Play, Trash2 } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { batchAlerts, batchById, batchDisplayName, nextInput, recordBalance, userName } from '@/lib/derive';
import { dateTime, destinationLabel, kg, kindLabel, num, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationById, stationName } from '@/lib/stations';
import type { StationId } from '@/lib/types';

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const batch = batchById(store, id);
  const [panel, setPanel] = useState<'hold' | 'release' | 'correction' | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState({ recordId: '', output: '', weight: '' });
  if (!batch) return <Empty>Batch {id} was not found.</Empty>;

  const alerts = batchAlerts(store, batch);
  const activeHold = batch.holds.find((h) => !h.releasedAt);
  const ready = nextInput(batch);

  // Upcoming stations: follow the default path from the next station until completion.
  const upcoming: StationId[] = [];
  let cursor = batch.nextStation ? stationById[batch.nextStation].next[0] : undefined;
  while (cursor && upcoming.length < 12) { upcoming.push(cursor); cursor = stationById[cursor].next[0]; }

  const correctable = batch.records.flatMap((r) => r.outputs.map((o) => ({ recordId: r.id, station: r.station, output: o.name, weight: o.weight })));
  const canDelete = batch.records.length === 0 && batch.holds.length === 0 && batch.corrections.length === 0 && !store.lots.some((lot) => lot.source.type === 'batch' && lot.source.batchId === batch.id);

  function submitHold(event: FormEvent) {
    event.preventDefault();
    if (panel === 'hold') store.placeHold(batch!.id, reason);
    if (panel === 'release') store.releaseHold(batch!.id, reason);
    setPanel(null); setReason('');
  }
  function submitCorrection(event: FormEvent) {
    event.preventDefault();
    const target = correctable.find((c) => c.recordId === correction.recordId && c.output === correction.output) ?? correctable[0];
    if (!target || !(Number(correction.weight) >= 0)) return;
    store.addCorrection(batch!.id, target.recordId, target.output, Number(correction.weight), reason);
    setPanel(null); setReason(''); setCorrection({ recordId: '', output: '', weight: '' });
  }

  const statusBadge = batch.status === 'completed' ? <Badge tone="green">Completed</Badge> : batch.status === 'hold' ? <Badge tone="danger">On hold</Badge> : <Badge tone="green">In progress</Badge>;

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow={`Batch ${batch.id}`} title={`${batchDisplayName(batch)} · ${batch.product}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{statusBadge}<span>ID {batch.id}</span><span>Started {dateTime(batch.startedAt)}</span>{batch.recipeId && <span>· Recipe {batch.recipeId} v{batch.recipeVersion}</span>}</span>}
        action={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setEditingDetails((value) => !value)}><Pencil size={14} /> Edit details</Button><Button variant="danger" disabled={!canDelete} title={canDelete ? 'Delete blank batch' : 'Batches with history cannot be deleted.'} onClick={() => { if (canDelete && window.confirm(`Delete blank batch ${batch.id}?`)) { store.deleteBatch(batch.id); router.push('/production'); } }}><Trash2 size={14} /> Delete</Button>{batch.status === 'active' && batch.nextStation ? <LinkButton href={`/production/batches/${batch.id}/record/${batch.nextStation}`}>{batch.nextStation === 'completion' ? 'Review & complete' : `Record ${stationName(batch.nextStation).toLowerCase()}`} <ArrowRight size={15} /></LinkButton> : null}</div>} />

      {activeHold && <Notice tone="danger" icon={Pause}><strong>On hold</strong> since {dateTime(activeHold.placedAt)} by {userName(store, activeHold.placedBy)}: {activeHold.reason}</Notice>}
      {alerts.filter((a) => a.kind !== 'hold').map((a) => <Notice key={a.id} tone="warn" icon={AlertTriangle}>{a.message}</Notice>)}
      {!canDelete && batch.records.length > 0 && <Notice tone="neutral">This batch has production history. Its identity and recorded history stay protected; use corrections for measured-output changes.</Notice>}

      {editingDetails && <Panel title="Edit batch details" subtitle="These are descriptive fields only. Measurements, holds and corrections remain audit-protected.">
        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); store.updateBatchDetails(batch.id, { name: String(form.get('name')), note: String(form.get('note')) }); setEditingDetails(false); }}>
          <Field label="Batch name"><Input name="name" defaultValue={batch.name ?? ''} placeholder={batch.id} /></Field>
          <Field label="Note" className="md:col-span-2"><Textarea name="note" defaultValue={batch.note ?? ''} rows={2} placeholder="Optional production note" /></Field>
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setEditingDetails(false)}>Cancel</Button><Button type="submit">Save changes</Button></div>
        </form>
      </Panel>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <Panel title="Batch timeline" subtitle="Completed stations, what is next, and what remains.">
            <ol className="px-5 py-2">
              <li className="flex gap-3 py-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-moss text-green"><Check size={13} /></span>
                <div className="text-[13px]">
                  <strong>Started</strong> <span className="text-muted">· {dateTime(batch.startedAt)}</span>
                  <div className="text-muted">{batch.startInput.material}: <strong className="text-ink tabular-nums">{kg(batch.startInput.weight)}</strong>{batch.startInput.lotIds.length > 0 && <> from {batch.startInput.lotIds.map((l, i) => <span key={l}>{i > 0 && ', '}<Link href={`/materials/${l}`} className="font-semibold text-green">{l}</Link></span>)}</>}</div>
                </div>
              </li>
              {batch.records.map((record) => {
                const balance = recordBalance(record);
                const limit = store.thresholds.variancePct[record.station];
                const over = Math.abs(balance.variancePct) > limit;
                const fixes = batch.corrections.filter((c) => c.recordId === record.id);
                return (
                  <li key={record.id} className="flex gap-3 border-t border-line py-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green text-white"><Check size={13} /></span>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{stationName(record.station)}</strong><span className="text-muted">{dateTime(record.recordedAt)} · {userName(store, record.recordedBy)}</span>{!record.destinationsSaved && <Badge tone="warn">Destinations not saved</Badge>}</div>
                      <div className="text-muted">Input {record.inputMaterial.toLowerCase()} <strong className="text-ink tabular-nums">{kg(record.inputWeight)}</strong> → measured <strong className="text-ink tabular-nums">{kg(balance.measured)}</strong></div>
                      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                        {record.outputs.map((o) => (
                          <li key={o.name} className="rounded-md bg-paper px-2.5 py-1.5">
                            <span className="flex justify-between gap-2"><span>{o.name} <span className="text-[11px] text-faint">{kindLabel[o.kind]}</span></span><strong className="tabular-nums">{record.station === 'packaging' && record.packaging ? (o.name === 'Accepted units' ? `${record.packaging.acceptedUnits} units` : `${record.packaging.rejectedUnits} units`) : kg(o.weight)}</strong></span>
                            <span className="block text-[11px] text-muted">→ {destinationLabel(o.destination, (s) => stationName(s as StationId))}{o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">{o.lotId}</Link></>}</span>
                          </li>
                        ))}
                      </ul>
                      <div className={`mt-1.5 ${over ? 'text-warn' : 'text-muted'}`}>Variance {kg(balance.variance)} ({pct(balance.variancePct)}){over ? ` · above ${limit}% limit` : ''} · yield {pct(balance.yieldPct)} · waste {pct(balance.wastePct)}</div>
                      {record.note && <div className="mt-1 text-muted">Note: {record.note}</div>}
                      {fixes.map((c) => <div key={c.id} className="mt-1 flex items-center gap-1 text-muted"><PenLine size={12} /> Corrected {c.output}: {num(c.previous)} → {num(c.corrected)} kg ({c.reason})</div>)}
                      <Link href={`/production/batches/${batch.id}/record/${record.station}`} className="mt-1 inline-block text-[12px] font-semibold text-green">Open {stationName(record.station).toLowerCase()} record</Link>
                    </div>
                  </li>
                );
              })}
              {batch.nextStation && (
                <li className="flex gap-3 border-t border-line py-3">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${batch.status === 'hold' ? 'border-danger text-danger' : 'border-green text-green'}`}>{batch.status === 'hold' ? <Pause size={11} /> : <Play size={11} />}</span>
                  <div className="text-[13px]">
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{stationName(batch.nextStation)}</strong><Badge tone={batch.status === 'hold' ? 'danger' : 'green'}>{batch.status === 'hold' ? 'On hold' : 'Next step'}</Badge></div>
                    {batch.nextStation !== 'completion' && <div className="text-muted">Input ready: <strong className="text-ink tabular-nums">{kg(ready.weight)}</strong> {ready.material.toLowerCase()}</div>}
                    {batch.status === 'active' && <LinkButton className="mt-2" href={`/production/batches/${batch.id}/record/${batch.nextStation}`}>{batch.nextStation === 'completion' ? 'Review & complete' : `Record ${stationName(batch.nextStation).toLowerCase()}`} <ArrowRight size={14} /></LinkButton>}
                  </div>
                </li>
              )}
              {upcoming.map((s) => (
                <li key={s} className="flex gap-3 border-t border-line py-2.5 text-[13px] text-faint">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center"><Circle size={12} /></span>
                  <span>{stationName(s)} <span className="text-[11px]">· later</span></span>
                </li>
              ))}
              {batch.status === 'completed' && (
                <li className="flex gap-3 border-t border-line py-3 text-[13px]"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green text-white"><Check size={13} /></span><div><strong>Completed</strong> <span className="text-muted">· {batch.completedAt && dateTime(batch.completedAt)}</span>{batch.note && <div className="text-muted">{batch.note}</div>}</div></li>
              )}
            </ol>
          </Panel>
        </div>

        <div>
          <Panel title="Actions">
            <div className="flex flex-wrap gap-2 p-4">
              {batch.status === 'active' && <Button variant="secondary" onClick={() => setPanel(panel === 'hold' ? null : 'hold')}><Pause size={14} /> Put on hold</Button>}
              {batch.status === 'hold' && <Button variant="secondary" onClick={() => setPanel(panel === 'release' ? null : 'release')}><Play size={14} /> Release hold</Button>}
              {batch.records.length > 0 && <Button variant="secondary" onClick={() => setPanel(panel === 'correction' ? null : 'correction')}><PenLine size={14} /> Add correction</Button>}
            </div>
            {(panel === 'hold' || panel === 'release') && (
              <form onSubmit={submitHold} className="border-t border-line p-4">
                <Field label={panel === 'hold' ? 'Why is the batch on hold?' : 'Release note'}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required aria-label={panel === 'hold' ? 'Hold reason' : 'Release note'} /></Field>
                <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPanel(null)}>Cancel</Button><Button type="submit">{panel === 'hold' ? 'Place hold' : 'Release'}</Button></div>
              </form>
            )}
            {panel === 'correction' && (
              <form onSubmit={submitCorrection} className="grid gap-3 border-t border-line p-4">
                <Field label="Recorded output">
                  <Select value={`${correction.recordId}|${correction.output}`} onChange={(e) => { const [recordId, output] = e.target.value.split('|'); const t = correctable.find((c) => c.recordId === recordId && c.output === output); setCorrection({ recordId, output, weight: t ? String(t.weight) : '' }); }} aria-label="Recorded output">
                    <option value="|">Choose an output</option>
                    {correctable.map((c) => <option key={`${c.recordId}|${c.output}`} value={`${c.recordId}|${c.output}`}>{stationName(c.station)} · {c.output} ({num(c.weight)} kg)</option>)}
                  </Select>
                </Field>
                <Field label="Corrected weight"><UnitInput unit="kg" value={correction.weight} onChange={(e) => setCorrection({ ...correction, weight: e.target.value })} aria-label="Corrected weight" required /></Field>
                <Field label="Reason"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Correction reason" /></Field>
                <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPanel(null)}>Cancel</Button><Button type="submit" disabled={!correction.recordId}>Save correction</Button></div>
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

          {batch.corrections.length > 0 && (
            <Panel title="Corrections">
              {batch.corrections.map((c) => <div key={c.id} className="border-b border-line px-4 py-2.5 text-[13px] last:border-b-0"><div>{stationName(c.station)} · {c.output}: {num(c.previous)} → {num(c.corrected)} kg</div><div className="text-[12px] text-muted">{c.reason} · {dateTime(c.correctedAt)} · {userName(store, c.correctedBy)}</div></div>)}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
