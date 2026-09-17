'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, LinkButton, Notice, PageHeader, Panel, Select, UnitInput, inputClass } from '@/components/ui';
import { calculateBalance, calculatePackaging, round2 } from '@/lib/balance';
import { batchById, batchDisplayName, nextInput, recordBalance, recordFor } from '@/lib/derive';
import { destinationLabel, kg, kindLabel, num, pct } from '@/lib/format';
import { useStore } from '@/lib/store';
import { isStationId, stationById, stationName } from '@/lib/stations';
import type { Balance, Batch, Destination, OutputKind, Station, StationId, StationRecord } from '@/lib/types';

type Step = 'input' | 'outputs' | 'destinations' | 'done';
interface Row { name: string; kind: OutputKind; weight: string; custom: boolean }

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
        <Back href={`/production/stations/${station.id}`} label={station.name} />
        <PageHeader eyebrow={`Batch ${batch.id}`} title={`${station.name} · ${batchDisplayName(batch)} is on hold`} />
        <Notice tone="danger" icon={AlertTriangle}>{batchDisplayName(batch)} is on hold: {batch.holds.find((h) => !h.releasedAt)?.reason} Release the hold from the batch page before recording.</Notice>
        <LinkButton href={`/production/batches/${batch.id}`}>Open batch {batchDisplayName(batch)}</LinkButton>
      </>
    );
  }
  if (batch.status === 'completed' && station.form !== 'completion' && !record) {
    return <><Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} /><Notice tone="neutral">{batchDisplayName(batch)} is completed. Nothing more can be recorded.</Notice></>;
  }
  if (!record && batch.nextStation !== station.id && !independent) {
    return (
      <>
        <Back href={`/production/stations/${station.id}`} label={station.name} />
        <PageHeader eyebrow={`Batch ${batch.id}`} title={`${batchDisplayName(batch)} is not at ${station.name.toLowerCase()}`} subtitle={`Its next step is ${stationName(batch.nextStation).toLowerCase()}.`} />
        <LinkButton href={`/production/batches/${batch.id}/record/${batch.nextStation}`}>Record {stationName(batch.nextStation).toLowerCase()} <ArrowRight size={15} /></LinkButton>
      </>
    );
  }

  if (station.form === 'completion') return <CompletionScreen batch={batch} />;
  return <StationForm key={`${batch.id}-${station.id}-${independent ? 'independent' : 'flow'}`} batch={batch} station={station} record={record} independent={independent} />;
}

