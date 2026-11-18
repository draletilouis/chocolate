'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Bell, BellOff, Check, RotateCcw, Share2 } from 'lucide-react';
import { NOTIFY_KEY, notifyEnabled } from '@/components/DiscrepancyWatch';
import { Badge, Button, Empty, Input, LinkButton, Notice, PageHeader, Panel, Select, Stat, Table, td, tdNum } from '@/components/ui';
import { userName } from '@/lib/derive';
import { USUAL_DAYS, digestText, findDiscrepancies, isWeighing, kindLabels, patternBy, severityLabels, usualRanges, type Discrepancy, type DiscrepancyKind, type Pattern, type Severity } from '@/lib/discrepancies';
import { dateTime, kg, num } from '@/lib/format';
import { useStore } from '@/lib/store';
import { stationName } from '@/lib/stations';

const tabs = [{ id: 'open', label: 'Open' }, { id: 'explained', label: 'Explained' }, { id: 'patterns', label: 'Patterns' }, { id: 'limits', label: 'Usual ranges' }] as const;
type Tab = (typeof tabs)[number]['id'];
const tone: Record<Severity, 'danger' | 'warn' | 'neutral'> = { high: 'danger', medium: 'warn', low: 'neutral' };
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** The discrepancy register: everything that does not add up, open until explained or dealt with */
export default function DiscrepanciesPage() {
  const store = useStore();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>('open');
  const [kind, setKind] = useState<'all' | DiscrepancyKind>('all');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [span, setSpan] = useState('90');
  const [notify, setNotify] = useState(false);
  const [shared, setShared] = useState('');
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  // What was open when this person last looked at the register on this device
  const seenKey = `discrepancies-seen:${store.sessionUserId ?? ''}`;
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  useEffect(() => {
    setNotify(notifyEnabled());
    try { setLastSeen(window.localStorage.getItem(seenKey) ?? ''); window.localStorage.setItem(seenKey, new Date().toISOString()); } catch { setLastSeen(''); }
  }, [seenKey]);

  const all = findDiscrepancies(store, today);
  const open = all.filter((d) => !d.resolution);
  const explained = all.filter((d) => d.resolution).sort((a, b) => (b.resolution!.at ?? b.at).localeCompare(a.resolution!.at ?? a.at));
  const matches = (d: Discrepancy) => (kind === 'all' || d.kind === kind) && (severity === 'all' || d.severity === severity);
  const shown = (tab === 'open' ? open : explained).filter(matches);
  const kinds = Array.from(new Set((tab === 'open' ? open : explained).map((d) => d.kind)));
  const explainable = shown.filter((d) => d.closes === 'explain');
  const isNew = (d: Discrepancy) => Boolean(lastSeen) && d.at > lastSeen!;
  const atStake = open.filter(isWeighing).reduce((t, d) => t + (d.kg ?? 0), 0);

  const since = span === 'all' ? '' : daysAgo(Number(span));
  const inSpan = all.filter((d) => isWeighing(d) && d.at.slice(0, 10) >= since);

  async function toggleNotify() {
    try {
      if (notify) { window.localStorage.removeItem(NOTIFY_KEY); return setNotify(false); }
      if (typeof Notification === 'undefined') return setShared('This browser cannot show notifications.');
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') return setShared('Notifications are blocked for this site in the browser settings.');
      window.localStorage.setItem(NOTIFY_KEY, '1');
      setNotify(true);
    } catch { setShared('Notifications could not be turned on here.'); }
  }

  async function share() {
    const text = digestText(store, today, store.business.name);
    try {
      if (navigator.share) { await navigator.share({ title: 'Open discrepancies', text }); setShared('Digest shared.'); }
      else { await navigator.clipboard.writeText(text); setShared('Digest copied. Paste it into a message.'); }
    } catch { setShared(''); }
  }

  async function explainAll(event: FormEvent) {
    event.preventDefault();
    if (!bulk.trim() || busy) return;
    setBusy(true);
    for (const d of explainable) if (!(await store.explainDiscrepancy(d.id, bulk.trim()))) break;
    setBusy(false);
    setBulk('');
  }

  return (
    <>
      <PageHeader eyebrow="Discrepancies" title={open.length ? `${open.length} open discrepanc${open.length === 1 ? 'y' : 'ies'}` : 'Everything adds up'} subtitle="Every weight, count or record that does not add up, found from the records themselves. An item stays here until a manager explains it or it is dealt with."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={share}><Share2 size={15} /> Share today&apos;s digest</Button>
          <Button variant="secondary" onClick={toggleNotify} aria-pressed={notify}>{notify ? <Bell size={15} /> : <BellOff size={15} />} {notify ? 'Notifying on this device' : 'Notify me on this device'}</Button>
          <LinkButton variant="secondary" href="/reports/discrepancies">Report and export</LinkButton>
        </div>} />
      {shared && <Notice tone="neutral">{shared}</Notice>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Serious" value={open.filter((d) => d.severity === 'high').length} tone={open.some((d) => d.severity === 'high') ? 'danger' : undefined} hint="Deal with these first" />
        <Stat label="To check" value={open.filter((d) => d.severity === 'medium').length} tone={open.some((d) => d.severity === 'medium') ? 'warn' : undefined} />
        <Stat label="Minor" value={open.filter((d) => d.severity === 'low').length} />
        <Stat label="Weight in question" value={kg(Math.round(atStake * 1000) / 1000)} hint="Open weighing discrepancies" />
      </div>

      <div className="sub-nav-tabs" role="group" aria-label="Parts of the register">
        {tabs.map((t) => <button key={t.id} type="button" onClick={() => { setTab(t.id); setKind('all'); setSeverity('all'); }} className={`sub-nav-btn ${t.id === tab ? 'active' : ''}`} aria-pressed={t.id === tab}>{t.label}{t.id === 'open' && open.length > 0 ? ` (${open.length})` : t.id === 'explained' && explained.length > 0 ? ` (${explained.length})` : ''}</button>)}
      </div>

      {(tab === 'open' || tab === 'explained') && (
        <Panel title={tab === 'open' ? 'Open' : 'Explained'} subtitle={tab === 'open' ? 'The most serious first. Explain an item to move it to the history; holds, low stock, waiting batches and unsigned sheets close by themselves once dealt with.' : 'What was explained, by whom, and how. An explanation written here can be taken back.'}
          action={<div className="flex flex-wrap gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind" className="w-auto"><option value="all">All kinds</option>{kinds.map((k) => <option key={k} value={k}>{kindLabels[k]}</option>)}</Select>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} aria-label="Severity" className="w-auto"><option value="all">Any severity</option>{(Object.keys(severityLabels) as Severity[]).map((s) => <option key={s} value={s}>{severityLabels[s]}</option>)}</Select>
          </div>}>
          {shown.length === 0 && <Empty>{tab === 'open' ? 'Nothing open here.' : 'Nothing explained yet.'}</Empty>}
          {shown.map((d) => <Item key={d.id} d={d} fresh={tab === 'open' && isNew(d)} />)}
          {tab === 'open' && explainable.length > 1 && store.signedInUser?.access === 'manager' && (
            <form onSubmit={explainAll} className="flex flex-wrap items-end gap-2 border-t border-line bg-paper px-5 py-3">
              <label className="min-w-[220px] flex-1 text-[12px] font-semibold text-muted">One explanation for all {explainable.length} items shown that can be explained
                <Input value={bulk} onChange={(e) => setBulk(e.target.value)} maxLength={500} placeholder="e.g. from before the scales were recalibrated" aria-label="Explanation for all shown" />
              </label>
              <Button type="submit" variant="secondary" disabled={busy || !bulk.trim()}>{busy ? 'Saving…' : `Explain all ${explainable.length}`}</Button>
            </form>
          )}
        </Panel>
      )}

      {tab === 'patterns' && (
        <>
          <Panel title="Where it keeps going wrong" subtitle="Weighing discrepancies added up, open and explained together. One item says little; the same station, person or supplier again and again says a lot."
            action={<Select value={span} onChange={(e) => setSpan(e.target.value)} aria-label="Period" className="w-auto"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="all">All time</option></Select>}>
            {inSpan.length === 0 && <Empty>No weighing discrepancies in this period.</Empty>}
          </Panel>
          {inSpan.length > 0 && (
            <>
              <PatternTable title="By station" head="Station" rows={patternBy(inSpan, (d) => (d.station ? stationName(d.station) : d.kind === 'count' ? 'Stock count' : undefined))} />
              <PatternTable title="By kind" head="Kind" rows={patternBy(inSpan, (d) => kindLabels[d.kind])} />
              <PatternTable title="By person" head="Recorded by" note="Who saved the record the item is about. A person who weighs more will also appear more." rows={patternBy(inSpan, (d) => (d.userId ? userName(store, d.userId) : undefined))} />
              <PatternTable title="By supplier" head="Supplier" note="For batches of beans and what was made from them." rows={patternBy(inSpan, (d) => d.supplier)} />
            </>
          )}
        </>
      )}

      {tab === 'limits' && (
        <Panel title="What each station usually loses" subtitle={`Waste and unweighed weight together, as a share of what went in: the middle 80% of the station's records over the last ${USUAL_DAYS} days. A record well outside its station's range is listed as unusual, in both directions, next to the fixed limit.`}>
          <Table head={['Station', `Records in ${USUAL_DAYS} days`, 'Usually loses', 'Fixed limit for missing weight']}>
            {usualRanges(store, today).map(({ station, records, usual, limit }) => (
              <tr key={station.id}>
                <td className={td}><strong>{station.name}</strong><span className="block text-[11px] text-muted">{station.group}</span></td>
                <td className={tdNum}>{records}</td>
                <td className={td}>{usual ? `${usual.low.toFixed(1)}% to ${usual.high.toFixed(1)}%` : <span className="text-muted">Not enough records yet (5 needed)</span>}</td>
                <td className={td}>{limit}% <Link href="/setup/alerts" className="ml-2 text-[12px] font-semibold text-green">Change</Link></td>
              </tr>
            ))}
          </Table>
          {usualRanges(store, today).length === 0 && <Empty>Nothing has been weighed yet.</Empty>}
        </Panel>
      )}
    </>
  );
}

