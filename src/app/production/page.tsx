'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Pause, Plus } from 'lucide-react';
import { Badge, Empty, LinkButton, PageHeader, Panel } from '@/components/ui';
import { activeBatches, batchDisplayName, currentStation, waitingAt } from '@/lib/derive';
import { openDiscrepancies } from '@/lib/discrepancies';
import { lineGroups, lineStages, type LineStage } from '@/lib/line';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

/** How many waiting items a stage lists before the rest fold behind "Show all" */
const SHOWN = 3;
/** Remembers on this device that someone asked to see every stage, also the ones with nothing waiting */
const ALL_KEY = 'line-show-all';

/**
 * The production line as one flow, from delivery to dispatch. Every stage is listed in the order the
 * work happens, with what is waiting there and the button that records it, so nothing has to be looked
 * for on another page.
 */
export default function ProductionPage() {
  const store = useStore();
  const manager = store.signedInUser?.access === 'manager';
  const stages = lineStages(store);
  const waiting = stages.filter((s) => s.id !== 'dispatch').reduce((n, s) => n + s.items.length, 0);
  const batches = activeBatches(store).sort((a, b) => (a.status === 'hold' ? 1 : 0) - (b.status === 'hold' ? 1 : 0) || a.startedAt.localeCompare(b.startedAt));
  const flags = openDiscrepancies(store, new Date().toISOString().slice(0, 10));
  // Stages with nothing waiting fold into one line per part, so the work stands out; the choice is kept on this device
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { try { setShowAll(window.localStorage.getItem(ALL_KEY) === '1'); } catch { /* no storage here */ } }, []);
  const toggleAll = () => { const next = !showAll; setShowAll(next); try { window.localStorage.setItem(ALL_KEY, next ? '1' : '0'); } catch { /* no storage here */ } };
  const numberOf = new Map(stages.map((s, i) => [s.id, i + 1]));
  const quiet = stages.filter((s) => s.items.length === 0).length;

  return (
    <>
      <PageHeader eyebrow="Production line" title={waiting ? `${waiting} ${waiting === 1 ? 'thing is' : 'things are'} waiting on the line` : 'Nothing is waiting on the line'} subtitle="The whole line from delivery to dispatch, in the order the work happens. Each stage shows what is waiting there and the button to record it."
        action={<LinkButton href="/production/new"><Plus size={16} /> Receive a delivery</LinkButton>} />

      {quiet > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
          <span>{showAll ? `All ${stages.length} stages of the line.` : `${stages.length - quiet} of ${stages.length} stages have work waiting. The others are listed under each part.`}</span>
          <button type="button" className="btn btn-secondary" onClick={toggleAll} aria-pressed={showAll}>{showAll ? 'Show only stages with work' : `Show all ${stages.length} stages`}</button>
        </div>
      )}

      {lineGroups.map((group) => {
        const own = stages.filter((s) => s.group === group.name);
        if (own.length === 0) return null;
        const cards = showAll ? own : own.filter((s) => s.items.length > 0);
        const folded = showAll ? [] : own.filter((s) => s.items.length === 0);
        return (
          <section key={group.name} className="mb-4" aria-label={group.name}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-extrabold tracking-wide text-muted uppercase">{group.name}</h2>
              <Link href={group.href} className="text-[12px] font-semibold text-green">Open this part</Link>
            </div>
            {cards.length > 0 && (
              <ol className="mix-flow" style={{ marginBottom: folded.length ? 8 : undefined }}>
                {cards.map((stage) => <Stage key={stage.id} stage={stage} number={numberOf.get(stage.id)!} manager={manager} />)}
              </ol>
            )}
            {folded.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-line bg-white px-4 py-2.5 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1"><Check size={13} /> Nothing waiting at</span>
                {folded.map((stage) => <Link key={stage.id} href={stage.href} className="font-semibold text-ink hover:underline"><span className="text-faint">{numberOf.get(stage.id)}</span> {stage.name}</Link>)}
                {folded.flatMap((stage) => (stage.also && (manager || !stage.also.managers) ? [stage.also] : [])).map((also) => <LinkButton key={also.href} variant="secondary" href={also.href}><Plus size={14} /> {also.label}</LinkButton>)}
              </div>
            )}
          </section>
        );
      })}

      <Panel title="Batches in progress" subtitle={`${batches.length} on the line. Open one to follow it from delivery to where it ended up.`}>
        {batches.length === 0 && <Empty>No batches in progress. Start one when beans arrive.</Empty>}
        {batches.map((batch) => {
          const own = flags.filter((d) => d.batchId === batch.id && d.kind !== 'hold');
          const onHold = batch.status === 'hold';
          const at = waitingAt(batch);
          return (
            <div key={batch.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 md:px-5">
              <div className="min-w-0">
                <Link href={`/production/batches/${batch.id}`} className="font-bold text-green hover:underline">{batchDisplayName(batch)}</Link>
                <span className="ml-2 text-[12px] text-muted">{batch.name ? `${batch.id} · ` : ''}{batch.product}</span>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span>Waiting at <strong>{at.map((s) => stationName(s).toLowerCase()).join(' and ') || 'nothing'}</strong></span>
                  <span className="text-[12px] text-muted">last recorded {stationName(currentStation(batch)).toLowerCase()}</span>
                  {onHold && <Badge tone="danger">On hold</Badge>}
                  {own.length > 0 && <Link href="/discrepancies"><Badge tone={own.some((d) => d.severity === 'high') ? 'danger' : 'warn'}>{own.length} to explain</Badge></Link>}
                </div>
              </div>
              {onHold
                ? <LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Review hold</LinkButton>
                : <LinkButton variant="secondary" href={`/production/batches/${batch.id}`} aria-label={`Open ${batchDisplayName(batch)}`}>Open <ArrowRight size={15} /></LinkButton>}
            </div>
          );
        })}
      </Panel>
    </>
  );
}

