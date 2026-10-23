'use client';

import type { KeyboardEvent } from 'react';
import type { FlowEdge, FlowNode, FlowNodeId } from '@/lib/flow';
import { placeName } from '@/lib/flow';

/** Where each place stands on the map: [column, row]. Butter and powder run above and below the main line. */
const grid: Record<string, [number, number]> = {
  deliveries: [1, 0], receiving: [1, 1], roasting: [2, 1], winnowing: [3, 1],
  pressing: [4, 0], sieving: [5, 0], filtering: [6, 0],
  'powder-roasting': [5, 2], 'powder-crushing': [6, 2],
  grinding: [6, 1], mixing: [7, 1], packaging: [8, 1],
  completion: [7, 2], customers: [8, 2],
};

const COL = 162, ROW = 132, W = 112, H = 84, PAD = 16, TOP = 22;
const BUS = TOP + 2 * ROW + H + 18;
export const mapWidth = PAD * 2 + W + 7 * COL;
const mapHeight = BUS + 18;

interface Box { left: number; right: number; top: number; bottom: number; cx: number; cy: number }
type Pt = [number, number];

function box(id: string): Box | undefined {
  const at = grid[id];
  if (!at) return undefined;
  const left = PAD + (at[0] - 1) * COL;
  const top = TOP + at[1] * ROW;
  return { left, right: left + W, top, bottom: top + H, cx: left + W / 2, cy: top + H / 2 };
}

/**
 * Routes drawn around the stations in their way, each with the leg its label sits on; every other route
 * is a straight line or a curve.
 */
const bends: Record<string, { points: (a: Box, b: Box) => Pt[]; label: number }> = {
  'winnowing>pressing': { points: (a, b) => [[a.cx, a.top], [a.cx, b.cy], [b.left, b.cy]], label: 1 },
  'sieving>grinding': { points: (a, b) => [[a.cx, a.bottom], [a.cx, (a.bottom + b.top) / 2], [b.cx, (a.bottom + b.top) / 2], [b.cx, b.top]], label: 1 },
  'filtering>mixing': { points: (a, b) => [[a.right, a.cy], [b.cx, a.cy], [b.cx, b.top]], label: 1 },
  'pressing>powder-roasting': { points: (a, b) => [[a.cx - 8, a.bottom], [a.cx - 8, b.cy], [b.left, b.cy]], label: 1 },
  'pressing>powder-crushing': { points: (a, b) => [[a.cx + 8, a.bottom], [a.cx + 8, BUS], [b.cx, BUS], [b.cx, b.bottom]], label: 1 },
};

/**
 * Material bought in for a station other than receiving (sugar and milk powder at mixing), and goods
 * dispatched from anywhere but Pieces, would cross the whole map; the station's card shows them instead.
 */
export const offMap = (e: Pick<FlowEdge, 'from' | 'to'>) => (e.from === 'deliveries' && e.to !== 'receiving') || (e.to === 'customers' && e.from !== 'packaging');

