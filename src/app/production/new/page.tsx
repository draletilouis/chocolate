'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

export default function NewBatchPage() {
  const store = useStore();
  const router = useRouter();
  const [productId, setProductId] = useState(store.products[0]?.id ?? '');
  const [batchName, setBatchName] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [batchSize, setBatchSize] = useState('100');
  const [version, setVersion] = useState<number | null>(null);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [ingredientLots, setIngredientLots] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const batchableProducts = store.products.filter((p) => !p.catalogOnly);

  const product = batchableProducts.find((p) => p.id === productId);
  const route = store.routes.find((r) => r.id === product?.route);
  const recipe = store.recipes.find((r) => r.id === product?.recipeId);
  const recipeVersion = recipe?.versions.find((v) => v.version === (version ?? recipe.currentVersion));
  const sourceMaterial = route?.id === 'beans' ? 'Cocoa beans' : route?.id === 'pressing' ? 'Liquor' : null;

  const ingredients = useMemo(() => {
    if (!recipeVersion) return [];
    const size = Number(batchSize) || 0;
    return recipeVersion.ingredients.map((i) => {
      const expected = round2((size * i.percent) / 100);
      const actual = actuals[i.name] === undefined ? expected : Number(actuals[i.name]) || 0;
      const lots = store.lots.filter((l) => l.material === i.name && l.available > 0 && l.unit === 'kg');
      return { name: i.name, expected, actual, lots, lotId: ingredientLots[i.name] ?? lots[0]?.id ?? '' };
    });
  }, [recipeVersion, batchSize, actuals, ingredientLots, store.lots]);
  const ingredientTotal = round2(ingredients.reduce((sum, i) => sum + i.actual, 0));

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!product || !route) return;
    if (route.id === 'chocolate') {
      if (!recipeVersion || ingredientTotal <= 0) return setError('Enter the ingredient weights you actually used.');
      const id = store.createBatch({
        productId, name: batchName, batchDate, startWeight: ingredientTotal, recipeVersion: recipeVersion.version, note,
        ingredients: ingredients.map((i) => ({ name: i.name, expected: i.expected, actual: i.actual, lotId: i.lotId || undefined })),
        lotUses: ingredients.filter((i) => i.lotId).map((i) => ({ lotId: i.lotId, quantity: i.actual })),
      });
      router.push(`/production/batches/${id}/record/${route.stations[0]}`);
      return;
    }
    const startWeight = Number(weight);
    if (!(startWeight > 0)) return setError('Enter the weight from the scale.');
    const id = store.createBatch({ productId, name: batchName, batchDate, startWeight, note, lotUses: [] });
    router.push(`/production/batches/${id}/record/${route.stations[0]}`);
  }

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow="New batch" title="Start a batch" subtitle="Choose what you are making and where the material comes from. You will weigh outputs at each station." />
      <form onSubmit={submit}>
        <Panel title="Batch">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Product">
              <Select value={productId} onChange={(e) => { setProductId(e.target.value); setVersion(null); setActuals({}); setIngredientLots({}); }}>
                {batchableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Route" hint={route?.note}>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px]">{route?.name} · starts at {stationName(route?.stations[0])}</div>
            </Field>
            <Field label="Batch name (optional)" hint="Use a memorable name for the production run. The system ID is kept automatically.">
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} maxLength={80} placeholder="e.g. Monday morning roast" />
            </Field>
            <Field label="Batch date" hint="Use the production date so past batches appear in the correct report period.">
              <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} aria-label="Batch date" required />
            </Field>
          </div>
        </Panel>

        {sourceMaterial && (
          <Panel title="Starting material" subtitle="Enter the weight from the scale before the first station.">
            <div className="p-5">
              <Field label="Starting weight" hint="Whatever the scale shows before the first station.">
                <UnitInput unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Starting weight" required autoFocus />
              </Field>
            </div>
          </Panel>
        )}

        {recipe && recipeVersion && (
          <Panel title="Recipe ingredients" subtitle="Expected comes from the recipe. Enter what you actually weighed in.">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Recipe version">
                <Select value={recipeVersion.version} onChange={(e) => setVersion(Number(e.target.value))}>
                  {recipe.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.version === recipe.currentVersion ? ' (current)' : ''}{v.note ? ` · ${v.note}` : ''}</option>)}
                </Select>
              </Field>
              <Field label="Planned batch size" hint="Only used to work out the expected amounts. What you actually weigh in can differ.">
                <UnitInput unit="kg" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} aria-label="Batch size" />
              </Field>
            </div>
            <div className="border-t border-line">
              <div className="hidden grid-cols-[1fr_110px_140px_1fr] gap-3 px-5 py-2 text-[11px] font-bold tracking-wide text-faint uppercase md:grid"><span>Ingredient</span><span className="text-right">Expected</span><span>Actual</span><span>Lot</span></div>
              {ingredients.map((i) => (
                <div key={i.name} className="grid gap-2 border-t border-line px-5 py-3 md:grid-cols-[1fr_110px_140px_1fr] md:items-center md:gap-3">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-[13px] text-muted md:text-right">Expected {kg(i.expected)}</span>
                  <UnitInput unit="kg" value={actuals[i.name] ?? String(i.expected)} onChange={(e) => setActuals({ ...actuals, [i.name]: e.target.value })} aria-label={`${i.name} actual`} />
                  <Select value={i.lotId} onChange={(e) => setIngredientLots({ ...ingredientLots, [i.name]: e.target.value })} aria-label={`${i.name} lot`}>
                    <option value="">No lot recorded</option>
                    {i.lots.map((l) => <option key={l.id} value={l.id}>{l.id} · {kg(l.available)} available</option>)}
                  </Select>
                </div>
              ))}
              <div className="flex justify-between border-t border-line bg-paper px-5 py-3 text-[13px]"><span className="text-muted">Total weighed in (becomes the mixing input)</span><strong>{kg(ingredientTotal)}</strong></div>
              {ingredients.filter((i) => i.lotId && i.actual > (i.lots.find((l) => l.id === i.lotId)?.available ?? 0)).map((i) => (
                <div key={i.name} className="px-5 pt-3"><Notice tone="warn">{i.name}: the scale shows {kg(i.actual)} but lot {i.lotId} has only {kg(i.lots.find((l) => l.id === i.lotId)?.available ?? 0)} on record. The batch is saved at the scale weight; the lot record is drawn down to zero.</Notice></div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Note">
          <div className="p-5">
            <Field label="Optional note for the team"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Panel>

        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <LinkButton variant="secondary" href="/production">Cancel</LinkButton>
          <Button type="submit">Create batch and record {stationName(route?.stations[0]).toLowerCase()} <ArrowRight size={15} /></Button>
        </div>
      </form>
    </>
  );
}
