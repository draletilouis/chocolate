'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Flag, PackageOpen, Undo2, X } from 'lucide-react';
import { Back, Button, Field, LinkButton, Notice, PageHeader, Select, UnitInput, inputClass } from '@/components/ui';
import { BalanceVerdict, LiveBalance } from '@/components/weighing';
import { calculateBalance, round2 } from '@/lib/balance';
import { batchById, batchDisplayName, recordBalance, userName } from '@/lib/derive';
import { dateTime, kg, num } from '@/lib/format';
import { batchMaterialAtMixing, changeover, ingredientsOf, mixerStamp, sourcesOf, versionOf } from '@/lib/mixing';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import type { Batch, MixerContents, RunSource, Station, StationRecord } from '@/lib/types';

const heldText = (held: MixerContents) => `${kg(held.kg)} of ${held.type}`;

/** Where an ingredient came from: its lot, the batch itself, or each place with its weight when it was split */
export function RunSources({ ingredient, own = 'this batch' }: { ingredient: { actual: number; lotId?: string; sources?: RunSource[] }; own?: string }) {
  const sources = sourcesOf(ingredient);
  return (
    <>
      {sources.map((s, index) => (
        <span key={s.lotId ?? ''}>
          {index > 0 && ' + '}
          {s.lotId ? <Link href={`/materials/${s.lotId}`} className="font-semibold text-green">{s.lotId}</Link> : own}
          {sources.length > 1 && <span className="tabular-nums"> {num(s.kg)} kg</span>}
        </span>
      ))}
    </>
  );
}

type StepState = 'done' | 'current' | 'next' | 'later';

/** One step of the mixing flow: a marker on the line down the left, and its card */
function FlowStep({ state, marker, title, subtitle, action, id, children }: { state: StepState; marker: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string; children?: ReactNode }) {
  return (
    <li className={`mix-step is-${state}`} id={id}>
      <span className="mix-step-icon" aria-hidden>{marker}</span>
      <section className="mix-step-card">
        <div className="mix-step-head">
          <div className="min-w-0">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </section>
    </li>
  );
}

/** A numbered part of the run being entered. Waiting parts show their title only, so the order of work is always visible. */
function SubStep({ n, title, hint, done, waiting, children }: { n: number; title: string; hint?: ReactNode; done?: boolean; waiting?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`mix-sub ${waiting ? 'is-waiting' : ''}`}>
      <div className="mix-sub-title">
        <span className={`mix-sub-num ${done ? 'is-done' : ''}`}>{done ? <Check size={12} strokeWidth={3} /> : n}</span>
        <span>{title}{(waiting || hint) && <span className="mix-sub-hint"> · {waiting ?? hint}</span>}</span>
      </div>
      {!waiting && children}
    </div>
  );
}

const scrollToStep = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

/**
 * Mixing as one flow, top to bottom: the liquor and butter the batch brought, each chocolate type made so far,
 * the next run (check the mixer, choose, weigh in, weigh out, save), then finish mixing and go on.
 * Each run is saved at once; the batch's mixing is finished when the last type is made.
 */
