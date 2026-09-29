'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { EditForm, RowActions } from '@/components/RowActions';
import { Back, Badge, Empty, Field, Input, LinkButton, Notice, PageHeader, Panel, Table, td, tdNum } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { dateTime, num } from '@/lib/format';
import { useStore } from '@/lib/store';

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const store = useStore();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const recipe = store.recipes.find((r) => r.id === id);
  const [editing, setEditing] = useState(search.get('edit') === '1');
  const [draft, setDraft] = useState<{ name: string; percent: string }[] | null>(null);
  const [saved, setSaved] = useState('');
  if (!recipe) return <Empty>Recipe {id} was not found.</Empty>;

  const product = store.products.find((p) => p.id === recipe.productId);
  const current = recipe.versions.find((v) => v.version === recipe.currentVersion);
  const batches = store.batches.filter((b) => b.recipeId === recipe.id && b.ingredients);
  const used = store.batches.filter((b) => b.recipeId === recipe.id || b.productId === recipe.productId).length;
  const rows = draft ?? (current?.ingredients ?? []).map((i) => ({ name: i.name, percent: String(i.percent) }));
  const total = round2(rows.reduce((s, d) => s + (Number(d.percent) || 0), 0));
  const currentUsed = store.batches.some((b) => b.recipeId === recipe.id && b.recipeVersion === recipe.currentVersion);

  function close() { setEditing(false); setDraft(null); }

  return (
    <>
      <Back href="/recipes" label="Recipes" />
      <PageHeader eyebrow="Recipe" title={recipe.name} subtitle={`Product: ${product?.name ?? recipe.productId} · current version v${recipe.currentVersion}`}
        action={<span className="flex flex-wrap items-center gap-3"><LinkButton variant="secondary" href="/production/new">Start a batch</LinkButton>
          {isAdmin && !editing && <RowActions name={recipe.name} onEdit={() => { setEditing(true); setSaved(''); }}
            onDelete={async () => { await store.deleteRecipe(recipe.id); router.push('/recipes'); }}
            blocked={used ? `${recipe.name} is used by ${used} batch${used === 1 ? '' : 'es'}, so it can't be deleted. You can edit it instead.` : undefined} />}</span>} />

      {saved && <Notice tone="green">{saved}</Notice>}

      {editing && isAdmin && (
        <Panel title="Edit recipe" subtitle={currentUsed
          ? `Batches have used v${recipe.currentVersion}, so new figures are saved as v${recipe.versions.length + 1} and v${recipe.currentVersion} stays as it was. A new name applies straight away.`
          : `No batch has used v${recipe.currentVersion} yet, so the figures are corrected in place. Percentages must add up to 100.`}>
          <div className="p-5">
            <EditForm className="grid gap-2" onCancel={close} onSubmit={async (d) => {
              if (Math.abs(total - 100) > 0.01) throw new Error(`The percentages add up to ${num(total)}%. They must add up to 100%.`);
              const ingredients = rows.filter((r) => r.name.trim() && Number(r.percent) > 0).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) }));
              const result = await store.updateRecipe(recipe.id, String(d.get('name')), ingredients, String(d.get('note') ?? ''));
              setSaved(result.versioned ? `Saved as v${result.version}. The earlier version stays as it was for the batches that used it.` : `Saved. v${result.version} is updated.`);
              close();
            }}>
              <Field label="Name" hint="Also the name of the product it makes."><Input name="name" defaultValue={recipe.name} required aria-label="Recipe name" /></Field>
              {rows.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px] gap-2">
                  <Input value={d.name} onChange={(e) => setDraft(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Ingredient ${i + 1}`} />
                  <Input type="number" step="0.1" min="0" value={d.percent} onChange={(e) => setDraft(rows.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} aria-label={`Ingredient ${i + 1} percent`} placeholder="%" />
                </div>
              ))}
              <button type="button" className="justify-self-start text-[13px] font-semibold text-green" onClick={() => setDraft([...rows, { name: '', percent: '' }])}>+ Add ingredient</button>
              <div className={`text-[13px] ${Math.abs(total - 100) > 0.01 ? 'text-danger' : 'text-muted'}`}>Total {num(total)}%</div>
              <Field label="What changed? (optional)"><Input name="note" placeholder="For example: new figures from the factory" /></Field>
            </EditForm>
          </div>
        </Panel>
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
              <div className="flex flex-wrap items-center gap-2 px-5 pt-3 text-[13px]"><Link href={`/production/batches/${b.id}`} className="font-bold text-green">{b.id}</Link><span className="text-muted">v{b.recipeVersion} · expected {num(expected)} kg · actual {num(actual)} kg</span></div>
              <Table head={['Ingredient', 'Expected', 'Actual', 'Difference', 'Lot']}>
                {b.ingredients!.map((i) => { const diff = round2(i.actual - i.expected); return (
                  <tr key={i.name}><td className={td}>{i.name}</td><td className={tdNum}>{num(i.expected)} kg</td><td className={tdNum}>{num(i.actual)} kg</td><td className={`${tdNum} ${diff !== 0 ? 'text-warn' : 'text-muted'}`}>{diff > 0 ? '+' : ''}{num(diff)} kg</td><td className={td}>{i.lotId ? <Link href={`/materials/${i.lotId}`} className="font-semibold text-green">{i.lotId}</Link> : <span className="text-faint">—</span>}</td></tr>
                ); })}
              </Table>
            </div>
          );
        })}
      </Panel>
      {!editing && recipe.versions.length > 1 && <Notice tone="neutral">Older versions stay on record so past batches can still be compared with what they used.</Notice>}
    </>
  );
}
