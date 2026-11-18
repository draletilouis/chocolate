'use client';

import { Field, Input, Select } from '@/components/ui';
import { blankChecks, decisionLabel, inspectionChecks } from '@/lib/inspection';
import type { InspectionInput } from '@/lib/store';
import type { Inspection, InspectionDecision } from '@/lib/types';

/** What the form holds while it is typed: the number of bags as text */
export interface InspectionDraft extends Omit<InspectionInput, 'bags'> { bags: string }

export const blankInspection = (): InspectionDraft => ({ bags: '1', supplierBatch: '', checks: blankChecks(), decision: 'accepted', reason: '' });

export const draftFrom = (i: Inspection): InspectionDraft => ({
  bags: i.bags === undefined ? '' : String(i.bags), supplierBatch: i.supplierBatch ?? '', decision: i.decision, reason: i.reason ?? '',
  // Checks added to the report since this inspection was saved start as fine
  checks: inspectionChecks.map((c) => i.checks.find((x) => x.id === c.id) ?? { id: c.id, ok: true }),
});

export const inspectionInput = (d: InspectionDraft): InspectionInput => ({
  bags: d.bags.trim() === '' ? undefined : Math.max(0, Math.round(Number(d.bags) || 0)),
  supplierBatch: d.supplierBatch?.trim() || undefined,
  checks: d.checks.map((c) => ({ id: c.id, ok: c.ok, remark: c.remark?.trim() || undefined })),
  decision: d.decision, reason: d.reason?.trim() || undefined,
});

/** What stops the inspection from being saved, in words, or '' */
export function inspectionProblem(d: InspectionDraft) {
  if (d.checks.some((c) => !c.ok && !c.remark?.trim())) return 'Say what was found for every check marked as a problem.';
  if (d.decision !== 'accepted' && !d.reason?.trim()) return d.decision === 'rejected' ? 'Say why the beans were rejected.' : 'Say on what condition the beans were accepted.';
  return '';
}

/**
 * The checks of the receiving and inspection report. Every check starts as fine, so a clean delivery
 * needs no typing; a problem asks for what was found.
 */
export function InspectionFields({ value, onChange }: { value: InspectionDraft; onChange: (value: InspectionDraft) => void }) {
  const setCheck = (id: string, patch: { ok?: boolean; remark?: string }) => onChange({ ...value, checks: value.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Field label="Number of bags"><Input type="number" inputMode="numeric" min="0" step="1" value={value.bags} onChange={(e) => onChange({ ...value, bags: e.target.value })} aria-label="Number of bags" /></Field>
        <Field label="Supplier's batch number" hint="As on the bag or the delivery note. Leave empty if there is none."><Input value={value.supplierBatch ?? ''} onChange={(e) => onChange({ ...value, supplierBatch: e.target.value })} maxLength={80} aria-label="Supplier's batch number" /></Field>
      </div>
      <div className="border-t border-line">
        {inspectionChecks.map((def) => {
          const check = value.checks.find((c) => c.id === def.id) ?? { id: def.id, ok: true };
          return (
            <div key={def.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-2.5 last:border-b-0">
              <span className="min-w-[200px] flex-1 text-[14px] font-semibold">{def.label}</span>
              <span className="flex gap-1" role="group" aria-label={def.label}>
                <button type="button" className={`btn ${check.ok ? 'btn-primary' : 'btn-secondary'}`} style={{ minHeight: 44 }} aria-pressed={check.ok} onClick={() => setCheck(def.id, { ok: true })}>Fine</button>
                <button type="button" className={`btn ${check.ok ? 'btn-secondary' : 'btn-danger'}`} style={{ minHeight: 44 }} aria-pressed={!check.ok} onClick={() => setCheck(def.id, { ok: false })}>Problem</button>
              </span>
              <Input className="min-w-[200px] flex-1" value={check.remark ?? ''} onChange={(e) => setCheck(def.id, { remark: e.target.value })} maxLength={200}
                placeholder={check.ok ? def.fine : 'What was found?'} aria-label={`${def.label} remark`} required={!check.ok} />
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 border-t border-line p-5 md:grid-cols-2">
        <Field label="Decision">
          <Select value={value.decision} onChange={(e) => onChange({ ...value, decision: e.target.value as InspectionDecision })} aria-label="Decision">
            {(Object.keys(decisionLabel) as InspectionDecision[]).map((d) => <option key={d} value={d}>{decisionLabel[d]}</option>)}
          </Select>
        </Field>
        {value.decision !== 'accepted' && (
          <Field label={value.decision === 'rejected' ? 'Reason for rejection' : 'Condition'}>
            <Input value={value.reason ?? ''} onChange={(e) => onChange({ ...value, reason: e.target.value })} maxLength={500} aria-label="Reason or condition" required />
          </Field>
        )}
      </div>
    </>
  );
}
