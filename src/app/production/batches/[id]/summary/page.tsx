'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { PaperLine, PaperSection, PaperSheet, PaperSignatures, PrintButton, useSignLine } from '@/components/PaperSheet';
import { Back, Button, Empty, LinkButton, Notice, PageHeader } from '@/components/ui';
import { beanSummary } from '@/lib/bean-summary';
import { batchById, batchDisplayName, userName } from '@/lib/derive';
import { kg, pct } from '@/lib/format';
import { summaryDocNumber } from '@/lib/inspection';
import { useStore } from '@/lib/store';

const longDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** The factory's "Bean summary" for one sack, filled in from the stations' records */
export default function BeanSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const signLine = useSignLine();
  const [signing, setSigning] = useState(false);
  const batch = batchById(store, id);
  if (!batch) return <Empty>Batch {id} was not found.</Empty>;
  if (batch.route !== 'beans') return <><Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} /><Notice tone="neutral">A bean summary is made for a sack of beans. {batchDisplayName(batch)} did not start from beans.</Notice></>;

  const s = beanSummary(store, batch);
  const weight = (n: number) => (n > 0 ? kg(n) : undefined);
  const share = (n: number) => (n > 0 ? pct(n) : undefined);
  const signed = batch.approvals?.summary;
  const manager = store.signedInUser?.access === 'manager';
  const unexplained = s.roastingLoss !== 0 || s.winnowingMissing !== 0 || s.rejected > 0;

  return (
    <>
      <div className="no-print">
        <Back href={`/production/batches/${batch.id}`} label={`Batch ${batchDisplayName(batch)}`} />
        <PageHeader eyebrow={`Batch ${batch.id}`} title={`Bean summary · ${batchDisplayName(batch)}`} subtitle="The paper bean summary, filled in from what was recorded at each station. The yields are worked out, not typed."
          action={<div className="flex flex-wrap gap-2">
            {manager && !signed && s.complete && <Button disabled={signing} onClick={async () => { setSigning(true); await store.approveDocument(batch.id, 'summary'); setSigning(false); }}><PenLine size={14} /> {signing ? 'Signing…' : 'Sign as production manager'}</Button>}
            <PrintButton>Print summary</PrintButton>
            {batch.inspection && <LinkButton variant="secondary" href={`/production/batches/${batch.id}/inspection`}>Receiving report</LinkButton>}
          </div>} />
        {!s.complete && <Notice tone="warn">Roasting and winnowing are not both recorded yet, so this summary is not final.</Notice>}
      </div>

      <PaperSheet title="Bean summary" subtitle={`${batchDisplayName(batch)} · batch ${batch.id}`} docNumber={summaryDocNumber(batch)}>
        <div className="paper-rows">
          <PaperLine label="Date" value={longDate(s.date)} />
          <PaperLine label="Supplier" value={s.suppliers.join(', ') || undefined} />
          <PaperLine label="Bag weight" value={weight(s.bagWeight)} />
          <PaperLine label="Weight after roasting" value={s.afterRoasting !== undefined ? kg(s.afterRoasting) : undefined} />
          <PaperLine label="Unusable beans sorted off" value={weight(s.unusable)} />
          <PaperLine label="Husks and rubbish" value={weight(s.husks)} />
        </div>

        <PaperSection>Usage</PaperSection>
        <div className="paper-rows">
          {s.usage.filter((u) => u.paper || u.weight > 0).map((u) => <PaperLine key={u.label} label={u.label} value={weight(u.weight)} />)}
          <PaperLine label="Yield of total usage from bag" value={s.complete ? share(s.yieldOfBag) : undefined} />
          <PaperLine label="Yield of winnower" value={share(s.yieldOfWinnower)} />
        </div>

        <PaperSection>Derivatives</PaperSection>
        <div className="paper-rows">
          <PaperLine label="Liquor produced from this sack" value={weight(s.liquor)} />
          <PaperLine label="Butter produced from this sack" value={weight(s.butter)} />
          <PaperLine label="Powder produced from this sack" value={weight(s.powder)} />
          <PaperLine label="Butter yield from nibs pressed" value={share(s.butterYield)} />
        </div>

        {unexplained && (
          <>
            <PaperSection>Weight not on the lines above</PaperSection>
            <div className="paper-rows">
              {s.rejected > 0 && <PaperLine label="Rejected when received" value={kg(s.rejected)} />}
              {s.roastingLoss !== 0 && <PaperLine label="Lost in the roaster (moisture)" value={`${kg(s.roastingLoss)} · ${pct(s.bagWeight > 0 ? (s.roastingLoss / s.bagWeight) * 100 : 0)} of the bag`} />}
              {s.winnowingMissing !== 0 && <PaperLine label={s.winnowingMissing > 0 ? 'Not accounted for at winnowing' : 'Weighed out above what went into the winnower'} value={kg(Math.abs(s.winnowingMissing))} />}
            </div>
          </>
        )}

        {s.notes.length > 0 && <p className="paper-note">Notes: {s.notes.join(' · ')}</p>}

        <PaperSignatures lines={[
          { role: 'By', name: s.by.map((u) => userName(store, u)).join(', ') || undefined },
          signLine('Production manager', signed),
        ]} />
      </PaperSheet>
    </>
  );
}