export function MixingScreen({ batch, station, record }: { batch: Batch; station: Station; record?: StationRecord }) {
  const store = useStore();
  const fresh = batchById(store, batch.id) ?? batch;
  const runs = record?.runs ?? [];
  const finished = record?.destinationsSaved ?? false;
  const canMix = !finished && fresh.status === 'active';
  const material = batchMaterialAtMixing(fresh);
  const held = store.mixer.holds;
  const name = batchDisplayName(fresh);
  const [justSaved, setJustSaved] = useState<{ lot: string; message: string } | null>(null);
  const [undone, setUndone] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const unused = material.filter((m) => m.left > 0.005);
  const canFinish = canMix && (runs.length > 0 || unused.length > 0);

  // A run just saved: show it with the next run right under it
  useEffect(() => { if (justSaved) scrollToStep(`run-${justSaved.lot}`); }, [justSaved]);

  async function undo(runId: string, type: string, lotId: string) {
    if (!window.confirm(`Undo the ${type} run? Its lot ${lotId} is removed and the ingredients go back to their lots.`)) return;
    setBusy(true);
    const ok = await store.undoMixingRun(fresh.id, runId);
    setBusy(false);
    if (ok) { setJustSaved(null); setUndone(`The ${type} run was undone.`); setFormKey((k) => k + 1); }
  }
  async function finish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await store.finishMixing(fresh.id, note.trim() || undefined);
    setBusy(false);
    if (ok) { setJustSaved(null); setUndone(null); setFinishing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  const next = fresh.status === 'active' && fresh.nextStation;
  const nextLink = next && (
    <LinkButton href={`/production/batches/${fresh.id}/record/${next}`}>{next === 'completion' ? 'Review & complete batch' : `Record ${stationName(next).toLowerCase()}`} <ArrowRight size={15} /></LinkButton>
  );

  return (
    <>
      <Back href={`/production/stations/${station.id}`} label={`${station.name} queue`} />
      <PageHeader eyebrow={`${station.group} · ${fresh.name ? `ID ${fresh.id} · ` : ''}${fresh.product}`} title={`${station.name} · ${name}`} subtitle="Work down the steps: make each chocolate type in turn, then finish mixing." />
      {fresh.status === 'hold' && !finished && <Notice tone="danger" icon={AlertTriangle}>{name} is on hold: {fresh.holds.find((h) => !h.releasedAt)?.reason} Release the hold before mixing.</Notice>}
      {finished && (
        <div className="saved-banner" role="status">
          <div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><div><strong>Mixing finished.</strong> {runs.length} run{runs.length === 1 ? '' : 's'} made. {next === 'completion' ? 'Nothing else is waiting. Complete the batch.' : ''}</div></div>
          {nextLink && <div className="mt-3 flex flex-wrap gap-2">{nextLink}</div>}
        </div>
      )}
      {undone && <Notice tone="neutral" icon={Undo2}>{undone}</Notice>}

      <ol className="mix-flow">
        {material.length > 0 ? (
          <FlowStep state="done" marker={<Check size={16} strokeWidth={3} />} title={`Liquor and butter from ${name}`} subtitle="Sent here from earlier stations. Each run uses it first; what is left goes to store when you finish mixing.">
            <div className="mix-step-body">
              {material.map((m) => {
                const stored = finished ? record?.outputs.find((o) => o.name === `${m.name} kept in store`) : undefined;
                return (
                  <div key={m.name} className="flex flex-wrap justify-between gap-2 border-b border-line px-5 py-2.5 text-[13px] last:border-b-0">
                    <strong>{m.name}</strong>
                    <span className="tabular-nums">{kg(m.carried)} sent · {kg(m.used)} used · {stored ? <>{kg(stored.weight)} kept in store as <Link href={`/materials/${stored.lotId}`} className="font-semibold text-green">{stored.lotId}</Link></> : <strong>{kg(m.left)} left</strong>}</span>
                  </div>
                );
              })}
            </div>
          </FlowStep>
        ) : (
          <FlowStep state="done" marker={<Check size={16} strokeWidth={3} />} title="Ingredients from store" subtitle="This batch has no liquor or cocoa butter of its own at mixing: take each ingredient from a lot in store." />
        )}

        {runs.map((run, index) => {
          const canUndo = canMix && store.mixer.lastRunId === run.id && index === runs.length - 1;
          const saved = justSaved?.lot === run.lotId ? justSaved.message : null;
          return (
            <FlowStep
              key={run.id}
              id={`run-${run.lotId}`}
              state="done"
              marker={<Check size={16} strokeWidth={3} />}
              title={<>Run {index + 1} · {run.type}</>}
              subtitle={<><span className="tabular-nums">{kg(run.made)}</span> made as <Link href={`/materials/${run.lotId}`} className="font-semibold text-green">{run.lotId}</Link> · {run.takenOut ? <>{kg(run.kept)} taken out later as <Link href={`/materials/${run.takenOut}`} className="font-semibold text-green">{run.takenOut}</Link></> : run.kept > 0 ? `${kg(run.kept)} kept in the mixer` : 'mixer run empty'}</>}
              action={canUndo && <Button variant="ghost" disabled={busy} onClick={() => undo(run.id, run.type, run.lotId)} aria-label={`Undo the ${run.type} run`}><Undo2 size={14} /> Undo</Button>}
            >
              {saved && <div className="mix-step-saved" role="status"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span>{saved}</span></div>}
              <div className="mix-step-body px-5 py-3 text-[12px] text-muted">
                <div>Made on {run.held ? heldText(run.held) : 'an empty mixer'} with {kg(run.toRun)} of fresh ingredients · {dateTime(run.recordedAt)} · {userName(store, run.recordedBy)}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {run.ingredients.filter((i) => i.expected > 0 || i.actual > 0).map((i) => (
                    <span key={i.name}>{i.name} <span className={`tabular-nums ${Math.abs(i.actual - i.expected) > 0.005 ? 'font-semibold text-warn' : 'text-ink'}`}>{num(i.actual)}</span> of {num(i.expected)} kg · <RunSources ingredient={i} /></span>
                  ))}
                </div>
              </div>
            </FlowStep>
          );
        })}

        {canMix && (
          <RunForm
            key={formKey}
            batch={fresh}
            n={runs.length + 1}
            onRestart={() => setFormKey((k) => k + 1)}
            onSaved={(lot, message) => { setUndone(null); setJustSaved({ lot, message }); setFormKey((k) => k + 1); }}
          />
        )}

        <FlowStep
          id="finish-mixing"
          state={finished ? 'done' : canFinish && runs.length > 0 ? 'next' : 'later'}
          marker={finished ? <Check size={16} strokeWidth={3} /> : <Flag size={15} />}
          title={finished ? 'Finished' : runs.length > 0 ? 'Or finish mixing' : 'Finish mixing'}
          subtitle={finished
            ? `${runs.length} run${runs.length === 1 ? '' : 's'} made${record?.recordedAt ? ` · ${dateTime(record.recordedAt)}` : ''}.`
            : canFinish ? 'When the last type for this batch is made.' : 'After the first run is saved.'}
        >
          {finished && record && (
            <div className="mix-step-body px-5 pt-4">
              <BalanceVerdict balance={recordBalance(record)} limit={store.thresholds.variancePct.mixing ?? 0} wasteLimit={store.thresholds.wastePct} />
            </div>
          )}
          {canFinish && (
            <div className="mix-step-body px-5 py-4 text-[13px]">
              {(unused.length > 0 || held) && <p className="mb-3 text-muted">{unused.length ? `Not used and kept in store as a lot: ${unused.map((m) => `${kg(m.left)} ${m.name.toLowerCase()}`).join(', ')}. ` : ''}{held ? `The ${heldText(held)} stays in the mixer for the next run.` : ''}</p>}
              {!finishing ? <Button variant="secondary" onClick={() => { setFinishing(true); scrollToStep('finish-mixing'); }}><Check size={15} /> Finish mixing</Button> : (
                <form onSubmit={finish} className="grid gap-3">
                  <Field label="Note (optional)"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Mixing note" /></Field>
                  <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setFinishing(false)}>Cancel</Button><Button type="submit" disabled={busy}><Check size={15} /> {busy ? 'Saving…' : 'Finish mixing'}</Button></div>
                </form>
              )}
            </div>
          )}
        </FlowStep>
      </ol>

      <div className="flex flex-wrap gap-2">
        <LinkButton variant="secondary" href={`/production/batches/${fresh.id}`}>View batch {name}</LinkButton>
        <LinkButton variant="ghost" href="/work">My work</LinkButton>
      </div>
    </>
  );
}

