import type { Batch, Inspection, InspectionCheck, InspectionDecision } from './types';

/**
 * The checks of the factory's "Cocoa bean receiving and inspection report", in the report's own order
 * and words. `fine` is what the quality controller writes when there is nothing to report.
 */
export const inspectionChecks = [
  { id: 'pests', label: 'No signs of pests or infestation', fine: 'No signs of pests' },
  { id: 'water', label: 'No water damage', fine: 'None' },
  { id: 'colour', label: 'Bean colour (uniform)', fine: 'Uniform' },
  { id: 'mould', label: 'Presence of mould', fine: 'No mould' },
  { id: 'foreign', label: 'Foreign matter (stones, sticks, etc.)', fine: 'No foreign matter' },
  { id: 'broken', label: 'Broken / damaged beans (%)', fine: 'None' },
  { id: 'insects', label: 'Insect damage', fine: 'None' },
  { id: 'odour', label: 'Odours (normal / off)', fine: 'Normal' },
  { id: 'cleanliness', label: 'Cleanliness', fine: 'Clean' },
] as const;

export const decisionLabel: Record<InspectionDecision, string> = { accepted: 'Accepted', conditional: 'Conditionally accepted', rejected: 'Rejected' };

/** A new inspection form: every check fine, the beans accepted */
export const blankChecks = (): InspectionCheck[] => inspectionChecks.map((c) => ({ id: c.id, ok: true }));

/** What the report shows in the Remarks column for one check */
export function checkRemark(check: InspectionCheck | undefined, id: string) {
  const def = inspectionChecks.find((c) => c.id === id);
  if (!check) return '';
  return check.remark?.trim() || (check.ok ? def?.fine ?? 'Fine' : 'Problem found');
}

/** Checks with a problem, as "Label: remark" */
export const problemsOf = (inspection: Inspection) =>
  inspection.checks.filter((c) => !c.ok).map((c) => `${inspectionChecks.find((d) => d.id === c.id)?.label ?? c.id}: ${c.remark ?? ''}`);

/** The document number printed on a batch's receiving report: the factory's series, then the batch */
export const inspectionDocNumber = (batch: Pick<Batch, 'id'>) => `ECL/SOP/PRO/RM/${batch.id}`;
export const summaryDocNumber = (batch: Pick<Batch, 'id'>) => `ECL/SOP/PRO/BS/${batch.id}`;
