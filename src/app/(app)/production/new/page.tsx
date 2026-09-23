'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Back, Button, Field, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { round2 } from '@/lib/balance';
import { lotSupplierId, supplierName } from '@/lib/derive';
import { kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';
import type { Lot } from '@/lib/types';

/** Lots a pressing batch can start from, best match first (older lots keep the names the rows had before the bean summary's wording) */
const pressable = ['Crushed nibs for butter', 'Nibs for butter', 'Crushed nibs for liquor', 'Nibs'];

export default function NewBatchPage() {
  const store = useStore();
  const router = useRouter();
  const { user } = useAuth();
  const [productId, setProductId] = useState(store.products[0]?.id ?? '');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [batchSize, setBatchSize] = useState('100');
  const [version, setVersion] = useState<number | null>(null);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [ingredientLots, setIngredientLots] = useState<Record<string, string>>({});
  const [nibLotId, setNibLotId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState('');

  const product = store.products.find((p) => p.id === productId);
  const route = store.routes.find((r) => r.id === product?.route);
  const recipe = store.recipes.find((r) => r.id === product?.recipeId);
  const recipeVersion = recipe?.versions.find((v) => v.version === (version ?? recipe.currentVersion));
  const sourceMaterial = route?.id === 'beans' ? 'Cocoa beans' : route?.id === 'pressing' ? 'Nibs' : null;

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

  // Crushed nibs for butter, stored at winnowing, are what a pressing batch starts from.
  const nibLots = store.lots.filter((l) => pressable.includes(l.material) && l.available > 0 && l.unit === 'kg')
    .sort((a, b) => pressable.indexOf(a.material) - pressable.indexOf(b.material));
  const nibLot = route?.id === 'pressing' ? nibLots.find((l) => l.id === (nibLotId ?? nibLots[0]?.id)) : undefined;

  // The supplier follows the cocoa: a pressing batch takes it from its nibs lot, a chocolate batch from its
  // liquor lot (or its butter lot when the recipe has no liquor). Bean batches, and batches without a lot, choose it.
  const base = ingredients.find((i) => i.name === 'Liquor') ?? ingredients.find((i) => i.name === 'Cocoa butter');
  const sourceLot = route?.id === 'pressing' ? nibLot : route?.id === 'chocolate' ? store.lots.find((l) => l.id === base?.lotId) : undefined;
  const inheritedSupplierId = lotSupplierId(store, sourceLot);
  const batchSupplierId = inheritedSupplierId ?? supplierId;
  const beanSuppliers = store.suppliers.filter((s) => /bean/i.test(s.supplies));
  const otherSuppliers = store.suppliers.filter((s) => !/bean/i.test(s.supplies));

  const lotLabel = (l: Lot) => {
    const supplier = lotSupplierId(store, l);
    return [l.id, `${kg(l.available)} available`, l.source.type === 'batch' ? `batch ${l.source.batchId}` : undefined, supplier && supplierName(store, supplier)].filter(Boolean).join(' · ');
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!product || !route) return;
    if (!batchSupplierId) return setError(route.id === 'beans' ? 'Choose the supplier the beans came from.' : 'Choose the supplier, or pick the lot this batch starts from.');
    if (route.id === 'chocolate') {
      if (!recipeVersion || ingredientTotal <= 0) return setError('Enter the ingredient weights you actually used.');
      try {
        const id = await store.createBatch({
          productId, supplierId: batchSupplierId, startWeight: ingredientTotal, recipeVersion: recipeVersion.version, note,
          ingredients: ingredients.map((i) => ({ name: i.name, expected: i.expected, actual: i.actual, lotId: i.lotId || undefined })),
          lotUses: ingredients.filter((i) => i.lotId).map((i) => ({ lotId: i.lotId, quantity: i.actual })),
        });
        router.push(`/production/batches/${id}/record/${route.stations[0]}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the batch.'); }
      return;
    }
    const startWeight = Number(weight);
    if (!(startWeight > 0)) return setError('Enter the weight from the scale.');
    try {
      const id = await store.createBatch({ productId, supplierId: batchSupplierId, startWeight, note, lotUses: nibLot ? [{ lotId: nibLot.id, quantity: startWeight }] : [] });
      router.push(`/production/batches/${id}/record/${route.stations[0]}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the batch.'); }
  }

  const supplierField = inheritedSupplierId && sourceLot ? (
    <Field label="Supplier" hint={`From lot ${sourceLot.id}${sourceLot.source.type === 'batch' ? `, made by batch ${sourceLot.source.batchId}` : ''}.`}>
      <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px]"><strong>{supplierName(store, inheritedSupplierId)}</strong></div>
    </Field>
  ) : (
    <Field label="Supplier" hint={<>{route?.id === 'beans' ? 'Who delivered the beans in this batch.' : 'No lot picked, so choose where the cocoa came from.'}{user.role === 'admin' && <> Not listed? <Link href="/setup/suppliers" className="font-semibold text-green">Add a supplier</Link>.</>}</>}>
      <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
        <option value="">Choose the supplier…</option>
        {beanSuppliers.length > 0 && <optgroup label="Cocoa bean suppliers">{beanSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
        {otherSuppliers.length > 0 && <optgroup label="Other suppliers">{otherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.supplies}</option>)}</optgroup>}
      </Select>
    </Field>
  );

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow="New batch" title="Start a batch" subtitle="Choose what you are making and where the material comes from. You will weigh outputs at each station." />
      <form onSubmit={submit}>
        <Panel title="Batch">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Product">
              <Select value={productId} onChange={(e) => { setProductId(e.target.value); setVersion(null); setActuals({}); setIngredientLots({}); setNibLotId(null); }}>
                {store.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Route" hint={route?.note}>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px]">{route?.name} · starts at {stationName(route?.stations[0])}</div>
            </Field>
          </div>
        </Panel>

        {sourceMaterial && (
          <Panel title="Starting material" subtitle={route?.id === 'pressing' ? 'Pick the nibs you are pressing, then enter the weight from the scale.' : 'One batch is one sack. Choose the supplier, then weigh the sack before it goes into the roaster.'}>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {route?.id === 'pressing' && (
                <Field label="Nibs lot" hint={nibLots.length ? 'Crushed nibs for butter, stored at winnowing.' : 'No nibs are stored for pressing. Crushed nibs for butter are stored at winnowing.'}>
                  <Select value={nibLot?.id ?? ''} onChange={(e) => setNibLotId(e.target.value)} aria-label="Nibs lot">
                    <option value="">No lot recorded</option>
                    {nibLots.map((l) => <option key={l.id} value={l.id}>{lotLabel(l)}</option>)}
                  </Select>
                </Field>
              )}
              {supplierField}
              {route?.id === 'beans' ? (
                <Field label="Bag weight" hint="The sack's weight on the scale, as on the bean summary.">
                  <UnitInput unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Bag weight" required />
                </Field>
              ) : (
                <Field label="Starting weight" hint="Whatever the scale shows before the first station.">
                  <UnitInput unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Starting weight" required />
                </Field>
              )}
            </div>
            {nibLot && Number(weight) > nibLot.available && (
              <div className="px-5 pb-4"><Notice tone="warn">The scale shows {kg(Number(weight))} but lot {nibLot.id} has only {kg(nibLot.available)} on record. The batch is saved at the scale weight; the lot record is drawn down to zero.</Notice></div>
            )}
          </Panel>
        )}

        {recipe && recipeVersion && (
          <Panel title="Liquor and recipe additions" subtitle="The liquor goes into the refiner with the additions and becomes chocolate. Expected comes from the recipe; enter what you actually weighed in.">
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
                    {i.lots.map((l) => <option key={l.id} value={l.id}>{lotLabel(l)}</option>)}
                  </Select>
                </div>
              ))}
              <div className="flex justify-between border-t border-line bg-paper px-5 py-3 text-[13px]"><span className="text-muted">Total weighed in (the {stationName(route?.stations[0]).toLowerCase()} input)</span><strong>{kg(ingredientTotal)}</strong></div>
              {ingredients.filter((i) => i.lotId && i.actual > (i.lots.find((l) => l.id === i.lotId)?.available ?? 0)).map((i) => (
                <div key={i.name} className="px-5 pt-3"><Notice tone="warn">{i.name}: the scale shows {kg(i.actual)} but lot {i.lotId} has only {kg(i.lots.find((l) => l.id === i.lotId)?.available ?? 0)} on record. The batch is saved at the scale weight; the lot record is drawn down to zero.</Notice></div>
              ))}
              <div className="grid gap-4 p-5 md:grid-cols-2">{supplierField}</div>
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
