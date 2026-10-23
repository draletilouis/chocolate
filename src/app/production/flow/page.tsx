'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Back, Badge, Button, Empty, Field, LinkButton, PageHeader, Panel, Select, SubNav, Table, td, tdNum } from '@/components/ui';
import { FloorMap, shortAmount, type MapFocus } from '@/components/FloorMap';
import { amountOf, batchById, batchDisplayName, customerName, recordBalance, waitingAt } from '@/lib/derive';
import { batchFlow, edgeKey, flowPeriods, floorFlow, placeName, type FlowEdge, type FlowMove, type FlowNode, type FlowNodeId, type FlowPeriod } from '@/lib/flow';
import { dateTime, destinationLabel, kg } from '@/lib/format';
import { useStore } from '@/lib/store';
import { lineStations, stationById, stationName } from '@/lib/stations';
import type { Batch, StationId } from '@/lib/types';

const link = 'font-semibold text-green';
const toStation = (s: string) => stationName(s as StationId);
const isPlace = (id: string | null): id is FlowNodeId => id === 'deliveries' || id === 'customers' || lineStations.some((s) => s.id === id);

export default function FloorFlowPage() {
  return <Suspense fallback={<p className="empty-state" aria-busy="true">Loading…</p>}><FloorFlow /></Suspense>;
}

function FloorFlow() {
  const store = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = (flowPeriods.find((p) => p.id === params.get('period'))?.id ?? '30') as FlowPeriod;
  const station = params.get('station');
  const edge = params.get('route');
  const followed = params.get('batch') ? batchById(store, params.get('batch')!) : undefined;

  /** Every choice lives in the address, so a view can be shared and the back button undoes it */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  const go = (changes: Record<string, string | null>) => router.replace(hrefWith(changes), { scroll: false });

  const { edges, nodes } = floorFlow(store, period);
  const flow = followed ? batchFlow(store, followed) : undefined;
  const pathEdges = new Map<string, { kg: number; units: number }>();
  for (const m of flow?.moves ?? []) {
    const k = edgeKey(m.from, m.to);
    const t = pathEdges.get(k) ?? { kg: 0, units: 0 };
    if (m.unit === 'units') t.units += m.quantity; else t.kg += m.quantity;
    pathEdges.set(k, t);
  }
  const focus: MapFocus = {
    selected: edge ? { kind: 'edge', key: edge } : isPlace(station) ? { kind: 'node', id: station } : undefined,
    path: flow ? { places: flow.places, edges: pathEdges } : undefined,
  };
  const selectedEdge = edge ? edges.find((e) => e.key === edge && e.moves.length > 0) : undefined;
  const batches = [...store.batches].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const periodLabel = flowPeriods.find((p) => p.id === period)!.label.toLowerCase();

  // Picking a station or route on the map brings its details into view; the map can be taller than the screen.
  const details = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current) details.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    picked.current = false;
  }, [station, edge]);
  const pick = (changes: Record<string, string | null>) => { picked.current = true; go(changes); };

  return (
    <>
      <Back href="/production" label="Production line" />
      <PageHeader eyebrow="Production line" title="Floor flow" subtitle="How material moves from station to station across the floor, and every batch and lot that passed through each one." />

      <SubNav items={flowPeriods.map((p) => ({ id: p.id, label: p.label, href: hrefWith({ period: p.id === '30' ? null : p.id }) }))} current={period} />

      <Panel title="Floor map" subtitle={<>Routes are sized by the weight that moved along them ({periodLabel}). Pick a station or a route to see its batches and lots.</>}
        action={(
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Follow a batch" className="min-w-[220px]">
              <Select value={followed?.id ?? ''} onChange={(e) => go({ batch: e.target.value || null })} aria-label="Follow a batch through the floor">
                <option value="">All batches</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{batchDisplayName(b)}{b.name ? ` (${b.id})` : ''} · {b.product}</option>)}
              </Select>
            </Field>
            {followed && <Button variant="ghost" onClick={() => go({ batch: null })} aria-label="Stop following the batch"><X size={15} /></Button>}
          </div>
        )}>
        <div className="floor-map-scroll">
          <FloorMap nodes={nodes} edges={edges} focus={focus}
            onNode={(id) => pick({ station: station === id ? null : id, route: null })}
            onEdge={(key) => pick({ route: edge === key ? null : key, station: null })} />
        </div>
        <p className="px-5 text-[12px] text-muted md:hidden">Swipe the map sideways to see the whole floor.</p>
        <Legend />
      </Panel>

      <div ref={details} className="scroll-mt-20">
        {selectedEdge && <RoutePanel edge={selectedEdge} onClose={() => go({ route: null })} />}
        {!selectedEdge && isPlace(station) && <PlacePanel key={station} node={nodes[station]} edges={edges} onRoute={(key) => pick({ route: key, station: null })} onClose={() => go({ station: null })} periodLabel={periodLabel} />}
      </div>
      {followed && flow && <BatchChain batch={followed} moves={flow.moves} />}

      <StationTable nodes={nodes} edges={edges} selected={isPlace(station) ? station : undefined} hrefFor={(id) => hrefWith({ station: id, route: null })} periodLabel={periodLabel} />
    </>
  );
}

