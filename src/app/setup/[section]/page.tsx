'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Select, SubNav, Table, td, tdNum } from '@/components/ui';
import { kindLabel } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName, stations } from '@/lib/stations';
import type { OutputKind, RouteId, StationId } from '@/lib/types';

const sections = [
  { id: 'products', label: 'Products', href: '/setup/products' },
  { id: 'pack-sizes', label: 'Pack sizes', href: '/setup/pack-sizes' },
  { id: 'paper-catalog', label: 'Paper catalog', href: '/setup/paper-catalog' },
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

export default function SetupPage() {
  const { section } = useParams<{ section: string }>();
  const store = useStore();
  const current = sections.find((s) => s.id === section) ?? sections[0];

  return (
    <>
      <PageHeader eyebrow="Setup" title={current.label} />
      <SubNav items={sections} current={current.id} />

      {current.id === 'products' && (
        <Panel title="Products" subtitle="What the factory makes, and which route each product follows.">
          <Table head={['Product', 'Batch prefix', 'Route', 'Recipe / status']}>
            {store.products.map((p) => <tr key={p.id}><td className={td}>{p.name}</td><td className={td}>{p.prefix}-</td><td className={td}>{store.routes.find((r) => r.id === p.route)?.name}</td><td className={td}>{p.catalogOnly ? <Badge tone="neutral">Paper catalog · recipe pending</Badge> : p.recipeId ? store.recipes.find((r) => r.id === p.recipeId)?.name : <span className="text-faint">—</span>}</td></tr>)}
          </Table>
          <p className="section-note">Products marked “Paper catalog” were printed on the supplied form, but no recipe quantities were visible. They are kept out of the new-batch selector until a verified recipe is configured.</p>
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
          <Table head={['Pack', 'Grams per unit']}>{store.packSizes.map((p) => <tr key={p.id}><td className={td}>{p.name}</td><td className={tdNum}>{p.grams} g</td></tr>)}</Table>
          <AddForm title="Add pack size" onSubmit={(d) => store.addPackSize({ name: String(d.get('name')), grams: Number(d.get('grams')) })}>
            <Field label="Name"><Input name="name" required placeholder="e.g. 60 g bar" /></Field>
            <Field label="Grams per unit"><Input name="grams" type="number" min="1" required /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'paper-catalog' && (
        <>
          <Notice tone="neutral">{store.paperCatalog.source} Blank quantity cells and unclear handwritten annotations were not imported as measurements.</Notice>

          <Panel title="Paper product strengths" subtitle="Printed chocolate rows found on the Tempering and Production Summary forms.">
            <div className="flex flex-wrap gap-2 p-5">{store.paperCatalog.chocolateStrengths.map((name) => <Badge key={name} tone="green">{name}</Badge>)}</div>
          </Panel>

          <Panel title="Production Summary rows" subtitle="The labels the paper form expects for daily ingredient usage and output.">
            <div className="grid gap-5 p-5 md:grid-cols-3">
              <div><h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-faint">Usage</h3><div className="space-y-2">{store.paperCatalog.productionSummary.usage.map((row) => <div key={row} className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px]">{row} <span className="float-right text-faint">kg</span></div>)}</div></div>
              <div><h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-faint">Chocolate output</h3><div className="space-y-2">{store.paperCatalog.productionSummary.productOutput.map((row) => <div key={row} className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px]">{row} <span className="float-right text-faint">kg</span></div>)}</div></div>
              <div><h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-faint">Other output</h3><div className="space-y-2">{store.paperCatalog.productionSummary.specialOutput.map((row) => <div key={row} className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px]">{row} <span className="float-right text-faint">kg</span></div>)}</div></div>
            </div>
          </Panel>

          <Panel title="Bean Summary rows" subtitle="Input, sorting, nib usage, yields and derivatives transcribed from the bean sheet.">
            <Table head={['Input & sorting', 'Usage / yield', 'Derivatives']}>
              {Array.from({ length: Math.max(store.paperCatalog.beanSummary.inputAndSorting.length, store.paperCatalog.beanSummary.usage.length, store.paperCatalog.beanSummary.derivatives.length) }, (_, i) => <tr key={i}><td className={td}>{store.paperCatalog.beanSummary.inputAndSorting[i] ?? <span className="text-faint">—</span>}</td><td className={td}>{store.paperCatalog.beanSummary.usage[i] ?? <span className="text-faint">—</span>}</td><td className={td}>{store.paperCatalog.beanSummary.derivatives[i] ?? <span className="text-faint">—</span>}</td></tr>)}
            </Table>
          </Panel>

          <Panel title="Tempering Summary rows" subtitle="The paper's product rows and columns. The live batch records remain the source of measured quantities.">
            <Table head={['Product', ...store.paperCatalog.temperingSummary.columns.map((c) => `${c.label} (${c.unit})`)]}>
              {store.paperCatalog.temperingSummary.products.map((row) => <tr key={row}><td className={td}>{row}</td>{store.paperCatalog.temperingSummary.columns.map((column) => <td key={column.label} className={`${tdNum} text-faint`}>—</td>)}</tr>)}
            </Table>
          </Panel>

          <Panel title="Ready Products rows" subtitle="Printed daily stock-sheet rows grouped as they appear on the supplied form.">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {store.paperCatalog.readyProducts.map((group) => <div key={group.section} className="rounded-lg border border-line"><div className="border-b border-line bg-paper px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-faint">{group.section}</div><div className="divide-y divide-line">{group.items.map((item) => <div key={item} className="px-3 py-2 text-[13px]">{item}<span className="float-right text-faint">—</span></div>)}</div></div>)}
            </div>
          </Panel>

          <Panel title="Weekly usage rows" subtitle="The weekly sheet records these items in kilograms by day.">
            <Table head={['Item', 'Unit']}>
              {store.paperCatalog.weeklyUsage.map((item) => <tr key={item}><td className={td}>{item}</td><td className={`${td} text-muted`}>kg</td></tr>)}
            </Table>
          </Panel>
        </>
      )}

      {current.id === 'outputs' && (
        <Panel title="Output categories" subtitle="The rows workers weigh at each station. Useful output counts toward yield; waste and by-products are recorded separately; anything left is variance.">
          <Table head={['Station', 'Output', 'Type']}>
            {store.outputCategories.map((c, i) => <tr key={`${c.station}-${c.name}-${i}`}><td className={td}>{stationName(c.station)}</td><td className={td}>{c.name}{c.custom && <Badge tone="neutral">added</Badge>}</td><td className={td}><Badge tone={c.kind === 'useful' ? 'green' : c.kind === 'waste' ? 'warn' : 'neutral'}>{kindLabel[c.kind]}</Badge></td></tr>)}
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
              <div className="flex flex-wrap items-center gap-2"><strong>{r.name}</strong><span className="text-muted">starts with {r.startMaterial.toLowerCase()}</span></div>
              <div className="mt-1 flex flex-wrap items-center gap-1">{r.stations.map((s, i) => <span key={s} className="flex items-center gap-1"><Badge tone="green">{stationName(s)}</Badge>{i < r.stations.length - 1 && <span className="text-faint">→</span>}</span>)}</div>
              <div className="mt-1 text-muted">{r.note}</div>
            </div>
          ))}
        </Panel>
      )}

      {current.id === 'suppliers' && (
        <Panel title="Suppliers">
          <Table head={['Supplier', 'Supplies', 'Contact']}>{store.suppliers.map((s) => <tr key={s.id}><td className={td}>{s.name}</td><td className={td}>{s.supplies}</td><td className={td}>{s.contact}</td></tr>)}</Table>
          <AddForm title="Add supplier" onSubmit={(d) => store.addSupplier({ name: String(d.get('name')), supplies: String(d.get('supplies')), contact: String(d.get('contact')) })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Supplies"><Input name="supplies" required /></Field>
            <Field label="Contact"><Input name="contact" /></Field>
          </AddForm>
        </Panel>
      )}

      {current.id === 'users' && (
        <Panel title="Users" subtitle="Staff accounts. Records are signed with the user chosen here; everyone signs in with their own email and password.">
          <Table head={['Name', 'Role', 'Email', 'Recording as']}>
            {store.users.map((u) => <tr key={u.id}><td className={td}>{u.name}</td><td className={td}>{u.role}</td><td className={td}>{u.email}</td><td className={td}>{u.id === store.currentUserId ? <Badge tone="green">Current user</Badge> : <button className="btn-text" onClick={() => store.setCurrentUser(u.id)}>Use {u.name.split(' ')[0]}</button>}</td></tr>)}
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
          <Panel title="Sample data">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]">
              <span className="text-muted">Data is kept in this browser. Reset to start again from the sample batches.</span>
              <Button variant="danger" onClick={() => { if (window.confirm('Reset all data to the sample set?')) store.resetData(); }}>Reset sample data</Button>
            </div>
          </Panel>
        </>
      )}
      <Notice tone="neutral">Changes here apply immediately to the stations and forms.</Notice>
    </>
  );
}
