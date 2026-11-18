import { percentOf, roundKg } from './balance';
import { batchDisplayName, batchSuppliers, lowStockLimit, nextInput, recordBalance, recordStamp, waitingAt } from './derive';
import { num } from './format';
import { checkRemark, inspectionChecks } from './inspection';
import { allRuns } from './mixing';
import { routes, type State } from './seed';
import { amountText, differenceText, expectedStock } from './stock';
import { stationById, stationName } from './stations';
import type { Batch, RecordEdit, StationId, StationRecord } from './types';

/**
 * Everything in the records that does not add up, in one list: the discrepancy register. Each item is
 * worked out from the state, so nothing has to be raised by hand and nothing is missed because a batch
 * was completed. An item stays open until a manager explains it (state.discrepancyNotes), its own
 * record explains it (a signed report, a manager's correction), or, for things to do, it is dealt with.
 */

export type DiscrepancyKind =
  | 'missing' | 'surplus' | 'waste' | 'unusual' | 'reweigh' | 'recipe' | 'overdrawn' | 'count' | 'adjustment'
  | 'edited' | 'correction' | 'inspection' | 'unsigned' | 'stale' | 'hold' | 'stock';

export const kindLabels: Record<DiscrepancyKind, string> = {
  missing: 'Weight missing', surplus: 'More out than in', waste: 'High waste', unusual: 'Unusual for this station', reweigh: 'Reweighed differently',
  recipe: 'Off the recipe', overdrawn: 'More taken than the lot held', count: 'Stock count differs', adjustment: 'Lot set to the count',
  edited: 'Weights edited', correction: 'Weight corrected', inspection: 'Inspection finding', unsigned: 'Not signed', stale: 'Waiting too long', hold: 'On hold', stock: 'Low stock',
};

export type Severity = 'high' | 'medium' | 'low';
export const severityLabels: Record<Severity, string> = { high: 'Serious', medium: 'Check', low: 'Minor' };

export interface Resolution { note: string; by?: string; at?: string; /** Explained by the record itself, not by a manager's note in the register */ own?: boolean }

export interface Discrepancy {
  id: string;
  kind: DiscrepancyKind;
  severity: Severity;
  title: string;
  detail: string;
  /** The weight at stake, where there is one */
  kg?: number;
  station?: StationId;
  batchId?: string;
  batchName?: string;
  lotId?: string;
  /** Who recorded what the item is about */
  userId?: string;
  supplier?: string;
  at: string;
  href: string;
  /** 'explain': a manager explains it. 'act': it closes by itself once dealt with (a hold released, stock received). */
  closes: 'explain' | 'act';
  /** What the person who saved the weights gave as the reason */
  operatorReason?: string;
  resolution?: Resolution;
}

const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(`${dayOf(to)}T00:00:00Z`) - Date.parse(`${dayOf(from)}T00:00:00Z`)) / DAY);
const pctText = (n: number) => `${n.toFixed(1)}%`;
const kgText = (n: number) => `${num(n)} kg`;

/** Days of history a station's usual range is taken from, and how many records it needs */
export const USUAL_DAYS = 90;
const USUAL_MIN = 5;

function percentile(sorted: number[], share: number) {
  const at = (sorted.length - 1) * share;
  const below = Math.floor(at);
  return sorted[below] + (sorted[Math.min(below + 1, sorted.length - 1)] - sorted[below]) * (at - below);
}

interface Past { key: string; day: string; lossPct: number }

/**
 * What a station usually loses (waste and unweighed weight together, as a share of its input): the
 * middle 80% of its other records in the USUAL_DAYS days up to a record. Undefined with too little history.
 */
function usualFor(history: Past[], key: string, day: string) {
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - USUAL_DAYS * DAY).toISOString().slice(0, 10);
  const shares = history.filter((p) => p.key !== key && p.day >= from && p.day <= day).map((p) => p.lossPct).sort((a, b) => a - b);
  if (shares.length < USUAL_MIN) return undefined;
  return { low: percentile(shares, 0.1), high: percentile(shares, 0.9), records: shares.length };
}

