'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { EditForm, EditRow, RowActions } from '@/components/RowActions';
import { StaffAccounts } from '@/components/StaffAccounts';
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Select, SubNav, Table, td, tdNum } from '@/components/ui';
import { kindLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName, stations } from '@/lib/stations';
import { useAuth } from '@/components/AuthProvider';
import type { OutputKind, RouteId, StationId } from '@/lib/types';

/** Why something can't be deleted, in the same words the server uses; undefined when nothing uses it */
function usedBy(name: string, uses: [count: number, one: string, many: string][]) {
  const parts = uses.filter(([count]) => count > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  return parts.length ? `${name} is used by ${parts.join(' and ')}, so it can't be deleted. You can edit it instead.` : undefined;
}

const sections = [
  { id: 'products', label: 'Products', href: '/setup/products' },
  { id: 'pack-sizes', label: 'Pack sizes', href: '/setup/pack-sizes' },
  { id: 'outputs', label: 'Output categories', href: '/setup/outputs' },
  { id: 'routes', label: 'Routes', href: '/setup/routes' },
  { id: 'suppliers', label: 'Suppliers', href: '/setup/suppliers' },
  { id: 'users', label: 'Users', href: '/setup/users' },
  { id: 'alerts', label: 'Alert thresholds', href: '/setup/alerts' },
];

function AddForm({ title, onSubmit, children, submitLabel = 'Add' }: { title: string; onSubmit: (data: FormData) => void | Promise<void>; children: ReactNode; submitLabel?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (user.role !== 'admin') return null;
  return (
    <div className="border-t border-line">
      {!open ? (
        <button className="flex w-full items-center gap-2 px-5 py-3 text-[13px] font-semibold text-green hover:bg-moss/60" onClick={() => setOpen(true)}><Plus size={15} /> {title}</button>
      ) : (
        <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); await onSubmit(new FormData(e.currentTarget)); setOpen(false); }}>
          {children}
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">{submitLabel}</Button></div>
        </form>
      )}
    </div>
  );
}

