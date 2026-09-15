'use client';

import { redirect, useParams } from 'next/navigation';
import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Select, SubNav, Table, Textarea, td, tdNum } from '@/components/ui';
import { kindLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName, stations } from '@/lib/stations';
import type { BusinessDetails, OutputKind, RouteId, StationId } from '@/lib/types';

const sections = [
  { id: 'business', label: 'Business details', href: '/setup/business' },
  { id: 'products', label: 'Products', href: '/setup/products' },
  { id: 'pack-sizes', label: 'Pack sizes', href: '/setup/pack-sizes' },
  { id: 'outputs', label: 'Output categories', href: '/setup/outputs' },
  { id: 'routes', label: 'Routes', href: '/setup/routes' },
  { id: 'suppliers', label: 'Suppliers', href: '/setup/suppliers' },
  { id: 'users', label: 'Users', href: '/setup/users' },
  { id: 'alerts', label: 'Alert thresholds', href: '/setup/alerts' },
];

function AddForm({ title, onSubmit, children, submitLabel = 'Add' }: { title: string; onSubmit: (data: FormData) => void; children: ReactNode; submitLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      {!open ? (
        <button className="flex w-full items-center gap-2 px-5 py-3 text-[13px] font-semibold text-green hover:bg-moss/60" onClick={() => setOpen(true)}><Plus size={15} /> {title}</button>
      ) : (
        <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); setOpen(false); }}>
          {children}
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">{submitLabel}</Button></div>
        </form>
      )}
    </div>
  );
}

function EditForm({ onSubmit, onCancel, children }: { onSubmit: (data: FormData) => void; onCancel: () => void; children: ReactNode }) {
  return (
    <form className="grid gap-3 rounded-lg bg-paper p-4 md:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
      {children}
      <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">Save changes</Button></div>
    </form>
  );
}

function RowActions({ onEdit, onDelete, deleteDisabled, deleteHint }: { onEdit: () => void; onDelete: () => void; deleteDisabled?: boolean; deleteHint?: string }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" className="px-2" onClick={onEdit} title="Edit"><Pencil size={14} /><span className="sr-only">Edit</span></Button>
      <Button variant="danger" className="px-2" onClick={onDelete} disabled={deleteDisabled} title={deleteDisabled ? deleteHint : 'Delete'}><Trash2 size={14} /><span className="sr-only">Delete</span></Button>
    </div>
  );
}

