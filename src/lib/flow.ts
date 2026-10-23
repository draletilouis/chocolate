import { round2 } from './balance';
import { chocolateWaiting, stationQueue } from './derive';
import { routes, type State } from './seed';
import { lineStations, stationById } from './stations';
import type { Batch, Destination, Lot, StationId, StationRecord } from './types';

/** A place on the floor material moves between: a station, or where it comes in from suppliers and leaves for customers */
export type FlowNodeId = StationId | 'deliveries' | 'customers';

/**
 * One movement of material from one place on the floor to the next: an output a batch carried on to its
 * next station, or a lot that was stored and later taken out (by a batch, for pieces, or in a dispatch).
 */
export interface FlowMove {
  key: string;
  from: FlowNodeId;
  to: FlowNodeId;
  material: string;
  quantity: number;
  unit: Lot['unit'];
  /** line: carried on inside the batch. store: kept as a lot first, then taken out */
  via: 'line' | 'store';
  /** The batch that made it; absent for a supplier's delivery */
  fromBatch?: string;
  /** The batch that took it in; absent when it left the factory */
  toBatch?: string;
  lotId?: string;
  dispatchId?: string;
  at: string;
}

/** Every move between two places, added up */
export interface FlowEdge {
  key: string;
  from: FlowNodeId;
  to: FlowNodeId;
  moves: FlowMove[];
  kg: number;
  units: number;
  materials: string[];
  /** A route the line allows, whether or not anything moved along it in the period */
  possible: boolean;
}

/** Output that left the line at a station: stored, for sale, rework, waste or left in the mixer */
export interface FlowExit { destination: Exclude<Destination, `continue:${string}`>; kg: number; names: string[] }

export interface FlowNode {
  id: FlowNodeId;
  /** Batches ready to record here now, and on hold here now */
  ready: Batch[];
  held: Batch[];
  /** Records saved here in the period, newest first */
  records: { batch: Batch; record: StationRecord }[];
  /** Weight that went in, from the records (or at Pieces, the chocolate made into pieces) */
  inKg: number;
  exits: FlowExit[];
  /** Pieces: chocolate lots still to make into pieces, and lots of pieces counted in the period */
  waitingLots: Lot[];
  madeLots: Lot[];
  /** Completion: batches closed in the period */
  completed: Batch[];
}

export type FlowPeriod = 'today' | '7' | '30' | 'all';
export const flowPeriods: { id: FlowPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'All records' },
];