function StationForm({ batch, station, record, independent }: { batch: Batch; station: Station; record?: StationRecord; independent: boolean }) {
  const store = useStore();
  const router = useRouter();
  const ready = nextInput(batch);
  const [step, setStep] = useState<Step>(record ? (record.destinationsSaved ? 'done' : 'destinations') : 'input');
  const [inputWeight, setInputWeight] = useState(String(record?.inputWeight ?? (independent ? '' : ready.weight)));
  const [adjusting, setAdjusting] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => {
    const configured = store.outputCategories.filter((c) => c.station === station.id);
    const existing = new Map((record?.outputs ?? []).map((output) => [output.name, output]));
    const configuredNames = new Set(configured.map((category) => category.name));
    return [
      ...configured.map((category) => ({ name: category.name, kind: category.kind, weight: existing.get(category.name) ? String(existing.get(category.name)!.weight) : '', custom: false })),
      ...(record?.outputs ?? []).filter((output) => !configuredNames.has(output.name)).map((output) => ({ name: output.name, kind: output.kind, weight: String(output.weight), custom: true })),
    ];
  });
  const [pack, setPack] = useState(() => record?.packaging
    ? { packSizeId: record.packaging.packSizeId, totalUnits: String(record.packaging.totalUnits), rejectedUnits: String(record.packaging.rejectedUnits) }
    : { packSizeId: store.packSizes[0]?.id ?? '', totalUnits: '', rejectedUnits: '0' });
  const [note, setNote] = useState(record?.note ?? '');
  const [destinations, setDestinations] = useState<Record<string, Destination>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (record) setDestinations(Object.fromEntries(record.outputs.map((o) => [o.name, o.destination])));
  }, [record]);

  const input = Number(inputWeight) || 0;
  const measured = useMemo(() => calculateBalance(input, rows.map((r) => ({ kind: r.kind, weight: Number(r.weight) || 0 }))), [input, rows]);
  const packCalc = calculatePackaging(Number(pack.totalUnits) || 0, Number(pack.rejectedUnits) || 0, store.packSizes.find((p) => p.id === pack.packSizeId)?.grams ?? 0);
  const limit = store.thresholds.variancePct[station.id];

  function saveMeasurements(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!(input > 0)) return setError('Confirm the input weight first.');
    if (station.form === 'packaging') {
      const total = Number(pack.totalUnits), rejected = Number(pack.rejectedUnits) || 0;
      if (!(total > 0)) return setError('Enter the total units made.');
      if (rejected > total) return setError('Rejected units cannot be more than the total made.');
      store.savePackaging(batch.id, input, pack.packSizeId, total, rejected, note || undefined, independent ? { advanceWorkflow: false, inputMaterial: station.input } : undefined);
    } else {
      const outputs = rows.filter((r) => Number(r.weight) > 0).map((r) => ({ name: r.name.trim() || 'Other output', kind: r.kind, weight: Number(r.weight) }));
      if (outputs.length === 0) return setError('Enter at least one measured weight.');
      store.saveMeasurements(batch.id, station.id, input, outputs, note || undefined, independent ? { advanceWorkflow: false, inputMaterial: station.input } : undefined);
    }
    setStep('destinations');
    window.scrollTo({ top: 0 });
  }

  function saveDestinations() {
    if (!record) return;
    store.saveDestinations(batch.id, record.id, destinations, independent ? { advanceWorkflow: false } : undefined);
    setStep('done');
    window.scrollTo({ top: 0 });
  }

  const summary = (
    <div className="grid gap-x-6 gap-y-2 rounded-xl border border-line bg-white px-5 py-4 text-[14px] sm:grid-cols-3">
      <div><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">Batch</span><strong>{batchDisplayName(batch)}</strong>{batch.name && <span className="ml-2 text-[11px] text-muted">ID {batch.id}</span>} <span className="text-muted">{batch.product}</span></div>
      <div><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">Input material</span>{record?.inputMaterial ?? (independent ? station.input : ready.material)}</div>
      <div><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">Input weight</span><strong className="tabular-nums">{kg(record?.inputWeight ?? input)}</strong></div>
    </div>
  );

  return (
    <>
      <Back href={independent ? `/production/batches/${batch.id}` : `/production/stations/${station.id}`} label={independent ? `Batch ${batchDisplayName(batch)}` : `${station.name} queue`} />
      <PageHeader eyebrow={`${independent ? 'Independent entry · ' : ''}Step ${['input', 'outputs', 'destinations', 'done'].indexOf(step) + 1} of 4 · ${station.group}`} title={`${station.name} · ${batchDisplayName(batch)}`} subtitle={<>{station.help} · ID {batch.id}</>} />

      {step === 'input' && (
        <>
          <div className="mb-4">{summary}</div>
          {independent && <Notice tone="neutral">This process will be saved against {batchDisplayName(batch)} without changing its current next step. Enter the scale reading from this process, even if another process is still waiting.</Notice>}
          {!independent && ready.weight <= 0 && <Notice tone="warn" icon={AlertTriangle}>No material was carried forward to this station. Enter the weight you are starting with.</Notice>}
          <Panel title={independent ? 'Enter the input for this process' : 'Confirm the input'} subtitle={independent ? 'Keep this process input separate from the batch’s current workflow position.' : 'This is what the previous station sent here. Adjust it only if you reweighed it.'}>
            <div className="flex flex-wrap items-end gap-3 p-5">
              {(independent || adjusting || ready.weight <= 0) ? (
                <Field label={independent ? 'Process input weight' : 'Input weight (reweighed)'} className="w-full max-w-xs"><UnitInput unit="kg" value={inputWeight} onChange={(e) => setInputWeight(e.target.value)} aria-label="Input weight" autoFocus /></Field>
              ) : (
                <Button variant="secondary" onClick={() => setAdjusting(true)}>Adjust weight</Button>
              )}
              <Button onClick={() => { if (input > 0) { setStep('outputs'); setError(''); } else setError('Enter the input weight.'); }}>{independent ? 'Continue to outputs' : 'Confirm input'} <ArrowRight size={15} /></Button>
            </div>
            {error && <div className="px-5 pb-4"><Notice tone="danger">{error}</Notice></div>}
          </Panel>
        </>
      )}

      {step === 'outputs' && (
        <form onSubmit={saveMeasurements}>
          <div className="mb-4">{summary}</div>
          {station.form === 'packaging' ? (
            <Panel title="Count the units" subtitle="Accepted units are calculated: total made minus rejected.">
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                <Field label="Pack size">
                  <Select value={pack.packSizeId} onChange={(e) => setPack({ ...pack, packSizeId: e.target.value })} aria-label="Pack size">
                    {store.packSizes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Total units made"><UnitInput unit="units" step="1" value={pack.totalUnits} onChange={(e) => setPack({ ...pack, totalUnits: e.target.value })} aria-label="Total units made" placeholder="0" autoFocus /></Field>
                <Field label="Rejected units"><UnitInput unit="units" step="1" value={pack.rejectedUnits} onChange={(e) => setPack({ ...pack, rejectedUnits: e.target.value })} aria-label="Rejected units" placeholder="0" /></Field>
              </div>
              <div className="grid gap-2 border-t border-line bg-paper px-5 py-3 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between"><span className="text-muted">Accepted units (calculated)</span><strong className="tabular-nums">{packCalc.acceptedUnits}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Nominal accepted weight</span><strong className="tabular-nums">{kg(packCalc.acceptedWeight)}</strong></div>
              </div>
            </Panel>
          ) : (
            <Panel title="Enter what you weighed" subtitle="Leave a row empty if there was none. The system calculates totals, yield, waste and variance.">
              <div>
                {rows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_150px] items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                    {row.custom ? (
                      <span className="flex flex-wrap gap-2">
                        <input className={`${inputClass} flex-1 min-w-[140px]`} placeholder="Output name" value={row.name} onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))} aria-label={`Output ${index + 1} name`} />
                        <select className={`${inputClass} w-auto`} value={row.kind} onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, kind: e.target.value as OutputKind } : r)))} aria-label={`Output ${index + 1} type`}>
                          <option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option>
                        </select>
                        <button type="button" className="text-faint hover:text-danger" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Remove output"><Trash2 size={16} /></button>
                      </span>
                    ) : (
                      <span><span className="font-medium">{row.name}</span><span className="ml-2 text-[11px] text-faint">{kindLabel[row.kind]}</span></span>
                    )}
                    <UnitInput unit="kg" value={row.weight} onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, weight: e.target.value } : r)))} aria-label={row.custom ? `Output ${index + 1} weight` : row.name} autoFocus={index === 0} />
                  </div>
                ))}
                <button type="button" className="flex w-full items-center gap-2 px-5 py-3 text-[13px] font-semibold text-green hover:bg-moss/60" onClick={() => setRows([...rows, { name: '', kind: 'useful', weight: '', custom: true }])}><Plus size={15} /> Add another output</button>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-line bg-paper px-5 py-3 text-[13px]">
                <span className="text-muted">Measured so far</span>
                <strong className="tabular-nums">{kg(measured.measured)} of {kg(input)}</strong>
              </div>
              {measured.measured > input && <div className="px-5 pt-3"><Notice tone="warn" icon={AlertTriangle}>Measured output is more than the input. Check the scale and the tare before saving.</Notice></div>}
            </Panel>
          )}
          <Panel title="Note (optional)"><div className="p-5"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything unusual at this station?" aria-label="Note" /></div></Panel>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep('input')}>Back</Button>
            <Button type="submit"><Check size={15} /> {station.form === 'packaging' ? 'Save packaging' : 'Save measurements'}</Button>
          </div>
        </form>
      )}

      {(step === 'destinations' || step === 'done') && record && (
        <>
          <SavedNotice batch={batch} station={station} record={record} done={step === 'done'} independent={independent} />
          {record.packaging && (
            <Panel title="Packaging result">
              <div className="grid gap-2 p-5 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between"><span className="text-muted">Pack size</span><strong>{store.packSizes.find((p) => p.id === record.packaging!.packSizeId)?.name}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Total units made</span><strong>{record.packaging.totalUnits}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Rejected units</span><strong>{record.packaging.rejectedUnits}</strong></div>
                <div className="flex justify-between"><span className="text-muted">Accepted units</span><strong>{record.packaging.acceptedUnits}</strong></div>
              </div>
            </Panel>
          )}
          <BalancePanel balance={recordBalance(record)} limit={limit} />
          <Panel title="Where does each output go?" subtitle={step === 'done' && independent ? 'Destinations saved. This independent entry does not move the batch workflow.' : step === 'done' ? 'Destinations saved. Split outputs stay separate; only what you continue becomes the next input.' : 'Split outputs stay separate. Only what you continue becomes the input of the next station.'}>
            {record.outputs.map((o) => (
              <div key={o.name} className="grid grid-cols-1 items-center gap-2 border-b border-line px-5 py-3 last:border-b-0 sm:grid-cols-[1fr_260px]">
                <span><strong>{o.name}</strong> <span className="text-muted tabular-nums">{kg(o.weight)}</span> <span className="ml-1 text-[11px] text-faint">{kindLabel[o.kind]}</span></span>
                {step === 'done' ? (
                  <span className="text-[13px]">{destinationLabel(o.destination, (s) => stationName(s as StationId))}{o.lotId && <> · <Link href={`/materials/${o.lotId}`} className="font-semibold text-green">lot {o.lotId}</Link></>}</span>
                ) : (
                  <Select value={destinations[o.name] ?? o.destination} onChange={(e) => setDestinations({ ...destinations, [o.name]: e.target.value as Destination })} aria-label={`${o.name} destination`}>
                    {station.next.map((n) => <option key={n} value={`continue:${n}`}>Continue to {stationName(n).toLowerCase()} (this batch)</option>)}
                    <option value="stock">Store as a lot</option>
                    <option value="rework">Send to rework</option>
                    <option value="waste">Waste bin</option>
                  </Select>
                )}
              </div>
            ))}
            {step === 'destinations' && <div className="flex justify-end px-5 py-3"><Button onClick={saveDestinations}><Check size={15} /> Save destinations</Button></div>}
          </Panel>
          {step === 'done' && <NextActions batch={batch} record={record} station={station} onRecordAgain={() => { setStep('outputs'); }} />}
        </>
      )}
    </>
  );
}

