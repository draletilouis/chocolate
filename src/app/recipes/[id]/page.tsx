'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, Table, td, tdNum } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { batchDisplayName } from '@/lib/derive';
import { dateTime, num } from '@/lib/format';
import { useStore } from '@/lib/store';

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const store = useStore();
  const recipe = store.recipes.find((r) => r.id === id);
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState<{ name: string; percent: string }[]>([]);
  const [note, setNote] = useState('');
  if (!recipe) return <Empty>Recipe {id} was not found.</Empty>;

  const product = store.products.find((p) => p.id === recipe.productId);
  const allRecipeBatches = store.batches.filter((b) => b.recipeId === recipe.id);
  const batches = store.batches.filter((b) => b.recipeId === recipe.id && b.ingredients);
  const canDelete = allRecipeBatches.length === 0;
  const total = round2(draft.reduce((s, d) => s + (Number(d.percent) || 0), 0));

  function startDraft() {
    const current = recipe!.versions.find((v) => v.version === recipe!.currentVersion)!;
    setDraft(current.ingredients.map((i) => ({ name: i.name, percent: String(i.percent) })));
    setAdding(true);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (Math.abs(total - 100) > 0.01) return;
    store.addRecipeVersion(recipe!.id, draft.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), percent: Number(d.percent) || 0 })), note);
    setAdding(false); setNote('');
  }

  return (
    <>
      <Back href="/recipes" label="Recipes" />
      <PageHeader eyebrow="Recipe" title={recipe.name} subtitle={`Product: ${product?.name ?? recipe.productId} · current version v${recipe.currentVersion}`}
        action={<div className="flex flex-wrap justify-end gap-2"><LinkButton variant="secondary" href="/production/new">Start a batch</LinkButton><Button variant="secondary" onClick={() => setEditingName((value) => !value)}><Pencil size={14} /> Edit name</Button><Button variant="danger" disabled={!canDelete} title={canDelete ? 'Delete recipe' : 'Recipes used by batches cannot be deleted.'} onClick={() => { if (canDelete && window.confirm(`Delete recipe ${recipe.name}?`)) { store.deleteRecipe(recipe.id); router.push('/recipes'); } }}><Trash2 size={14} /> Delete</Button>{!adding && <Button onClick={startDraft}><Plus size={15} /> New version</Button>}</div>} />

      {editingName && <Panel title="Edit recipe" subtitle="This changes the recipe label only. Existing version history remains unchanged.">
        <form className="flex flex-wrap items-end gap-3 p-5" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); store.updateRecipe(recipe.id, { name: String(form.get('name')) }); setEditingName(false); }}>
          <Field label="Recipe name" className="min-w-[240px] flex-1"><Input name="name" defaultValue={recipe.name} required /></Field>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setEditingName(false)}>Cancel</Button><Button type="submit">Save changes</Button></div>
        </form>
      </Panel>}

      {adding && (
        <form onSubmit={submit}>
          <Panel title={`New version v${recipe.versions.length + 1}`} subtitle="Percentages must add up to 100. The new version becomes current.">
            <div className="p-5">
              {draft.map((d, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_120px] gap-2">
                  <Input value={d.name} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Ingredient ${i + 1}`} />
                  <Input type="number" step="0.1" min="0" value={d.percent} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} aria-label={`Ingredient ${i + 1} percent`} />
                </div>
              ))}
              <button type="button" className="mb-3 text-[13px] font-semibold text-green" onClick={() => setDraft([...draft, { name: '', percent: '' }])}>+ Add ingredient</button>
              <div className={`mb-3 text-[13px] ${Math.abs(total - 100) > 0.01 ? 'text-danger' : 'text-muted'}`}>Total {num(total)}%</div>
              <Field label="What changed?"><Input value={note} onChange={(e) => setNote(e.target.value)} required /></Field>
              <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={Math.abs(total - 100) > 0.01}><Check size={15} /> Save version</Button></div>
            </div>
          </Panel>
        </form>
      )}

      <Panel title="Versions">
        {[...recipe.versions].reverse().map((v) => (
          <div key={v.version} className="border-b border-line px-5 py-3 text-[13px] last:border-b-0">
            <div className="flex flex-wrap items-center gap-2"><strong>v{v.version}</strong>{v.version === recipe.currentVersion && <Badge tone="green">Current</Badge>}<span className="text-muted">{dateTime(v.createdAt)}{v.note ? ` · ${v.note}` : ''}</span></div>
            <div className="text-muted">{v.ingredients.map((i) => `${i.name} ${i.percent}%`).join(' · ')}</div>
          </div>
        ))}
      </Panel>

      <Panel title="Expected vs actual" subtitle="What each batch actually weighed in, against the recipe version it used.">
        {batches.length === 0 && <Empty>No batches have used this recipe yet.</Empty>}
        {batches.map((b) => {
          const expected = round2(b.ingredients!.reduce((s, i) => s + i.expected, 0));
          const actual = round2(b.ingredients!.reduce((s, i) => s + i.actual, 0));
          return (
            <div key={b.id} className="border-b border-line last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 px-5 pt-3 text-[13px]"><Link href={`/production/batches/${b.id}`} className="font-bold text-green">{batchDisplayName(b)}</Link>{b.name && <span className="text-[11px] text-muted">ID {b.id}</span>}<span className="text-muted">v{b.recipeVersion} · expected {num(expected)} kg · actual {num(actual)} kg</span></div>
              <Table head={['Ingredient', 'Expected', 'Actual', 'Difference', 'Lot']}>
                {b.ingredients!.map((i) => { const diff = round2(i.actual - i.expected); return (
                  <tr key={i.name}><td className={td}>{i.name}</td><td className={tdNum}>{num(i.expected)} kg</td><td className={tdNum}>{num(i.actual)} kg</td><td className={`${tdNum} ${diff !== 0 ? 'text-warn' : 'text-muted'}`}>{diff > 0 ? '+' : ''}{num(diff)} kg</td><td className={td}>{i.lotId ? <Link href={`/materials/${i.lotId}`} className="font-semibold text-green">{i.lotId}</Link> : <span className="text-faint">—</span>}</td></tr>
                ); })}
              </Table>
            </div>
          );
        })}
      </Panel>
      {!adding && recipe.versions.length > 1 && <Notice tone="neutral">Older versions stay on record so past batches can still be compared with what they used. Versions cannot be edited or deleted after creation.</Notice>}
    </>
  );
}
