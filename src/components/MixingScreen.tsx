'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, PackageOpen, Undo2 } from 'lucide-react';
import { Back, Badge, Button, Field, LinkButton, Notice, PageHeader, Panel, Select, UnitInput, inputClass } from '@/components/ui';
import { BalanceVerdict, LiveBalance } from '@/components/weighing';
import { calculateBalance, round2 } from '@/lib/balance';
import { batchById, batchDisplayName, recordBalance, userName } from '@/lib/derive';
import { dateTime, kg, num } from '@/lib/format';
import { batchMaterialAtMixing, changeover, ingredientsOf, mixerStamp, versionOf } from '@/lib/mixing';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import type { Batch, MixerContents, MixingRun, Station, StationRecord } from '@/lib/types';

const heldText = (held: MixerContents) => `${kg(held.kg)} of ${held.type}`;

/**
 * Mixing: the chocolate types made one after another. Each run is entered on its own and saved at once;
 * the batch's mixing is finished when the last type is made.
 */
export function MixingScreen({ batch, station, record }: { batch: Batch; station: Station; record?: StationRecord }) {
  const store = useStore();
  const fresh = batchById(store, batch.id) ?? batch;
  const runs = record?.runs ?? [];
  const finished = record?.destinationsSaved ?? false;
  const canMix = !finished && fresh.status === 'active';
  const material = batchMaterialAtMixing(fresh);
  const held = store.mixer.holds;
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const unused = material.filter((m) => m.left > 0.005);

  async function takeOut() {
    if (!held || !window.confirm(`Take the ${heldText(held)} out of the mixer? It becomes a lot of ${held.type}.`)) return;
    setBusy(true);
    const lot = await store.emptyMixer(mixerStamp(store.mixer));
    setBusy(false);
    if (lot) { setSaved(`The ${heldText(held)} was taken out as lot ${lot}. The mixer is empty.`); setFormKey((k) => k + 1); }
  }
  async function undo(run: MixingRun) {
    if (!window.confirm(`Undo the ${run.type} run? Its lot ${run.lotId} is removed and the ingredients go back to their lots.`)) return;
    setBusy(true);
    const ok = await store.undoMixingRun(fresh.id, run.id);
    setBusy(false);
    if (ok) { setSaved(`The ${run.type} run was undone.`); setFormKey((k) => k + 1); }
  }
  async function finish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await store.finishMixing(fresh.id, note.trim() || undefined);
    setBusy(false);
    if (ok) { setSaved(null); setFinishing(false); window.scrollTo({ top: 0 }); }
  }

  return (
    <>
      <Back href={`/production/stations/${station.id}`} label={`${station.name} queue`} />
      <PageHeader eyebrow={`${station.group} · ${fresh.name ? `ID ${fresh.id} · ` : ''}${fresh.product}`} title={`${station.name} · ${batchDisplayName(fresh)}`} subtitle={station.help} />
      {fresh.status === 'hold' && !finished && <Notice tone="danger" icon={AlertTriangle}>{batchDisplayName(fresh)} is on hold: {fresh.holds.find((h) => !h.releasedAt)?.reason} Release the hold before mixing.</Notice>}
      {saved && <div className="saved-banner" role="status"><div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><strong>{saved}</strong></div></div>}
      {finished && (
        <div className="saved-banner" role="status">
          <div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><div><strong>Mixing finished.</strong> {runs.length} run{runs.length === 1 ? '' : 's'} made. {fresh.status === 'active' && fresh.nextStation === 'completion' ? 'Nothing else is waiting. Complete the batch.' : ''}</div></div>
          {fresh.status === 'active' && fresh.nextStation && (
            <div className="mt-3 flex flex-wrap gap-2"><LinkButton href={`/production/batches/${fresh.id}/record/${fresh.nextStation}`}>{fresh.nextStation === 'completion' ? 'Review & complete batch' : `Record ${stationName(fresh.nextStation).toLowerCase()}`} <ArrowRight size={15} /></LinkButton></div>
          )}
        </div>
      )}
      {record && finished && <BalanceVerdict balance={recordBalance(record)} limit={store.thresholds.variancePct.mixing ?? 0} wasteLimit={store.thresholds.wastePct} />}

      {!finished && (
        <section className="input-card" aria-label="What the mixer holds">
          <div className="input-card-label">The mixer holds</div>
          {held ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><strong className="text-[22px] tabular-nums">{kg(held.kg)}</strong> <span className="text-muted">of {held.type} · left by <Link href={`/production/batches/${held.batchId}`} className="font-semibold text-green">{held.batchId}</Link></span></div>
              {canMix && <Button variant="secondary" disabled={busy} onClick={takeOut}><PackageOpen size={15} /> Take it out of the mixer</Button>}
            </div>
          ) : <div className="text-[15px] font-semibold">Empty</div>}
        </section>
      )}

      {material.length > 0 && (
        <Panel title={`From ${batchDisplayName(fresh)}`} subtitle="Sent here from earlier stations. Runs use it first; what is left is kept in store when mixing is finished.">
          {material.map((m) => {
            const stored = finished ? record?.outputs.find((o) => o.name === `${m.name} kept in store`) : undefined;
            return (
              <div key={m.name} className="flex flex-wrap justify-between gap-2 border-b border-line px-5 py-2.5 text-[13px] last:border-b-0">
                <strong>{m.name}</strong>
                <span className="tabular-nums">{kg(m.carried)} sent · {kg(m.used)} used · {stored ? <>{kg(stored.weight)} kept in store as <Link href={`/materials/${stored.lotId}`} className="font-semibold text-green">{stored.lotId}</Link></> : <strong>{kg(m.left)} left</strong>}</span>
              </div>
            );
          })}
        </Panel>
      )}
      {material.length === 0 && !finished && <Notice tone="neutral">This batch has no liquor or cocoa butter of its own at mixing: take each ingredient from a lot in store.</Notice>}

      {runs.length > 0 && (
        <Panel title="Runs" subtitle="The chocolate types made, in order.">
          {runs.map((run, index) => {
            const lastOnMixer = store.mixer.lastRunId === run.id;
            return (
              <div key={run.id} className="border-b border-line px-5 py-3 text-[13px] last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2"><strong className="text-[14px]">{index + 1}. {run.type}</strong><Link href={`/materials/${run.lotId}`} className="font-semibold text-green">{run.lotId}</Link><span className="tabular-nums">{kg(run.made)} made</span></span>
                  {canMix && lastOnMixer && index === runs.length - 1 && <Button variant="ghost" disabled={busy} onClick={() => undo(run)} aria-label={`Undo the ${run.type} run`}><Undo2 size={14} /> Undo</Button>}
                </div>
                <div className="text-muted">
                  {kg(run.toRun)} run on {run.held ? heldText(run.held) : 'an empty mixer'} · {run.takenOut ? <>{kg(run.kept)} taken out as <Link href={`/materials/${run.takenOut}`} className="font-semibold text-green">{run.takenOut}</Link></> : `${kg(run.kept)} kept in the mixer`} · {dateTime(run.recordedAt)} · {userName(store, run.recordedBy)}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                  {run.ingredients.filter((i) => i.expected > 0 || i.actual > 0).map((i) => (
                    <span key={i.name}>{i.name} <span className={`tabular-nums ${Math.abs(i.actual - i.expected) > 0.005 ? 'font-semibold text-warn' : 'text-ink'}`}>{num(i.actual)}</span> of {num(i.expected)} kg · {i.lotId ? <Link href={`/materials/${i.lotId}`} className="font-semibold text-green">{i.lotId}</Link> : 'this batch'}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </Panel>
      )}

      {canMix && <RunForm key={formKey} batch={fresh} onRestart={() => setFormKey((k) => k + 1)} onSaved={(message) => { setSaved(message); setFormKey((k) => k + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}

      {canMix && (runs.length > 0 || unused.length > 0) && (
        <Panel title="Finish mixing" subtitle="When the last type for this batch is made.">
          <div className="p-5 text-[13px]">
            <p className="mb-3 text-muted">{unused.length ? `Not used and kept in store as a lot: ${unused.map((m) => `${kg(m.left)} ${m.name.toLowerCase()}`).join(', ')}. ` : ''}{held ? `The ${heldText(held)} stays in the mixer for the next run.` : ''}</p>
            {!finishing ? <Button variant="secondary" onClick={() => setFinishing(true)}><Check size={15} /> Finish mixing</Button> : (
              <form onSubmit={finish} className="grid gap-3">
                <Field label="Note (optional)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Mixing note" /></Field>
                <div className="flex gap-2"><Button variant="secondary" onClick={() => setFinishing(false)}>Cancel</Button><Button type="submit" disabled={busy}><Check size={15} /> {busy ? 'Saving…' : 'Finish mixing'}</Button></div>
              </form>
            )}
          </div>
        </Panel>
      )}

      <div className="flex flex-wrap gap-2">
        <LinkButton variant="secondary" href={`/production/batches/${fresh.id}`}>View batch {batchDisplayName(fresh)}</LinkButton>
        <LinkButton variant="ghost" href="/work">My work</LinkButton>
      </div>
    </>
  );
}

interface Line { actual?: string; source?: string }

/** One run: the type and how much to run, what to add on top of what the mixer holds, and what came out */
function RunForm({ batch, onSaved, onRestart }: { batch: Batch; onSaved: (message: string) => void; onRestart: () => void }) {
  const store = useStore();
  // The mixer this run was worked out on. If another device records a run meanwhile, the amounts change: start again.
  const [openedOn] = useState(() => mixerStamp(store.mixer));
  const changedElsewhere = mixerStamp(store.mixer) !== openedOn;
  const [recipeId, setRecipeId] = useState('');
  const [toRun, setToRun] = useState('');
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [made, setMade] = useState<string | undefined>();
  const [kept, setKept] = useState(String(store.mixerKeepsKg));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const recipe = store.recipes.find((r) => r.id === recipeId);
  const version = recipe && versionOf(recipe);
  const held = store.mixer.holds ?? undefined;
  const plan = version && Number(toRun) > 0 ? changeover(version.ingredients, Number(toRun), held && { kg: held.kg, ingredients: ingredientsOf(store, held.recipeId, held.recipeVersion) }) : undefined;
  const material = new Map(batchMaterialAtMixing(batch).map((m) => [m.name, m.left]));
  const rows = (version?.ingredients ?? []).map((i) => {
    const line = plan?.lines.find((l) => l.name === i.name);
    const add = Math.max(0, line?.add ?? 0);
    const lots = store.lots.filter((l) => l.material === i.name && l.unit === 'kg' && l.available > 0).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const fromBatch = material.get(i.name) ?? 0;
    const given = lines[i.name] ?? {};
    const source = given.source ?? (fromBatch > 0 ? '' : lots[0]?.id ?? '');
    return { name: i.name, percent: i.percent, inMixer: line?.inMixer ?? 0, add, actual: given.actual ?? (add ? String(add) : ''), source, lots, fromBatch };
  });
  const freshKg = round2(rows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0));
  const heldKg = held?.kg ?? 0;
  const keptKg = Number(kept) || 0;
  const madeKg = made === undefined ? Math.max(0, round2(freshKg + heldKg - keptKg)) : Number(made) || 0;
  const balance = calculateBalance(round2(freshKg + heldKg), [{ kind: 'useful', weight: madeKg }, { kind: 'useful', weight: keptKg }]);
  const blocked = held && plan && plan.blocked.length > 0;
  const tooSmall = held && plan && !blocked && plan.lines.some((l) => l.add < -0.005);
  const setLine = (name: string, patch: Line) => setLines({ ...lines, [name]: { ...lines[name], ...patch } });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || changedElsewhere) return;
    setError('');
    if (!recipe || !version) return setError('Choose the chocolate type.');
    if (!(Number(toRun) > 0)) return setError('Enter how many kg to run.');
    if (blocked || tooSmall) return setError('This run cannot be made on top of what the mixer holds.');
    const bad = rows.find((r) => r.source === '' && (Number(r.actual) || 0) > r.fromBatch + 0.005);
    if (bad) return setError(`Only ${kg(bad.fromBatch)} of ${bad.name.toLowerCase()} from this batch is left. Take the rest from a lot.`);
    if (!(freshKg > 0)) return setError('Enter the ingredients weighed in.');
    if (!(madeKg > 0)) return setError('Enter the chocolate taken out.');
    setSaving(true);
    const lot = await store.saveMixingRun({
      batchId: batch.id, recipeId: recipe.id, toRun: Number(toRun), made: madeKg, kept: keptKg, expectMixer: openedOn,
      ingredients: rows.map((r) => ({ name: r.name, actual: Number(r.actual) || 0, lotId: r.source || undefined })),
    });
    setSaving(false);
    if (lot) onSaved(`${recipe.name} saved: ${kg(madeKg)} made as lot ${lot}${keptKg > 0 ? `, ${kg(keptKg)} kept in the mixer` : ''}.`);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <form onSubmit={save} noValidate>
      <Panel title="Next run" subtitle={held ? `Made on top of the ${heldText(held)} in the mixer.` : 'The mixer is empty.'}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Chocolate type">
            <Select value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setLines({}); setMade(undefined); }} aria-label="Chocolate type">
              <option value="">Choose…</option>
              {store.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Fresh ingredients to run" hint={held ? `The run makes this plus the ${kg(heldKg)} in the mixer.` : undefined}>
            <UnitInput unit="kg" value={toRun} onChange={(e) => { setToRun(e.target.value); setLines({}); setMade(undefined); }} aria-label="Kg to run" />
          </Field>
        </div>
        {blocked && held && (
          <div className="px-5 pb-4"><Notice tone="danger" icon={AlertTriangle}>The mixer holds {heldText(held)}, which has {plan!.blocked.join(' and ').toLowerCase()}. {recipe!.name} has none: take the chocolate out of the mixer first.</Notice></div>
        )}
        {tooSmall && held && (
          <div className="px-5 pb-4"><Notice tone="warn" icon={AlertTriangle}>With {heldText(held)} in the mixer, run at least <strong>{kg(plan!.minRun)}</strong> of {recipe!.name}. Less would need an ingredient taken out again.</Notice></div>
        )}
        {plan && !blocked && (
          <div className="border-t border-line">
            <div className="hidden grid-cols-[1fr_90px_110px_140px_1fr] gap-3 px-5 py-2 text-[11px] font-bold tracking-wide text-faint uppercase md:grid"><span>Ingredient</span><span className="text-right">In mixer</span><span className="text-right">To add</span><span>Weighed in</span><span>From</span></div>
            {rows.map((r) => (
              <div key={r.name} className="grid gap-2 border-t border-line px-5 py-3 md:grid-cols-[1fr_90px_110px_140px_1fr] md:items-center md:gap-3">
                <span><strong>{r.name}</strong> <span className="text-[12px] text-muted">{r.percent}%</span></span>
                <span className="text-[13px] text-muted md:text-right">{r.inMixer > 0 ? `${kg(r.inMixer)} in mixer` : <span className="md:hidden">nothing in mixer</span>}</span>
                <span className="text-[13px] md:text-right">Add <strong className="tabular-nums">{kg(r.add)}</strong></span>
                <UnitInput unit="kg" value={r.actual} onChange={(e) => setLine(r.name, { actual: e.target.value })} aria-label={`${r.name} weighed in`} />
                <Select value={r.source} onChange={(e) => setLine(r.name, { source: e.target.value })} aria-label={`${r.name} from`}>
                  {r.fromBatch > 0 && <option value="">This batch · {kg(r.fromBatch)} left</option>}
                  {r.lots.map((l) => <option key={l.id} value={l.id}>{l.id} · {kg(l.available)} available</option>)}
                  {r.fromBatch <= 0 && r.lots.length === 0 && <option value="">No {r.name.toLowerCase()} in store</option>}
                </Select>
              </div>
            ))}
            <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
              <Field label="Chocolate taken out" hint="Weighed out of the mixer. It becomes a lot of this type.">
                <UnitInput unit="kg" value={made ?? String(madeKg)} onChange={(e) => setMade(e.target.value)} aria-label="Chocolate taken out" />
              </Field>
              <Field label="Kept in the mixer for the next run" hint="Set to 0 if the mixer is run empty.">
                <UnitInput unit="kg" value={kept} onChange={(e) => setKept(e.target.value)} aria-label="Kept in the mixer" />
              </Field>
            </div>
          </div>
        )}
      </Panel>
      {plan && !blocked && (
        <div className="save-bar">
          <LiveBalance balance={balance} limit={store.thresholds.variancePct.mixing ?? 0} wasteLimit={store.thresholds.wastePct} />
          {error && !changedElsewhere && <div className="save-bar-error" role="alert">{error}</div>}
          {changedElsewhere && <div className="save-bar-error" role="alert">The mixer was just used on another device, so these amounts are out of date. Nothing is saved. <button type="button" className="btn-text" onClick={onRestart}>Start again</button></div>}
          <Button type="submit" className="flex-1" disabled={saving || changedElsewhere || !!tooSmall}><Check size={16} /> {saving ? 'Saving…' : `Save ${recipe?.name ?? 'run'}`}</Button>
        </div>
      )}
      {!plan && <p className="mb-4 text-[13px] text-muted"><Badge tone="neutral">Next</Badge> Choose the type and how many kg to run; the amounts to add appear here.</p>}
    </form>
  );
}