function availableText(record: StationRecord, next: StationId | null) {
  const carried = record.outputs.filter((o) => o.destination === `continue:${next}`);
  if (record.station === 'packaging' && record.packaging) return `${record.packaging.acceptedUnits} accepted units ready.`;
  if (carried.length === 0) return 'Nothing carried forward.';
  return `${carried.map((o) => `${kg(o.weight)} ${o.name.toLowerCase()}`).join(' and ')} available.`;
}

function SavedNotice({ batch, station, record, done, independent }: { batch: Batch; station: Station; record: StationRecord; done: boolean; independent: boolean }) {
  const store = useStore();
  const fresh = batchById(store, batch.id) ?? batch;
  const next = fresh.nextStation;
  const nextText = next === 'completion' ? 'Complete the batch.' : next ? `Record ${stationName(next).toLowerCase()}.` : '';
  return (
    <Notice tone="green" icon={CheckCircle2}>
      <strong>{station.name} saved{independent ? ' independently' : ''}.</strong> {done ? independent ? `The batch remains ready for ${next ? stationName(next).toLowerCase() : 'its next step'}. ${nextText}` : `${availableText(record, next)} ${nextText}` : 'Check the balance, then choose where each output goes.'}
    </Notice>
  );
}

function NextActions({ batch, record, station, onRecordAgain }: { batch: Batch; record: StationRecord; station: Station; onRecordAgain: () => void }) {
  const next = batch.nextStation;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>View batch {batchDisplayName(batch)}</LinkButton>
        <LinkButton variant="ghost" href={`/production/stations/${station.id}`}>Station queue</LinkButton>
      </div>
      <div className="flex gap-2">
        {batch.status !== 'completed' && record.station === station.id && <Button variant="secondary" onClick={onRecordAgain}>Re-enter weights</Button>}
        {next && batch.status === 'active' && (
          <LinkButton href={`/production/batches/${batch.id}/record/${next}`}>{next === 'completion' ? 'Review & complete batch' : `Record ${stationName(next).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>
        )}
      </div>
    </div>
  );
}

function BalancePanel({ balance, limit }: { balance: Balance; limit: number }) {
  const over = Math.abs(balance.variancePct) > limit;
  const line = (label: string, value: string, strong?: boolean, tone?: 'warn') => (
    <div className={`flex justify-between gap-3 border-b border-line px-5 py-2 last:border-b-0 ${tone === 'warn' ? 'bg-warn-soft text-warn' : ''}`}>
      <span className={strong ? 'font-semibold' : 'text-muted'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
  return (
    <Panel title="Calculated balance" subtitle="Worked out from the weights you entered." action={over ? <Badge tone="warn">Variance above {limit}% limit</Badge> : <Badge tone="green">Within limits</Badge>}>
      <div className="grid text-[13px] md:grid-cols-2">
        <div>
          {line('Input', kg(balance.input))}
          {line('Measured output', kg(balance.measured), true)}
          {line('Useful output', kg(balance.useful))}
          {line('By-products', kg(balance.byproduct))}
          {line('Recorded waste', kg(balance.waste))}
          {line('Recorded waste / by-product', kg(balance.recordedWaste))}
        </div>
        <div className="md:border-l md:border-line">
          {line('Unaccounted variance', kg(balance.variance), true, over ? 'warn' : undefined)}
          {line('Material accounted for', pct(balance.accountedPct))}
          {line('Yield', pct(balance.yieldPct))}
          {line('Waste', pct(balance.wastePct))}
          {line('Variance', pct(balance.variancePct), false, over ? 'warn' : undefined)}
          {line('Variance limit', `${num(limit)}%`)}
        </div>
      </div>
    </Panel>
  );
}

function CompletionScreen({ batch }: { batch: Batch }) {
  const store = useStore();
  const router = useRouter();
  const [note, setNote] = useState('');
  const packaging = batch.records.find((r) => r.packaging)?.packaging;
  const lots = store.lots.filter((l) => l.source.type === 'batch' && l.source.batchId === batch.id);
  const totalVariance = round2(batch.records.reduce((sum, r) => sum + recordBalance(r).variance, 0));
  const pending = batch.records.filter((r) => !r.destinationsSaved);
  const finalUseful = batch.records.at(-1) ? recordBalance(batch.records.at(-1)!).useful : 0;

  return (
    <>
      <Back href="/production/stations/completion" label="Completion queue" />
      <PageHeader eyebrow={`Batch ${batch.id}`} title={batch.status === 'completed' ? `${batchDisplayName(batch)} is completed` : 'Review and complete the batch'} subtitle={<>{batch.product} · ID {batch.id}</>} />
      {batch.status === 'completed' && <Notice tone="green" icon={CheckCircle2}>Completed {batch.completedAt?.replace('T', ' ').slice(0, 16)}. The record is closed; corrections stay available on the batch page.</Notice>}
      {pending.length > 0 && <Notice tone="warn" icon={AlertTriangle}>{pending.map((r) => stationName(r.station)).join(', ')} still needs destinations before the batch can be completed.</Notice>}
      <Panel title="Stations recorded">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-bold tracking-wide text-faint uppercase"><th className="px-5 py-2">Station</th><th className="px-4 py-2 text-right">Input</th><th className="px-4 py-2 text-right">Useful output</th><th className="px-4 py-2 text-right">Waste / by-product</th><th className="px-5 py-2 text-right">Variance</th></tr></thead>
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
          <div className="flex justify-between"><span className="text-muted">Starting input</span><strong className="tabular-nums">{kg(batch.startInput.weight)}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Last useful output</span><strong className="tabular-nums">{kg(finalUseful)}</strong></div>
          <div className="flex justify-between"><span className="text-muted">Total unaccounted variance</span><strong className="tabular-nums">{kg(totalVariance)}</strong></div>
          {packaging && <div className="flex justify-between"><span className="text-muted">Accepted units</span><strong className="tabular-nums">{packaging.acceptedUnits} × {packaging.packGrams} g</strong></div>}
          {packaging && <div className="flex justify-between"><span className="text-muted">Rejected units</span><strong className="tabular-nums">{packaging.rejectedUnits}</strong></div>}
        </div>
        {lots.length > 0 && (
          <div className="border-t border-line px-5 py-3 text-[13px]">
            <span className="text-muted">Lots created by this batch: </span>
            {lots.map((l, i) => <span key={l.id}>{i > 0 && ', '}<Link href={`/materials/${l.id}`} className="font-semibold text-green">{l.id}</Link> ({l.material}, {l.received} {l.unit})</span>)}
          </div>
        )}
      </Panel>
      {batch.status !== 'completed' && (
        <>
          <Panel title="Closing note (optional)"><div className="p-5"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Closing note" placeholder="Anything to remember about this batch?" /></div></Panel>
          <div className="flex flex-wrap justify-between gap-2">
            <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Back to batch</LinkButton>
            <Button disabled={pending.length > 0 || batch.status === 'hold'} onClick={() => { store.completeBatch(batch.id, note); router.push(`/production/batches/${batch.id}`); }}><Check size={15} /> Complete batch</Button>
          </div>
        </>
      )}
      {batch.status === 'completed' && <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>View batch record</LinkButton>}
    </>
  );
}
