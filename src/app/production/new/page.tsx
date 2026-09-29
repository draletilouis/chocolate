'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, Textarea, UnitInput } from '@/components/ui';
import { DestinationSelect, LiveBalance, WeightField, emptyWeight, netWeight, type WeightValue } from '@/components/weighing';
import { calculateBalance } from '@/lib/balance';
import { defaultDestination, suggestBatchName } from '@/lib/derive';
import { useStore } from '@/lib/store';
import { stationById, stationName } from '@/lib/stations';
import type { Destination, OutputKind } from '@/lib/types';

export default function NewBatchPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><NewBatch /></Suspense>;
}

function NewBatch() {
  const store = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const batchableProducts = store.products;
  // Opened from a lot in store or the mixing queue: start a batch that mixes chocolate from stored liquor and butter.
  const fromStore = params.has('lot') || params.has('chocolate');
  const [productId, setProductId] = useState(() => (fromStore && batchableProducts.find((p) => p.route === 'chocolate')?.id) || batchableProducts[0]?.id || '');
  const [batchName, setBatchName] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const product = batchableProducts.find((p) => p.id === productId);
  const route = store.routes.find((r) => r.id === product?.route);
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
      id = await store.createBatch({ productId, name: batchName, batchDate, startWeight, note, lotUses: [] });
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
    return <ReceiveDelivery productId={product.id} productField={productField} batchDate={batchDate} setBatchDate={setBatchDate} />;
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
          <Panel title="Starting material" subtitle="Enter the weight from the scale before the first station.">
            <div className="p-5">
              <Field label="Starting weight" hint="Whatever the scale shows before pressing.">
                <UnitInput unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Starting weight" required autoFocus />
              </Field>
            </div>
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
function ReceiveDelivery({ productId, productField, batchDate, setBatchDate }: { productId: string; productField: ReactNode; batchDate: string; setBatchDate: (value: string) => void }) {
  const store = useStore();
  const router = useRouter();
  const station = stationById.receiving;
  const [supplierId, setSupplierId] = useState(() => store.suppliers.find((s) => /bean/i.test(s.supplies))?.id ?? '');
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
    const id = await store.receiveDelivery({ productId, name: batchName, batchDate, startWeight: input.net, supplierId, note: note || undefined, lotUses: [] }, { weight: input.net, container: input.container }, outputs, note || undefined);
    saving.current = false;
    setBusy(false);
    if (id) router.push(`/production/batches/${id}/record/receiving?saved=1`);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <form onSubmit={save} noValidate>
      <Back href="/work" label="My work" />
      <PageHeader eyebrow="New batch · Receiving" title="Receive a delivery" subtitle="Weigh the delivery, then the accepted and rejected beans. The batch and its receiving record are saved together." />
      <Panel title="Delivery">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Supplier" hint="Printed on the batch card and liquor label.">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
              <option value="">Not recorded</option>
              {store.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
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
        <div className="input-card-label">Delivered weight</div>
        <WeightField value={delivered} onChange={setDelivered} containers={store.containers} label="Delivered weight" autoFocus />
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
