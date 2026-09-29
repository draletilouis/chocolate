'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Empty, Field, Input, Notice, PageHeader, Panel, Select, Stat, Table, UnitInput, td, tdNum } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { userName } from '@/lib/derive';
import { dateTime, kg } from '@/lib/format';
import { planProgress } from '@/lib/plan';
import { useStore } from '@/lib/store';

interface Row { recipeId: string; packSizeId: string; pieces: string }

const today = () => new Date().toISOString().slice(0, 10);

function Progress({ made, planned }: { made: number; planned: number }) {
  const share = planned ? Math.min(100, Math.round((made / planned) * 100)) : 0;
  return <div className="ml-auto mt-1 h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-moss-dark" role="img" aria-label={`${share}% made`}><div className="h-full bg-green" style={{ width: `${share}%` }} /></div>;
}

/** The production plan: pieces of each chocolate type and size to make, and how far along it is */
export default function PlanPage() {
  const store = useStore();
  const isManager = (store.signedInUser ?? store.users.find((u) => u.id === store.currentUserId))?.access !== 'operator';
  const progress = planProgress(store);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function startEditing() {
    const plan = store.plan;
    setRows(plan?.lines.length ? plan.lines.map((l) => ({ recipeId: l.recipeId, packSizeId: l.packSizeId, pieces: String(l.pieces) })) : [{ recipeId: store.recipes[0]?.id ?? '', packSizeId: store.packSizes[0]?.id ?? '', pieces: '' }]);
    setFrom(plan?.from ?? today());
    setNote(plan?.note ?? '');
    setError('');
    setEditing(true);
  }
  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    const lines = rows.filter((r) => r.recipeId && r.packSizeId && Math.floor(Number(r.pieces)) > 0).map((r) => ({ recipeId: r.recipeId, packSizeId: r.packSizeId, pieces: Math.floor(Number(r.pieces)) }));
    if (lines.length === 0) return setError('Enter the pieces to make for at least one chocolate type and size.');
    const keys = lines.map((l) => `${l.recipeId}|${l.packSizeId}`);
    const twice = keys.find((k, i) => keys.indexOf(k) !== i);
    if (twice) {
      const [recipeId, packSizeId] = twice.split('|');
      return setError(`${store.recipes.find((r) => r.id === recipeId)?.name} · ${store.packSizes.find((p) => p.id === packSizeId)?.name} is in the plan twice. Give it one line.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return setError('Choose the date to count pieces from.');
    setSaving(true);
    const ok = await store.setPlan({ lines, from, note: note.trim() || undefined });
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <>
        <PageHeader eyebrow="Production plan" title={store.plan ? 'Change the plan' : 'Set the plan'} subtitle="The pieces of each chocolate type and size to make. Pieces recorded at Pieces from the start date count towards it." />
        <form onSubmit={save} noValidate>
          <Panel title="Pieces to make" subtitle="One line for each chocolate type and size. Sizes are set in Setup → Piece sizes.">
            <div className="p-5">
              {rows.map((r, i) => (
                <div key={i} className="mb-3 grid grid-cols-[1fr_1fr] items-end gap-2 border-b border-line pb-3 last-of-type:border-b-0 md:grid-cols-[1.4fr_1fr_160px_auto] md:border-b-0 md:pb-0">
                  <Field label="Chocolate type" className={i ? 'md:[&>.form-label]:hidden' : ''}>
                    <Select value={r.recipeId} onChange={(e) => update(i, { recipeId: e.target.value })} aria-label={`Line ${i + 1} chocolate type`}>
                      {store.recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Size" className={i ? 'md:[&>.form-label]:hidden' : ''}>
                    <Select value={r.packSizeId} onChange={(e) => update(i, { packSizeId: e.target.value })} aria-label={`Line ${i + 1} size`}>
                      {store.packSizes.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.grams} g)</option>)}
                    </Select>
                  </Field>
                  <Field label="Pieces" className={i ? 'md:[&>.form-label]:hidden' : ''}>
                    <UnitInput unit="pieces" step="1" min="0" placeholder="0" value={r.pieces} onChange={(e) => update(i, { pieces: e.target.value })} aria-label={`Line ${i + 1} pieces`} />
                  </Field>
                  <Button variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} disabled={rows.length === 1}><Trash2 size={15} /></Button>
                </div>
              ))}
              <button type="button" className="text-[13px] font-semibold text-green" onClick={() => setRows([...rows, { recipeId: store.recipes[0]?.id ?? '', packSizeId: store.packSizes[0]?.id ?? '', pieces: '' }])}><Plus size={13} className="inline" /> Add a line</button>
            </div>
          </Panel>
          <Panel title="Counting">
            <div className="grid gap-4 p-5 md:grid-cols-[220px_1fr]">
              <Field label="Count pieces made from" hint="Pieces recorded before this day do not count.">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Count pieces made from" />
              </Field>
              <Field label="Note (optional)" hint="For example the week or the order it is for.">
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Plan note" />
              </Field>
            </div>
          </Panel>
          {error && <Notice tone="danger" icon={AlertTriangle}>{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}><Check size={15} /> {saving ? 'Saving…' : 'Save plan'}</Button>
          </div>
        </form>
      </>
    );
  }

  if (!progress) {
    return (
      <>
        <PageHeader eyebrow="Production plan" title="No plan yet" subtitle="The plan says how many pieces of each chocolate type and size to make." />
        <Panel><Empty>{isManager ? 'Set the plan and everyone can see how far along it is.' : 'A manager has not set a plan yet.'}</Empty></Panel>
        {isManager && <div className="flex justify-end"><Button onClick={startEditing}><Plus size={15} /> Set the plan</Button></div>}
      </>
    );
  }

  const { plan, lines, types, ingredients } = progress;
  const shortfall = ingredients.filter((i) => i.short > 0);
  const toMix = round2(types.reduce((sum, t) => sum + t.toMix, 0));
  return (
    <>
      <PageHeader eyebrow="Production plan" title={progress.left ? `${progress.left} pieces left to make` : 'The plan is done'}
        subtitle={<>Counting pieces made from {plan.from}{plan.note ? ` · ${plan.note}` : ''} · set by {userName(store, plan.updatedBy)} {dateTime(plan.updatedAt)}</>}
        action={isManager ? <Button variant="secondary" onClick={startEditing}><Pencil size={15} /> Change the plan</Button> : undefined} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Planned" value={progress.planned} hint="pieces" />
        <Stat label="Made" value={progress.made} hint={`${progress.planned ? Math.round((progress.made / progress.planned) * 100) : 0}% of the plan`} />
        <Stat label="Left to make" value={progress.left} hint="pieces" />
        <Stat label="Chocolate to mix" value={kg(toMix)} hint="after what is waiting for pieces" />
      </div>

      <Panel title="Pieces" subtitle="Good pieces recorded at Pieces since the plan's start date.">
        {lines.length === 0 ? <Empty>The plan has no lines.</Empty> : (
          <>
            <div className="hidden md:block">
              <Table head={['Chocolate type', 'Size', 'Planned', 'Made', 'Left', 'Chocolate for the rest']}>
                {lines.map((l) => (
                  <tr key={`${l.recipeId}-${l.packSizeId}`}>
                    <td className={td}><Link href={`/recipes/${l.recipeId}`} className="font-semibold text-green">{l.type}</Link></td>
                    <td className={td}>{l.size}</td>
                    <td className={tdNum}>{l.pieces}</td>
                    <td className={tdNum}><div className="font-semibold">{l.made}</div><Progress made={l.made} planned={l.pieces} /></td>
                    <td className={`${tdNum} ${l.left ? 'font-semibold' : 'text-muted'}`}>{l.left || 'Done'}</td>
                    <td className={tdNum}>{kg(l.leftKg)}</td>
                  </tr>
                ))}
              </Table>
            </div>
            {/* Phones: one line per type and size */}
            <div className="md:hidden">
              {lines.map((l) => (
                <div key={`${l.recipeId}-${l.packSizeId}`} className="border-b border-line px-5 py-3 text-[14px] last:border-b-0">
                  <div className="flex justify-between gap-3"><strong>{l.type} · {l.size}</strong><span className={`tabular-nums ${l.left ? 'font-semibold' : 'text-muted'}`}>{l.left ? `${l.left} left` : 'Done'}</span></div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-muted"><span className="tabular-nums">{l.made} of {l.pieces} made · {kg(l.leftKg)} for the rest</span><Progress made={l.made} planned={l.pieces} /></div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Chocolate still to mix" subtitle="The chocolate the pieces left take, less what is already mixed and waiting to be made into pieces.">
        {types.length === 0 ? <Empty>Nothing in the plan.</Empty> : (
          <Table head={['Type', 'For pieces left', 'Mixed, waiting', 'To mix']}>
            {types.map((t) => (
              <tr key={t.recipeId}>
                <td className={`${td} whitespace-nowrap`}>{t.type}</td>
                <td className={tdNum}>{kg(t.leftKg)}</td>
                <td className={tdNum}>{kg(t.inLots)}</td>
                <td className={`${tdNum} font-semibold`}>{t.toMix ? kg(t.toMix) : 'None'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Ingredients to mix it" subtitle="From each type's current recipe. In store counts lots in Materials; at mixing counts liquor and cocoa butter from batches not yet completed.">
        {ingredients.length === 0 ? <Empty>Nothing left to mix.</Empty> : (
          <Table head={['Ingredient', 'Needed', 'In store', 'At mixing', 'Short']}>
            {ingredients.map((i) => (
              <tr key={i.name}>
                <td className={`${td} whitespace-nowrap`}>{i.name}</td>
                <td className={`${tdNum} font-semibold`}>{kg(i.need)}</td>
                <td className={tdNum}>{kg(i.inStore)}</td>
                <td className={tdNum}>{i.atMixing ? kg(i.atMixing) : '—'}</td>
                <td className={`${tdNum} ${i.short ? 'font-semibold text-danger' : 'text-muted'}`}>{i.short ? kg(i.short) : 'None'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      {shortfall.length > 0
        ? <Notice tone="warn" icon={AlertTriangle}>Not enough {shortfall.map((i) => `${i.name.toLowerCase()} (${kg(i.short)} short)`).join(', ')} for the rest of the plan.</Notice>
        : toMix > 0 && <Notice tone="green">There are enough ingredients for the rest of the plan.</Notice>}
    </>
  );
}