/** One place an ingredient is weighed from in the form: '' is the batch itself, otherwise a lot. Only the first part may be left to its defaults. */
interface Part { kg?: string; source?: string }

/** The run being entered, as numbered parts in the order they are done: the mixer, what to make, weigh in, weigh out */
function RunForm({ batch, n, onSaved, onRestart }: { batch: Batch; n: number; onSaved: (lot: string, message: string) => void; onRestart: () => void }) {
  const store = useStore();
  // The mixer this run was worked out on. If another device records a run meanwhile, the amounts change: start again.
  const [openedOn, setOpenedOn] = useState(() => mixerStamp(store.mixer));
  const changedElsewhere = mixerStamp(store.mixer) !== openedOn;
  const [recipeId, setRecipeId] = useState('');
  const [toRun, setToRun] = useState('');
  const [lines, setLines] = useState<Record<string, Part[]>>({});
  const [made, setMade] = useState<string | undefined>();
  const [kept, setKept] = useState(String(store.mixerKeepsKg));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [takenOut, setTakenOut] = useState<string | null>(null);

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
    // Where it can come from, in the order it is used: the batch's own first, then the oldest lot.
    const places = [...(fromBatch > 0 ? [''] : []), ...lots.map((l) => l.id)];
    const has = (source: string) => (source === '' ? fromBatch : lots.find((l) => l.id === source)?.available ?? 0);
    const given = lines[i.name] ?? [{}];
    const parts = given.map((p, index) => {
      const source = p.source ?? places[0] ?? '';
      return { source, kg: p.kg ?? (index === 0 && add ? String(add) : ''), has: has(source), free: places.filter((s) => s === source || !given.some((x, j) => j !== index && (x.source ?? places[0] ?? '') === s)) };
    });
    const unused = places.filter((s) => !parts.some((p) => p.source === s));
    return { name: i.name, percent: i.percent, inMixer: line?.inMixer ?? 0, add, actual: round2(parts.reduce((sum, p) => sum + (Number(p.kg) || 0), 0)), parts, unused, has, lots, fromBatch };
  });
  const freshKg = round2(rows.reduce((sum, r) => sum + r.actual, 0));
  const heldKg = held?.kg ?? 0;
  const keptKg = Number(kept) || 0;
  const madeKg = made === undefined ? Math.max(0, round2(freshKg + heldKg - keptKg)) : Number(made) || 0;
  const balance = calculateBalance(round2(freshKg + heldKg), [{ kind: 'useful', weight: madeKg }, { kind: 'useful', weight: keptKg }]);
  const blocked = held && plan && plan.blocked.length > 0;
  const tooSmall = held && plan && !blocked && plan.lines.some((l) => l.add < -0.005);
  const ready = plan && !blocked;
  const weighedIn = ready && rows.every((r) => r.add <= 0.005 || r.actual > 0);
  const setParts = (name: string, parts: Part[]) => setLines({ ...lines, [name]: parts });
  const setPart = (row: (typeof rows)[number], index: number, patch: Part) => setParts(row.name, row.parts.map((p, j) => (j === index ? { kg: p.kg, source: p.source, ...patch } : { kg: p.kg, source: p.source })));
  /** The lot does not hold the weight entered: it gives what it has, and the rest comes from the next place */
  const takeRest = (row: (typeof rows)[number], index: number) => {
    const part = row.parts[index];
    const rest = round2((Number(part.kg) || 0) - part.has);
    setParts(row.name, [...row.parts.map((p, j) => ({ kg: j === index ? String(part.has) : p.kg, source: p.source })), { kg: String(rest), source: row.unused[0] }]);
  };

  /** Empties the mixer into a lot, keeping the type and amount chosen so the run can go on at once */
  async function takeOut() {
    if (!held || !window.confirm(`Take the ${heldText(held)} out of the mixer? It becomes a lot of ${held.type}.`)) return;
    setSaving(true);
    const lot = await store.emptyMixer(openedOn);
    setSaving(false);
    if (!lot) return;
    setOpenedOn(mixerStamp({ holds: null, lastRunId: null })); // as emptyMixer leaves it
    setLines({});
    setMade(undefined);
    setError('');
    setTakenOut(`The ${heldText(held)} was taken out as lot ${lot}. The mixer is empty.`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || changedElsewhere) return;
    setError('');
    if (!recipe || !version) return setError('Choose the chocolate type.');
    if (!(Number(toRun) > 0)) return setError('Enter how many kg to run.');
    if (blocked || tooSmall) return setError('This run cannot be made on top of what the mixer holds.');
    const bad = rows.find((r) => r.parts.some((p) => p.source === '' && (Number(p.kg) || 0) > r.fromBatch + 0.005));
    if (bad) return setError(`Only ${kg(bad.fromBatch)} of ${bad.name.toLowerCase()} from this batch is left. Take the rest from a lot.`);
    if (!(freshKg > 0)) return setError('Enter the ingredients weighed in.');
    if (!(madeKg > 0)) return setError('Enter the chocolate taken out.');
    setSaving(true);
    const lot = await store.saveMixingRun({
      batchId: batch.id, recipeId: recipe.id, toRun: Number(toRun), made: madeKg, kept: keptKg, expectMixer: openedOn,
      // One entry for each place an ingredient came from.
      ingredients: rows.flatMap((r) => r.parts.filter((p) => Number(p.kg) > 0).map((p) => ({ name: r.name, actual: Number(p.kg), lotId: p.source || undefined }))),
    });
    setSaving(false);
    if (lot) onSaved(lot, `${recipe.name} saved: ${kg(madeKg)} made as lot ${lot}${keptKg > 0 ? `, ${kg(keptKg)} kept in the mixer` : ''}.`);
    else window.scrollTo({ top: 0, behavior: 'smooth' }); // the refusal shows at the top of the page
  }

  const takeOutButton = <Button variant="secondary" disabled={saving} onClick={takeOut}><PackageOpen size={15} /> Take it out of the mixer</Button>;
  const total = plan?.total ?? 0;

  return (
    <li className="mix-step is-current" id="next-run">
      <span className="mix-step-icon" aria-hidden>{n}</span>
      <form onSubmit={save} noValidate className="mix-step-card">
        <div className="mix-step-head">
          <div className="min-w-0">
            <h3>Run {n}{recipe ? ` · ${recipe.name}` : ''}</h3>
            <p>{n > 1 ? 'Make the next chocolate type, or finish mixing below if this batch is done.' : 'Make the first chocolate type. Work through the four parts in order.'}</p>
          </div>
        </div>

        <SubStep n={1} title="Check the mixer" done={!blocked}>
          {held ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-[13px]">
                <span className="text-muted">The mixer holds</span> <strong className="text-[18px] tabular-nums">{kg(held.kg)}</strong> <span className="text-muted">of {held.type} · left by <Link href={`/production/batches/${held.batchId}`} className="font-semibold text-green">{held.batchId}</Link></span>
                <div className="text-[12px] text-muted">This run is made on top of it. Take it out first if the next type cannot take it.</div>
              </div>
              {!blocked && takeOutButton}
            </div>
          ) : <div className="text-[13px]"><strong>The mixer is empty.</strong> <span className="text-muted">This run starts from fresh ingredients only.</span></div>}
          {takenOut && <div className="mt-3"><Notice tone="green" icon={CheckCircle2}>{takenOut}</Notice></div>}
        </SubStep>

        <SubStep n={2} title="Choose what to make" done={!!ready}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chocolate type">
              <Select value={recipeId} onChange={(e) => { setRecipeId(e.target.value); setLines({}); setMade(undefined); }} aria-label="Chocolate type">
                <option value="">Choose…</option>
                {store.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field
              label="Fresh ingredients to add"
              hint={ready && recipe ? (held ? `With the ${kg(heldKg)} in the mixer this makes ${kg(total)} of ${recipe.name}.` : `This makes ${kg(total)} of ${recipe.name}.`) : held ? `The run makes this plus the ${kg(heldKg)} in the mixer.` : 'The total weight of liquor, butter, sugar and the rest.'}
            >
              <UnitInput unit="kg" value={toRun} onChange={(e) => { setToRun(e.target.value); setLines({}); setMade(undefined); }} aria-label="Kg to run" />
            </Field>
          </div>
          {blocked && held && (
            <div className="mt-4">
              <Notice tone="danger" icon={AlertTriangle}>
                <div>The mixer holds {heldText(held)}, which has {plan!.blocked.join(' and ').toLowerCase()}. {recipe!.name} has none: take the chocolate out of the mixer first.</div>
                <div className="mt-2">{takeOutButton}</div>
              </Notice>
            </div>
          )}
          {tooSmall && held && (
            <div className="mt-4"><Notice tone="warn" icon={AlertTriangle}>With {heldText(held)} in the mixer, run at least <strong>{kg(plan!.minRun)}</strong> of {recipe!.name}. Less would need an ingredient taken out again.</Notice></div>
          )}
        </SubStep>

        <SubStep n={3} title="Weigh in the ingredients" done={!!weighedIn} hint={ready ? 'change any you weighed differently' : undefined} waiting={!ready ? 'opens when the type and amount are chosen' : undefined}>
          <div className="-mx-5 border-t border-line max-[640px]:-mx-[14px]">
            <div className="hidden grid-cols-[1fr_90px_110px_140px_1fr] gap-3 px-5 py-2 text-[11px] font-bold tracking-wide text-faint uppercase md:grid"><span>Ingredient</span><span className="text-right">In mixer</span><span className="text-right">To add</span><span>Weighed in</span><span>From</span></div>
            {rows.map((r) => (
              <div key={r.name} className="border-t border-line px-5 py-3 max-[640px]:px-[14px]">
                {r.parts.map((p, index) => {
                  const nth = index ? ` (${index + 1})` : '';
                  // More than the place holds on record: offer to take the rest from the next one.
                  const short = (p.source !== '' || r.fromBatch > 0) && (Number(p.kg) || 0) > p.has + 0.005;
                  return (
                    <div key={index} className={index ? 'mt-2' : undefined}>
                      <div className="grid gap-2 md:grid-cols-[1fr_90px_110px_140px_1fr] md:items-center md:gap-3">
                        {index === 0 ? (
                          <>
                            <span><strong>{r.name}</strong> <span className="text-[12px] text-muted">{r.percent}%</span></span>
                            <span className="text-[13px] text-muted md:text-right">{r.inMixer > 0 ? `${kg(r.inMixer)} in mixer` : <span className="md:hidden">nothing in mixer</span>}</span>
                            <span className="text-[13px] md:text-right">Add <strong className="tabular-nums">{kg(r.add)}</strong></span>
                          </>
                        ) : <span className="text-[12px] text-muted md:col-span-3 md:text-right">and from</span>}
                        <UnitInput unit="kg" value={p.kg} onChange={(e) => setPart(r, index, { kg: e.target.value })} aria-label={`${r.name} weighed in${nth}`} />
                        <span className="flex items-center gap-2">
                          <Select value={p.source} onChange={(e) => setPart(r, index, { source: e.target.value })} aria-label={`${r.name} from${nth}`}>
                            {p.free.map((s) => <option key={s} value={s}>{s === '' ? `This batch · ${kg(r.fromBatch)} left` : `${s} · ${kg(r.has(s))} available`}</option>)}
                            {p.free.length === 0 && <option value="">No {r.name.toLowerCase()} in store</option>}
                          </Select>
                          {index > 0 && <button type="button" className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 10px' }} onClick={() => setParts(r.name, r.parts.filter((_, j) => j !== index).map((x) => ({ kg: x.kg, source: x.source })))} aria-label={`Remove ${r.name} from ${p.source || 'this batch'}`}><X size={15} /></button>}
                        </span>
                      </div>
                      {short && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-warn">
                          <span>{p.source || 'This batch'} has only {kg(p.has)}.</span>
                          {r.unused.length > 0
                            ? <button type="button" className="btn-text font-semibold" onClick={() => takeRest(r, index)}>Take the other {kg(round2((Number(p.kg) || 0) - p.has))} from {r.unused[0] || 'this batch'}</button>
                            : <span>{p.source ? `No other lot of ${r.name.toLowerCase()} is in store: the lot is saved as used up.` : `No lot of ${r.name.toLowerCase()} is in store.`}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                  {r.unused.length > 0 ? <button type="button" className="btn-text font-semibold text-green" onClick={() => setParts(r.name, [...r.parts.map((x) => ({ kg: x.kg, source: x.source })), { kg: '', source: r.unused[0] }])}>+ From another lot too</button> : <span />}
                  {r.parts.length > 1 && <span>{r.name} weighed in: <strong className="text-ink tabular-nums">{kg(r.actual)}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        </SubStep>

        <SubStep n={4} title="Weigh out the chocolate" waiting={!ready ? 'after weighing in' : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chocolate taken out" hint="Weighed out of the mixer. It becomes a lot of this type.">
              <UnitInput unit="kg" value={made ?? String(madeKg)} onChange={(e) => setMade(e.target.value)} aria-label="Chocolate taken out" />
            </Field>
            <Field label="Kept in the mixer for the next run" hint="Set to 0 if the mixer is run empty.">
              <UnitInput unit="kg" value={kept} onChange={(e) => setKept(e.target.value)} aria-label="Kept in the mixer" />
            </Field>
          </div>
        </SubStep>

        {ready && (
          <div className="mix-save">
            <div className="save-bar">
              <LiveBalance balance={balance} limit={store.thresholds.variancePct.mixing ?? 0} wasteLimit={store.thresholds.wastePct} />
              {error && !changedElsewhere && <div className="save-bar-error" role="alert">{error}</div>}
              {changedElsewhere && <div className="save-bar-error" role="alert">The mixer was just used on another device, so these amounts are out of date. Nothing is saved. <button type="button" className="btn-text" onClick={onRestart}>Start again</button></div>}
              <Button type="submit" className="flex-1" disabled={saving || changedElsewhere || !!tooSmall}><Check size={16} /> {saving ? 'Saving…' : `Save ${recipe?.name ?? 'run'}`}</Button>
            </div>
          </div>
        )}
      </form>
    </li>
  );
}
