'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button, Notice } from './ui';

/**
 * The Edit and Delete controls every list uses. Delete asks before it acts, and when
 * something still uses the item it says why it can't be deleted instead.
 */
export function RowActions({ name, onEdit, onDelete, blocked }: { name: string; onEdit?: () => void; onDelete?: () => Promise<void>; blocked?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[12px]" role="group" aria-label={`Delete ${name}`}>
        {blocked ? (
          <><span className="text-warn">{blocked}</span><button type="button" className="btn-text" onClick={() => setConfirming(false)}>OK</button></>
        ) : (
          <>
            <span>Delete {name}?</span>
            <button type="button" className="btn-text text-danger" disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try { await onDelete?.(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete it.'); setBusy(false); }
            }}>Yes, delete</button>
            <button type="button" className="btn-text" onClick={() => { setConfirming(false); setError(''); }}>Cancel</button>
            {error && <span className="basis-full text-right text-danger">{error}</span>}
          </>
        )}
      </span>
    );
  }
  return (
    <span className="flex justify-end gap-3">
      {onEdit && <button type="button" className="btn-text" onClick={onEdit} aria-label={`Edit ${name}`}>Edit</button>}
      {onDelete && <button type="button" className="btn-text" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>Delete</button>}
    </span>
  );
}

/** A form with the same Save and Cancel buttons everywhere; errors from the server show inside it. */
export function EditForm({ onSubmit, onCancel, children, submitLabel = 'Save changes', className = 'grid gap-3 md:grid-cols-2' }: { onSubmit: (data: FormData) => Promise<void>; onCancel: () => void; children: ReactNode; submitLabel?: string; className?: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className={className} onSubmit={async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); setBusy(true); setError('');
      try { await onSubmit(new FormData(e.currentTarget)); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the changes.'); } finally { setBusy(false); }
    }}>
      {children}
      {error && <div className="md:col-span-2"><Notice tone="danger">{error}</Notice></div>}
      <div className="flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy}>{submitLabel}</Button></div>
    </form>
  );
}

/** A table row that becomes an edit form */
export function EditRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} className="bg-paper px-5 py-4">{children}</td></tr>;
}