function PatternTable({ title, head, rows, note }: { title: string; head: string; rows: Pattern[]; note?: string }) {
  if (rows.length === 0) return null;
  return (
    <Panel title={title} subtitle={note}>
      <Table head={[head, 'Items', 'Still open', 'Weight in question']}>
        {rows.map((r) => <tr key={r.name}><td className={td}>{r.name}</td><td className={tdNum}>{r.open + r.explained}</td><td className={`${tdNum} ${r.open ? 'font-semibold text-warn' : 'text-muted'}`}>{r.open}</td><td className={tdNum}>{num(r.kg)} kg</td></tr>)}
      </Table>
    </Panel>
  );
}

function Item({ d, fresh }: { d: Discrepancy; fresh: boolean }) {
  const store = useStore();
  const manager = store.signedInUser?.access === 'manager';
  const [explaining, setExplaining] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function explain(event: FormEvent) {
    event.preventDefault();
    if (!note.trim() || saving) return;
    setSaving(true);
    const ok = await store.explainDiscrepancy(d.id, note.trim());
    setSaving(false);
    if (ok) setExplaining(false);
  }

  return (
    <div className="border-b border-line px-5 py-3.5 text-[13px] last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={tone[d.severity]}>{severityLabels[d.severity]}</Badge><span className="text-[11px] font-bold tracking-wide text-faint uppercase">{kindLabels[d.kind]}</span>{fresh && <Badge tone="info">New</Badge>}</div>
          <Link href={d.href} className="mt-1 block text-[14px] font-semibold text-ink hover:underline">{d.title}</Link>
          <div className="text-muted">{d.detail}</div>
          {d.operatorReason && <div className="mt-1">Reason given when it was saved: <strong>{d.operatorReason}</strong></div>}
          <div className="mt-1 text-[12px] text-faint">{dateTime(d.at)}{d.userId ? ` · ${userName(store, d.userId)}` : ''}{d.supplier ? ` · ${d.supplier}` : ''}{d.lotId ? ` · ${d.lotId}` : ''}</div>
          {d.resolution && <div className="mt-2 rounded-md bg-paper px-3 py-2"><Check size={13} className="mr-1 inline text-success" /><strong>{d.resolution.note}</strong><span className="block text-[12px] text-muted">{d.resolution.by ? userName(store, d.resolution.by) : 'From the records'}{d.resolution.at ? ` · ${dateTime(d.resolution.at)}` : ''}{d.resolution.own ? ' · explained on the record itself' : ''}</span></div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {d.kg !== undefined && d.kg > 0 && <strong className="tabular-nums">{kg(d.kg)}</strong>}
          <LinkButton variant="ghost" href={d.href}>Open</LinkButton>
          {!d.resolution && d.closes === 'explain' && manager && <Button variant="secondary" onClick={() => setExplaining((v) => !v)}>Explain</Button>}
          {d.resolution && !d.resolution.own && manager && <Button variant="ghost" onClick={() => store.reopenDiscrepancy(d.id)} title="Take the explanation back"><RotateCcw size={14} /> Reopen</Button>}
        </div>
      </div>
      {!d.resolution && d.closes === 'act' && <div className="mt-1 text-[12px] text-muted">Closes by itself once it is dealt with.</div>}
      {explaining && (
        <form onSubmit={explain} className="mt-2 flex flex-wrap gap-2">
          <Input className="min-w-[220px] flex-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What explains it, or what was done about it?" aria-label={`Explanation for ${d.title}`} autoFocus required />
          <Button type="submit" disabled={saving || !note.trim()}>{saving ? 'Saving…' : 'Save explanation'}</Button>
        </form>
      )}
    </div>
  );
}