/** First day (YYYY-MM-DD, local) the period covers; null for all records */
export function periodStart(period: FlowPeriod, now = new Date()): string | null {
  if (period === 'all') return null;
  const day = new Date(now);
  day.setDate(day.getDate() - (period === 'today' ? 0 : Number(period) - 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export const edgeKey = (from: FlowNodeId, to: FlowNodeId) => `${from}>${to}`;

export const placeName = (id: FlowNodeId) => (id === 'deliveries' ? 'Deliveries' : id === 'customers' ? 'Customers' : stationById[id].name);

/** The routes the line allows: each station's next stations and its rows' default destinations, plus the way in and out */
export function possibleRoutes(): [FlowNodeId, FlowNodeId][] {
  const pairs: [FlowNodeId, FlowNodeId][] = [['deliveries', 'receiving']];
  for (const s of lineStations) {
    const targets = [...s.next, ...s.rows.flatMap((r) => (r.to?.startsWith('continue:') ? [r.to.slice(9) as StationId] : []))];
    for (const t of targets) if (!stationById[t].retired) pairs.push([s.id, t]);
  }
  pairs.push(['mixing', 'packaging'], ['packaging', 'customers']);
  return Array.from(new Map(pairs.map((p) => [edgeKey(...p), p])).values());
}

/** Every move of material on the floor, oldest first */
export function floorMoves(state: Pick<State, 'batches' | 'lots'>): FlowMove[] {
  const moves: FlowMove[] = [];
  for (const batch of state.batches) {
    // Beans received straight onto the line: the batch is the delivery.
    const first = routes.find((r) => r.id === batch.route)?.stations[0];
    if (first && batch.startInput.weight > 0 && batch.startInput.lotIds.length === 0) {
      moves.push({ key: `${batch.id}-start`, from: 'deliveries', to: first, material: batch.startInput.material, quantity: batch.startInput.weight, unit: 'kg', via: 'line', toBatch: batch.id, at: batch.startedAt });
    }
    for (const record of batch.records) {
      if (!record.destinationsSaved) continue;
      record.outputs.forEach((o, i) => {
        if (!o.destination.startsWith('continue:') || !(o.weight > 0)) return;
        moves.push({ key: `${record.id}-${i}`, from: record.station, to: o.destination.slice(9) as StationId, material: o.name, quantity: o.weight, unit: 'kg', via: 'line', fromBatch: batch.id, toBatch: batch.id, at: record.recordedAt });
      });
    }
  }
  for (const lot of state.lots) {
    const from: FlowNodeId = lot.source.type === 'batch' ? lot.source.station : 'deliveries';
    const fromBatch = lot.source.type === 'batch' ? lot.source.batchId : undefined;
    lot.uses.forEach((use, i) => {
      const to: FlowNodeId | undefined = use.dispatchId ? 'customers' : use.station;
      if (!to || !(use.quantity > 0)) return;
      moves.push({ key: `${lot.id}-use-${i}`, from, to, material: lot.material, quantity: use.quantity, unit: use.dispatchId ? lot.unit : 'kg', via: 'store', fromBatch, toBatch: use.batchId, lotId: lot.id, dispatchId: use.dispatchId, at: use.at });
    });
  }
  return moves.sort((a, b) => a.at.localeCompare(b.at));
}

/** The floor in a period: what moved along each route and what each place holds, made and sent out */
export function floorFlow(state: State, period: FlowPeriod, now = new Date()) {
  const start = periodStart(period, now);
  const inPeriod = (at: string | undefined) => Boolean(at) && (!start || at!.slice(0, 10) >= start);

  const edges = new Map<string, FlowEdge>();
  const edgeFor = (from: FlowNodeId, to: FlowNodeId) => {
    const key = edgeKey(from, to);
    if (!edges.has(key)) edges.set(key, { key, from, to, moves: [], kg: 0, units: 0, materials: [], possible: false });
    return edges.get(key)!;
  };
  for (const [from, to] of possibleRoutes()) edgeFor(from, to).possible = true;
  for (const move of floorMoves(state).filter((m) => inPeriod(m.at))) {
    const edge = edgeFor(move.from, move.to);
    edge.moves.push(move);
    if (move.unit === 'units') edge.units += move.quantity;
    else edge.kg = round2(edge.kg + move.quantity);
    if (!edge.materials.includes(move.material)) edge.materials.push(move.material);
  }

  const node = (id: FlowNodeId): FlowNode => ({ id, ready: [], held: [], records: [], inKg: 0, exits: [], waitingLots: [], madeLots: [], completed: [] });
  const nodes = Object.fromEntries((['deliveries', ...lineStations.map((s) => s.id), 'customers'] as FlowNodeId[]).map((id) => [id, node(id)])) as Record<FlowNodeId, FlowNode>;

  for (const s of lineStations) {
    const n = nodes[s.id];
    const queue = stationQueue(state, s.id);
    n.ready = queue.ready;
    n.held = queue.held;
    for (const batch of state.batches) {
      for (const record of batch.records.filter((r) => r.station === s.id && inPeriod(r.recordedAt))) {
        n.records.push({ batch, record });
        n.inKg = round2(n.inKg + record.inputWeight);
        for (const o of record.outputs) {
          if (o.destination.startsWith('continue:') || !(o.weight > 0)) continue;
          const destination = o.destination as FlowExit['destination'];
          const exit = n.exits.find((e) => e.destination === destination) ?? n.exits[n.exits.push({ destination, kg: 0, names: [] }) - 1];
          exit.kg = round2(exit.kg + o.weight);
          if (!exit.names.includes(o.name)) exit.names.push(o.name);
        }
      }
    }
    n.records.sort((a, b) => b.record.recordedAt.localeCompare(a.record.recordedAt));
  }

  const pieces = nodes.packaging;
  pieces.waitingLots = chocolateWaiting(state);
  pieces.madeLots = state.lots.filter((l) => l.pieces && inPeriod(l.receivedAt)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  pieces.inKg = round2(pieces.inKg + (edges.get(edgeKey('mixing', 'packaging'))?.kg ?? 0));
  nodes.completion.completed = state.batches.filter((b) => b.status === 'completed' && inPeriod(b.completedAt)).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return { edges: [...edges.values()], nodes, start };
}

/** Everything one batch moved on the floor, from its start to the goods that left, and the places it passed */
export function batchFlow(state: Pick<State, 'batches' | 'lots'>, batch: Batch) {
  const moves = floorMoves(state).filter((m) => m.fromBatch === batch.id || m.toBatch === batch.id);
  const places = new Set<FlowNodeId>([...batch.records.map((r) => r.station), ...moves.flatMap((m) => [m.from, m.to])]);
  return { moves, places, edges: new Set(moves.map((m) => edgeKey(m.from, m.to))) };
}
