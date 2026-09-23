'use client';

import { useState, type FormEvent } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { api, useAuth } from './AuthProvider';
import { Button, Field, Input, Notice, PageHeader, Panel } from './ui';

export function ChangePasswordForm() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const forced = user.passwordResetRequired;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    const r = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? 'Could not change the password.');
    // Full navigation so the server re-resolves the session (the reset flag is now cleared).
    window.location.assign('/production');
  }

  return (
    <>
      <PageHeader eyebrow="Account" title={forced ? 'Choose your own password' : 'Change password'} subtitle={forced ? 'Your account was set up with a temporary password. Choose your own before continuing.' : `Signed in as ${user.email}`} />
      {forced && <Notice tone="warn" icon={KeyRound}>You must set a new password before using the workspace.</Notice>}
      <form onSubmit={submit}>
        <Panel title="New password" subtitle="A 4-digit PIN or a password of at least 8 characters. Other devices signed in to this account will be signed out.">
          <div className="grid gap-4 p-5 md:max-w-md">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required aria-label="Current password" /></Field>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required aria-label="New password" /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-label="Confirm new password" /></Field>
          </div>
          {error && <div className="px-5 pb-4"><Notice tone="danger">{error}</Notice></div>}
          <div className="flex justify-end border-t border-line px-5 py-3"><Button type="submit" disabled={busy}><Check size={15} /> {busy ? 'Saving…' : 'Save new password'}</Button></div>
        </Panel>
      </form>
    </>
  );
}
