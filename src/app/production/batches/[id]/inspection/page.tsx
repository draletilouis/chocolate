'use client';

import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Check, PenLine, Pencil } from 'lucide-react';
import { InspectionFields, blankInspection, draftFrom, inspectionInput, inspectionProblem, type InspectionDraft } from '@/components/InspectionFields';
import { PaperLine, PaperSheet, PaperSignatures, PrintButton, useSignLine } from '@/components/PaperSheet';
import { Back, Button, Empty, LinkButton, Notice, PageHeader, Panel } from '@/components/ui';
import { batchById, batchDisplayName, batchSuppliers, recordFor, userName } from '@/lib/derive';
import { kg } from '@/lib/format';
import { checkRemark, inspectionChecks, inspectionDocNumber } from '@/lib/inspection';
import { useStore } from '@/lib/store';
import type { Batch } from '@/lib/types';

const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** The factory's "Cocoa bean receiving and inspection report" for one delivery: entered here, then printed */
export default function InspectionPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const batch = batchById(store, id);
  const [editing, setEditing] = useState(false);
  if (!batch) return <Empty>Batch {id} was not found.</Empty>;
  const back = <Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} />;
  if (batch.route !== 'beans') return <>{back}<Notice tone="neutral">Only a delivery of beans has a receiving report.</Notice></>;
  if (!batch.inspection || editing) return <>{back}<InspectionForm key={batch.id} batch={batch} onDone={() => setEditing(false)} onCancel={batch.inspection ? () => setEditing(false) : undefined} /></>;
  return <Report batch={batch} onEdit={() => setEditing(true)} />;
}

function InspectionForm({ batch, onDone, onCancel }: { batch: Batch; onDone: () => void; onCancel?: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<InspectionDraft>(() => (batch.inspection ? draftFrom(batch.inspection) : blankInspection()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = inspectionProblem(draft);
    setError(problem);
    if (problem || saving) return;
    setSaving(true);
    const saved = await store.saveInspection(batch.id, inspectionInput(draft));
    setSaving(false);
    if (saved) onDone();
  }

  return (
    <form onSubmit={save} noValidate>
      <PageHeader eyebrow={`Batch ${batch.id}`} title={`Receiving inspection · ${batchDisplayName(batch)}`} subtitle="The checks of the receiving and inspection report. Everything starts as fine: change only what was not." />
      <Panel title="Inspection"><InspectionFields value={draft} onChange={setDraft} /></Panel>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={saving}><Check size={16} /> {saving ? 'Saving…' : 'Save inspection'}</Button>
      </div>
    </form>
  );
}

function Report({ batch, onEdit }: { batch: Batch; onEdit: () => void }) {
  const store = useStore();
  const signLine = useSignLine();
  const [signing, setSigning] = useState(false);
  const inspection = batch.inspection!;
  const signed = batch.approvals?.inspection;
  const manager = store.signedInUser?.access === 'manager';
  const receiving = recordFor(batch, 'receiving');
  const rejected = receiving?.outputs.filter((o) => o.kind === 'waste').reduce((t, o) => t + o.weight, 0) ?? 0;
  const decided = (d: typeof inspection.decision) => (inspection.decision === d ? 'Yes' : '');

  return (
    <>
      <div className="no-print">
        <Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} />
        <PageHeader eyebrow={`Batch ${batch.id}`} title={`Receiving report · ${batchDisplayName(batch)}`} subtitle="The cocoa bean receiving and inspection report for this delivery."
          action={<div className="flex flex-wrap gap-2">
            {manager && !signed && <Button disabled={signing} onClick={async () => { setSigning(true); await store.approveDocument(batch.id, 'inspection'); setSigning(false); }}><PenLine size={14} /> {signing ? 'Signing…' : 'Sign as production manager'}</Button>}
            <PrintButton>Print report</PrintButton>
            {!signed && <Button variant="secondary" onClick={onEdit}><Pencil size={14} /> Edit</Button>}
            <LinkButton variant="secondary" href={`/production/batches/${batch.id}/summary`}>Bean summary</LinkButton>
          </div>} />
        {inspection.decision === 'conditional' && <Notice tone="warn">Accepted on a condition: {inspection.reason}</Notice>}
        {inspection.decision === 'rejected' && <Notice tone="danger">Rejected: {inspection.reason}</Notice>}
        {signed && <Notice tone="neutral">Signed by {userName(store, signed.by)}. A signed report no longer changes.</Notice>}
      </div>

      <PaperSheet title="Cocoa bean receiving and inspection report" docNumber={inspectionDocNumber(batch)}>
        <div className="paper-meta">
          <PaperLine label="Date received" value={longDate(batch.startedAt)} />
          <PaperLine label="Supplier name" value={batchSuppliers(store, batch).join(', ') || undefined} />
          <PaperLine label="Supplier batch No" value={inspection.supplierBatch} />
          <PaperLine label="Internal batch No" value={`${batchDisplayName(batch)}${batch.name ? ` (${batch.id})` : ''}`} />
        </div>
        <table className="paper-table">
          <thead><tr><th style={{ width: '48%' }}>Detail</th><th>Remarks</th></tr></thead>
          <tbody>
            <tr><td>Quantity received (kg)</td><td>{kg(batch.startInput.weight)}{rejected > 0 ? ` · ${kg(rejected)} rejected` : ''}</td></tr>
            <tr><td>Number of bags</td><td>{inspection.bags ?? ''}</td></tr>
            {inspectionChecks.map((def) => {
              const check = inspection.checks.find((c) => c.id === def.id);
              return <tr key={def.id}><td>{def.label}</td><td>{check && !check.ok ? <strong>{checkRemark(check, def.id)}</strong> : checkRemark(check, def.id)}</td></tr>;
            })}
            <tr><td>Accepted / rejected</td><td><strong>{inspection.decision === 'rejected' ? 'Rejected' : 'Accepted'}</strong></td></tr>
            <tr><td>Conditionally accepted</td><td>{decided('conditional')}</td></tr>
            <tr><td>Reason for rejection / condition</td><td>{inspection.reason ?? ''}</td></tr>
          </tbody>
        </table>
        {receiving?.note && <p className="paper-note">Note: {receiving.note}</p>}
        <PaperSignatures lines={[
          { role: 'Quality controller', name: userName(store, inspection.inspectedBy), at: inspection.inspectedAt },
          signLine('Production manager', signed),
        ]} />
      </PaperSheet>
    </>
  );
}
