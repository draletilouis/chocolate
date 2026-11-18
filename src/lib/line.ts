import { batchDisplayName, chocolateWaiting, lotOrigin, nextInput, stationQueue } from './derive';
import { kg } from './format';
import { piecesLots, piecesWithoutBatchNumber } from './pieces';
import type { State } from './seed';
import { lineStations, stationGroups } from './stations';
import type { StationGroup } from './types';

/** One thing waiting at a stage of the line, with the one action that moves it on */
export interface LineItem { key: string; title: string; sub: string; href: string; action: string; hold?: boolean; managers?: boolean }

/**
 * One stage of the line from delivery to dispatch. `also` is a way to start work at the stage that is
 * not a waiting batch (receive a delivery, mix from store).
 */
export interface LineStage {
  id: string;
  name: string;
  group: StationGroup | 'Out of the factory';
  /** What goes in and what comes out, in a few words */
  hint: string;
  items: LineItem[];
  /** What the stage holds in all, e.g. "2 batches · 96.40 kg" */
  total: string;
  also?: { href: string; label: string; managers?: boolean };
  /** Where the whole queue of the stage is */
  href: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sumKg = (weights: number[]) => Math.round(weights.reduce((t, w) => t + w, 0) * 1000) / 1000;

/**
 * The whole line as one list of stages, each with what is waiting there now: batches at the stations,
 * then chocolate to make into pieces, pieces without a batch number, and goods ready to dispatch.
 * Everything a batch goes through, in the order it happens, on one screen.
 */
export function lineStages(state: State): LineStage[] {
  const stages: LineStage[] = [];
  const beans = state.lots.filter((l) => l.unit === 'kg' && l.material === 'Cocoa beans' && l.available > 0).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const receiving = stationQueue(state, 'receiving');
  stages.push({
    id: 'delivery', name: 'Delivery', group: 'Bean processing', hint: 'Beans arrive, are weighed and inspected', href: '/production/stations/receiving',
    also: { href: '/production/new', label: 'Receive a delivery' },
    items: [
      ...receiving.ready.map((b) => ({ key: b.id, title: batchDisplayName(b), sub: `${kg(nextInput(b, 'receiving').weight)} to receive`, href: `/production/batches/${b.id}/record/receiving`, action: 'Record receiving' })),
      ...beans.map((l) => ({ key: l.id, title: `${l.id} in store`, sub: `${kg(l.available)} of beans · ${lotOrigin(state, l)}`, href: `/production/new?lot=${l.id}`, action: 'Start a batch' })),
    ],
    total: beans.length ? `${plural(beans.length, 'lot')} of beans in store · ${kg(sumKg(beans.map((l) => l.available)))}` : '',
  });

  for (const station of lineStations) {
    if (station.id === 'receiving' || station.id === 'completion' || station.form === 'pieces') continue;
    const queue = stationQueue(state, station.id);
    const weights = [...queue.ready, ...queue.held].map((b) => nextInput(b, station.id).weight);
    const items: LineItem[] = [
      ...queue.ready.map((b) => {
        const input = nextInput(b, station.id);
        return { key: b.id, title: batchDisplayName(b), sub: input.weight > 0 ? `${kg(input.weight)} ${input.material.toLowerCase()}` : station.form === 'mixing' ? 'Ingredients from store' : 'Weigh the input to start', href: `/production/batches/${b.id}/record/${station.id}`, action: `Record ${station.name.toLowerCase()}` };
      }),
      ...queue.held.map((b) => ({ key: b.id, title: batchDisplayName(b), sub: `On hold: ${b.holds.find((h) => !h.releasedAt)?.reason ?? ''}`, href: `/production/batches/${b.id}`, action: 'Review hold', hold: true })),
    ];
    // Stored nibs can be pressed later: they start their own batch at pressing
    if (station.id === 'pressing') {
      for (const l of state.lots.filter((x) => x.unit === 'kg' && x.material === 'Nibs for butter' && x.available > 0)) items.push({ key: l.id, title: `${l.id} in store`, sub: `${kg(l.available)} of nibs for butter`, href: `/production/new?lot=${l.id}`, action: 'Press these nibs' });
    }
    stages.push({
      id: station.id, name: station.name, group: station.group, hint: `${station.input} → ${station.output}`, href: `/production/stations/${station.id}`, items,
      total: items.length ? `${plural(queue.ready.length + queue.held.length, 'batch', 'batches')}${sumKg(weights) > 0 ? ` · ${kg(sumKg(weights))}` : ''}` : '',
      also: station.form === 'mixing' ? { href: '/production/new?chocolate=1', label: 'Mix from store' } : undefined,
    });
  }

  const chocolate = chocolateWaiting(state);
  stages.push({
    id: 'pieces', name: 'Pieces', group: 'Finishing', hint: 'Chocolate by type → pieces by size', href: '/production/stations/packaging',
    items: chocolate.map((l) => ({ key: l.id, title: `${l.chocolate!.type} · ${l.id}`, sub: `${kg(l.available)} to make into pieces${l.source.type === 'batch' ? ` · mixed by ${l.source.batchId}` : ''}`, href: `/production/pieces/${l.id}`, action: 'Record pieces' })),
    total: chocolate.length ? `${plural(chocolate.length, 'lot')} of chocolate · ${kg(sumKg(chocolate.map((l) => l.available)))}` : '',
  });

  const unnumbered = piecesWithoutBatchNumber(state);
  stages.push({
    id: 'numbers', name: 'Batch numbers', group: 'Finishing', hint: 'Counted pieces → the batch number they carry', href: '/production/stations/packaging',
    items: unnumbered.map((l) => ({ key: l.id, title: `${l.pieces!.type} · ${l.pieces!.size}`, sub: `${l.received} pieces · ${l.id}`, href: `/materials/${l.id}`, action: 'Add the batch number' })),
    total: unnumbered.length ? plural(unnumbered.length, 'lot') + ' of pieces without a number' : '',
  });

  const completion = stationQueue(state, 'completion');
  stages.push({
    id: 'completion', name: 'Completion', group: 'Finishing', hint: 'Every station recorded → the batch is checked and closed', href: '/production/stations/completion',
    items: completion.ready.map((b) => ({ key: b.id, title: batchDisplayName(b), sub: `${plural(b.records.length, 'station')} recorded`, href: `/production/batches/${b.id}/record/completion`, action: 'Review & complete' })),
    total: completion.ready.length ? plural(completion.ready.length, 'batch', 'batches') + ' ready to close' : '',
  });

  // Numbered pieces still in store, by product: what can leave the factory
  const ready = piecesLots(state).filter((l) => l.available > 0 && l.pieces!.batchNumber);
  const products = Array.from(new Set(ready.map((l) => l.material))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  stages.push({
    id: 'dispatch', name: 'Dispatch', group: 'Out of the factory', hint: 'Finished pieces → customers', href: '/dispatch',
    also: { href: '/dispatch/new', label: 'Dispatch goods', managers: true },
    items: products.map((material) => {
      const lots = ready.filter((l) => l.material === material).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      return { key: material, title: material, sub: `${lots.reduce((n, l) => n + l.available, 0)} pieces in ${plural(lots.length, 'lot')}`, href: `/dispatch/new?lot=${lots[0].id}`, action: 'Dispatch', managers: true };
    }),
    total: ready.length ? `${ready.reduce((n, l) => n + l.available, 0)} pieces ready` : '',
  });

  return stages;
}

/** The parts of the line in order, with the page of each; the last is what leaves the factory */
export const lineGroups = [...stationGroups.map((g) => ({ name: g.name as LineStage['group'], href: `/production/parts/${g.slug}`, note: g.note })), { name: 'Out of the factory' as const, href: '/dispatch', note: 'Finished pieces go to customers on a dispatch note.' }];
