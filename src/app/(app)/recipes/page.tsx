'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, RowLink } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { num } from '@/lib/format';
import { useStore } from '@/lib/store';

/** Ingredients a new recipe starts with. The names match the material lots a chocolate batch draws from. */
const usualIngredients = ['Liquor', 'Cocoa butter', 'Sugar', 'Milk powder', 'Lecithin'];
const emptyDraft = () => usualIngredients.map((name) => ({ name, percent: '' }));

export default function RecipesPage() {
  const store = useStore();
  const router = useRouter();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const total = round2(draft.reduce((s, d) => s + (Number(d.percent) || 0), 0));

  function close() {
    setAdding(false); setName(''); setDraft(emptyDraft()); setNote(''); setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (Math.abs(total - 100) > 0.01) return setError(`The percentages add up to ${num(total)}%. They must add up to 100%.`);
    try {
      const id = await store.addRecipe(name, draft.filter((d) => d.name.trim() && Number(d.percent) > 0).map((d) => ({ name: d.name.trim(), percent: Number(d.percent) })), note);
      router.push(`/recipes/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the recipe.'); }
  }

  return (
    <>
      <PageHeader eyebrow="Recipes" title="Recipes" subtitle="Each recipe keeps its versions. Batches record which version they used and what was actually weighed in."
        action={user.role === 'admin' && !adding ? <Button onClick={() => setAdding(true)}><Plus size={15} /> New recipe</Button> : undefined} />

      {adding && (
        <form onSubmit={submit}>
          <Panel title="New recipe" subtitle="It starts at version 1 and becomes a product chocolate batches can be started from. Leave an ingredient empty if the recipe has none.">
            <div className="p-5">
              <Field label="Name" hint="As on the production summary, for example 56% Dark chocolate." className="mb-4"><Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Recipe name" required autoFocus /></Field>
              {draft.map((d, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_120px] gap-2">
                  <Input value={d.name} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Ingredient ${i + 1}`} />
                  <Input type="number" step="0.1" min="0" value={d.percent} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} aria-label={`Ingredient ${i + 1} percent`} placeholder="%" />
                </div>
              ))}
              <button type="button" className="mb-3 text-[13px] font-semibold text-green" onClick={() => setDraft([...draft, { name: '', percent: '' }])}>+ Add ingredient</button>
              <div className={`mb-3 text-[13px] ${Math.abs(total - 100) > 0.01 ? 'text-danger' : 'text-muted'}`}>Total {num(total)}%</div>
              <Field label="Where the figures come from (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the factory's recipe card" /></Field>
              {error && <div className="mt-3"><Notice tone="danger">{error}</Notice></div>}
              <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit"><Check size={15} /> Save recipe</Button></div>
            </div>
          </Panel>
        </form>
      )}

      <Panel>
        {store.recipes.map((recipe) => {
          const current = recipe.versions.find((v) => v.version === recipe.currentVersion)!;
          const used = store.batches.filter((b) => b.recipeId === recipe.id).length;
          return (
            <RowLink key={recipe.id} href={`/recipes/${recipe.id}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong>{recipe.name}</strong><Badge tone="green">v{recipe.currentVersion} current</Badge><span className="text-[12px] text-muted">{recipe.versions.length} version{recipe.versions.length > 1 ? 's' : ''} · used by {used} batch{used === 1 ? '' : 'es'}</span></span>
                <span className="block text-[12px] text-muted">{current.ingredients.map((i) => `${i.name} ${i.percent}%`).join(' · ')}</span>
              </span>
            </RowLink>
          );
        })}
      </Panel>
    </>
  );
}
