'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, CheckCircle2, Undo2 } from 'lucide-react';
import { Back, Button, Empty, LinkButton, Notice, PageHeader, Panel, UnitInput } from '@/components/ui';
import { batchById, batchDisplayName, userName } from '@/lib/derive';
import { dateTime, kg } from '@/lib/format';
import { piecesFrom, piecesKg } from '@/lib/pieces';
import { planProgress } from '@/lib/plan';
import { useStore } from '@/lib/store';

/** Pieces: good pieces of each size made from one lot of chocolate */
export default function PiecesPage() {
  const { lot: id } = useParams<{ lot: string }>();
  const store = useStore();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lot = store.lots.find((l) => l.id === id);
  if (!lot) return <Empty>Lot {id} was not found.</Empty>;
  if (!lot.chocolate || lot.source.type !== 'batch') return <><Back href="/production/stations/packaging" label="Pieces queue" /><Notice tone="neutral">Lot {lot.id} is {lot.material.toLowerCase()}, not chocolate made at mixing. Pieces are made from chocolate lots.</Notice></>;

  const batch = batchById(store, lot.source.batchId);
  const made = piecesFrom(store, lot.id);
  const entries = store.packSizes.map((p) => ({ pack: p, count: Math.max(0, Math.floor(Number(counts[p.id]) || 0)) }));
  const usedKg = Math.round(entries.reduce((sum, e) => sum + piecesKg(e.count, e.pack.grams), 0) * 1000) / 1000;
  const leftKg = Math.round((lot.available - usedKg) * 1000) / 1000;
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const planned = planProgress(store)?.lines.filter((l) => l.recipeId === lot.chocolate!.recipeId) ?? [];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (total === 0) return setError('Enter how many pieces of each size were made.');
    if (leftKg < -0.005) return setError(`That is ${kg(usedKg)} of chocolate, but the lot has ${kg(lot!.available)} left.`);
    setSaving(true);
    const lots = await store.recordPieces(lot!.id, entries.filter((e) => e.count > 0).map((e) => ({ packSizeId: e.pack.id, count: e.count })));
    setSaving(false);
    if (lots) { setSaved(lots); setCounts({}); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  return (
    <>
      <Back href="/production/stations/packaging" label="Pieces queue" />
      <PageHeader eyebrow={`Finishing · ${lot.chocolate.type}`} title={`Pieces · ${lot.id}`}
        subtitle={<>{lot.chocolate.type} made at mixing by {batch ? <Link href={`/production/batches/${batch.id}`} className="font-semibold text-green">{batchDisplayName(batch)}</Link> : lot.source.batchId} · {dateTime(lot.receivedAt)}</>} />
      {saved && (
        <div className="saved-banner" role="status">
          <div className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><div><strong>Pieces saved.</strong> {saved.map((lotId) => { const l = store.lots.find((x) => x.id === lotId); return l ? `${l.received} × ${l.pieces?.size} (${l.id})` : lotId; }).join(' · ')}.</div></div>
          <div className="mt-3 flex flex-wrap gap-2">{saved.map((lotId) => <LinkButton key={lotId} variant="secondary" href={`/materials/${lotId}`}>Label for {lotId}</LinkButton>)}<LinkButton href="/production/stations/packaging">Pieces queue <ArrowRight size={15} /></LinkButton></div>
        </div>
      )}

      <section className="input-card" aria-label="Chocolate in the lot">
        <div className="input-card-label">Chocolate in the lot</div>
        <div><strong className="text-[22px] tabular-nums">{kg(lot.available)}</strong> <span className="text-muted">of {lot.chocolate.type} left of {kg(lot.received)}</span></div>
      </section>

      {lot.available > 0.004 ? (
        <form onSubmit={save} noValidate>
          <Panel title="Count the good pieces" subtitle="Enter the pieces of each size made from this lot. Leave a size empty if none were made. Sizes are set in Setup → Piece sizes.">
            {store.packSizes.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_160px] items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                <span><strong>{p.name}</strong> <span className="text-[12px] text-muted">{p.grams} g each</span>{(() => { const line = planned.find((l) => l.packSizeId === p.id); return line && <span className="block text-[12px] text-muted">Plan: {line.left ? `${line.left} still to make` : 'done'}</span>; })()}</span>
                <UnitInput unit="pieces" step="1" placeholder="0" value={counts[p.id] ?? ''} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })} aria-label={`${p.name} pieces`} />
              </div>
            ))}
          </Panel>
          <div className="save-bar">
            <div className={`live-balance ${leftKg < -0.005 ? 'is-warn' : total ? 'is-ok' : 'is-neutral'}`} role="status">
              <strong>{total ? `${total} pieces · ${kg(usedKg)} of chocolate` : 'Enter the pieces made'}</strong>
              <span className="live-balance-total">{leftKg < -0.005 ? `${kg(-leftKg)} more than the lot has` : `${kg(Math.max(0, leftKg))} stays in the lot`}</span>
            </div>
            {error && <div className="save-bar-error" role="alert">{error}</div>}
            <Button type="submit" className="flex-1" disabled={saving}><Check size={16} /> {saving ? 'Saving…' : 'Save pieces'}</Button>
          </div>
        </form>
      ) : <Notice tone="neutral">All the chocolate in this lot has been made into pieces.</Notice>}

      <Panel title="Pieces made from this lot">
        {made.length === 0 && <Empty>None yet.</Empty>}
        {made.map((p) => {
          const unused = p.uses.length === 0 && p.available === p.received;
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-[13px] last:border-b-0">
              <span><Link href={`/materials/${p.id}`} className="font-semibold text-green">{p.id}</Link> · <strong className="tabular-nums">{p.received}</strong> × {p.pieces!.size} <span className="text-muted">· {kg(piecesKg(p.received, p.pieces!.grams))} · {dateTime(p.receivedAt)} · {userName(store, p.pieces!.recordedBy)}</span></span>
              {unused && <Button variant="ghost" onClick={async () => { if (window.confirm(`Undo ${p.id} (${p.received} × ${p.pieces!.size})? The chocolate goes back to ${lot.id}.`)) await store.removePieces(p.id); }} aria-label={`Undo ${p.id}`}><Undo2 size={14} /> Undo</Button>}
            </div>
          );
        })}
      </Panel>
    </>
  );
}
