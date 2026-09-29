'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { PublicUser } from '@/server/auth/users';
import { dateTime } from '@/lib/format';
import { api, useAuth } from './AuthProvider';
import { Badge, Button, Empty, Field, Input, Notice, Panel, Select, Table, td } from './ui';

/** Staff accounts live in PostgreSQL and are managed through /api/users (admins only). */
export function StaffAccounts() {
  const { user: me } = useAuth();
  const isAdmin = me.role === 'admin';
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [issuing, setIssuing] = useState<PublicUser | null>(null);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ users?: PublicUser[] }>('/api/users');
    if (!r.ok) return setError(r.data.message ?? 'Could not load accounts.');
    setUsers(r.data.users ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(target: PublicUser, body: Record<string, unknown>, done: string) {
    setBusy(true); setError(''); setNotice('');
    const r = await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? 'The change was not saved.');
    setNotice(done); setIssuing(null); setEditing(null);
    await load();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setNotice('');
    const r = await api('/api/users', { method: 'POST', body: JSON.stringify({ name: data.get('name'), email: data.get('email'), role: data.get('role'), roleLabel: data.get('roleLabel') || undefined, password: data.get('password') }) });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? 'The account was not created.');
    setNotice(`Account created. They must change the temporary password at first sign-in.`); setAdding(false);
    await load();
  }

  return (
    <Panel title="Staff accounts" subtitle={isAdmin ? 'Everyone signs in with their own email and password. New accounts get a temporary password. Accounts are deactivated rather than deleted, so their name stays on the records they made.' : 'Ask a production manager to add or change accounts.'}
      action={isAdmin && !adding ? <Button onClick={() => setAdding(true)}><Plus size={15} /> Add account</Button> : undefined}>
      {notice && <div className="px-5 pt-4"><Notice tone="green">{notice}</Notice></div>}
      {error && <div className="px-5 pt-4"><Notice tone="danger">{error}</Notice></div>}
      {adding && (
        <form onSubmit={create} className="grid gap-3 border-b border-line p-5 md:grid-cols-2">
          <Field label="Name"><Input name="name" required minLength={2} /></Field>
          <Field label="Email"><Input name="email" type="email" required autoComplete="off" /></Field>
          <Field label="Access"><Select name="role" defaultValue="operator"><option value="operator">Operator (records at stations)</option><option value="admin">Production manager (admin)</option></Select></Field>
          <Field label="Job title (optional)"><Input name="roleLabel" placeholder="e.g. Winnowing operator" /></Field>
          <Field label="Temporary password" hint="A 4-digit PIN or 8+ characters. Share it with the person; they set their own at first sign-in." className="md:col-span-2"><Input name="password" type="text" required minLength={4} maxLength={72} autoComplete="off" /></Field>
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={busy}>Create account</Button></div>
        </form>
      )}
      {issuing && (
        <form onSubmit={(e) => { e.preventDefault(); const pw = String(new FormData(e.currentTarget).get('password')); void patch(issuing, { newPassword: pw }, `Temporary password set for ${issuing.name}. They are signed out everywhere and must choose a new one.`); }} className="grid gap-3 border-b border-line p-5 md:grid-cols-[1fr_auto]">
          <Field label={`Temporary password for ${issuing.name}`} hint="A 4-digit PIN or 8+ characters."><Input name="password" type="text" required minLength={4} maxLength={72} autoComplete="off" autoFocus /></Field>
          <div className="flex items-end gap-2"><Button variant="secondary" onClick={() => setIssuing(null)}>Cancel</Button><Button type="submit" disabled={busy}>Set password</Button></div>
        </form>
      )}
      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); void patch(editing, { name: String(data.get('name')), roleLabel: String(data.get('roleLabel') ?? '') || null }, `${String(data.get('name'))} updated.`); }} className="grid gap-3 border-b border-line p-5 md:grid-cols-2">
          <Field label="Name"><Input name="name" defaultValue={editing.name} required minLength={2} autoFocus /></Field>
          <Field label="Job title (optional)"><Input name="roleLabel" defaultValue={editing.roleLabel} placeholder="e.g. Winnowing operator" /></Field>
          <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>Save changes</Button></div>
        </form>
      )}
      {users === null ? <Empty>Loading accounts…</Empty> : users.length === 0 ? <Empty>No accounts yet.</Empty> : (
        <Table head={isAdmin ? ['Name', 'Access', 'Email', 'Status', 'Last sign-in', 'Actions'] : ['Name', 'Access', 'Email', 'Status', 'Last sign-in']}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className={td}><strong>{u.name}</strong>{u.id === me.id && <span className="ml-2 text-[11px] text-muted">(you)</span>}</td>
              <td className={td}>{u.roleLabel}{u.role === 'admin' && <Badge tone="info">admin</Badge>}</td>
              <td className={td}>{u.email}</td>
              <td className={td}>{!u.isActive ? <Badge tone="neutral">Inactive</Badge> : u.passwordResetRequired ? <Badge tone="warn">Must change password</Badge> : <Badge tone="green">Active</Badge>}</td>
              <td className={td}>{u.lastLoginAt ? dateTime(u.lastLoginAt) : <span className="text-faint">Never</span>}</td>
              {isAdmin && (
                <td className={td}>
                  <span className="flex flex-wrap justify-center gap-3">
                    <button className="btn-text" disabled={busy} onClick={() => { setEditing(u); setIssuing(null); }} aria-label={`Edit ${u.name}`}>Edit</button>
                    {u.id !== me.id && (u.isActive
                      ? <button className="btn-text" disabled={busy} onClick={() => patch(u, { isActive: false }, `${u.name} deactivated.`)}>Deactivate</button>
                      : <button className="btn-text" disabled={busy} onClick={() => patch(u, { isActive: true }, `${u.name} reactivated.`)}>Reactivate</button>)}
                    {u.id !== me.id && u.isActive && <button className="btn-text" disabled={busy} onClick={() => patch(u, { role: u.role === 'admin' ? 'operator' : 'admin' }, `${u.name} is now ${u.role === 'admin' ? 'an operator' : 'an admin'}.`)}>{u.role === 'admin' ? 'Make operator' : 'Make admin'}</button>}
                    {u.isActive && <button className="btn-text" disabled={busy} onClick={() => setIssuing(u)}>Reset password</button>}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
