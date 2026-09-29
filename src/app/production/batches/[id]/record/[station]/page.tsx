'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Back, Button, Empty, LinkButton, Notice, PageHeader, Panel, inputClass } from '@/components/ui';
import { BatchLabel } from '@/components/BatchLabel';
import { MixingScreen } from '@/components/MixingScreen';
import { piecesByTypeAndSize } from '@/lib/pieces';
import { BalanceVerdict, DestinationSelect, LiveBalance, WeightField, emptyWeight, netWeight, weightFrom, type WeightValue } from '@/components/weighing';
import { calculateBalance, round2 } from '@/lib/balance';
import { batchById, batchDisplayName, defaultDestination, isReadyAt, lastContainerId, nextInput, recordBalance, recordFor, recordStamp, userName, waitingAt } from '@/lib/derive';
import { dateTime, destinationLabel, kg, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { isStationId, stationById, stationName } from '@/lib/stations';
import type { Batch, Destination, OutputKind, Station, StationId, StationRecord } from '@/lib/types';

interface Row { name: string; kind: OutputKind; weight: WeightValue; destination: Destination; custom: boolean }

const eyebrowFor = (batch: Batch, station: Station) => `${station.group} · ${batch.name ? `ID ${batch.id} · ` : ''}${batch.product}`;

export default function RecordPage() {
  const { id, station: stationParam } = useParams<{ id: string; station: string }>();
  const searchParams = useSearchParams();
  const independent = searchParams.get('mode') === 'independent';
  const store = useStore();
  const batch = batchById(store, id);
  if (!batch) return <Empty>Batch {id} was not found.</Empty>;
  if (!isStationId(stationParam)) return <Empty>Unknown station.</Empty>;
  const station = stationById[stationParam];
  const record = recordFor(batch, station.id);

  if (batch.status === 'hold' && !record) {
    return (
      <>
        <Back href={`/production/stations/${station.id}`} label={`${station.name} queue`} />
        <PageHeader eyebrow={eyebrowFor(batch, station)} title={`${station.name} · ${batchDisplayName(batch)} is on hold`} />
        <Notice tone="danger" icon={AlertTriangle}>{batchDisplayName(batch)} is on hold: {batch.holds.find((h) => !h.releasedAt)?.reason} Release the hold from the batch page before recording.</Notice>
        <LinkButton href={`/production/batches/${batch.id}`}>Open batch {batchDisplayName(batch)}</LinkButton>
      </>
    );
  }
  if (batch.status === 'completed' && station.form !== 'completion' && !record) {
    return <><Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} /><Notice tone="neutral">{batchDisplayName(batch)} is completed. Nothing more can be recorded.</Notice></>;
  }
  if (station.form === 'pieces' && !record) {
    return <><Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} /><Notice tone="neutral">Pieces are made from the chocolate lots, not recorded on the batch. <Link href="/production/stations/packaging" className="font-semibold text-green">Open the Pieces queue</Link>.</Notice></>;
  }
  if (station.retired && !record) {
    return <><Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} /><Notice tone="neutral">{station.name} is no longer part of the line. Chocolate is made in mixing runs.</Notice></>;
  }
  if (!record && !isReadyAt(batch, station.id) && (!independent || station.form === 'mixing')) {
    const waiting = waitingAt(batch);
    return (
      <>
        <Back href={`/production/stations/${station.id}`} label={`${station.name} queue`} />
        <PageHeader eyebrow={eyebrowFor(batch, station)} title={`${batchDisplayName(batch)} is not waiting at ${station.name.toLowerCase()}`} subtitle={waiting.length ? `It is waiting at ${waiting.map((s) => stationName(s).toLowerCase()).join(' and ')}.` : 'Nothing is waiting for this batch.'} />
        <div className="flex flex-wrap gap-2">
          {waiting.map((s) => <LinkButton key={s} href={`/production/batches/${batch.id}/record/${s}`}>{s === 'completion' ? 'Review & complete' : `Record ${stationName(s).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>)}
          {station.form === 'weights' && batch.status === 'active' && <LinkButton variant="secondary" href={`/production/batches/${batch.id}/record/${station.id}?mode=independent`}>Enter {station.name.toLowerCase()} early</LinkButton>}
        </div>
      </>
    );
  }

  if (station.form === 'completion') return <CompletionScreen batch={batch} />;
  if (station.form === 'mixing') return <MixingScreen batch={batch} station={station} record={record} />;
  return <StationScreen key={`${batch.id}-${station.id}-${independent ? 'early' : 'flow'}`} batch={batch} station={station} record={record} independent={independent} justCreated={searchParams.get('saved') === '1'} />;
}

/** Shows the saved result, or the form while a station is being entered or edited */
function StationScreen({ batch, station, record, independent, justCreated }: { batch: Batch; station: Station; record?: StationRecord; independent: boolean; justCreated: boolean }) {
  const readOnly = station.retired || station.form === 'pieces';
  const [editing, setEditing] = useState((!record || !record.destinationsSaved) && !readOnly);
  const [justSaved, setJustSaved] = useState(justCreated);
  if (record && !editing) return <SavedView batch={batch} station={station} record={record} independent={independent} justSaved={justSaved} onEdit={readOnly ? undefined : () => { setEditing(true); setJustSaved(false); }} />;
  return (
    <StationForm batch={batch} station={station} record={record} independent={independent}
      onSaved={() => { setEditing(false); setJustSaved(true); window.scrollTo({ top: 0 }); }}
      onShowSaved={() => { setEditing(false); setJustSaved(false); window.scrollTo({ top: 0 }); }}
      onCancel={record?.destinationsSaved ? () => setEditing(false) : undefined} />
  );
}

/** One screen per station: confirm the input, weigh each output (with where it goes), save once */
function StationForm({ batch, station, record, independent, onSaved, onShowSaved, onCancel }: { batch: Batch; station: Station; record?: StationRecord; independent: boolean; onSaved: () => void; onShowSaved: () => void; onCancel?: () => void }) {
  const store = useStore();
  // The saved state this form was opened on. Other devices' saves arrive while it is open; the server
  // refuses to overwrite them, and the form says so as soon as it sees one.
  const [startedFrom] = useState(() => recordStamp(batch, station.id));
  const changedElsewhere = recordStamp(batch, station.id) !== startedFrom;
  const containers = store.containers;
  const ready = nextInput(batch, station.id);
  const [input, setInput] = useState<WeightValue>(() => record ? weightFrom(record.inputWeight, record.inputContainer, containers) : !independent && ready.weight > 0 ? { reading: String(ready.weight), containerId: '' } : emptyWeight);
  const [changingInput, setChangingInput] = useState(independent || (!record && ready.weight <= 0) || !!record?.inputContainer);
  const [rows, setRows] = useState<Row[]>(() => {
    const configured = store.outputCategories.filter((c) => c.station === station.id);
    const saved = new Map((record?.outputs ?? []).map((o) => [o.name, o]));
    const names = new Set(configured.map((c) => c.name));
    return [
      ...configured.map((c, i): Row => {
        const was = saved.get(c.name);
        return {
          name: c.name, kind: c.kind, custom: false,
          weight: was ? weightFrom(was.weight, was.container, containers) : { reading: '', containerId: lastContainerId(store, station.id, c.name) },
          destination: was?.destination ?? defaultDestination(station.id, c.name, c.kind, i),
        };
      }),
      ...(record?.outputs ?? []).filter((o) => !names.has(o.name)).map((o): Row => ({ name: o.name, kind: o.kind, custom: true, weight: weightFrom(o.weight, o.container, containers), destination: o.destination })),
    ];
  });
  const [note, setNote] = useState(record?.note ?? '');
  const [showNote, setShowNote] = useState(Boolean(record?.note));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const inputNet = netWeight(input, containers);
  const nets = rows.map((r) => netWeight(r.weight, containers));
  const balance = calculateBalance(inputNet.net, rows.map((r, i) => ({ kind: r.kind, weight: nets[i].net })));
  const limit = store.thresholds.variancePct[station.id] ?? 0;
  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || changedElsewhere) return;
    setError('');
    if (!(inputNet.net > 0)) { setChangingInput(true); return setError('Enter the input weight.'); }
    const options = independent ? { advanceWorkflow: false, inputMaterial: station.input } : undefined;
    const outputs = rows.map((r, i) => ({ name: r.name.trim() || 'Other output', kind: r.kind, weight: nets[i].net, destination: r.destination, container: nets[i].container })).filter((o) => o.weight > 0);
    if (outputs.length === 0) return setError('Enter at least one weight.');
    setSaving(true);
    const saved = await store.saveRecord(batch.id, station.id, { weight: inputNet.net, container: inputNet.container }, outputs, note || undefined, options, startedFrom);
    setSaving(false);
    // On failure the weights stay on screen; the reason is shown at the top.
    if (saved) onSaved();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <form onSubmit={save} noValidate>
      <Back href={independent ? `/production/batches/${batch.id}` : `/production/stations/${station.id}`} label={independent ? `Batch ${batchDisplayName(batch)}` : `${station.name} queue`} />
      <PageHeader eyebrow={`${independent ? 'Early entry · ' : ''}${eyebrowFor(batch, station)}`} title={`${station.name} · ${batchDisplayName(batch)}`} subtitle={station.help} />
      {record && !record.destinationsSaved && <Notice tone="warn" icon={AlertTriangle}>This entry was not finished. Check the weights and save.</Notice>}
      {independent && <Notice tone="neutral">Saved against {batchDisplayName(batch)} without changing where the batch is waiting. Enter the reading from this process’s scale log.</Notice>}

      <section className="input-card" aria-label="Input">
        <div className="input-card-label">Input</div>
        {!changingInput ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><strong className="text-[22px] tabular-nums">{kg(inputNet.net)}</strong> <span className="text-muted">{(record?.inputMaterial ?? ready.material).toLowerCase()}</span></div>
            <Button variant="secondary" onClick={() => setChangingInput(true)}>Reweighed? Change</Button>
          </div>
        ) : (
          <div>
            <p className="mb-2 text-[13px] text-muted">{independent ? 'Enter the scale reading for this process.' : ready.weight > 0 ? `${kg(ready.weight)} ${ready.material.toLowerCase()} was sent here. Enter the new scale reading.` : 'Nothing was sent here. Enter the weight you are starting with.'}</p>
            <WeightField value={input} onChange={setInput} containers={containers} label="Input weight" autoFocus />
          </div>
        )}
      </section>

      <Panel title="Weigh the outputs" subtitle="Leave a row empty if there was none. If you weigh in a container, pick it and its empty weight is taken off. Each output shows where it goes; tap to change.">
        {rows.map((row, index) => {
          const label = row.custom ? `Output ${index + 1}` : row.name;
          return (
            <div key={index} className="weigh-row">
              <div className="weigh-row-head">
                {row.custom ? (
                  <span className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <input className={`${inputClass} min-w-[140px] flex-1`} placeholder="Output name" value={row.name} onChange={(e) => update(index, { name: e.target.value })} aria-label={`${label} name`} />
                    <select className={`${inputClass} w-auto`} value={row.kind} onChange={(e) => update(index, { kind: e.target.value as OutputKind })} aria-label={`${label} type`}>
                      <option value="useful">Good output</option><option value="byproduct">By-product</option><option value="waste">Waste</option>
                    </select>
                    <button type="button" className="icon-button" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Remove output"><Trash2 size={18} /></button>
                  </span>
                ) : (
                  <span className="weigh-row-name">{row.name}{row.kind === 'waste' && <span className="kind-tag">waste</span>}</span>
                )}
                <DestinationSelect station={station} value={row.destination} onChange={(destination) => update(index, { destination })} label={label} />
              </div>
              <WeightField value={row.weight} onChange={(weight) => update(index, { weight })} containers={containers} label={row.custom ? `${label} weight` : row.name} autoFocus={index === 0 && !changingInput && !record} />
            </div>
          );
        })}
        <button type="button" className="add-row" onClick={() => setRows([...rows, { name: '', kind: 'useful', weight: emptyWeight, destination: defaultDestination(station.id, '', 'useful', rows.length), custom: true }])}><Plus size={16} /> Add another output</button>
      </Panel>

      {showNote
        ? <Panel title="Note"><div className="p-5"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything unusual at this station?" aria-label="Note" autoFocus={!record?.note} /></div></Panel>
        : <button type="button" className="add-note" onClick={() => setShowNote(true)}><Plus size={15} /> Add a note</button>}

      <div className="save-bar">
        <LiveBalance balance={balance} limit={limit} wasteLimit={store.thresholds.wastePct} />
        {error && !changedElsewhere && <div className="save-bar-error" role="alert">{error}</div>}
        {changedElsewhere && (
          <div className="save-bar-error" role="alert">
            {station.name} for {batchDisplayName(batch)} was just saved on another device while you were entering weights. Yours are not saved.{' '}
            <button type="button" className="btn-text" onClick={onShowSaved}>See the saved weights</button>
          </div>
        )}
        <div className="flex gap-2">
          {onCancel && !changedElsewhere && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" className="flex-1" disabled={saving || changedElsewhere}><Check size={16} /> {saving ? 'Saving…' : `Save ${station.name.toLowerCase()}`}</Button>
        </div>
      </div>
    </form>
  );
}

/** After saving: what happens next comes first, then the result in one line, then the details */
function SavedView({ batch, station, record, independent, justSaved, onEdit }: { batch: Batch; station: Station; record: StationRecord; independent: boolean; justSaved: boolean; onEdit?: () => void }) {
  const store = useStore();
  const fresh = batchById(store, batch.id) ?? batch;
  const waiting = waitingAt(fresh);
  const next = fresh.nextStation;
  const others = waiting.filter((s) => s !== next);
  const sent = record.outputs.filter((o) => o.destination.startsWith('continue:'));
  const limit = store.thresholds.variancePct[station.id] ?? 0;

  return (
    <>
      <Back href={`/production/stations/${station.id}`} label={`${station.name} queue`} />
      <PageHeader eyebrow={eyebrowFor(fresh, station)} title={`${station.name} · ${batchDisplayName(fresh)}`} subtitle={`Recorded ${dateTime(record.recordedAt)} by ${userName(store, record.recordedBy)}`} />
      {justSaved && (
        <div className="saved-banner" role="status">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{station.name} saved.</strong>{' '}
              {record.packaging ? `${record.packaging.acceptedUnits} accepted units ready. ` : ''}
              {sent.length > 0 && `Sent on: ${sent.map((o) => `${kg(o.weight)} ${o.name.toLowerCase()} to ${stationName(o.destination.slice(9) as StationId).toLowerCase()}`).join(' · ')}. `}
              {independent ? `The batch still waits at ${waiting.map((s) => stationName(s).toLowerCase()).join(' and ') || 'no station'}.` : next === 'completion' && others.length === 0 ? 'Nothing else is waiting. Complete the batch.' : ''}
            </div>
          </div>
          {fresh.status === 'active' && !independent && (next || others.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {next && <LinkButton href={`/production/batches/${fresh.id}/record/${next}`}>{next === 'completion' ? 'Review & complete batch' : `Record ${stationName(next).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>}
              {others.map((s) => <LinkButton key={s} variant="secondary" href={`/production/batches/${fresh.id}/record/${s}`}>{stationName(s)} also waiting</LinkButton>)}
            </div>
          )}
        </div>
      )}

      <BalanceVerdict balance={recordBalance(record)} limit={limit} wasteLimit={store.thresholds.wastePct} />

      <Panel title={record.packaging ? 'Packaging' : 'What was weighed'} subtitle={`Input ${kg(record.inputWeight)} ${record.inputMaterial.toLowerCase()}${record.inputContainer ? ` (${kg(record.inputContainer.gross)} on the scale − ${kg(record.inputContainer.tare)} ${record.inputContainer.name.toLowerCase()})` : ''}`}>
        {record.packaging && <div className="border-b border-line px-5 py-3 text-[13px]">{store.packSizes.find((p) => p.id === record.packaging!.packSizeId)?.name}: {record.packaging.totalUnits} made, {record.packaging.rejectedUnits} rejected, <strong>{record.packaging.acceptedUnits} accepted</strong></div>}
        {record.outputs.map((o) => (
          <div key={o.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3 last:border-b-0">
            <span>
              <strong>{o.name}</strong> <span className="tabular-nums">{record.packaging ? `${o.name === 'Accepted units' ? record.packaging.acceptedUnits : record.packaging.rejectedUnits} units` : kg(o.weight)}</span>
              {o.container && <span className="block text-[12px] text-muted">{kg(o.container.gross)} on the scale − {kg(o.container.tare)} {o.container.name.toLowerCase()}</span>}
            </span>
            <span className="text-[13px]">{destinationLabel(o.destination, (s) => stationName(s as StationId))}{o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">lot {o.lotId}</Link></>}</span>
          </div>
        ))}
        {record.note && <div className="border-t border-line px-5 py-3 text-[13px] text-muted">Note: {record.note}</div>}
      </Panel>

      {station.id === 'grinding' && record.outputs.filter((o) => o.name === 'Liquor').map((o) => (
        <BatchLabel key={o.name} title="Liquor label" batch={fresh} material="Cocoa liquor" quantity={kg(o.weight)} madeAt={record.recordedAt} lotId={o.lotId} />
      ))}
      {station.id === 'receiving' && <BatchLabel title="Batch card" batch={fresh} material={fresh.product} quantity={kg(fresh.startInput.weight)} madeAt={fresh.startedAt} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href={`/production/batches/${fresh.id}`}>View batch {batchDisplayName(fresh)}</LinkButton>
          <LinkButton variant="ghost" href="/work">My work</LinkButton>
        </div>
        {fresh.status !== 'completed' && onEdit && <Button variant="secondary" onClick={onEdit}><Pencil size={14} /> Edit weights</Button>}
      </div>
    </>
  );
}

function CompletionScreen({ batch }: { batch: Batch }) {
  const store = useStore();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const packaging = batch.records.find((r) => r.packaging)?.packaging;
  const lots = store.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === batch.id);
  const totalMissing = round2(batch.records.reduce((sum, r) => sum + recordBalance(r).variance, 0));
  const pending = batch.records.filter((r) => !r.destinationsSaved);
  const finalUseful = batch.records.at(-1) ? recordBalance(batch.records.at(-1)!).useful : 0;
  // Chocolate made at mixing, added up by type
  const madeByType = new Map<string, number>();
  for (const run of recordFor(batch, 'mixing')?.runs ?? []) madeByType.set(run.type, round2((madeByType.get(run.type) ?? 0) + run.made));

  return (
    <>
      <Back href="/production/stations/completion" label="Completion queue" />
      <PageHeader eyebrow={`Batch ${batch.id}`} title={batch.status === 'completed' ? `${batchDisplayName(batch)} is completed` : 'Review and complete the batch'} subtitle={<>{batch.product} · ID {batch.id}</>} />
      {batch.status === 'completed' && <Notice tone="green" icon={CheckCircle2}>Completed {batch.completedAt?.replace('T', ' ').slice(0, 16)}. The record is closed; corrections stay available on the batch page.</Notice>}
      {pending.length > 0 && <Notice tone="warn" icon={AlertTriangle}>{pending.map((r) => stationName(r.station)).join(', ')} was not finished. Open it and save before completing the batch.</Notice>}
      <Panel title="Stations recorded">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-bold tracking-wide text-faint uppercase"><th className="px-5 py-2">Station</th><th className="px-4 py-2 text-right">In</th><th className="px-4 py-2 text-right">Good output</th><th className="px-4 py-2 text-right">Waste / by-product</th><th className="px-5 py-2 text-right">Missing</th></tr></thead>
            <tbody>
              {batch.records.map((r) => { const b = recordBalance(r); return (
                <tr key={r.id} className="border-b border-line last:border-b-0"><td className="px-5 py-2 font-medium">{stationName(r.station)}</td><td className="px-4 py-2 text-right tabular-nums">{kg(b.input)}</td><td className="px-4 py-2 text-right tabular-nums">{kg(b.useful)}</td><td className="px-4 py-2 text-right tabular-nums">{kg(b.recordedWaste)}</td><td className="px-5 py-2 text-right tabular-nums">{kg(b.variance)} ({pct(b.variancePct)})</td></tr>
              ); })}
              {batch.records.length === 0 && <tr><td colSpan={5}><Empty>Nothing recorded yet.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Finished quantities">
        <div className="grid gap-2 p-5 text-[13px] sm:grid-cols-2">
          {batch.startInput.weight > 0 && <div className="flex justify-between"><span className="text-muted">Starting input</span><strong className="tabular-nums">{kg(batch.startInput.weight)}</strong></div>}
          {madeByType.size === 0 && <div className="flex justify-between"><span className="text-muted">Last good output</span><strong className="tabular-nums">{kg(finalUseful)}</strong></div>}
          {Array.from(madeByType, ([type, made]) => <div key={type} className="flex justify-between"><span className="text-muted">{type} made</span><strong className="tabular-nums">{kg(made)}</strong></div>)}
          {piecesByTypeAndSize(lots).map((t) => <div key={`${t.type}-${t.size}`} className="flex justify-between"><span className="text-muted">{t.type} · {t.size}</span><strong className="tabular-nums">{t.pieces} pieces</strong></div>)}
          <div className="flex justify-between"><span className="text-muted">Total missing weight</span><strong className="tabular-nums">{kg(totalMissing)}</strong></div>
          {packaging && <div className="flex justify-between"><span className="text-muted">Accepted units</span><strong className="tabular-nums">{packaging.acceptedUnits} × {packaging.packGrams} g</strong></div>}
          {packaging && <div className="flex justify-between"><span className="text-muted">Rejected units</span><strong className="tabular-nums">{packaging.rejectedUnits}</strong></div>}
        </div>
        {lots.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-[13px]">
            <span className="text-muted">Lots made by this batch: </span>
            {lots.map((l, i) => <span key={l.id}>{i > 0 && ', '}<Link href={`/materials/${l.id}`} className="font-semibold text-green">{l.id}</Link> ({l.material}, {l.received} {l.unit})</span>)}
          </div>
        )}
      </Panel>
      {batch.status !== 'completed' && (
        <>
          <Panel title="Closing note (optional)"><div className="p-5"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Closing note" placeholder="Anything to remember about this batch?" /></div></Panel>
          <div className="flex flex-wrap justify-between gap-2">
            <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Back to batch</LinkButton>
            <Button disabled={pending.length > 0 || batch.status === 'hold' || saving} onClick={async () => { setSaving(true); const ok = await store.completeBatch(batch.id, note); setSaving(false); if (ok) router.push(`/production/batches/${batch.id}`); }}><Check size={15} /> {saving ? 'Completing…' : 'Complete batch'}</Button>
          </div>
        </>
      )}
      {batch.status === 'completed' && <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>View batch record</LinkButton>}
    </>
  );
}