function Stage({ stage, number, manager }: { stage: LineStage; number: number; manager: boolean }) {
  const [all, setAll] = useState(false);
  const busy = stage.items.length > 0;
  const shown = all ? stage.items : stage.items.slice(0, SHOWN);
  const also = stage.also && (manager || !stage.also.managers) ? stage.also : undefined;
  return (
    <li className={`mix-step ${busy ? 'is-current' : 'is-later'}`}>
      <span className="mix-step-icon" aria-hidden="true">{number}</span>
      <div className="mix-step-card">
        <div className="mix-step-head">
          <div className="min-w-0">
            <h3><Link href={stage.href} className="hover:underline">{stage.name}</Link></h3>
            {/* A phone keeps empty stages to one line, so the stages with work stand out */}
            <p className={busy ? undefined : 'hidden md:block'}>{stage.hint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {busy ? <Badge tone="green">{stage.total || `${stage.items.length} waiting`}</Badge> : <span className="inline-flex items-center gap-1 text-[12px] text-faint"><Check size={13} /> Nothing waiting</span>}
            {also && <LinkButton variant="secondary" href={also.href}><Plus size={14} /> {also.label}</LinkButton>}
          </div>
        </div>
        {busy && (
          <div className="mix-step-body">
            {shown.map((item) => (
              <div key={item.key} className="work-card">
                <div className="min-w-0">
                  <div className="work-card-name">{item.title}{item.hold && <> <Badge tone="danger">On hold</Badge></>}</div>
                  <div className={`text-[13px] ${item.hold ? 'text-danger' : 'text-muted'}`}>{item.hold && <Pause size={12} className="mr-1 inline" />}{item.sub}</div>
                </div>
                {(manager || !item.managers) && <LinkButton variant={item.hold ? 'secondary' : 'primary'} href={item.href} aria-label={`${item.action}: ${item.title}`}>{item.action} <ArrowRight size={16} /></LinkButton>}
              </div>
            ))}
            {stage.items.length > SHOWN && <button type="button" className="add-row" onClick={() => setAll(!all)} aria-expanded={all}>{all ? 'Show fewer' : `Show all ${stage.items.length}`}</button>}
          </div>
        )}
      </div>
    </li>
  );
}
