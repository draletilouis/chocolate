'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Empty, Panel, Stat } from '@/components/ui';
import { kgText as kg, pctText as pct, USUAL_DAYS, type PhaseLoss, type Summary } from '@/lib/summary';

/** The three kinds of loss, in the same colours as the PDF */
const kinds = [
  { key: 'waste', label: 'Waste weighed', color: '#c9a27a' },
  { key: 'expected', label: 'Moisture from the roaster', color: '#8fb3d9' },
  { key: 'missing', label: 'Missing, not weighed', color: '#d9534f' },
] as const;

const stateBadge: Record<PhaseLoss['state'], { label: string; className: string }> = {
  normal: { label: 'Usual', className: 'bg-success-soft text-success' },
  high: { label: 'Higher than usual', className: 'bg-warn-soft text-warn' },
  low: { label: 'Lower than usual', className: 'bg-moss text-green' },
  unknown: { label: 'Not enough history', className: 'bg-paper text-muted' },
};

const toneStripe = { danger: 'bg-danger', warn: 'bg-warn', neutral: 'bg-green' };

function PhaseRow({ phase, scale }: { phase: PhaseLoss; scale: number }) {
  const badge = stateBadge[phase.state];
  const named = phase.wasteItems.slice(0, 2).map((w) => `${w.name} ${kg(w.weight)}`).join(' · ');
  return (
    <div className="summary-phase">
      <div className="min-w-0">
        <strong className="block">{phase.name}</strong>
        <span className="block text-[12px] text-muted">{kg(phase.input)} went in{named ? ` · ${named}` : ''}{phase.expected ? ` · ${phase.expectedLabel?.startsWith('Moisture') ? 'moisture' : 'loss'} ${kg(phase.expected)}` : ''}{phase.missing ? ` · missing ${kg(phase.missing)}` : ''}</span>
      </div>
      <div className="summary-bar" role="img" aria-label={`${phase.name}: ${kinds.map((k) => `${k.label} ${kg(phase[k.key])}`).join(', ')}`}>
        {kinds.map((k) => phase[k.key] > 0 && phase.input > 0 && <span key={k.key} style={{ width: `${Math.min(100, (phase[k.key] / phase.input) * 100 / scale * 100)}%`, background: k.color }} />)}
      </div>
      <strong className={`text-right tabular-nums ${phase.state === 'high' ? 'text-warn' : ''}`}>{pct(phase.lossPct)}</strong>
      <div className="summary-usual">
        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>{badge.label}</span>
        {phase.usual && <span className="block text-[11px] text-muted tabular-nums">Usual {pct(phase.usual.low)} – {pct(phase.usual.high)}</span>}
      </div>
    </div>
  );
}

/** The owner's page: the answer in a sentence, five numbers, loss at each phase and what needs a look */
export function ReportSummary({ summary }: { summary: Summary }) {
  const scale = Math.max(20, ...summary.phases.map((p) => p.lossPct));
  return (
    <>
      <p className="summary-headline">{summary.headline}</p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Beans in" value={summary.beans.sacks ? kg(summary.beans.kg) : '—'} hint={summary.beans.sacks ? `${summary.beans.sacks} sacks · ${summary.beans.suppliers} suppliers` : 'No beans received'} />
        <Stat label="Products per 100 kg" value={summary.sacks.finished ? kg(summary.sacks.productsPer100) : '—'} hint={summary.sacks.finished ? `From ${summary.sacks.finished} finished sacks` : 'No sack finished'} />
        <Stat label="Chocolate made" value={kg(summary.chocolateKg)} hint="Taken out of the mixer" />
        <Stat label="Pieces made" value={summary.pieces.count.toLocaleString('en-GB')} hint={`${kg(summary.pieces.kg)} of chocolate`} />
        <Stat label="Missing, not weighed" value={kg(summary.missing.kg)} hint={summary.missing.worstPhase ? `Most at ${summary.missing.worstPhase.toLowerCase()}` : 'Whole line'} tone={summary.missing.kg > 0 ? 'warn' : undefined} />
      </div>

      <Panel title="Loss at each phase" subtitle={`Share of what went into each phase. "Usual" is the middle 80% of the factory's own batches over the last ${USUAL_DAYS} days.`}>
        {summary.phases.length === 0 ? <Empty>Nothing was weighed in this period.</Empty> : (
          <>
            {summary.phases.map((p) => <PhaseRow key={p.id} phase={p} scale={scale} />)}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-[12px] text-muted">
              {kinds.map((k) => <span key={k.key} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} />{k.label}</span>)}
              <span className="ml-auto">Bars are drawn to {Math.round(scale)}% across. <Link href="/reports/losses" className="font-semibold text-green">Every batch</Link></span>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Needs attention" subtitle={summary.attention.length ? undefined : 'Nothing needs a look.'}>
        {summary.attention.map((item, i) => (
          <Link key={i} href={item.href} className="summary-alert">
            <span className={`summary-alert-stripe ${toneStripe[item.tone]}`} />
            <span className="min-w-0 flex-1"><strong className="block">{item.title}</strong>{item.detail && <span className="block text-[13px] text-muted">{item.detail}</span>}</span>
            <ChevronRight size={16} className="shrink-0 text-faint" />
          </Link>
        ))}
      </Panel>
    </>
  );
}