/** The usual loss range of every weighing station today, for the register's "limits from your own history" view */
export function usualRanges(state: State, today: string) {
  return Object.values(stationById).filter((s) => s.form === 'weights' && !s.retired).flatMap((station) => {
    const history = pastOf(state, station.id);
    const usual = usualFor(history, '', today);
    return history.length ? [{ station, records: history.length, usual, limit: state.thresholds.variancePct[station.id] }] : [];
  });
}

const lossPctOf = (record: StationRecord) => { const b = recordBalance(record); return percentOf(b.waste + b.variance, b.input); };
const pastOf = (state: State, station: StationId): Past[] =>
  state.batches.flatMap((b) => b.records.filter((r) => r.station === station && r.destinationsSaved && r.inputWeight > 0).map((r) => ({ key: `${b.id}:${r.id}`, day: dayOf(r.recordedAt), lossPct: lossPctOf(r) })));

/** The outputs an edit changed, as "name old → new" */
function changesOf(before: RecordEdit, after: { inputWeight: number; outputs: { name: string; weight: number }[] }) {
  const names = Array.from(new Set([...before.outputs.map((o) => o.name), ...after.outputs.map((o) => o.name)]));
  const rows = [{ name: 'Input', was: before.inputWeight, now: after.inputWeight }, ...names.map((name) => ({ name, was: before.outputs.find((o) => o.name === name)?.weight ?? 0, now: after.outputs.find((o) => o.name === name)?.weight ?? 0 }))].filter((r) => r.was !== r.now);
  return { text: rows.map((r) => `${r.name} ${num(r.was)} → ${num(r.now)} kg`).join(' · '), kg: roundKg(rows.reduce((t, r) => t + Math.abs(r.now - r.was), 0)) };
}

let cache: { key: unknown[]; today: string; items: Discrepancy[] } | undefined;

