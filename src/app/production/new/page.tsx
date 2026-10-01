'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { DestinationSelect, LiveBalance, WeightField, emptyWeight, netWeight, type WeightValue } from '@/components/weighing';
import { calculateBalance } from '@/lib/balance';
import { defaultDestination, lotOrigin, suggestBatchName } from '@/lib/derive';
import { kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationById, stationName } from '@/lib/stations';
import type { Destination, Lot, OutputKind } from '@/lib/types';

const beans = 'Cocoa beans';

/** Lots of a material with stock, oldest first: what a new batch can take from the store */
const inStore = (lots: Lot[], material: string) => lots.filter((l) => l.unit === 'kg' && l.available > 0 && l.material === material).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

export default function NewBatchPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><NewBatch /></Suspense>;
}

function NewBatch() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const batchableProducts = store.products;
  // Opened from a lot in store: beans or nibs start the batch that takes them; a chocolate ingredient (or the mixing queue) starts a batch that mixes from store.
  const startLot = store.lots.find((l) => l.id === params.get('lot'));
  const startsFrom = (material: string) => batchableProducts.find((p) => (material === beans ? p.route === 'beans' : store.routes.find((r) => r.id === p.route)?.startMaterial === material));
  const fromStore = params.has('lot') || params.has('chocolate');
  const [productId, setProductId] = useState(() => (startLot && startsFrom(startLot.material)?.id) || (fromStore && batchableProducts.find((p) => p.route === 'chocolate')?.id) || batchableProducts[0]?.id || '');
  // null: the lot the page was opened from, else the oldest in store; '': not from a lot
  const [lotId, setLotId] = useState<string | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const product = batchableProducts.find((p) => p.id === productId);
  const route = store.routes.find((r) => r.id === product?.route);
  const stored = route ? inStore(store.lots, route.startMaterial) : [];
  const fromLot = stored.find((l) => l.id === (lotId ?? (stored.some((x) => x.id === startLot?.id) ? startLot!.id : stored[0]?.id)));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!product || !route) return;
    let id: string | undefined;
    if (route.stations[0] === 'mixing') {
      // The ingredients are weighed in run by run at mixing.
      setSaving(true);
      id = await store.createBatch({ productId, name: batchName, batchDate, startWeight: 0, note, lotUses: [] });
    } else {
      const startWeight = Number(weight);
      if (!(startWeight > 0)) return setError('Enter the weight from the scale.');
      setSaving(true);
      id = await store.createBatch({ productId, name: batchName, batchDate, startWeight, note, lotUses: fromLot ? [{ lotId: fromLot.id, quantity: startWeight }] : [] });
    }
    setSaving(false);
    if (id) router.push(`/production/batches/${id}/record/${route.stations[0]}`);
  }

  const productField = (
    <Field label="Product">
      <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
        {batchableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
    </Field>
  );

  if (route?.id === 'beans' && product) {
    return <ReceiveDelivery productId={product.id} productField={productField} batchDate={batchDate} setBatchDate={setBatchDate} startLotId={startLot?.id} />;
  }

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow="New batch" title="Start a batch" subtitle="Choose what you are making and where the material comes from. You will weigh outputs at each station." />
      <form onSubmit={submit}>
        <Panel title="Batch">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {productField}
            <Field label="Route" hint={route?.note}>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px]">{route?.name} · starts at {stationName(route?.stations[0])}</div>
            </Field>
            <Field label="Batch name (optional)" hint="Printed on labels so the material traces back to the supplier. The system ID is kept automatically.">
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} maxLength={80} placeholder="e.g. Monday morning roast" />
            </Field>
            <Field label="Batch date" hint="Use the production date so past batches appear in the correct report period.">
              <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} aria-label="Batch date" required />
            </Field>
          </div>
        </Panel>

        {route?.id === 'pressing' && (
          <Panel title="Starting material" subtitle="Choose the lot it is taken from, then enter the weight from the scale before the first station.">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Taken from" hint={fromLot ? 'The weight is taken off this lot in the store.' : `No lot of ${route.startMaterial.toLowerCase()} is chosen, so nothing is taken off the store.`}>
                <Select value={fromLot?.id ?? ''} onChange={(e) => setLotId(e.target.value)} aria-label="Taken from">
                  {stored.map((l) => <option key={l.id} value={l.id}>{l.id} · {kg(l.available)} in store · {lotOrigin(store, l)}</option>)}
                  <option value="">Not from a lot in store</option>
                </Select>
              </Field>
              <Field label="Starting weight" hint="Whatever the scale shows before pressing.">
                <UnitInput unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Starting weight" required autoFocus />
              </Field>
            </div>
            {fromLot && Number(weight) > fromLot.available + 0.005 && <div className="px-5 pb-5"><Notice tone="warn">The scale shows {kg(Number(weight))} but lot {fromLot.id} has only {kg(fromLot.available)} on record. The batch is saved at the scale weight and the lot goes to zero.</Notice></div>}
          </Panel>
        )}

        {route?.id === 'chocolate' && (
          <Notice tone="neutral">The batch starts at mixing. There each chocolate type is made in a run, taking liquor, cocoa butter, sugar and milk powder from their lots in store.</Notice>
        )}

        <Panel title="Note">
          <div className="p-5">
            <Field label="Optional note for the team"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Panel>

        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <LinkButton variant="secondary" href="/production">Cancel</LinkButton>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : <>Create batch and record {stationName(route?.stations[0]).toLowerCase()} <ArrowRight size={15} /></>}</Button>
        </div>
      </form>
    </>
  );
}

interface Row { name: string; kind: OutputKind; weight: WeightValue; destination: Destination }

