import { roundKg } from './balance';
import { num } from './format';
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

/** Where part of a row is: a lot in store, material waiting at a station, or the mixer. `kg` is pieces for a row of finished products. */
export interface StockPart { label: string; kg: number; href: string }
/** `unit` is 'units' for a finished product, counted in pieces */
export interface StockRow { row: string; expected: number; parts: StockPart[]; unit: 'kg' | 'units' }

/** A quantity of a count row in words: kg to the gram, or whole pieces */
export const amountText = (n: number, unit: 'kg' | 'units' | undefined) => (unit === 'units' ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : `${num(n)} kg`);

/**
 * What the records say is in the factory now, row by row as the stock sheet lists it: lots in store,
 * material a batch has waiting at a station (roasted beans before winnowing, cake before crushing),
 * and chocolate in the mixer. After them come the finished products, one row per chocolate type and size,
 * counted in pieces: every lot of pieces in store, with the batch number it carries.
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
  const weighed: StockRow[] = names.map((row) => {
    const parts = rows.get(row) ?? [];
    return { row, unit: 'kg', expected: roundKg(parts.reduce((t, p) => t + p.kg, 0)), parts };
  });

  // Finished products: every product ever made keeps its row, so pieces found on the shelf that the records no longer show can be counted too
  const pieces = state.lots.filter((l) => l.pieces);
  const products = Array.from(new Set(pieces.map((l) => l.material))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const finished: StockRow[] = products.map((row) => {
    const parts = pieces.filter((l) => l.material === row && l.available > 0).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map((l) => ({ label: `${l.id} · ${l.pieces!.batchNumber ? `batch ${l.pieces!.batchNumber}` : 'no batch number'}`, kg: l.available, href: `/materials/${l.id}` }));
    return { row, unit: 'units', expected: parts.reduce((t, p) => t + p.kg, 0), parts };
  });
  return [...weighed, ...finished];
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
  const lines = counts.flatMap((c) => c?.lines ?? []);
  const inPieces = new Set(lines.filter((l) => l.unit === 'units').map((l) => l.row));
  const counted = new Set(lines.filter((l) => l.unit !== 'units').map((l) => l.row));
  const order = [...sheetRows, ...state.recipes.map((r) => machineRow(r.name))];
  const names = [...order, ...[...counted].filter((r) => !order.includes(r)).sort()];
  const cellsOf = (row: string) => ({ row, cells: counts.map((c) => c?.lines.find((l) => l.row === row)) });
  return {
    counts,
    rows: names.map(cellsOf),
    // Finished products counted that week, in pieces: the sheet's second table
    pieceRows: [...inPieces].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(cellsOf),
  };
}

/** Lines of a count where what was counted differs from what the records expected */
export const differences = (count: StockCount) => count.lines.map((l) => ({ ...l, difference: roundKg(l.counted - l.expected) })).filter((l) => Math.abs(l.difference) >= 0.001);

/** A difference in words: "0.30 kg less", "6 pieces more" */
export const differenceText = (difference: number, unit: 'kg' | 'units' | undefined) => `${amountText(Math.abs(difference), unit)} ${difference < 0 ? 'less' : 'more'}`;
