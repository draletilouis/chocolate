import type { State } from './seed';
import type { Lot } from './types';

/** Grams to kg, kept to the gram so small pieces add up exactly */
export const piecesKg = (count: number, grams: number) => Math.round(count * grams) / 1000;

/** Every lot of pieces, newest first */
export const piecesLots = (state: Pick<State, 'lots'>) => state.lots.filter((l) => l.pieces).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

/** Pieces lots made from one chocolate lot */
export const piecesFrom = (state: Pick<State, 'lots'>, lotId: string) => piecesLots(state).filter((l) => l.pieces!.fromLotId === lotId);

export interface PiecesTotal { type: string; size: string; grams: number; pieces: number; kg: number }

/** Pieces made, added up by chocolate type and size: the factory's end result */
export function piecesByTypeAndSize(lots: Lot[]): PiecesTotal[] {
  const totals = new Map<string, PiecesTotal>();
  for (const lot of lots) {
    if (!lot.pieces) continue;
    const key = `${lot.pieces.type}|${lot.pieces.packSizeId}`;
    const total = totals.get(key) ?? { type: lot.pieces.type, size: lot.pieces.size, grams: lot.pieces.grams, pieces: 0, kg: 0 };
    total.pieces += lot.received;
    total.kg = piecesKg(total.pieces, total.grams);
    totals.set(key, total);
  }
  return Array.from(totals.values()).sort((a, b) => a.type.localeCompare(b.type, undefined, { numeric: true }) || a.grams - b.grams);
}