function Legend() {
  const line = (dash?: string, color = 'var(--color-green)', opacity = 0.55, w = 3) => (
    <svg width="30" height="10" aria-hidden="true"><path d="M1,5 L29,5" stroke={color} strokeOpacity={opacity} strokeWidth={w} strokeDasharray={dash} /></svg>
  );
  return (
    <div className="floor-legend">
      <span>Numbers on routes are kg</span>
      <span>{line()} Carried on inside the batch</span>
      <span>{line('7 5')} Stored as a lot, then taken out</span>
      <span>{line('3 4', 'var(--color-faint)', 1, 1.5)} Route not used in this period</span>
      <span><span className="inline-block h-3.5 min-w-5 rounded-full bg-accent px-1 text-center text-[10px] font-extrabold leading-[14px] text-white">2</span> Waiting now</span>
      <span><span className="inline-block h-3.5 min-w-5 rounded-full bg-danger px-1 text-center text-[10px] font-extrabold leading-[14px] text-white">1</span> On hold</span>
    </div>
  );
}

/** Who a move belongs to: the batch that made it, the batch that took it, the lot and the dispatch */
function MoveParties({ move }: { move: FlowMove }) {
  const store = useStore();
  const batchLink = (id?: string) => {
    if (!id) return null;
    const b = batchById(store, id);
    return <Link href={`/production/batches/${id}`} className={link}>{b ? batchDisplayName(b) : id}</Link>;
  };
  const parts: ReactNode[] = [];
  if (move.fromBatch) parts.push(<span key="from">{batchLink(move.fromBatch)}</span>);
  if (move.lotId) parts.push(<span key="lot">lot <Link href={`/materials/${move.lotId}`} className={link}>{move.lotId}</Link></span>);
  if (move.toBatch && move.toBatch !== move.fromBatch) parts.push(<span key="to">into {batchLink(move.toBatch)}</span>);
  if (move.dispatchId) {
    const d = store.dispatches.find((x) => x.id === move.dispatchId);
    parts.push(<span key="dsp"><Link href={`/dispatch/${move.dispatchId}`} className={link}>{move.dispatchId}</Link>{d && ` to ${customerName(store, d.customerId)}`}</span>);
  }
  if (!move.fromBatch && !move.lotId) parts.push(<span key="del">delivered into {batchLink(move.toBatch)}</span>);
  return <span className="inline-flex flex-wrap items-center gap-x-1.5">{parts.map((p, i) => <Fragment key={i}>{i > 0 && <ArrowRight size={11} className="text-faint" />}{p}</Fragment>)}</span>;
}

const amount = (m: FlowMove) => (m.unit === 'units' ? amountOf(m.quantity, 'units') : kg(m.quantity));

/** Show the first rows of a long list, with a button for the rest */
function useMore<T>(rows: T[], first = 10) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, first);
  const more = rows.length > first ? <div className="px-5 py-2"><button type="button" className="btn btn-ghost" onClick={() => setAll((v) => !v)} aria-pressed={all}>{all ? `Show the first ${first}` : `Show all ${rows.length}`}</button></div> : null;
  return { shown, more };
}

/** Moves newest first, or in the order they happened when reading a chain */
function MovesTable({ moves, route = true, inOrder = false }: { moves: FlowMove[]; route?: boolean; inOrder?: boolean }) {
  const { shown, more } = useMore(inOrder ? moves : [...moves].reverse());
  return (
    <>
      <Table head={['When', ...(route ? ['From → to'] : []), 'What', 'Amount', 'Batch and lot']}>
        {shown.map((m) => (
          <tr key={m.key}>
            <td className={`${td} whitespace-nowrap text-[13px]`}>{dateTime(m.at)}</td>
            {route && <td className={`${td} text-[13px]`}>{placeName(m.from)} <ArrowRight size={11} className="inline text-faint" /> {placeName(m.to)}{m.via === 'store' && <span className="block text-[11px] text-muted">via store</span>}</td>}
            <td className={`${td} text-[13px]`}>{m.material}</td>
            <td className={tdNum}>{amount(m)}</td>
            <td className={`${td} text-[13px]`}><MoveParties move={m} /></td>
          </tr>
        ))}
      </Table>
      {more}
    </>
  );
}

