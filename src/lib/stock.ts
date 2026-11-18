import { roundKg } from './balance';
import { batchDisplayName, carriedTo, pendingStations } from './derive';
import { batchMaterialAtMixing } from './mixing';
import { routes, type State } from './seed';
import { stationName } from './stations';
import type { StockCount } from './types';

/**
 * The rows of the factory's weekly stock sheet, in its order. Every chocolate type gets a "Machine" row
 * after them, and anything else in store a row under its own name.
 */
export const sheetRows = [
  'Raw beans', 'Roasted beans', 'Nibs', 'Whole roasted peeled beans', 'Liquor', 'Clear butter', 'Brown butter',
  'Unground cocoa powder', 'Fine cocoa powder', 'Milk powder', 'Sugar', 'Lecithin',
] as const;

/** The paper's row for chocolate of one type still in a machine or warmer, not yet made into pieces */
export const machineRow = (type: string) => `Machine ${type}`;

/** The sheet row a material belongs to, whether it is a lot in store or an output waiting at a station */
export function rowOf(material: string): string {
  const m = material.toLowerCase();
  if (/peeled/.test(m)) return 'Whole roasted peeled beans';
  if (/roasted beans/.test(m)) return 'Roasted beans';
  if (/beans/.test(m)) return 'Raw beans';
  if (/nib|particle/.test(m)) return 'Nibs';
  if (/^liquor/.test(m)) return 'Liquor';
  if (/brown butter|sieved butter/.test(m)) return 'Brown butter';
  if (/butter/.test(m)) return 'Clear butter';
  if (/fine cocoa powder/.test(m)) return 'Fine cocoa powder';
  if (/cake|roasted powder|unground/.test(m)) return 'Unground cocoa powder';
  if (/milk powder/.test(m)) return 'Milk powder';
  if (m === 'sugar') return 'Sugar';
  if (/lecithin/.test(m)) return 'Lecithin';
  return material;
}

/** Where part of a row's weight is: a lot in store, material waiting at a station, or the mixer */
export interface StockPart { label: string; kg: number; href: string }
export interface StockRow { row: string; expected: number; parts: StockPart[] }

/**
 * What the records say is in the factory now, row by row as the stock sheet lists it: lots in store,
 * material a batch has waiting at a station (roasted beans before winnowing, cake before crushing),
 * and chocolate in the mixer. Finished pieces are counted on their own list, not here.
 */
export function expectedStock(state: State): StockRow[] {
  const rows = new Map<string, StockPart[]>();
  const add = (row: string, part: StockPart) => { if (part.kg > 0.0005) rows.set(row, [...(rows.get(row) ?? []), { ...part, kg: roundKg(part.kg) }]); };

  for (const lot of state.lots) {
    if (lot.unit !== 'kg' || lot.pieces) continue;
    add(lot.chocolate ? machineRow(lot.chocolate.type) : rowOf(lot.material), { label: `${lot.id} in store`, kg: lot.available, href: `/materials/${lot.id}` });
  }
  if (state.mixer.holds) add(machineRow(state.mixer.holds.type), { label: 'In the mixer', kg: state.mixer.holds.kg, href: '/production/stations/mixing' });

  for (const batch of state.batches) {
    if (batch.status === 'completed') continue;
    const href = `/production/batches/${batch.id}`;
    const at = (station: Parameters<typeof stationName>[0]) => `${batchDisplayName(batch)} at ${stationName(station).toLowerCase()}`;
    const first = routes.find((r) => r.id === batch.route)?.stations[0];
    // A batch started from stored material and not recorded anywhere yet holds its starting weight
    if (batch.records.length === 0 && first && first !== 'mixing') add(rowOf(batch.startInput.material), { label: at(first), kg: batch.startInput.weight, href });
    for (const station of pendingStations(batch)) {
      if (station === 'mixing') {
        for (const m of batchMaterialAtMixing(batch)) add(rowOf(m.name), { label: at(station), kg: m.left, href });
        continue;
      }
      for (const o of carriedTo(batch, station)) add(rowOf(o.name), { label: at(station), kg: o.weight, href });
    }
  }

  const order = [...sheetRows, ...state.recipes.map((r) => machineRow(r.name))];
  const names = [...order, ...[...rows.keys()].filter((r) => !order.includes(r)).sort()];
  return names.map((row) => {
    const parts = rows.get(row) ?? [];
    return { row, expected: roundKg(parts.reduce((t, p) => t + p.kg, 0)), parts };
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The seven days, Monday to Sunday, of the week a day is in */
export function weekOf(day: string): string[] {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return dayOf(x); });
}

export const shiftDay = (day: string, days: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + days); return dayOf(d); };

/**
 * A week of counts laid out like the paper sheet: one line per item, one column per day. Rows come in
 * the sheet's order; a row shows when it is on the paper, or was counted that week.
 */
export function weekSheet(state: State, days: string[]) {
  const counts = days.map((day) => state.stockCounts.find((c) => c.day === day));
  const counted = new Set(counts.flatMap((c) => c?.lines.map((l) => l.row) ?? []));
  const order = [...sheetRows, ...state.recipes.map((r) => machineRow(r.name))];
  const names = [...order, ...[...counted].filter((r) => !order.includes(r)).sort()];
  return {
    counts,
    rows: names.map((row) => ({ row, cells: counts.map((c) => c?.lines.find((l) => l.row === row)) })),
  };
}

/** Lines of a count where what was counted differs from what the records expected */
export const differences = (count: StockCount) => count.lines.map((l) => ({ ...l, difference: roundKg(l.counted - l.expected) })).filter((l) => Math.abs(l.difference) >= 0.001);