export default function SetupPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const current = sections.find((s) => s.id === section) ?? sections[0];
  /** The one row being edited, as `list:id` */
  const [editing, setEditing] = useState<string | null>(null);
  const actionsHead = isAdmin ? [''] : [];
  const productBatches = (id: string) => store.batches.filter((b) => b.productId === id).length;
  const packUses = (id: string) => store.batches.flatMap((b) => b.records).filter((r) => r.packaging?.packSizeId === id).length;

  return (
    <>
      <PageHeader eyebrow="Setup" title={current.label} />
      <SubNav items={sections} current={current.id} />

      {current.id === 'products' && (
        <Panel title="Products" subtitle="What the factory makes, and which route each product follows.">
          <Table head={['Product', 'Batch prefix', 'Route', 'Recipe', ...actionsHead]}>
            {store.products.map((p) => editing === `product:${p.id}` ? (
              <EditRow key={p.id} colSpan={5}>
                <EditForm onCancel={() => setEditing(null)} onSubmit={async (d) => { await store.updateProduct(p.id, { name: String(d.get('name')), prefix: String(d.get('prefix')).toUpperCase(), route: d.get('route') as RouteId, recipeId: String(d.get('recipe')) || undefined }); setEditing(null); }}>
                  <Field label="Name"><Input name="name" defaultValue={p.name} required autoFocus /></Field>
                  <Field label="Batch prefix"><Input name="prefix" defaultValue={p.prefix} required maxLength={3} /></Field>
                  <Field label="Route" hint={productBatches(p.id) ? 'It already has batches, so the route stays as it is.' : undefined}><Select name="route" defaultValue={p.route}>{store.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                  <Field label="Recipe (chocolate only)"><Select name="recipe" defaultValue={p.recipeId ?? ''}><option value="">None</option>{store.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                </EditForm>
              </EditRow>
            ) : (
              <tr key={p.id}>
                <td className={td}>{p.name}</td><td className={td}>{p.prefix}-</td><td className={td}>{store.routes.find((r) => r.id === p.route)?.name}</td><td className={td}>{p.recipeId ? store.recipes.find((r) => r.id === p.recipeId)?.name : <span className="text-faint">—</span>}</td>
                {isAdmin && <td className={td}><RowActions name={p.name} onEdit={() => setEditing(`product:${p.id}`)} onDelete={() => store.deleteProduct(p.id)} blocked={usedBy(p.name, [[productBatches(p.id), 'batch', 'batches']])} /></td>}
              </tr>
            ))}
          </Table>
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
          <Table head={['Pack', 'Grams per unit', ...actionsHead]}>
            {store.packSizes.map((p) => editing === `pack:${p.id}` ? (
              <EditRow key={p.id} colSpan={3}>
                <EditForm onCancel={() => setEditing(null)} onSubmit={async (d) => { await store.updatePackSize(p.id, { name: String(d.get('name')), grams: Number(d.get('grams')) }); setEditing(null); }}>
                  <Field label="Name"><Input name="name" defaultValue={p.name} required autoFocus /></Field>
                  <Field label="Grams per unit" hint="Packs already recorded keep the weight they were counted at."><Input name="grams" type="number" min="1" defaultValue={p.grams} required /></Field>
                </EditForm>
              </EditRow>
            ) : (
              <tr key={p.id}>
                <td className={td}>{p.name}</td><td className={tdNum}>{p.grams} g</td>
                {isAdmin && <td className={td}><RowActions name={p.name} onEdit={() => setEditing(`pack:${p.id}`)} onDelete={() => store.deletePackSize(p.id)} blocked={usedBy(p.name, [[packUses(p.id), 'packaging record', 'packaging records']])} /></td>}
              </tr>
            ))}
          </Table>
          <AddForm title="Add pack size" onSubmit={(d) => store.addPackSize({ name: String(d.get('name')), grams: Number(d.get('grams')) })}>
            <Field label="Name"><Input name="name" required placeholder="e.g. 60 g bar" /></Field>
            <Field label="Grams per unit"><Input name="grams" type="number" min="1" required /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'outputs' && (
        <Panel title="Output categories" subtitle="The rows workers weigh at each station. Useful output counts toward yield; waste and by-products are recorded separately; anything left is variance.">
          <Table head={['Station', 'Output', 'Type', ...actionsHead]}>
            {store.outputCategories.map((c, i) => c.id !== undefined && editing === `output:${c.id}` ? (
              <EditRow key={c.id} colSpan={4}>
                <EditForm onCancel={() => setEditing(null)} onSubmit={async (d) => { await store.updateOutputCategory(c.id!, String(d.get('name') ?? c.name), d.get('kind') as OutputKind); setEditing(null); }}>
                  <Field label="Output name" hint={c.custom ? `At ${stationName(c.station).toLowerCase()}.` : `Part of the process at ${stationName(c.station).toLowerCase()}, so only its type can change.`}>
                    <Input name="name" defaultValue={c.name} required readOnly={!c.custom} autoFocus={c.custom} />
                  </Field>
                  <Field label="Type"><Select name="kind" defaultValue={c.kind}><option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option></Select></Field>
                </EditForm>
              </EditRow>
            ) : (
              <tr key={c.id ?? `${c.station}-${c.name}-${i}`}>
                <td className={td}>{stationName(c.station)}</td><td className={td}>{c.name}{c.custom && <Badge tone="neutral">added</Badge>}</td><td className={td}><Badge tone={c.kind === 'useful' ? 'green' : c.kind === 'waste' ? 'warn' : 'neutral'}>{kindLabel[c.kind]}</Badge></td>
                {isAdmin && <td className={td}>{c.id !== undefined && <RowActions name={c.name} onEdit={() => setEditing(`output:${c.id}`)} onDelete={() => store.deleteOutputCategory(c.id!)} blocked={c.custom ? undefined : `${c.name} is part of the process at ${stationName(c.station).toLowerCase()}, so it can't be deleted. You can change its type.`} />}</td>}
              </tr>
            ))}
          </Table>
          <AddForm title="Add output row" onSubmit={(d) => store.addOutputCategory(d.get('station') as StationId, String(d.get('name')), d.get('kind') as OutputKind)}>
            <Field label="Station"><Select name="station">{stations.filter((s) => s.form === 'weights').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Output name"><Input name="name" required /></Field>
            <Field label="Type"><Select name="kind"><option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option></Select></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'routes' && (
        <Panel title="Routes" subtitle="The order of stations for each kind of batch. Destinations at each station decide the actual path. Routes are the process itself, so they are fixed here; the rows weighed at each station are edited under Output categories.">
          {store.routes.map((r) => (
            <div key={r.id} className="border-b border-line px-5 py-3 text-[13px] last:border-b-0">
              <div className="flex flex-wrap items-center gap-2"><strong>{r.name}</strong><span className="text-muted">starts with {r.startMaterial.toLowerCase()}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1">{r.stations.map((s, i) => <span key={s} className="flex items-center gap-1"><Badge tone="green">{stationName(s)}</Badge>{i < r.stations.length - 1 && <span className="text-faint">→</span>}</span>)}</div>
              <div className="mt-1 text-muted">{r.note}</div>
            </div>
          ))}
        </Panel>
      )}

      {current.id === 'suppliers' && (
        <Panel title="Suppliers" subtitle="Every batch is assigned to a supplier when it starts. Suppliers whose supplies mention beans are offered first for bean batches.">
          <Table head={['Supplier', 'Supplies', 'Contact', 'Batches', ...actionsHead]}>
            {store.suppliers.map((s) => {
              const batches = store.batches.filter((b) => b.supplierId === s.id).length;
              const lots = store.lots.filter((l) => l.source.type === 'supplier' && l.source.supplierId === s.id).length;
              return editing === `supplier:${s.id}` ? (
                <EditRow key={s.id} colSpan={5}>
                  <EditForm onCancel={() => setEditing(null)} onSubmit={async (d) => { await store.updateSupplier(s.id, { name: String(d.get('name')), supplies: String(d.get('supplies')), contact: String(d.get('contact')) }); setEditing(null); }}>
                    <Field label="Name"><Input name="name" defaultValue={s.name} required autoFocus /></Field>
                    <Field label="Supplies"><Input name="supplies" defaultValue={s.supplies} required /></Field>
                    <Field label="Contact"><Input name="contact" defaultValue={s.contact} /></Field>
                  </EditForm>
                </EditRow>
              ) : (
                <tr key={s.id}>
                  <td className={td}>{s.name}</td><td className={td}>{s.supplies}</td><td className={td}>{s.contact}</td><td className={tdNum}>{batches}</td>
                  {isAdmin && <td className={td}><RowActions name={s.name} onEdit={() => setEditing(`supplier:${s.id}`)} onDelete={() => store.deleteSupplier(s.id)} blocked={usedBy(s.name, [[batches, 'batch', 'batches'], [lots, 'delivered lot', 'delivered lots']])} /></td>}
                </tr>
              );
            })}
          </Table>
          <AddForm title="Add supplier" onSubmit={(d) => store.addSupplier({ name: String(d.get('name')), supplies: String(d.get('supplies')), contact: String(d.get('contact')) })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Supplies"><Input name="supplies" required placeholder="e.g. Cocoa beans" /></Field>
            <Field label="Contact"><Input name="contact" /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'users' && (
        <StaffAccounts />
      )}

      {current.id === 'alerts' && (
        <>
          <Panel title="Variance limit per station" subtitle="An alert is raised when unaccounted variance is above this share of the station input.">
            <Table head={['Station', 'Allowed variance']}>
              {stations.filter((s) => s.form !== 'completion').map((s) => (
                <tr key={s.id}><td className={td}>{s.name}</td><td className={td}><span className="flex max-w-[160px] items-center gap-2"><Input type="number" step="0.1" min="0" defaultValue={store.thresholds.variancePct[s.id]} disabled={!isAdmin} onBlur={(e) => { if (isAdmin) void store.setStationVariance(s.id, Number(e.currentTarget.value)); }} aria-label={`${s.name} variance limit`} /><span className="text-muted">%</span></span></td></tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Other limits">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Waste limit at any station (%)"><Input type="number" step="0.1" min="0" defaultValue={store.thresholds.wastePct} disabled={!isAdmin} onBlur={(e) => { if (isAdmin) void store.setThresholds({ wastePct: Number(e.currentTarget.value) }); }} aria-label="Waste limit" /></Field>
              <Field label="Low stock warning for raw materials (kg)"><Input type="number" step="1" min="0" defaultValue={store.thresholds.lowStockKg} disabled={!isAdmin} onBlur={(e) => { if (isAdmin) void store.setThresholds({ lowStockKg: Number(e.currentTarget.value) }); }} aria-label="Low stock limit" /></Field>
            </div>
          </Panel>
          <Panel title="Sample data">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]">
              <span className="text-muted">Production records are stored in PostgreSQL. Reset to start again from the sample batches.</span>
              {isAdmin && <Button variant="danger" onClick={() => { if (window.confirm('Reset all data to the sample set?')) void store.resetData(); }}>Reset sample data</Button>}
            </div>
          </Panel>
        </>
      )}
      <Notice tone="neutral">{isAdmin ? 'Every list can be added to, edited and deleted from, and changes apply immediately. Anything a batch or lot still uses can\'t be deleted, so records stay complete: edit it instead.' : 'Setup is read-only for operators. Ask a production manager to change products, thresholds, or staff accounts.'}</Notice>
    </>
  );
}