/** One batch's chain through the floor: where it came in, every station it was carried through, and where its goods went */
function BatchChain({ batch, moves }: { batch: Batch; moves: FlowMove[] }) {
  const waiting = waitingAt(batch);
  const recorded = [...batch.records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).map((r) => r.station);
  return (
    <Panel title={`The chain for ${batchDisplayName(batch)}`} subtitle={<>{batch.product} · {batch.status === 'completed' ? 'completed' : batch.status === 'hold' ? 'on hold' : waiting.length ? `waiting at ${waiting.map((s) => stationName(s).toLowerCase()).join(' and ')}` : 'in progress'}. Every move below is lit up on the map, over all time.</>}
      action={<div className="flex flex-wrap gap-2"><LinkButton variant="secondary" href={`/production/batches/${batch.id}`}>Open batch</LinkButton><LinkButton variant="secondary" href={`/trace/${batch.id}`}>Trace</LinkButton></div>}>
      <ol className="flex flex-wrap items-center gap-1.5 px-5 py-3 text-[13px]" aria-label="Stations recorded, in order">
        {recorded.map((s, i) => <li key={s} className="flex items-center gap-1.5">{i > 0 && <ArrowRight size={12} className="text-faint" />}<Badge tone="green">{stationName(s)}</Badge></li>)}
        {waiting.map((s) => <li key={`w-${s}`} className="flex items-center gap-1.5"><ArrowRight size={12} className="text-faint" /><Badge tone="warn">{stationName(s)} · waiting</Badge></li>)}
        {recorded.length === 0 && waiting.length === 0 && <li className="text-muted">Nothing recorded yet.</li>}
      </ol>
      {moves.length ? <MovesTable moves={moves} inOrder /> : <Empty>No material has moved for this batch yet.</Empty>}
    </Panel>
  );
}

function RoutePanel({ edge, onClose }: { edge: FlowEdge; onClose: () => void }) {
  const line = edge.moves.filter((m) => m.via === 'line');
  const stored = edge.moves.filter((m) => m.via === 'store');
  const sum = (ms: FlowMove[]) => shortAmount(ms.filter((m) => m.unit === 'kg').reduce((t, m) => t + m.quantity, 0), ms.filter((m) => m.unit === 'units').reduce((t, m) => t + m.quantity, 0));
  const batchCount = new Set(edge.moves.flatMap((m) => [m.fromBatch, m.toBatch]).filter(Boolean)).size;
  return (
    <Panel title={`${placeName(edge.from)} → ${placeName(edge.to)}`}
      subtitle={<>{edge.materials.join(', ')} · <strong className="text-ink">{shortAmount(edge.kg, edge.units)}</strong> in {edge.moves.length} move{edge.moves.length === 1 ? '' : 's'} by {batchCount} batch{batchCount === 1 ? '' : 'es'}{line.length > 0 && stored.length > 0 && <> · {sum(line)} carried on, {sum(stored)} via store</>}</>}
      action={<Button variant="ghost" onClick={onClose} aria-label="Close the route"><X size={15} /></Button>}>
      <MovesTable moves={edge.moves} route={false} />
    </Panel>
  );
}

