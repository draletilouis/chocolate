'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, PageHeader, Panel, UnitInput } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { num } from '@/lib/format';
import { chocolateIngredients } from '@/lib/seed';
import { useStore } from '@/lib/store';

/** A new chocolate type: its name and recipe, as percentages of the batch weight */
export default function NewChocolateTypePage() {
  const router = useRouter();
  const store = useStore();
  const [name, setName] = useState('');
  const [rows, setRows] = useState(() => chocolateIngredients.map((ingredient) => ({ name: ingredient as string, percent: '', fixed: true })));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const total = round2(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0));
  const balanced = Math.abs(total - 100) <= 0.01;
  const update = (index: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!balanced || saving) return;
    setSaving(true);
    const ingredients = rows.filter((r) => r.name.trim() && Number(r.percent) > 0).map((r) => ({ name: r.name.trim(), percent: Number(r.percent) }));
    const id = await store.addChocolateType({ name: name.trim(), ingredients, note: note.trim() || undefined });
    setSaving(false);
    if (id) router.push(`/recipes/${id}`);
  }

  return (
    <>
      <Back href="/recipes" label="Chocolate types" />
      <PageHeader eyebrow="Recipes" title="New chocolate type" subtitle="Give the type a name and its recipe as a share of the batch weight. It can then be chosen when a chocolate batch is started." />
      <form onSubmit={submit}>
        <Panel title="Chocolate type">
          <div className="p-5">
            <Field label="Name" hint="For example 60% Dark or 45% Milk.">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus aria-label="Chocolate type name" />
            </Field>
          </div>
        </Panel>
        <Panel title="Recipe" subtitle="Leave an ingredient empty if the type does not use it. The percentages must add up to 100.">
          <div className="p-5">
            {rows.map((r, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_140px] items-center gap-2">
                {r.fixed ? <span className="font-medium">{r.name}</span> : <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Ingredient" aria-label={`Ingredient ${i + 1}`} />}
                <UnitInput unit="%" step="0.1" placeholder="0" value={r.percent} onChange={(e) => update(i, { percent: e.target.value })} aria-label={`${r.fixed ? r.name : `Ingredient ${i + 1}`} percent`} />
              </div>
            ))}
            <button type="button" className="mb-3 text-[13px] font-semibold text-green" onClick={() => setRows([...rows, { name: '', percent: '', fixed: false }])}>+ Add another ingredient</button>
            <div className={`text-[13px] ${balanced ? 'text-muted' : 'text-danger'}`}>Total {num(total)}%</div>
          </div>
        </Panel>
        <Panel title="Note">
          <div className="p-5">
            <Field label="Where does this recipe come from? (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
          </div>
        </Panel>
        <div className="flex justify-end gap-2">
          <LinkButton variant="secondary" href="/recipes">Cancel</LinkButton>
          <Button type="submit" disabled={!balanced || !name.trim() || saving}><Check size={15} /> {saving ? 'Saving…' : 'Save chocolate type'}</Button>
        </div>
      </form>
    </>
  );
}