/** A polyline with rounded corners, and the middle of a leg (the longest unless given) for the label */
function polyline(points: Pt[], labelLeg?: number) {
  const r = 10;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1], [x, y] = points[i], [nx, ny] = points[i + 1];
    const into = Math.min(r, Math.hypot(x - px, y - py) / 2), out = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * into},${y - uy * into} Q${x},${y} ${x + vx * out},${y + vy * out}`;
  }
  const last = points.at(-1)!;
  d += ` L${last[0]},${last[1]}`;
  let leg = labelLeg ?? 0, longest = -1;
  if (labelLeg === undefined) {
    for (let i = 0; i < points.length - 1; i++) {
      const length = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      if (length > longest) { longest = length; leg = i; }
    }
  }
  const label: Pt = [(points[leg][0] + points[leg + 1][0]) / 2, (points[leg][1] + points[leg + 1][1]) / 2];
  return { d, label };
}

function edgePath(edge: Pick<FlowEdge, 'key' | 'from' | 'to'>) {
  const a = box(edge.from), b = box(edge.to);
  if (!a || !b || edge.from === edge.to || offMap(edge)) return undefined;
  if (bends[edge.key]) return polyline(bends[edge.key].points(a, b), bends[edge.key].label);
  if (a.cx === b.cx) return polyline(a.cy < b.cy ? [[a.cx, a.bottom], [b.cx, b.top]] : [[a.cx, a.top], [b.cx, b.bottom]]);
  if (a.cy === b.cy) return polyline(a.cx < b.cx ? [[a.right, a.cy], [b.left, b.cy]] : [[a.left, a.cy], [b.right, b.cy]]);
  // Anything else (a route the line does not usually take) is drawn as a curve.
  const [sx, ex] = a.cx < b.cx ? [a.right, b.left] : [a.left, b.right];
  const mx = (sx + ex) / 2;
  return { d: `M${sx},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${ex},${b.cy}`, label: [mx, (a.cy + b.cy) / 2] as Pt };
}

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
/** Short amount: kg and pieces */
export const shortAmount = (kg: number, units = 0) => [kg > 0 ? `${whole(kg)} kg` : '', units > 0 ? `${whole(units)} pcs` : ''].filter(Boolean).join(' · ');
/** Shorter still, for a route's label: kg is left out (the legend says so), pieces are marked */
const routeAmount = (kg: number, units = 0) => [kg > 0 ? whole(kg) : '', units > 0 ? `${whole(units)} pcs` : ''].filter(Boolean).join(' · ');

const kgOf = (edges: FlowEdge[]) => edges.reduce((t, e) => t + e.kg, 0);
const unitsOf = (edges: FlowEdge[]) => edges.reduce((t, e) => t + e.units, 0);

/** The short lines under a place's name; the third is what came in or left off the map */
function nodeLines(node: FlowNode, edgesIn: FlowEdge[], edgesOut: FlowEdge[]): [string, string, string] {
  const moves = (edges: FlowEdge[]) => edges.flatMap((e) => e.moves);
  if (node.id === 'deliveries') return [`${new Set(moves(edgesOut).map((m) => m.lotId ?? m.toBatch)).size} deliveries used`, `${shortAmount(kgOf(edgesOut)) || '0 kg'} in`, ''];
  if (node.id === 'customers') {
    const other = kgOf(edgesIn.filter(offMap));
    return [`${new Set(moves(edgesIn).map((m) => m.dispatchId)).size} dispatches`, `${whole(unitsOf(edgesIn))} pieces`, other > 0 ? `+${whole(other)} kg other goods` : ''];
  }
  if (node.id === 'completion') return [`${node.completed.length} closed`, '', ''];
  const bought = kgOf(edgesIn.filter(offMap));
  const sold = edgesOut.filter(offMap);
  const extra = [bought > 0 ? `+${whole(bought)} kg bought` : '', kgOf(sold) > 0 ? `${whole(kgOf(sold))} kg dispatched` : ''].filter(Boolean).join(' · ');
  if (node.id === 'packaging') return [`${whole(node.madeLots.reduce((t, l) => t + l.received, 0))} pieces`, node.inKg > 0 ? `${whole(node.inKg)} kg in` : '—', extra];
  return [`${node.records.length} recorded`, node.inKg > 0 ? `${whole(node.inKg)} kg in` : '—', extra];
}

export interface MapFocus {
  /** The place or route picked */
  selected?: { kind: 'node'; id: FlowNodeId } | { kind: 'edge'; key: string };
  /** A followed batch: the places and routes it passed, and its own amount on each route */
  path?: { places: Set<FlowNodeId>; edges: Map<string, { kg: number; units: number }> };
}

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

/** The production floor: every station, the routes between them sized by what moved, and the work waiting at each */
export function FloorMap({ nodes, edges, focus, onNode, onEdge }: { nodes: Record<FlowNodeId, FlowNode>; edges: FlowEdge[]; focus: MapFocus; onNode: (id: FlowNodeId) => void; onEdge: (key: string) => void }) {
  const max = Math.max(1, ...edges.map((e) => e.kg));
  const drawn = edges.map((e) => ({ edge: e, path: edgePath(e) })).filter((x): x is { edge: FlowEdge; path: NonNullable<ReturnType<typeof edgePath>> } => Boolean(x.path) && (x.edge.possible || x.edge.moves.length > 0));
  // Widest last, so thin routes stay clickable where they meet a wide one
  drawn.sort((x, y) => y.edge.kg - x.edge.kg);
  const path = focus.path;
  const selectedEdge = focus.selected?.kind === 'edge' ? focus.selected.key : undefined;
  const selectedNode = focus.selected?.kind === 'node' ? focus.selected.id : undefined;

  return (
    <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="floor-map" role="group" aria-label="Map of the production floor">
      <defs>
        {(['idle', 'flow', 'focus'] as const).map((tone) => (
          <marker key={tone} id={`floor-arrow-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`floor-arrow is-${tone}`} />
          </marker>
        ))}
      </defs>

      {drawn.map(({ edge, path: p }) => {
        const used = edge.moves.length > 0;
        const own = path?.edges.get(edge.key);
        const focused = selectedEdge === edge.key || Boolean(own);
        const dim = Boolean(path) && !own;
        const width = used ? 1.5 + 7 * Math.sqrt(edge.kg / max) : 1.25;
        const onlyStore = used && edge.moves.every((m) => m.via === 'store');
        const label = own ? routeAmount(own.kg, own.units) : routeAmount(edge.kg, edge.units);
        const name = `${placeName(edge.from)} to ${placeName(edge.to)}`;
        return (
          <g key={edge.key} className={`floor-edge ${dim ? 'is-dim' : ''}`} role="button" tabIndex={used ? 0 : -1} aria-label={`${name}: ${used ? `${shortAmount(edge.kg, edge.units)}, ${edge.moves.length} moves` : 'nothing moved in this period'}`} aria-pressed={selectedEdge === edge.key}
            onClick={() => used && onEdge(edge.key)} onKeyDown={activate(() => used && onEdge(edge.key))}>
            <title>{`${name}${used ? ` · ${edge.materials.join(', ')} · ${shortAmount(edge.kg, edge.units)}` : ' · not used in this period'}`}</title>
            <path d={p.d} className="floor-edge-hit" />
            <path d={p.d} className={`floor-edge-line ${focused ? 'is-focus' : used ? 'is-flow' : 'is-idle'} ${onlyStore ? 'is-store' : ''}`} style={{ strokeWidth: focused ? Math.max(width, 3) : width }} markerEnd={`url(#floor-arrow-${focused ? 'focus' : used ? 'flow' : 'idle'})`} />
            {used && label && (
              <g transform={`translate(${p.label[0]},${p.label[1]})`} className="floor-edge-label">
                <rect x={-label.length * 3.2 - 6} y={-9} width={label.length * 6.4 + 12} height={18} rx={9} className={focused ? 'is-focus' : ''} />
                <text textAnchor="middle" dy="0.35em">{label}</text>
              </g>
            )}
          </g>
        );
      })}

      {(Object.keys(grid) as FlowNodeId[]).map((id) => {
        const b = box(id)!;
        const node = nodes[id];
        if (!node) return null;
        const [line1, line2, line3] = nodeLines(node, edges.filter((e) => e.to === id), edges.filter((e) => e.from === id));
        const waiting = id === 'packaging' ? node.waitingLots.length : node.ready.length;
        const held = node.held.length;
        const terminal = id === 'deliveries' || id === 'customers' || id === 'completion';
        const dim = Boolean(path) && !path!.places.has(id);
        const selected = selectedNode === id;
        return (
          <g key={id} className={`floor-node ${terminal ? 'is-terminal' : ''} ${dim ? 'is-dim' : ''} ${selected ? 'is-selected' : ''} ${path?.places.has(id) ? 'is-path' : ''}`} transform={`translate(${b.left},${b.top})`}
            role="button" tabIndex={0} aria-pressed={selected} aria-label={`${placeName(id)}: ${[line1, line2, line3].filter(Boolean).join(', ')}${waiting ? `, ${waiting} waiting` : ''}${held ? `, ${held} on hold` : ''}`}
            onClick={() => onNode(id)} onKeyDown={activate(() => onNode(id))}>
            <rect width={W} height={H} rx={10} className="floor-node-box" />
            <text x={10} y={21} className="floor-node-name">{placeName(id)}</text>
            <text x={10} y={40} className="floor-node-stat">{line1}</text>
            <text x={10} y={56} className="floor-node-stat">{line2}</text>
            {line3 && <text x={10} y={72} className="floor-node-stat is-extra">{line3}</text>}
            {waiting > 0 && (
              <g transform={`translate(${W - (held ? 46 : 18)},-8)`} className="floor-pill is-waiting"><title>{`${waiting} waiting`}</title><rect width={waiting > 9 ? 30 : 24} height={18} rx={9} x={waiting > 9 ? -6 : 0} /><text x={12} y={13} textAnchor="middle">{waiting}</text></g>
            )}
            {held > 0 && (
              <g transform={`translate(${W - 18},-8)`} className="floor-pill is-held"><title>{`${held} on hold`}</title><rect width={24} height={18} rx={9} /><text x={12} y={13} textAnchor="middle">{held}</text></g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
