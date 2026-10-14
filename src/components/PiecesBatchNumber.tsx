'use client';

import { useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useStore } from '@/lib/store';
import type { Lot } from '@/lib/types';

/**
 * The batch number of a lot of pieces: typed in by hand once the pieces are counted, never filled in by
 * the app. It can be changed until some of the pieces are dispatched.
 */
export function PiecesBatchNumber({ lot, autoFocus }: { lot: Lot; autoFocus?: boolean }) {
  const store = useStore();
  const current = lot.pieces?.batchNumber ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dispatched = lot.uses.some((u) => u.dispatchId);

  if (current && !editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>Batch number <strong data-testid="pieces-batch-number">{current}</strong></span>
        {!dispatched && <Button variant="ghost" className="px-2" onClick={() => { setValue(current); setError(''); setEditing(true); }} aria-label={`Change the batch number of ${lot.id}`}><Pencil size={13} /> Change</Button>}
      </span>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const batchNumber = value.trim();
    if (!batchNumber) return setError('Enter the batch number.');
    setError('');
    if (batchNumber === current) return setEditing(false);
    setSaving(true);
    const ok = await store.setPiecesBatchNumber(lot.id, batchNumber);
    setSaving(false);
    if (ok) { setEditing(false); setValue(''); }
  }

  return (
    <form onSubmit={save} className="flex w-full flex-wrap items-center gap-2 sm:w-auto" noValidate>
      <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} placeholder="Batch number" aria-label={`Batch number for ${lot.id}`} className="min-w-[120px] flex-1 sm:w-44 sm:flex-none" autoFocus={autoFocus} />
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : current ? 'Save' : <><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add batch number</span></>}</Button>
      {current && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
      {error && <span className="w-full text-[12px] text-danger" role="alert">{error}</span>}
    </form>
  );
}