export default function SetupPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const [businessDetails, setBusinessDetails] = useState<BusinessDetails>(store.business);
  const [editingId, setEditingId] = useState<string | null>(null);
  const current = sections.find((s) => s.id === section) ?? sections[0];
  if (section === 'paper-catalog') redirect('/setup/products');

  return (
    <>
      <PageHeader eyebrow="Setup" title={current.label} />
      <SubNav items={sections} current={current.id} />

      {current.id === 'business' && (
        <Panel title="Business details" subtitle="These details appear in the header of exported Excel and print/PDF reports.">
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); store.setBusinessDetails(businessDetails); }}>
            <Field label="Business name">
              <Input value={businessDetails.name} onChange={(event) => setBusinessDetails({ ...businessDetails, name: event.target.value })} required maxLength={100} />
            </Field>
            <Field label="Address / location">
              <Input value={businessDetails.address} onChange={(event) => setBusinessDetails({ ...businessDetails, address: event.target.value })} maxLength={160} placeholder="e.g. Kampala, Uganda" />
            </Field>
            <Field label="Phone">
              <Input value={businessDetails.phone} onChange={(event) => setBusinessDetails({ ...businessDetails, phone: event.target.value })} maxLength={40} placeholder="e.g. +256 700 000 000" />
            </Field>
            <Field label="Email">
              <Input type="email" value={businessDetails.email} onChange={(event) => setBusinessDetails({ ...businessDetails, email: event.target.value })} maxLength={120} placeholder="e.g. info@yourfactory.example" />
            </Field>
            <div className="flex justify-end md:col-span-2">
              <Button type="submit">Save business details</Button>
            </div>
          </form>
          <p className="section-note">These values are saved in this browser and are included whenever a report is generated.</p>
        </Panel>
      )}

      {current.id === 'products' && (
        <Panel title="Products" subtitle="What the factory makes, and which route each product follows.">
          <Table head={['Product', 'Batch prefix', 'Route', 'Recipe / status', '']}>
            {store.products.map((p) => {
              const canDelete = !store.batches.some((b) => b.productId === p.id) && !store.recipes.some((r) => r.productId === p.id);
              return <Fragment key={p.id}>
                <tr key={p.id}>
                  <td className={td}>{p.name}</td><td className={td}>{p.prefix}-</td><td className={td}>{store.routes.find((r) => r.id === p.route)?.name ?? <span className="text-faint">Route removed</span>}</td>
                    <td className={td}>{p.recipeId ? store.recipes.find((r) => r.id === p.recipeId)?.name : p.route === 'chocolate' ? <Badge tone="neutral">Recipe pending</Badge> : <span className="text-faint">—</span>}</td>
                  <td className={td}><RowActions onEdit={() => setEditingId(p.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${p.name}?`)) store.deleteProduct(p.id); }} deleteDisabled={!canDelete} deleteHint="Products used by recipes or batches cannot be deleted." /></td>
                </tr>
                {editingId === p.id && <tr key={`${p.id}-edit`}><td className={td} colSpan={5}>
                  <EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateProduct(p.id, { name: String(d.get('name')).trim(), prefix: String(d.get('prefix')).trim().toUpperCase(), route: d.get('route') as RouteId, recipeId: String(d.get('recipe')) || undefined }); setEditingId(null); }}>
                    <Field label="Name"><Input name="name" defaultValue={p.name} required /></Field>
                    <Field label="Batch prefix"><Input name="prefix" defaultValue={p.prefix} required maxLength={3} /></Field>
                    <Field label="Route"><Select name="route" defaultValue={p.route}>{store.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                    <Field label="Recipe"><Select name="recipe" defaultValue={p.recipeId ?? ''}><option value="">None</option>{store.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                  </EditForm>
                </td></tr>}
              </Fragment>;
            })}
          </Table>
          <p className="section-note">Chocolate products without a recipe are marked “Recipe pending” and are kept out of the new-batch selector until a verified recipe is configured.</p>
          <AddForm title="Add product" onSubmit={(d) => store.addProduct({ name: String(d.get('name')), prefix: String(d.get('prefix')).toUpperCase(), route: d.get('route') as RouteId, recipeId: String(d.get('recipe')) || undefined })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Batch prefix"><Input name="prefix" required maxLength={3} placeholder="CH" /></Field>
            <Field label="Route"><Select name="route">{store.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
            <Field label="Recipe (chocolate only)"><Select name="recipe"><option value="">None</option>{store.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'pack-sizes' && (
        <Panel title="Pack sizes" subtitle="Used at packaging to work out accepted weight.">
          <Table head={['Pack', 'Grams per unit', '']}>
            {store.packSizes.map((p) => {
              const canDelete = !store.batches.some((b) => b.records.some((r) => r.packaging?.packSizeId === p.id));
              return <Fragment key={p.id}>
                <tr key={p.id}><td className={td}>{p.name}</td><td className={tdNum}>{p.grams} g</td><td className={td}><RowActions onEdit={() => setEditingId(p.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${p.name}?`)) store.deletePackSize(p.id); }} deleteDisabled={!canDelete} deleteHint="Pack sizes used by packaging records cannot be deleted." /></td></tr>
                {editingId === p.id && <tr key={`${p.id}-edit`}><td className={td} colSpan={3}><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updatePackSize(p.id, { name: String(d.get('name')).trim(), grams: Number(d.get('grams')) }); setEditingId(null); }}><Field label="Name"><Input name="name" defaultValue={p.name} required /></Field><Field label="Grams per unit"><Input name="grams" type="number" min="1" defaultValue={p.grams} required /></Field></EditForm></td></tr>}
              </Fragment>;
            })}
          </Table>
          <AddForm title="Add pack size" onSubmit={(d) => store.addPackSize({ name: String(d.get('name')), grams: Number(d.get('grams')) })}>
            <Field label="Name"><Input name="name" required placeholder="e.g. 60 g bar" /></Field>
            <Field label="Grams per unit"><Input name="grams" type="number" min="1" required /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'outputs' && (
        <Panel title="Output categories" subtitle="The rows workers weigh at each station. Useful output counts toward yield; waste and by-products are recorded separately; anything left is variance.">
          <Table head={['Station', 'Output', 'Type', '']}>
            {store.outputCategories.map((c, i) => <Fragment key={`${c.station}-${c.name}-${i}`}>
              <tr key={`${c.station}-${c.name}-${i}`}><td className={td}>{stationName(c.station)}</td><td className={td}>{c.name}{c.custom && <Badge tone="neutral">added</Badge>}</td><td className={td}><Badge tone={c.kind === 'useful' ? 'green' : c.kind === 'waste' ? 'warn' : 'neutral'}>{kindLabel[c.kind]}</Badge></td><td className={td}><RowActions onEdit={() => setEditingId(`output-${i}`)} onDelete={() => { if (window.confirm(`Delete the ${c.name} output row?`)) store.deleteOutputCategory(i); }} /></td></tr>
              {editingId === `output-${i}` && <tr key={`output-${i}-edit`}><td className={td} colSpan={4}><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateOutputCategory(i, { station: d.get('station') as StationId, name: String(d.get('name')).trim(), kind: d.get('kind') as OutputKind }); setEditingId(null); }}><Field label="Station"><Select name="station" defaultValue={c.station}>{stations.filter((s) => s.form === 'weights').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Output name"><Input name="name" defaultValue={c.name} required /></Field><Field label="Type"><Select name="kind" defaultValue={c.kind}><option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option></Select></Field></EditForm></td></tr>}
            </Fragment>) }
          </Table>
          <AddForm title="Add output row" onSubmit={(d) => store.addOutputCategory(d.get('station') as StationId, String(d.get('name')), d.get('kind') as OutputKind)}>
            <Field label="Station"><Select name="station">{stations.filter((s) => s.form === 'weights').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Output name"><Input name="name" required /></Field>
            <Field label="Type"><Select name="kind"><option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option></Select></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'routes' && (
        <Panel title="Routes" subtitle="The order of stations for each kind of batch. Destinations at each station decide the actual path.">
          {store.routes.map((r) => (
            <div key={r.id} className="border-b border-line px-5 py-3 text-[13px] last:border-b-0">
              <div className="flex flex-wrap items-center gap-2"><strong>{r.name}</strong><span className="text-muted">starts with {r.startMaterial.toLowerCase()}</span><span className="ml-auto"><RowActions onEdit={() => setEditingId(`route-${r.id}`)} onDelete={() => { const used = store.products.some((p) => p.route === r.id) || store.batches.some((b) => b.route === r.id); if (!used && window.confirm(`Delete ${r.name}?`)) store.deleteRoute(r.id); }} deleteDisabled={store.products.some((p) => p.route === r.id) || store.batches.some((b) => b.route === r.id)} deleteHint="Routes used by products or batches cannot be deleted." /></span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1">{r.stations.map((s, i) => <span key={s} className="flex items-center gap-1"><Badge tone="green">{stationName(s)}</Badge>{i < r.stations.length - 1 && <span className="text-faint">→</span>}</span>)}</div>
              <div className="mt-1 text-muted">{r.note}</div>
              {editingId === `route-${r.id}` && <div className="mt-3"><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateRoute(r.id, { name: String(d.get('name')).trim(), startMaterial: String(d.get('startMaterial')).trim(), note: String(d.get('note')).trim() }); setEditingId(null); }}><Field label="Name"><Input name="name" defaultValue={r.name} required /></Field><Field label="Starting material"><Input name="startMaterial" defaultValue={r.startMaterial} required /></Field><Field label="Note" className="md:col-span-2"><Textarea name="note" defaultValue={r.note} rows={2} /></Field></EditForm></div>}
            </div>
          ))}
          <p className="section-note">Route station order is structural and remains protected; names, starting material and notes can be edited. A route cannot be deleted while a product or batch still uses it.</p>
        </Panel>
      )}

      {current.id === 'suppliers' && (
        <Panel title="Suppliers">
          <Table head={['Supplier', 'Supplies', 'Contact', '']}>
            {store.suppliers.map((s) => {
              const canDelete = !store.lots.some((lot) => lot.source.type === 'supplier' && lot.source.supplierId === s.id);
              return <Fragment key={s.id}>
                <tr key={s.id}><td className={td}>{s.name}</td><td className={td}>{s.supplies}</td><td className={td}>{s.contact}</td><td className={td}><RowActions onEdit={() => setEditingId(s.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${s.name}?`)) store.deleteSupplier(s.id); }} deleteDisabled={!canDelete} deleteHint="Suppliers referenced by material lots cannot be deleted." /></td></tr>
                {editingId === s.id && <tr key={`${s.id}-edit`}><td className={td} colSpan={4}><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateSupplier(s.id, { name: String(d.get('name')).trim(), supplies: String(d.get('supplies')).trim(), contact: String(d.get('contact')).trim() }); setEditingId(null); }}><Field label="Name"><Input name="name" defaultValue={s.name} required /></Field><Field label="Supplies"><Input name="supplies" defaultValue={s.supplies} required /></Field><Field label="Contact"><Input name="contact" defaultValue={s.contact} /></Field></EditForm></td></tr>}
              </Fragment>;
            })}
          </Table>
          <AddForm title="Add supplier" onSubmit={(d) => store.addSupplier({ name: String(d.get('name')), supplies: String(d.get('supplies')), contact: String(d.get('contact')) })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Supplies"><Input name="supplies" required /></Field>
            <Field label="Contact"><Input name="contact" /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'users' && (
        <Panel title="Users" subtitle="Staff accounts. Records are signed with the user chosen here; everyone signs in with their own email and password.">
          <Table head={['Name', 'Role', 'Email', 'Recording as', '']}>
            {store.users.map((u) => {
              const usedInAudit = store.batches.some((b) => b.records.some((r) => r.recordedBy === u.id) || b.holds.some((h) => h.placedBy === u.id) || b.corrections.some((c) => c.correctedBy === u.id));
              const canDelete = u.id !== store.currentUserId && !usedInAudit;
              return <Fragment key={u.id}>
                <tr key={u.id}><td className={td}>{u.name}</td><td className={td}>{u.role}</td><td className={td}>{u.email}</td><td className={td}>{u.id === store.currentUserId ? <Badge tone="green">Current user</Badge> : <button className="btn-text" onClick={() => store.setCurrentUser(u.id)}>Use {u.name.split(' ')[0]}</button>}</td><td className={td}><RowActions onEdit={() => setEditingId(u.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${u.name}?`)) store.deleteUser(u.id); }} deleteDisabled={!canDelete} deleteHint="The current user or users referenced in audit history cannot be deleted." /></td></tr>
                {editingId === u.id && <tr key={`${u.id}-edit`}><td className={td} colSpan={5}><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { const password = String(d.get('password')); store.updateUser(u.id, { name: String(d.get('name')).trim(), role: String(d.get('role')).trim(), email: String(d.get('email')).trim(), password: password || u.password }); setEditingId(null); }}><Field label="Name"><Input name="name" defaultValue={u.name} required /></Field><Field label="Role"><Input name="role" defaultValue={u.role} required /></Field><Field label="Email"><Input name="email" type="email" defaultValue={u.email} required autoComplete="off" /></Field><Field label="New password" hint="Leave blank to keep the current password."><Input name="password" type="password" minLength={6} autoComplete="new-password" /></Field></EditForm></td></tr>}
              </Fragment>;
            })}
          </Table>
          <AddForm title="Add user" onSubmit={(d) => store.addUser({ name: String(d.get('name')), role: String(d.get('role')), email: String(d.get('email')).trim(), password: String(d.get('password')) })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Role"><Input name="role" required placeholder="e.g. Winnowing operator" /></Field>
            <Field label="Email"><Input name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Password"><Input name="password" type="password" required minLength={6} autoComplete="new-password" /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'alerts' && (
        <>
          <Panel title="Variance limit per station" subtitle="An alert is raised when unaccounted variance is above this share of the station input.">
            <Table head={['Station', 'Allowed variance']}>
              {stations.filter((s) => s.form !== 'completion').map((s) => (
                <tr key={s.id}><td className={td}>{s.name}</td><td className={td}><span className="flex max-w-[160px] items-center gap-2"><Input type="number" step="0.1" min="0" value={store.thresholds.variancePct[s.id]} onChange={(e) => store.setStationVariance(s.id, Number(e.target.value))} aria-label={`${s.name} variance limit`} /><span className="text-muted">%</span></span></td></tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Other limits">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Waste limit at any station (%)"><Input type="number" step="0.1" min="0" value={store.thresholds.wastePct} onChange={(e) => store.setThresholds({ wastePct: Number(e.target.value) })} aria-label="Waste limit" /></Field>
              <Field label="Low stock warning for raw materials (kg)"><Input type="number" step="1" min="0" value={store.thresholds.lowStockKg} onChange={(e) => store.setThresholds({ lowStockKg: Number(e.target.value) })} aria-label="Low stock limit" /></Field>
            </div>
          </Panel>
        </>
      )}
      <Notice tone="neutral">Changes here apply immediately to the stations and forms.</Notice>
    </>
  );
}