/** Everything at one place on the floor: what came in and went out, what waits there now, and each batch recorded there */
function PlacePanel({ node, edges, onRoute, onClose, periodLabel }: { node: FlowNode; edges: FlowEdge[]; onRoute: (key: string) => void; onClose: () => void; periodLabel: string }) {
  const id = node.id;
  const station = id !== 'deliveries' && id !== 'customers' ? stationById[id] : undefined;
  const incoming = edges.filter((e) => e.to === id && e.moves.length && e.from !== id);
  const outgoing = edges.filter((e) => e.from === id && e.moves.length && e.to !== id);
  const routeRow = (e: FlowEdge, other: FlowNodeId, dir: string) => (
    <tr key={e.key}>
      <td className={td}><button type="button" className={`${link} text-left hover:underline`} onClick={() => onRoute(e.key)}>{dir} {placeName(other)}</button></td>
      <td className={`${td} text-[13px]`}>{e.materials.join(', ')}</td>
      <td className={tdNum}>{shortAmount(e.kg, e.units)}</td>
      <td className={tdNum}>{e.moves.length}</td>
    </tr>
  );
  return (
    <Panel title={placeName(id)} subtitle={station ? <>{station.input} <ArrowRight size={12} className="inline" /> {station.output}</> : id === 'deliveries' ? 'Material bought in from suppliers and where it went first.' : 'Goods that left the factory in dispatches.'}
      action={<div className="flex gap-2">{station && <LinkButton variant="secondary" href={`/production/stations/${id}`}>Open station</LinkButton>}<Button variant="ghost" onClick={onClose} aria-label="Close the station"><X size={15} /></Button></div>}>
      {(incoming.length > 0 || outgoing.length > 0 || node.exits.length > 0) && (
        <Table head={['Route', 'What', 'Amount', 'Moves']}>
          {incoming.map((e) => routeRow(e, e.from, 'From'))}
          {outgoing.map((e) => routeRow(e, e.to, 'To'))}
          {node.exits.map((x) => (
            <tr key={x.destination}>
              <td className={`${td} text-muted`}>{destinationLabel(x.destination, toStation)}</td>
              <td className={`${td} text-[13px]`}>{x.names.join(', ')}</td>
              <td className={tdNum}>{shortAmount(x.kg)}</td>
              <td className={td} />
            </tr>
          ))}
        </Table>
      )}
      {(id === 'deliveries' || id === 'customers') && <MovesTable moves={(id === 'deliveries' ? outgoing : incoming).flatMap((e) => e.moves).sort((a, b) => a.at.localeCompare(b.at))} />}
      {station && <StationInstances node={node} periodLabel={periodLabel} />}
    </Panel>
  );
}

