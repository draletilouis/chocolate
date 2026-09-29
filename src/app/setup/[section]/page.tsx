'use client';

import { redirect, useParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Empty, Field, Input, Notice, PageHeader, Panel, Select, SubNav, Table, Textarea, td, tdNum } from '@/components/ui';
import { dateTime, kindLabel } from '@/lib/format';
import { useStore, type DeviceInfo } from '@/lib/store';
import { isWeighed, lineStations, stationName } from '@/lib/stations';
import type { Access, BusinessDetails, OutputKind, RouteId, StationId, User } from '@/lib/types';

const sections = [
  { id: 'business', label: 'Business details', href: '/setup/business' },
  { id: 'products', label: 'Products', href: '/setup/products' },
  { id: 'pack-sizes', label: 'Pack sizes', href: '/setup/pack-sizes' },
  { id: 'containers', label: 'Containers', href: '/setup/containers' },
  { id: 'outputs', label: 'Output categories', href: '/setup/outputs' },
  { id: 'routes', label: 'Routes', href: '/setup/routes' },
  { id: 'suppliers', label: 'Suppliers', href: '/setup/suppliers' },
  { id: 'users', label: 'Users', href: '/setup/users' },
  { id: 'alerts', label: 'Alert thresholds', href: '/setup/alerts' },
];

function AddForm({ title, onSubmit, children, submitLabel = 'Add' }: { title: string; onSubmit: (data: FormData) => void | Promise<boolean | void>; children: ReactNode; submitLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      {!open ? (
        <button className="flex w-full items-center gap-2 px-5 py-3 text-[13px] font-semibold text-green hover:bg-moss/60" onClick={() => setOpen(true)}><Plus size={15} /> {title}</button>
      ) : (
        <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if ((await onSubmit(new FormData(e.currentTarget))) !== false) setOpen(false); }}>
          {children}
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">{submitLabel}</Button></div>
        </form>
      )}
    </div>
  );
}