/** Bean deliveries: the batch and its receiving record are created together from one form */
function ReceiveDelivery({ productId, productField, batchDate, setBatchDate, startLotId }: { productId: string; productField: ReactNode; batchDate: string; setBatchDate: (value: string) => void; startLotId?: string }) {
  const store = useStore();
  const router = useRouter();
  const station = stationById.receiving;
  const [newSupplierId, setSupplierId] = useState(() => store.suppliers.find((s) => /bean/i.test(s.supplies))?.id ?? '');
  // Beans already received into the store are taken from their lot; a new delivery starts from the supplier.
  const stored = inStore(store.lots, beans);
  const [lotId, setLotId] = useState(() => (stored.some((l) => l.id === startLotId) ? startLotId! : ''));
  const fromLot = stored.find((l) => l.id === lotId);
  const supplierId = fromLot ? (fromLot.source.type === 'supplier' ? fromLot.source.supplierId : '') : newSupplierId;
  const [name, setName] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<WeightValue>(emptyWeight);
  const [rows, setRows] = useState<Row[]>(() => store.outputCategories.filter((c) => c.station === 'receiving').map((c, i) => ({ name: c.name, kind: c.kind, weight: emptyWeight, destination: defaultDestination('receiving', c.name, c.kind, i) })));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // A double tap on Save must not start a second batch.
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);

  const suggested = suggestBatchName(store, supplierId, batchDate);
  const batchName = name ?? suggested;
  const input = netWeight(delivered, store.containers);
  const nets = rows.map((r) => netWeight(r.weight, store.containers));
  const balance = calculateBalance(input.net, rows.map((r, i) => ({ kind: r.kind, weight: nets[i].net })));

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!(input.net > 0)) return setError('Enter the delivered weight from the scale.');
    const outputs = rows.map((r, i) => ({ name: r.name, kind: r.kind, weight: nets[i].net, destination: r.destination, container: nets[i].container })).filter((o) => o.weight > 0);
    if (outputs.length === 0) return setError('Enter the accepted beans.');
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    const id = await store.receiveDelivery({ productId, name: batchName, batchDate, startWeight: input.net, supplierId, note: note || undefined, lotUses: fromLot ? [{ lotId: fromLot.id, quantity: input.net }] : [] }, { weight: input.net, container: input.container }, outputs, note || undefined);
    saving.current = false;
    setBusy(false);
    if (id) router.push(`/production/batches/${id}/record/receiving?saved=1`);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <form onSubmit={save} noValidate>
      <Back href="/work" label="My work" />
      <PageHeader eyebrow="New batch · Receiving" title={fromLot ? 'Start a batch of beans' : 'Receive a delivery'} subtitle={fromLot ? `Weigh the beans taken from ${fromLot.id}, then the accepted and rejected beans. The weight is taken off the lot in the store.` : 'Weigh the delivery, then the accepted and rejected beans. The batch and its receiving record are saved together.'} />
      <Panel title="Delivery">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {stored.length > 0 && (
            <Field label="Beans from" hint={fromLot ? 'The weight is taken off this lot in the store.' : 'Beans already received into the store are taken from their lot.'}>
              <Select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Beans from">
                <option value="">A new delivery</option>
                {stored.map((l) => <option key={l.id} value={l.id}>{l.id} · {kg(l.available)} in store · {lotOrigin(store, l)}</option>)}
              </Select>
            </Field>
          )}
          {!fromLot && <Field label="Supplier" hint="Printed on the batch card and liquor label.">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
              <option value="">Not recorded</option>
              {store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>}
          <Field label="Delivery date">
            <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} aria-label="Batch date" required />
          </Field>
          <Field label="Batch name" hint="Filled in from the supplier and date. Change it if you like.">
            <Input value={batchName} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Batch name" />
          </Field>
          {productField}
        </div>
      </Panel>
      <section className="input-card">
        <div className="input-card-label">{fromLot ? 'Weight taken from the store' : 'Delivered weight'}</div>
        <WeightField value={delivered} onChange={setDelivered} containers={store.containers} label="Delivered weight" autoFocus />
        {fromLot && input.net > fromLot.available + 0.005 && <Notice tone="warn">The scale shows {kg(input.net)} but lot {fromLot.id} has only {kg(fromLot.available)} on record. The batch is saved at the scale weight and the lot goes to zero.</Notice>}
      </section>
      <Panel title="Weigh the beans" subtitle="Accepted beans go on to sorting. Leave rejected empty if there were none.">
        {rows.map((row, index) => (
          <div key={row.name} className="weigh-row">
            <div className="weigh-row-head">
              <span className="weigh-row-name">{row.name}{row.kind === 'waste' && <span className="kind-tag">waste</span>}</span>
              <DestinationSelect station={station} value={row.destination} onChange={(destination) => setRows(rows.map((r, i) => (i === index ? { ...r, destination } : r)))} label={row.name} />
            </div>
            <WeightField value={row.weight} onChange={(weight) => setRows(rows.map((r, i) => (i === index ? { ...r, weight } : r)))} containers={store.containers} label={row.name} />
          </div>
        ))}
      </Panel>
      <Panel title="Note (optional)"><div className="p-5"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery note number, condition of the sacks…" aria-label="Note" /></div></Panel>
      <div className="save-bar">
        <LiveBalance balance={balance} limit={store.thresholds.variancePct.receiving} wasteLimit={store.thresholds.wastePct} />
        {error && <div className="save-bar-error" role="alert">{error}</div>}
        <Button type="submit" disabled={busy}><Check size={16} /> {busy ? 'Saving…' : 'Save delivery'}</Button>
      </div>
    </form>
  );
}
