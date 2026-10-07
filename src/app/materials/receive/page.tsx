'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Back, Button, Field, Input, LinkButton, Notice, PageHeader, Panel, Select, SupplierOptions, UnitInput } from '@/components/ui';
import { suppliersFor } from '@/lib/derive';
import { useStore } from '@/lib/store';
import type { LotCategory } from '@/lib/types';

const materials = ['Cocoa beans', 'Sugar', 'Cocoa butter', 'Lecithin', 'Milk powder', 'Liquor', 'Other'];

export default function ReceivePage() {
  const store = useStore();
  const router = useRouter();
  const [material, setMaterial] = useState(materials[0]);
  const [other, setOther] = useState('');
  const [supplierId, setSupplierId] = useState(() => suppliersFor(store, materials[0]).usual[0]?.id ?? store.suppliers[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [supplierBatch, setSupplierBatch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const name = material === 'Other' ? other.trim() : material;
  const offered = suppliersFor(store, name);

  /** Another material: its usual supplier is chosen, unless the one already chosen supplies it too */
  function chooseMaterial(next: string) {
    setMaterial(next);
    const { usual } = suppliersFor(store, next === 'Other' ? other : next);
    if (usual.length && !usual.some((s) => s.id === supplierId)) setSupplierId(usual[0].id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!(qty > 0)) return setError('Enter the weight you measured on delivery.');
    if (!name) return setError('Name the material.');
    const category: LotCategory = name === 'Liquor' ? 'Intermediate' : 'Raw material';
    const id = await store.receiveLot({ material: name, category, quantity: qty, unit: 'kg', supplierId, reference: reference || undefined, supplierBatch: supplierBatch.trim() || undefined });
    if (!id) return;
    router.push(`/materials/${id}`);
  }

  return (
    <>
      <Back href="/store" label="Store" />
      <PageHeader eyebrow="Store" title="Receive material" subtitle="Record the delivery you physically weighed. A new lot is created." />
      <form onSubmit={submit}>
        <Panel title="Delivery">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Material"><Select value={material} onChange={(e) => chooseMaterial(e.target.value)} aria-label="Material">{materials.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            {material === 'Other' && <Field label="Material name"><Input value={other} onChange={(e) => setOther(e.target.value)} required /></Field>}
            <Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier"><SupplierOptions material={name} {...offered} /></Select></Field>
            <Field label="Supplier's batch number" hint="As printed on the bag or the delivery note."><Input value={supplierBatch} onChange={(e) => setSupplierBatch(e.target.value)} maxLength={80} placeholder="Optional" /></Field>
            <Field label="Delivery note or invoice"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Measured weight"><UnitInput unit="kg" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Measured weight" required /></Field>
          </div>
        </Panel>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2"><LinkButton variant="secondary" href="/store">Cancel</LinkButton><Button type="submit"><Check size={15} /> Save receipt</Button></div>
      </form>
    </>
  );
}