function EditForm({ onSubmit, onCancel, children }: { onSubmit: (data: FormData) => void | Promise<void>; onCancel: () => void; children: ReactNode }) {
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

/** Staff fields shared by the add and edit forms: PIN, access and the stations on their "My work" page */
function UserFields({ user }: { user?: User }) {
  return (
    <>
      <Field label={user ? 'New PIN (4 digits)' : 'PIN (4 digits)'} hint={user ? 'Leave blank to keep the current PIN.' : 'Used for quick sign-in on shared devices.'}><Input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required={!user} autoComplete="new-password" /></Field>
      <Field label="Access" hint="Operators see My work and the production line. Managers also see reports, chocolate types and setup.">
        <Select name="access" defaultValue={user?.access ?? 'operator'}><option value="operator">Operator</option><option value="manager">Manager</option></Select>
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="form-label">Stations on their My work page</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
          {lineStations.map((s) => (
            <label key={s.id} className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-[13px] hover:bg-paper"><input type="checkbox" name="stations" value={s.id} defaultChecked={user?.stations.includes(s.id)} className="h-5 w-5" />{s.name}</label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** A number saved to the server when the field is left or Enter is pressed, not on every keystroke */
function NumberSetting({ value, onSave, label, step = '1' }: { value: number; onSave: (value: number) => Promise<boolean>; label: string; step?: string }) {
  const [text, setText] = useState(String(value));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setText(String(value)); }, [value]);
  async function commit() {
    const next = Number(text);
    if (text.trim() === '' || !Number.isFinite(next) || next < 0) return setText(String(value));
    if (next === value) return;
    if (await onSave(next)) { setSaved(true); window.setTimeout(() => setSaved(false), 1500); } else setText(String(value));
  }
  return (
    <span className="flex max-w-[200px] items-center gap-2">
      <Input type="number" step={step} min="0" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void commit()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} aria-label={label} />
      {saved && <Check size={16} className="shrink-0 text-green" aria-label="Saved" />}
    </span>
  );
}

/** Devices set up for quick PIN sign-in, and setting up this one */
function DevicesPanel() {
  const store = useStore();
  const { listDevices, trustThisDevice, removeDevice } = store;
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [name, setName] = useState('');
  const load = useCallback(async () => setDevices((await listDevices()) ?? []), [listDevices]);
  useEffect(() => { void load(); }, [load]);
  const current = devices?.find((d) => d.current);
  return (
    <Panel title="Devices set up for quick sign-in" subtitle="On these devices staff tap their name and enter a PIN. Remove a lost or replaced device: it can no longer use PINs and anyone signed in on it is signed out.">
      {store.demo && <div className="px-5 pt-4"><Notice tone="neutral">In the demo, every device can use quick sign-in.</Notice></div>}
      {devices === null ? <Empty>Loading…</Empty> : devices.length === 0 ? <Empty>No devices are set up yet.</Empty> : (
        <Table head={['Device', 'Set up by', 'Set up', 'Last used', '']}>
          {devices.map((d) => (
            <tr key={d.id}>
              <td className={td}>{d.name}{d.current && <> <Badge tone="green">This device</Badge></>}</td>
              <td className={td}>{store.users.find((u) => u.id === d.trustedBy)?.name ?? d.trustedBy}</td>
              <td className={td}>{dateTime(d.createdAt)}</td><td className={td}>{dateTime(d.lastSeen)}</td>
              <td className={td}><Button variant="danger" className="px-3" onClick={async () => { if (window.confirm(`Remove ${d.name}? Quick sign-in stops working on it.`) && await removeDevice(d.id)) await load(); }}><Trash2 size={14} /> Remove</Button></td>
            </tr>
          ))}
        </Table>
      )}
      {devices !== null && !current && (
        <form className="flex flex-wrap items-end gap-3 border-t border-line p-5" onSubmit={async (e) => { e.preventDefault(); if (await trustThisDevice(name.trim() || 'Shared device')) { setName(''); await load(); } }}>
          <Field label="Set up this device" hint="Name it after where it is used, for example Roasting tablet." className="min-w-[240px] flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Roasting tablet" maxLength={80} aria-label="Name for this device" /></Field>
          <Button type="submit">Set up this device</Button>
        </form>
      )}
    </Panel>
  );
}

/** Records a browser kept before the app moved to the server, uploaded once */
function BrowserDataPanel() {
  const store = useStore();
  const [legacy, setLegacy] = useState<{ raw: Record<string, unknown>; batches: number; lots: number } | null>(null);
  const [done, setDone] = useState<{ people: number; needSecrets: number } | null>(null);
  useEffect(() => {
    try {
      const text = window.localStorage.getItem('cocoa-production-v1');
      if (!text) return;
      const raw = JSON.parse(text) as Record<string, unknown>;
      setLegacy({ raw, batches: Array.isArray(raw.batches) ? raw.batches.length : 0, lots: Array.isArray(raw.lots) ? raw.lots.length : 0 });
    } catch { /* nothing to upload */ }
  }, []);
  if (done) return (
    <Notice tone="green">
      The records from this browser are now on the server.
      {done.needSecrets > 0 && ` ${done.needSecrets} of the ${done.people} people added from it had no password or PIN, or still had the sample one: give them one in Setup → Users before they sign in.`}
    </Notice>
  );
  if (!legacy) return null;
  return (
    <Panel title="Records saved in this browser" subtitle="Before the move to the server, this browser kept its own copy of the records.">
      <div className="grid gap-3 p-5 text-[13px]">
        <p>This browser holds <strong>{legacy.batches} batches</strong> and <strong>{legacy.lots} lots</strong>. Uploading replaces the batches, lots and settings on the server with them. People already on the server are kept; people from this browser are added with their PINs and passwords, except the sample ones.</p>
        <div><Button onClick={async () => {
          if (!window.confirm('Replace the batches, lots and settings on the server with the records from this browser?')) return;
          const summary = await store.importBrowserData(legacy.raw);
          if (summary) {
            try { window.localStorage.setItem('cocoa-production-v1-uploaded', JSON.stringify(legacy.raw)); window.localStorage.removeItem('cocoa-production-v1'); } catch { /* ignore */ }
            setDone(summary);
          }
        }}><Upload size={15} /> Upload to the server</Button></div>
      </div>
    </Panel>
  );
}

const userPatch = (d: FormData) => ({
  pin: String(d.get('pin') ?? '').trim() || undefined,
  access: (d.get('access') as Access) || 'operator',
  stations: d.getAll('stations').map(String) as StationId[],
});

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
          <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void store.setBusinessDetails(businessDetails); }}>
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
          <p className="section-note">These details are saved on the server and are included whenever a report is generated.</p>
        </Panel>
      )}
      {current.id === 'business' && <BrowserDataPanel />}
      {current.id === 'business' && store.demo && (
        <Panel title="Demo data" subtitle="This is a demo: the sample factory can be put back at any time.">
          <div className="p-5"><Button variant="danger" onClick={async () => { if (window.confirm('Put the sample factory back? All changes made in the demo are lost and everyone is signed out.')) await store.resetDemo(); }}>Reset demo data</Button></div>
        </Panel>
      )}

      {current.id === 'products' && (
        <Panel title="Products" subtitle="What the factory makes, and which route each product follows.">
          <Table head={['Product', 'Batch prefix', 'Route', '']}>
            {store.products.map((p) => {
              const canDelete = !store.batches.some((b) => b.productId === p.id) && !store.recipes.some((r) => r.productId === p.id);
              return <Fragment key={p.id}>
                <tr key={p.id}>
                  <td className={td}>{p.name}</td><td className={td}>{p.prefix}-</td><td className={td}>{store.routes.find((r) => r.id === p.route)?.name ?? <span className="text-faint">Route removed</span>}</td>
                  <td className={td}><RowActions onEdit={() => setEditingId(p.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${p.name}?`)) store.deleteProduct(p.id); }} deleteDisabled={!canDelete} deleteHint="Products used by recipes or batches cannot be deleted." /></td>
                </tr>
                {editingId === p.id && <tr key={`${p.id}-edit`}><td className={td} colSpan={4}>
                  <EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateProduct(p.id, { name: String(d.get('name')).trim(), prefix: String(d.get('prefix')).trim().toUpperCase(), route: d.get('route') as RouteId, recipeId: p.recipeId }); setEditingId(null); }}>
                    <Field label="Name"><Input name="name" defaultValue={p.name} required /></Field>
                    <Field label="Batch prefix"><Input name="prefix" defaultValue={p.prefix} required maxLength={3} /></Field>
                    <Field label="Route"><Select name="route" defaultValue={p.route}>{store.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                  </EditForm>
                </td></tr>}
              </Fragment>;
            })}
          </Table>
          <p className="section-note">Chocolate types and their recipes are kept under Chocolate types: each is chosen per run at mixing, not as a product.</p>
          <AddForm title="Add product" onSubmit={(d) => store.addProduct({ name: String(d.get('name')), prefix: String(d.get('prefix')).toUpperCase(), route: d.get('route') as RouteId })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Batch prefix"><Input name="prefix" required maxLength={3} placeholder="CH" /></Field>
            <Field label="Route"><Select name="route">{store.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
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
            {store.outputCategories.map((c) => <Fragment key={c.id}>
              <tr key={c.id}><td className={td}>{stationName(c.station)}</td><td className={td}>{c.name}{c.custom && <Badge tone="neutral">added</Badge>}</td><td className={td}><Badge tone={c.kind === 'useful' ? 'green' : c.kind === 'waste' ? 'warn' : 'neutral'}>{kindLabel[c.kind]}</Badge></td><td className={td}><RowActions onEdit={() => setEditingId(`output-${c.id}`)} onDelete={() => { if (window.confirm(`Delete the ${c.name} output row?`)) void store.deleteOutputCategory(c.id); }} /></td></tr>
              {editingId === `output-${c.id}` && <tr key={`output-${c.id}-edit`}><td className={td} colSpan={4}><EditForm onCancel={() => setEditingId(null)} onSubmit={async (d) => { if (await store.updateOutputCategory(c.id, { station: d.get('station') as StationId, name: String(d.get('name')).trim(), kind: d.get('kind') as OutputKind })) setEditingId(null); }}><Field label="Station"><Select name="station" defaultValue={c.station}>{lineStations.filter((s) => s.form === 'weights').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Output name"><Input name="name" defaultValue={c.name} required /></Field><Field label="Type"><Select name="kind" defaultValue={c.kind}><option value="useful">Useful output</option><option value="byproduct">By-product</option><option value="waste">Waste</option></Select></Field></EditForm></td></tr>}
            </Fragment>) }
          </Table>
          <AddForm title="Add output row" onSubmit={(d) => store.addOutputCategory(d.get('station') as StationId, String(d.get('name')), d.get('kind') as OutputKind)}>
            <Field label="Station"><Select name="station">{lineStations.filter((s) => s.form === 'weights').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
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
        <Panel title="Users" subtitle="Staff accounts. On devices set up for quick sign-in (below), people tap their name and enter their PIN; on any other device they use their email and password. Records are signed with the person who is signed in.">
          <Table head={['Name', 'Role', 'Access', 'Stations', 'Recording as', '']}>
            {store.users.map((u) => {
              const usedInAudit = store.batches.some((b) => b.records.some((r) => r.recordedBy === u.id) || b.holds.some((h) => h.placedBy === u.id) || b.corrections.some((c) => c.correctedBy === u.id));
              const lastManager = u.access === 'manager' && store.users.filter((x) => x.access === 'manager').length === 1;
              const canDelete = u.id !== store.sessionUserId && !usedInAudit && !lastManager;
              return <Fragment key={u.id}>
                <tr key={u.id}>
                  <td className={td}>{u.name}<span className="block text-[11px] text-muted">{u.email}</span></td><td className={td}>{u.role}</td>
                  <td className={td}><Badge tone={u.access === 'manager' ? 'info' : 'neutral'}>{u.access === 'manager' ? 'Manager' : 'Operator'}</Badge></td>
                  <td className={td}>{u.stations.length ? u.stations.map((sid) => stationName(sid)).join(', ') : <span className="text-faint">All (no own stations)</span>}</td>
                  <td className={td}>{u.id === store.currentUserId ? <Badge tone="green">Current user</Badge> : <button className="btn-text" onClick={() => void store.setCurrentUser(u.id)}>Use {u.name.split(' ')[0]}</button>}</td>
                  <td className={td}><RowActions onEdit={() => setEditingId(u.id)} onDelete={() => { if (canDelete && window.confirm(`Delete ${u.name}?`)) void store.deleteUser(u.id); }} deleteDisabled={!canDelete} deleteHint="The current user, the last manager, and users in the audit history cannot be deleted." /></td>
                </tr>
                {editingId === u.id && <tr key={`${u.id}-edit`}><td className={td} colSpan={6}>
                  <EditForm onCancel={() => setEditingId(null)} onSubmit={async (d) => {
                    const password = String(d.get('password') ?? '');
                    if (await store.updateUser(u.id, { name: String(d.get('name')).trim(), role: String(d.get('role')).trim(), email: String(d.get('email')).trim(), password: password || undefined, ...userPatch(d) })) setEditingId(null);
                  }}>
                    <Field label="Name"><Input name="name" defaultValue={u.name} required /></Field><Field label="Role"><Input name="role" defaultValue={u.role} required /></Field>
                    <Field label="Email"><Input name="email" type="email" defaultValue={u.email} required autoComplete="off" /></Field><Field label="New password" hint="Leave blank to keep the current password."><Input name="password" type="password" minLength={6} autoComplete="new-password" /></Field>
                    <UserFields user={u} />
                  </EditForm>
                </td></tr>}
              </Fragment>;
            })}
          </Table>
          <AddForm title="Add user" onSubmit={(d) => store.addUser({ name: String(d.get('name')), role: String(d.get('role')), email: String(d.get('email')).trim(), password: String(d.get('password')), ...userPatch(d), pin: String(d.get('pin') ?? '').trim() })}>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Role"><Input name="role" required placeholder="e.g. Winnowing operator" /></Field>
            <Field label="Email"><Input name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Password"><Input name="password" type="password" required minLength={6} autoComplete="new-password" /></Field>
            <UserFields />
          </AddForm>
          <div className="grid gap-2 border-t border-line p-5 md:grid-cols-[320px_1fr] md:items-end">
            <Field label="Sign out after (minutes without use)" hint="Applies to every device. 0 keeps people signed in (up to 7 days)."><NumberSetting value={store.idleMinutes} onSave={store.setIdleMinutes} label="Idle sign-out minutes" /></Field>
          </div>
        </Panel>
      )}

      {current.id === 'users' && <DevicesPanel />}

      {current.id === 'containers' && (
        <Panel title="Containers" subtitle="Bins, buckets and tubs weighed together with the material. Operators pick the container and its empty weight is taken off the scale reading.">
          <Table head={['Container', 'Empty weight', '']}>
            {store.containers.map((c) => <Fragment key={c.id}>
              <tr key={c.id}><td className={td}>{c.name}</td><td className={tdNum}>{c.tare.toFixed(2)} kg</td><td className={td}><RowActions onEdit={() => setEditingId(c.id)} onDelete={() => { if (window.confirm(`Delete ${c.name}? Past records keep the weight they used.`)) store.deleteContainer(c.id); }} /></td></tr>
              {editingId === c.id && <tr key={`${c.id}-edit`}><td className={td} colSpan={3}><EditForm onCancel={() => setEditingId(null)} onSubmit={(d) => { store.updateContainer(c.id, { name: String(d.get('name')).trim(), tare: Number(d.get('tare')) }); setEditingId(null); }}><Field label="Name"><Input name="name" defaultValue={c.name} required /></Field><Field label="Empty weight (kg)" hint="Weigh the empty container."><Input name="tare" type="number" min="0" step="0.01" defaultValue={c.tare} required /></Field></EditForm></td></tr>}
            </Fragment>)}
          </Table>
          <AddForm title="Add container" onSubmit={(d) => store.addContainer({ name: String(d.get('name')).trim(), tare: Number(d.get('tare')) })}>
            <Field label="Name"><Input name="name" required placeholder="e.g. Husk bin 2" /></Field>
            <Field label="Empty weight (kg)" hint="Weigh the empty container."><Input name="tare" type="number" min="0" step="0.01" required /></Field>
          </AddForm>
        </Panel>
      )}
      {current.id === 'containers' && (
        <Panel title="Mixer" subtitle="The mixer keeps some chocolate between types; the next run is made on top of it.">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="Chocolate usually kept in the mixer (kg)" hint="Suggested on every run; the operator can change it."><NumberSetting value={store.mixerKeepsKg} step="0.1" onSave={store.setMixerKeeps} label="Chocolate kept in the mixer" /></Field>
            <div className="text-[13px]"><span className="block text-[11px] font-bold tracking-wide text-faint uppercase">It holds now</span>{store.mixer.holds ? `${store.mixer.holds.kg.toFixed(2)} kg of ${store.mixer.holds.type} (left by ${store.mixer.holds.batchId})` : 'Nothing'}</div>
          </div>
        </Panel>
      )}

      {current.id === 'alerts' && (
        <>
          <Panel title="Variance limit per station" subtitle="An alert is raised when unaccounted variance is above this share of the station input.">
            <Table head={['Station', 'Allowed variance']}>
              {lineStations.filter(isWeighed).map((s) => (
                <tr key={s.id}><td className={td}>{s.name}</td><td className={td}><span className="flex items-center gap-2"><NumberSetting value={store.thresholds.variancePct[s.id] ?? 0} step="0.1" onSave={(v) => store.setStationVariance(s.id, v)} label={`${s.name} variance limit`} /><span className="text-muted">%</span></span></td></tr>
              ))}
            </Table>
          </Panel>
          <Panel title="Other limits">
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Waste limit at any station (%)"><NumberSetting value={store.thresholds.wastePct} step="0.1" onSave={(v) => store.setThresholds({ wastePct: v })} label="Waste limit" /></Field>
              <Field label="Low stock warning for raw materials (kg)"><NumberSetting value={store.thresholds.lowStockKg} onSave={(v) => store.setThresholds({ lowStockKg: v })} label="Low stock limit" /></Field>
            </div>
          </Panel>
        </>
      )}
      <Notice tone="neutral">Changes here are saved on the server and reach every device within a few seconds.</Notice>
    </>
  );
}