/** Every discrepancy in the records, open ones first, the most serious and newest at the top */
export function findDiscrepancies(state: State, today: string): Discrepancy[] {
  // The same state gives the same list; screens ask several times per render
  const key = [state.batches, state.lots, state.stockCounts, state.discrepancyNotes, state.thresholds, state.users, state.mixer];
  if (cache && cache.today === today && cache.key.every((k, i) => k === key[i])) return cache.items;

  const items: Discrepancy[] = [];
  const isManager = (userId: string) => state.users.find((u) => u.id === userId)?.access === 'manager';
  const histories = new Map<StationId, Past[]>();
  const historyOf = (station: StationId) => { if (!histories.has(station)) histories.set(station, pastOf(state, station)); return histories.get(station)!; };

  for (const batch of state.batches) {
    const name = batchDisplayName(batch);
    const href = `/production/batches/${batch.id}`;
    const supplier = batchSuppliers(state, batch)[0];
    const about = { batchId: batch.id, batchName: name, supplier, href };
    const first = routes.find((r) => r.id === batch.route)?.stations[0];

    for (const record of batch.records) {
      const station = stationById[record.station];
      if (!station || (station.form !== 'weights' && station.form !== 'mixing')) continue;
      const balance = recordBalance(record);
      if (!(balance.input > 0)) continue;
      const limit = state.thresholds.variancePct[record.station] ?? 0;
      const stamp = recordStamp(batch, record.station);
      const base = { ...about, station: record.station, userId: record.recordedBy, at: record.recordedAt, closes: 'explain' as const, operatorReason: record.varianceReason };
      const where = `${station.name} on ${name}`;
      const usual = station.form === 'weights' && record.destinationsSaved ? usualFor(historyOf(record.station), `${batch.id}:${record.id}`, dayOf(record.recordedAt)) : undefined;
      const usualText = usual ? ` This station usually loses ${pctText(usual.low)} to ${pctText(usual.high)} in all.` : '';
      const lossName = station.lossLabel ? station.lossLabel.toLowerCase() : 'missing';
      let flagged = false;

      // Weight that no output explains, above the station's limit
      if (balance.variancePct > limit) {
        flagged = true;
        items.push({ ...base, id: `missing:${batch.id}:${stamp}`, kind: 'missing', severity: balance.variancePct > limit * 2 || balance.variance >= 2 ? 'high' : 'medium', kg: balance.variance,
          title: `${where}: ${kgText(balance.variance)} ${station.lossLabel ? 'lost' : 'missing'}`, detail: `${pctText(balance.variancePct)} of the ${kgText(balance.input)} that went in${station.lossLabel ? ` (${lossName})` : ''}, above the ${limit}% limit.${usualText}` });
      }
      // More weighed out than went in: a scale, a tare or a typing mistake, whatever the limit says
      if (balance.variance < -0.02) {
        flagged = true;
        const over = Math.abs(balance.variancePct) > limit;
        items.push({ ...base, id: `surplus:${batch.id}:${stamp}`, kind: 'surplus', severity: over ? 'medium' : 'low', kg: -balance.variance,
          title: `${where}: ${kgText(-balance.variance)} more came out than went in`, detail: `${kgText(balance.measured)} was weighed out of ${kgText(balance.input)} (${pctText(Math.abs(balance.variancePct))} over${over ? `, above the ${limit}% limit` : ''}). Check the scale and the input weight.` });
      }
      if (station.form === 'weights' && record.destinationsSaved) {
        const loss = lossPctOf(record);
        if (usual) {
          // Against the factory's own history, in both directions; a margin keeps ordinary batches out
          const margin = Math.max(1, (usual.high - usual.low) / 2);
          const lostKg = roundKg(balance.waste + balance.variance);
          if (!flagged && loss > usual.high + margin) {
            items.push({ ...base, id: `unusual:${batch.id}:${stamp}`, kind: 'unusual', severity: loss > usual.high + margin * 3 ? 'medium' : 'low', kg: roundKg(((loss - usual.high) / 100) * balance.input),
              title: `${where} lost ${pctText(loss)}, more than usual`, detail: `${kgText(lostKg)} of waste and unweighed weight from ${kgText(balance.input)}. Over the last ${USUAL_DAYS} days this station lost ${pctText(usual.low)} to ${pctText(usual.high)} (${usual.records} records).` });
          } else if (!flagged && loss < usual.low - margin) {
            items.push({ ...base, id: `unusual:${batch.id}:${stamp}`, kind: 'unusual', severity: 'low', kg: roundKg(((usual.low - loss) / 100) * balance.input),
              title: `${where} lost only ${pctText(loss)}, less than usual`, detail: `Over the last ${USUAL_DAYS} days this station lost ${pctText(usual.low)} to ${pctText(usual.high)} (${usual.records} records). A weight may be wrong, or something was not weighed.` });
          }
        } else if (record.station !== 'winnowing' && balance.wastePct > state.thresholds.wastePct) {
          // Without history the general waste limit applies; husks are what winnowing is for, so it is left out
          items.push({ ...base, id: `waste:${batch.id}:${stamp}`, kind: 'waste', severity: 'medium', kg: balance.waste,
            title: `${where}: waste is ${pctText(balance.wastePct)} of the input`, detail: `${kgText(balance.waste)} of waste from ${kgText(balance.input)}, above the ${state.thresholds.wastePct}% limit.` });
        }

        // What the station weighed in against what the stations before sent it
        const sent = roundKg(batch.records.filter((r) => r !== record && r.destinationsSaved).flatMap((r) => r.outputs).filter((o) => o.destination === `continue:${record.station}`).reduce((t, o) => t + o.weight, 0));
        const diff = roundKg(record.inputWeight - sent);
        if (sent > 0 && record.station !== first && Math.abs(diff) >= Math.max(0.05, sent * 0.003)) {
          items.push({ ...base, operatorReason: undefined, id: `reweigh:${batch.id}:${stamp}`, kind: 'reweigh', severity: Math.abs(diff) >= Math.max(0.5, sent * 0.02) ? 'medium' : 'low', kg: Math.abs(diff),
            title: `${where}: weighed in ${kgText(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than was sent`, detail: `${kgText(sent)} was sent to ${station.name.toLowerCase()}, and ${kgText(record.inputWeight)} was weighed in there.` });
        }
      }

      // Saved weights changed afterwards with "Edit weights": what they were is kept, and a manager looks at it
      (record.edits ?? []).forEach((edit, i) => {
        const after = record.edits![i + 1] ?? record;
        const change = changesOf(edit, after);
        if (!change.text) return;
        const byManager = isManager(edit.by);
        items.push({ ...about, station: record.station, userId: edit.by, at: edit.at, closes: 'explain', id: `edited:${batch.id}:${record.station}:${edit.at}`, kind: 'edited', severity: change.kg >= 1 ? 'medium' : 'low', kg: change.kg,
          title: `${where}: saved weights were changed`, detail: change.text, operatorReason: byManager ? undefined : edit.reason,
          resolution: byManager ? { note: edit.reason, by: edit.by, at: edit.at, own: true } : undefined });
      });
    }

    for (const c of batch.corrections) {
      const byManager = isManager(c.correctedBy);
      items.push({ ...about, station: c.station, userId: c.correctedBy, at: c.correctedAt, closes: 'explain', id: `correction:${batch.id}:${c.id}`, kind: 'correction', severity: 'low', kg: roundKg(Math.abs(c.corrected - c.previous)),
        title: `${stationName(c.station)} on ${name}: ${c.output} corrected`, detail: `${num(c.previous)} → ${num(c.corrected)} kg.`, operatorReason: byManager ? undefined : c.reason,
        resolution: byManager ? { note: c.reason, by: c.correctedBy, at: c.correctedAt, own: true } : undefined });
    }

    // Receiving inspection: a finding stays open until a manager signs the report
    const inspection = batch.inspection;
    if (inspection) {
      const problems = inspection.checks.filter((c) => !c.ok);
      const signed = batch.approvals?.inspection;
      if (problems.length > 0 || inspection.decision !== 'accepted') {
        const found = problems.map((c) => `${inspectionChecks.find((d) => d.id === c.id)?.label ?? c.id}: ${checkRemark(c, c.id)}`);
        const decided = inspection.decision === 'rejected' ? `Rejected: ${inspection.reason ?? ''}` : inspection.decision === 'conditional' ? `Accepted on a condition: ${inspection.reason ?? ''}` : '';
        items.push({ ...about, href: `${href}/inspection`, station: 'receiving', userId: inspection.inspectedBy, at: inspection.inspectedAt, closes: 'explain', id: `inspection:${batch.id}`, kind: 'inspection', severity: inspection.decision === 'rejected' || problems.length > 1 ? 'high' : 'medium', kg: batch.startInput.weight,
          title: `Delivery ${name}: ${inspection.decision === 'accepted' ? `${problems.length} inspection finding${problems.length === 1 ? '' : 's'}` : inspection.decision === 'rejected' ? 'rejected at inspection' : 'accepted on a condition'}`,
          detail: [decided, ...found].filter(Boolean).join(' · '), resolution: signed ? { note: 'The receiving report is signed.', by: signed.by, at: signed.at, own: true } : undefined });
      }
      if (!signed && daysBetween(inspection.inspectedAt, today) > 2) {
        items.push({ ...about, href: `${href}/inspection`, at: inspection.inspectedAt, closes: 'act', id: `unsigned:inspection:${batch.id}`, kind: 'unsigned', severity: 'low', title: `Receiving report of ${name} is not signed`, detail: `Inspected ${daysBetween(inspection.inspectedAt, today)} days ago. It waits for the production manager.` });
      }
      if (batch.status === 'completed' && !batch.approvals?.summary) {
        items.push({ ...about, href: `${href}/summary`, at: batch.completedAt ?? batch.startedAt, closes: 'act', id: `unsigned:summary:${batch.id}`, kind: 'unsigned', severity: 'low', title: `Bean summary of ${name} is not signed`, detail: 'The batch is completed. Its summary waits for the production manager.' });
      }
    }

    const hold = batch.holds.find((h) => !h.releasedAt);
    if (batch.status === 'hold' && hold) {
      items.push({ ...about, station: hold.station ?? undefined, userId: hold.placedBy, at: hold.placedAt, closes: 'act', id: `hold:${batch.id}:${hold.id}`, kind: 'hold', severity: 'high', title: `${name} is on hold`, detail: hold.reason });
    }

    // Material that has sat at a station longer than the factory allows
    if (batch.status === 'active') {
      const last = batch.records.reduce((latest, r) => (r.recordedAt > latest ? r.recordedAt : latest), batch.records.length ? '' : batch.startedAt);
      const days = daysBetween(last, today);
      const limitDays = state.thresholds.staleDays ?? 7;
      const waiting = waitingAt(batch);
      if (days > limitDays && waiting.length > 0) {
        const stations = waiting.filter((s) => s !== 'completion');
        const kg = roundKg(stations.reduce((t, s) => t + (s === 'mixing' ? 0 : nextInput(batch, s).weight), 0));
        items.push({ ...about, station: stations[0], at: last, closes: 'act', id: `stale:${batch.id}`, kind: 'stale', severity: days > limitDays * 3 ? 'medium' : 'low', kg: kg || undefined,
          title: stations.length ? `${name} has waited ${days} days at ${stations.map((s) => stationName(s).toLowerCase()).join(' and ')}` : `${name} has been ready to complete for ${days} days`,
          detail: `${kg > 0 ? `${kgText(kg)} is waiting there. ` : ''}Nothing was recorded for this batch since ${dayOf(last)}; the limit is ${limitDays} days.` });
      }
    }
  }

  // Mixing: what was weighed in against what the recipe called for on top of what the mixer held
  for (const { batch, run, index } of allRuns(state)) {
    const off = run.ingredients.map((i) => ({ ...i, diff: roundKg(i.actual - i.expected) })).filter((i) => Math.abs(i.diff) >= Math.max(0.05, i.expected * 0.02));
    if (off.length === 0) continue;
    const kg = roundKg(off.reduce((t, i) => t + Math.abs(i.diff), 0));
    const worst = Math.max(...off.map((i) => (i.expected > 0 ? Math.abs(i.diff) / i.expected : 1)));
    items.push({ id: `recipe:${run.id}`, kind: 'recipe', severity: worst > 0.05 ? 'medium' : 'low', kg, station: 'mixing', batchId: batch.id, batchName: batchDisplayName(batch), userId: run.recordedBy, at: run.recordedAt, closes: 'explain', href: `/recipes/${run.recipeId}`, lotId: run.lotId,
      title: `${run.type}, run ${index + 1} of ${batchDisplayName(batch)}: not weighed in to the recipe`, detail: off.map((i) => `${i.name} ${num(i.actual)} kg against ${num(i.expected)} kg (${i.diff > 0 ? '+' : '−'}${num(Math.abs(i.diff))})`).join(' · ') });
  }

  for (const lot of state.lots) {
    for (const use of lot.uses) {
      if (use.short && use.short > 0.005) {
        items.push({ id: `overdrawn:${lot.id}:${use.at}:${use.batchId ?? ''}:${use.runId ?? ''}`, kind: 'overdrawn', severity: use.short >= 1 ? 'high' : 'medium', kg: use.short, lotId: lot.id, batchId: use.batchId, station: use.station, at: use.at, closes: 'explain', href: `/materials/${lot.id}`,
          title: `${lot.id} (${lot.material}): ${kgText(use.short)} more was taken than the lot held`, detail: `${use.batchId ? `${use.batchId} took` : 'A use took'} ${kgText(use.quantity)}${use.station ? ` at ${stationName(use.station).toLowerCase()}` : ''}. The lot went to zero, and ${kgText(use.short)} has no recorded source.` });
      }
      if (use.adjustment) {
        const less = use.quantity > 0;
        items.push({ id: `adjustment:${lot.id}:${use.at}`, kind: 'adjustment', severity: 'low', kg: Math.abs(use.quantity), lotId: lot.id, userId: use.adjustment.by, at: use.at, closes: 'explain', href: `/materials/${lot.id}`,
          title: `${lot.id} (${lot.material}) was set to the count: ${lot.unit === 'kg' ? kgText(Math.abs(use.quantity)) : `${Math.abs(use.quantity)} pieces`} ${less ? 'less' : 'more'} than the records`, detail: 'The lot was changed to what was counted in store.',
          resolution: { note: use.adjustment.reason, by: use.adjustment.by, at: use.at, own: true } });
      }
    }
  }

  // Stock counts: the latest count of each row, where it differed from the records
  const expected = new Map(expectedStock(state).map((r) => [r.row, r.expected]));
  const seenRows = new Set<string>();
  for (const count of [...state.stockCounts].sort((a, b) => b.day.localeCompare(a.day))) {
    for (const line of count.lines) {
      if (seenRows.has(line.row)) continue;
      seenRows.add(line.row);
      const diff = roundKg(line.counted - line.expected);
      // Finished products are counted in pieces: a single piece out is a difference
      const pieces = line.unit === 'units';
      if (Math.abs(diff) < (pieces ? 1 : Math.max(0.05, line.expected * 0.01))) continue;
      const now = expected.get(line.row) ?? 0;
      const matchesNow = Math.abs(now - line.counted) < (pieces ? 1 : Math.max(0.05, line.counted * 0.01));
      const serious = pieces ? Math.abs(diff) >= Math.max(5, line.expected * 0.05) : Math.abs(diff) >= Math.max(1, line.expected * 0.05);
      items.push({ id: `count:${count.day}:${line.row}`, kind: 'count', severity: serious ? 'medium' : 'low', kg: pieces ? undefined : Math.abs(diff), userId: count.countedBy, at: count.countedAt, closes: 'explain', href: '/store/count',
        title: `${line.row}: counted ${differenceText(diff, line.unit)} than the records`, detail: `Counted ${amountText(line.counted, line.unit)} on ${count.day}; the records expected ${amountText(line.expected, line.unit)}.`,
        resolution: matchesNow ? { note: `The records now show ${amountText(now, line.unit)}, which matches the count.`, own: true } : undefined });
    }
  }

  // Low stock, as the Store adds each raw material up
  const materials = Array.from(new Set(state.lots.filter((l) => l.category === 'Raw material' && l.unit === 'kg').map((l) => l.material)));
  for (const material of materials) {
    const total = roundKg(state.lots.filter((l) => l.material === material && l.unit === 'kg').reduce((sum, l) => sum + l.available, 0));
    const limit = lowStockLimit(state, material);
    if (total < limit) items.push({ id: `stock:${material}`, kind: 'stock', severity: 'low', at: `${today}T00:00:00`, closes: 'act', href: '/store', title: `${material} is low`, detail: `${kgText(total)} in store, below the ${limit} kg warning.` });
  }

  const notes = new Map(state.discrepancyNotes.map((n) => [n.id, n]));
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const done = items.map((d) => {
    const note = notes.get(d.id);
    return d.resolution || !note ? d : { ...d, resolution: { note: note.note, by: note.by, at: note.at } };
  }).sort((a, b) => Number(Boolean(a.resolution)) - Number(Boolean(b.resolution)) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
  cache = { key, today, items: done };
  return done;
}

export const openDiscrepancies = (state: State, today: string) => findDiscrepancies(state, today).filter((d) => !d.resolution);

export interface Pattern { name: string; open: number; explained: number; kg: number }

/** Discrepancies added up by one of their properties, the heaviest first: where the weight keeps going wrong */
export function patternBy(items: Discrepancy[], of: (d: Discrepancy) => string | undefined): Pattern[] {
  const groups = new Map<string, Pattern>();
  for (const d of items) {
    const name = of(d);
    if (!name) continue;
    const g = groups.get(name) ?? { name, open: 0, explained: 0, kg: 0 };
    if (d.resolution) g.explained += 1; else g.open += 1;
    g.kg = roundKg(g.kg + (d.kg ?? 0));
    groups.set(name, g);
  }
  return [...groups.values()].sort((a, b) => b.open + b.explained - (a.open + a.explained) || b.kg - a.kg);
}

/** Weighing discrepancies only: what the patterns are worked out from (not holds, stock or signatures) */
export const isWeighing = (d: Discrepancy) => ['missing', 'surplus', 'waste', 'unusual', 'reweigh', 'recipe', 'overdrawn', 'count', 'edited', 'correction'].includes(d.kind);

/** The open items as a short text for a message: the manager's daily digest */
export function digestText(state: State, today: string, business: string) {
  const open = openDiscrepancies(state, today);
  if (open.length === 0) return `${business} · ${today}\nNo open discrepancies.`;
  const count = (s: Severity) => open.filter((d) => d.severity === s).length;
  const lines = open.filter((d) => d.severity !== 'low').slice(0, 12).map((d) => `- ${d.title}`);
  const rest = open.length - lines.length;
  return [`${business} · ${today}`, `${open.length} open discrepanc${open.length === 1 ? 'y' : 'ies'}: ${count('high')} serious, ${count('medium')} to check, ${count('low')} minor.`, ...lines, ...(rest > 0 ? [`and ${rest} more.`] : [])].join('\n');
}