function StationInstances({ node, periodLabel }: { node: FlowNode; periodLabel: string }) {
  const id = node.id as StationId;
  const store = useStore();
  const records = useMore(node.records);
  const made = useMore(node.madeLots);
  const completed = useMore(node.completed);
  const heading = (text: string) => <h4 className="border-t border-line bg-paper px-5 py-2 text-[12px] font-bold tracking-wide text-muted uppercase">{text}</h4>;
  const batchCell = (b: Batch) => <><Link href={`/production/batches/${b.id}`} className={link}>{batchDisplayName(b)}</Link> <span className="text-[12px] text-muted">{b.product}</span></>;
  return (
    <>
      {heading(id === 'packaging' ? 'Chocolate waiting to be made into pieces' : 'Waiting here now')}
      {id === 'packaging'
        ? (node.waitingLots.length ? node.waitingLots.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2.5 text-[13px] last:border-b-0">
            <span><strong>{l.chocolate!.type}</strong> · <Link href={`/materials/${l.id}`} className={link}>{l.id}</Link> <span className="text-muted">mixed by {l.source.type === 'batch' ? l.source.batchId : ''}</span></span>
            <Link href={`/production/pieces/${l.id}`} className={link}>{kg(l.available)} · Record pieces</Link>
          </div>
        )) : <Empty>No chocolate is waiting.</Empty>)
        : (node.ready.length + node.held.length ? [...node.ready, ...node.held].map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2.5 text-[13px] last:border-b-0">
            <span>{batchCell(b)} {b.status === 'hold' && <Badge tone="danger">On hold</Badge>}</span>
            {b.status === 'active' && <Link href={`/production/batches/${b.id}/record/${id}`} className={link}>{id === 'completion' ? 'Review & complete' : 'Record'}</Link>}
          </div>
        )) : <Empty>Nothing is waiting here.</Empty>)}

      {id === 'packaging' && <>
        {heading(`Pieces counted · ${periodLabel}`)}
        {node.madeLots.length ? <><Table head={['Counted', 'Pieces', 'From chocolate', 'Lot', 'Batch number']}>
          {made.shown.map((l) => (
            <tr key={l.id}>
              <td className={`${td} whitespace-nowrap text-[13px]`}>{dateTime(l.receivedAt)}</td>
              <td className={tdNum}>{l.received} × {l.pieces!.size}</td>
              <td className={`${td} text-[13px]`}>{l.pieces!.type} · <Link href={`/materials/${l.pieces!.fromLotId}`} className={link}>{l.pieces!.fromLotId}</Link></td>
              <td className={td}><Link href={`/materials/${l.id}`} className={link}>{l.id}</Link></td>
              <td className={`${td} text-[13px]`}>{l.pieces!.batchNumber ?? <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </Table>{made.more}</> : <Empty>No pieces were counted in this period.</Empty>}
      </>}

      {id === 'completion' && <>
        {heading(`Completed · ${periodLabel}`)}
        {node.completed.length ? <><Table head={['Batch', 'Completed', 'Stations recorded']}>
          {completed.shown.map((b) => (
            <tr key={b.id}><td className={td}>{batchCell(b)}</td><td className={`${td} text-[13px]`}>{b.completedAt ? dateTime(b.completedAt) : '—'}</td><td className={tdNum}>{b.records.length}</td></tr>
          ))}
        </Table>{completed.more}</> : <Empty>No batch was completed in this period.</Empty>}
      </>}

      {id !== 'packaging' && id !== 'completion' && <>
        {heading(`Batches recorded here · ${periodLabel}`)}
        {node.records.length ? <><Table head={['Batch', 'Recorded', 'In', 'Carried on', 'Left the line', 'Missing']}>
          {records.shown.map(({ batch, record }) => {
            const balance = recordBalance(record);
            const on = record.outputs.filter((o) => o.destination.startsWith('continue:'));
            const off = record.outputs.filter((o) => !o.destination.startsWith('continue:'));
            const list = (os: typeof on, to: boolean) => os.length ? os.map((o) => <span key={o.name} className="block whitespace-nowrap">{kg(o.weight)} {to ? `to ${stationName(o.destination.slice(9) as StationId).toLowerCase()}` : o.name.toLowerCase()}</span>) : '—';
            return (
              <tr key={record.id}>
                <td className={td}>{batchCell(batch)}<span className="block text-[11px] text-muted">by {store.users.find((u) => u.id === record.recordedBy)?.name ?? record.recordedBy}</span></td>
                <td className={`${td} whitespace-nowrap text-[13px]`}>{dateTime(record.recordedAt)}</td>
                <td className={tdNum}>{kg(record.inputWeight)}</td>
                <td className={`${td} text-[12px]`}>{record.destinationsSaved ? list(on, true) : <Badge tone="warn">Destinations not saved</Badge>}</td>
                <td className={`${td} text-[12px] text-muted`}>{list(off, false)}</td>
                <td className={tdNum}>{kg(balance.variance)}</td>
              </tr>
            );
          })}
        </Table>{records.more}</> : <Empty>No batch was recorded here in this period.</Empty>}
      </>}
    </>
  );
}

/** Every station with its instances, as a table: also the way to read the map on a small screen */
function StationTable({ nodes, edges, selected, hrefFor, periodLabel }: { nodes: Record<FlowNodeId, FlowNode>; edges: FlowEdge[]; selected?: FlowNodeId; hrefFor: (id: FlowNodeId) => string; periodLabel: string }) {
  const out = (id: FlowNodeId) => edges.filter((e) => e.from === id && e.to !== id && e.moves.length);
  return (
    <Panel title="Every station" subtitle={`What waits at each station now, and what passed through it (${periodLabel}).`}>
      <Table head={['Station', 'Waiting', 'On hold', 'Recorded', 'Went in', 'Sent on to']}>
        {lineStations.map((s) => {
          const n = nodes[s.id];
          const waiting = s.id === 'packaging' ? n.waitingLots.length : n.ready.length;
          const count = s.id === 'packaging' ? `${n.madeLots.length} lots of pieces` : s.id === 'completion' ? `${n.completed.length} completed` : n.records.length;
          return (
            <tr key={s.id} className={selected === s.id ? 'bg-cream' : undefined}>
              <td className={td}><Link href={hrefFor(s.id)} scroll={false} className={link}>{s.name}</Link><span className="block text-[11px] text-muted">{s.group}</span></td>
              <td className={tdNum}>{waiting ? <Badge tone="warn">{waiting}</Badge> : '—'}</td>
              <td className={tdNum}>{n.held.length ? <Badge tone="danger">{n.held.length}</Badge> : '—'}</td>
              <td className={tdNum}>{count}</td>
              <td className={tdNum}>{n.inKg > 0 ? kg(n.inKg) : '—'}</td>
              <td className={`${td} text-[12px]`}>{out(s.id).map((e) => <span key={e.key} className="block whitespace-nowrap">{placeName(e.to)} · {shortAmount(e.kg, e.units)}</span>)}{out(s.id).length === 0 && '—'}</td>
            </tr>
          );
        })}
      </Table>
    </Panel>
  );
}
