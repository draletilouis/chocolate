import { round2 } from '@/lib/balance';
import { commandSchema, type Command } from '@/lib/commands';
import { chocolateWaiting, nextInput, suggestBatchName, waitingAt } from '@/lib/derive';
import { takeOldestFirst } from '@/lib/dispatch';
import { batchMaterialAtMixing, changeover, ingredientsOf, mixerStamp, versionOf } from '@/lib/mixing';
import { seedState, type State } from '@/lib/seed';
import { stationById } from '@/lib/stations';
import type { ContainerUse, Destination, OutputKind, StationId } from '@/lib/types';
import { applyCommand } from './reduce';

/**
 * The demo factory: six weeks of production up to `today` (the factory's date, YYYY-MM-DD), made by running
 * the same commands people run in the app, so every lot, every use and every balance adds up.
 *
 * Deliveries of every material from the suppliers; bean batches through every station, some making their
 * own chocolate and some storing their liquor and butter; stored nibs pressed later; chocolate of all eight
 * types made from store, one run on top of another; pieces of every size; a hold, corrections and a
 * production plan; and orders dispatched to six customers, one of them cancelled and sent again. It ends with work waiting at every station, one batch on hold, chocolate waiting for
 * pieces and the mixer holding 10 kg of 85% Dark.
 *
 * browser-check.cjs and interaction-audit.cjs build on that end: the 90.40 kg of Kuapa beans waiting at
 * winnowing, the 85% Dark in the mixer (the changeover sheet's example) and the store batch waiting at mixing.
 */
export function demoState(today: string): State {
  const f = new Factory(today);

  // Week 1: the period's first deliveries and bean batches
  f.at(30, '07:00');
  const kuapa1 = f.deliver('Cocoa beans', 'S-KUAPA', 600);
  f.deliver('Sugar', 'S-MZANSI', 500);
  f.deliver('Cocoa butter', 'S-GOLDEN', 100);
  f.deliver('Milk powder', 'S-GOLDEN', 100);
  f.deliver('Lecithin', 'S-GOLDEN', 50);
  f.at(30, '08:30');
  const cb1 = f.startBeans({ lot: kuapa1 }, 150, { forSale: true });

  f.at(29, '07:30');
  f.finishBeans(cb1, { liquor: 'stock', butter: 'stock' });
  f.at(29, '08:00');
  const cb2 = f.startBeans({ lot: kuapa1 }, 150);

  f.at(28, '07:30');
  f.finishBeans(cb2, { liquor: 'mixing', butter: 'mixing' });
  f.at(28, '13:00');
  f.mix(cb2, 'R-70', 100);
  f.mix(cb2, 'R-85', 30);
  f.finishMixing(cb2);
  f.at(28, '08:00');
  const cb3 = f.startBeans({ lot: kuapa1 }, 150, { nibs: 'stock' });

  f.at(27, '07:30');
  f.finishBeans(cb3, { liquor: 'stock', butter: 'stock' });
  f.at(27, '09:00');
  f.makePieces();

  f.at(26, '08:00');
  const cb4 = f.startBeans({ lot: kuapa1 }, 150, { forSale: true });
  f.at(26, '16:00');
  f.ship('C-SHOP');

  // Week 2
  f.at(25, '07:00');
  const bundibugyo1 = f.deliver('Cocoa beans', 'S-BUNDIBUGYO', 450);
  f.deliver('Cocoa butter', 'S-EQUATOR', 100);
  f.at(25, '07:30');
  f.finishBeans(cb4, { liquor: 'stock', butter: 'stock', cake: 'continue:powder-crushing' });
  f.at(25, '13:00');
  const ch1 = f.chocolateBatch();
  f.mix(ch1, 'R-MILK', 100);
  f.mix(ch1, 'R-MILK50', 60);
  f.finishMixing(ch1);

  f.at(24, '09:00');
  f.makePieces();
  f.at(24, '08:00');
  const cb5 = f.receive({ lot: bundibugyo1 }, 150);
  f.sort(cb5);
  f.hold(cb5, 'Beans smell smoky. Cut test before roasting.');
  f.release(cb5, 'Cut test passed: well fermented, no mould. Roast as normal.');
  f.roast(cb5);
  f.winnow(cb5);
  f.at(24, '16:00');
  f.ship('C-FRESHMART');

  f.at(23, '07:30');
  f.finishBeans(cb5, { liquor: 'mixing', butter: 'mixing' });
  f.correct(cb5, 'winnowing', 'Husks', -0.6, 'Weighed with the lid on the husk bin (0.60 kg).');
  f.at(23, '13:00');
  f.mix(cb5, 'R-54', 100);
  f.mix(cb5, 'R-56', 50);
  f.finishMixing(cb5);

  f.at(22, '07:00');
  f.deliver('Sugar', 'S-LAKESIDE', 500);
  f.deliver('Milk powder', 'S-RWENZORI', 150);
  f.at(22, '09:00');
  f.makePieces();
  f.at(22, '08:00');
  const cb6 = f.startBeans({ lot: bundibugyo1 }, 150, { nibs: 'stock' });
  f.at(22, '16:00');
  f.ship('C-LAKEVIEW');

  f.at(21, '07:30');
  f.finishBeans(cb6, { liquor: 'stock', butter: 'stock' });
  f.at(21, '10:00');
  f.storedNibs(f.nibLots(cb3), 'continue:powder-roasting');
  f.at(21, '16:00');
  f.ship('C-CAPITAL');

  // Week 3
  f.at(20, '13:00');
  const ch2 = f.chocolateBatch();
  f.mix(ch2, 'R-70', 120);
  f.mix(ch2, 'R-100', 40, 0);
  f.finishMixing(ch2);
  f.at(20, '08:00');
  const cb7 = f.startBeans({ lot: bundibugyo1 }, 150);

  f.at(19, '09:00');
  f.makePieces();
  f.at(19, '07:30');
  f.finishBeans(cb7, { liquor: 'mixing', butter: 'mixing' });
  f.at(19, '13:00');
  f.mix(cb7, 'R-WHITE', 80);
  f.mix(cb7, 'R-MILK', 100);
  f.finishMixing(cb7);
  f.at(19, '16:00');
  f.ship('C-SHOP');

  f.at(18, '09:00');
  f.makePieces();
  f.at(18, '08:00');
  const cb8 = f.startBeans({ supplier: 'S-KUAPA' }, 120);
  f.at(18, '16:00');
  f.ship('C-SKYLINE');

  f.at(17, '07:30');
  f.finishBeans(cb8, { liquor: 'stock', butter: 'stock' });
  f.at(17, '13:00');
  const ch3 = f.chocolateBatch();
  f.mix(ch3, 'R-MILK', 120);
  f.mix(ch3, 'R-85', 80);
  f.finishMixing(ch3);
  f.at(17, '16:00');
  f.ship('C-FRESHMART');

  f.at(16, '07:00');
  const semuliki1 = f.deliver('Cocoa beans', 'S-SEMULIKI', 500);
  f.at(16, '09:00');
  f.makePieces();
  f.at(16, '08:00');
  const cb9 = f.startBeans({ lot: semuliki1 }, 160, { forSale: true });

  f.at(15, '07:30');
  f.finishBeans(cb9, { liquor: 'mixing', butter: 'mixing', cake: 'continue:powder-crushing' });
  f.at(15, '13:00');
  f.mix(cb9, 'R-70', 100);
  f.mix(cb9, 'R-56', 40);
  f.finishMixing(cb9);
  f.at(15, '16:00');
  f.ship('C-LAKEVIEW');

  // Week 4: the manager sets the plan for the rest of the month
  f.at(14, '09:00');
  f.makePieces();
  f.at(14, '08:00');
  const cb10 = f.startBeans({ lot: semuliki1 }, 160, { nibs: 'stock' });
  f.at(14, '16:00');
  f.ship('C-GOLDENCRUST');

  f.at(13, '07:00');
  f.deliver('Cocoa butter', 'S-GOLDEN', 100);
  f.at(13, '07:30');
  f.finishBeans(cb10, { liquor: 'stock', butter: 'stock' });
  f.correct(cb10, 'grinding', 'Liquor', -0.3, 'The scale was not zeroed before weighing: 0.30 kg less.');
  f.at(13, '16:00');
  f.ship('C-CAPITAL');

  f.at(12, '07:00');
  f.plan('Orders for the next four weeks, with the hotel and supermarket orders.', [
    ['R-70', 'PK-45', 3000], ['R-70', 'PK-80', 800], ['R-85', 'PK-45', 1200], ['R-MILK', 'PK-45', 3500], ['R-MILK', 'PK-7', 10000],
    ['R-MILK50', 'PK-80', 600], ['R-54', 'PK-80', 800], ['R-WHITE', 'PK-45', 1000], ['R-100', 'PK-200', 150],
  ]);
  f.at(12, '13:00');
  const ch4 = f.chocolateBatch();
  f.mix(ch4, 'R-54', 80, 0);
  f.mix(ch4, 'R-WHITE', 60);
  f.mix(ch4, 'R-MILK', 100);
  f.finishMixing(ch4);
  f.at(12, '08:00');
  const cb11 = f.startBeans({ lot: semuliki1 }, 180);

  f.at(11, '09:00');
  f.makePieces();
  f.at(11, '07:30');
  f.finishBeans(cb11, { liquor: 'mixing', butter: 'mixing' });
  f.at(11, '13:00');
  f.mix(cb11, 'R-MILK50', 80, 0);
  f.mix(cb11, 'R-70', 100);
  f.finishMixing(cb11);
  f.at(11, '16:00');
  f.ship('C-SHOP');

  f.at(10, '07:00');
  const bundibugyo2 = f.deliver('Cocoa beans', 'S-BUNDIBUGYO', 450);
  f.deliver('Sugar', 'S-MZANSI', 500);
  f.deliver('Liquor', 'S-EQUATOR', 60);
  f.at(10, '09:00');
  f.makePieces();
  f.at(10, '08:00');
  const cb12 = f.startBeans({ lot: bundibugyo2 }, 150, { nibs: 'stock' });
  f.at(10, '16:00');
  f.ship('C-FRESHMART');

  f.at(9, '07:30');
  f.finishBeans(cb12, { liquor: 'stock', butter: 'stock' });
  f.at(9, '10:00');
  f.storedNibs([...f.nibLots(cb6), ...f.nibLots(cb10)], 'continue:powder-crushing');
  f.at(9, '16:00');
  // Skyline's order was entered for Capital Foods by mistake, taken back, and entered again.
  f.cancelDispatch(f.ship('C-CAPITAL', orders['C-SKYLINE'])!, 'Entered for the wrong customer: this order went to Skyline Duty Free.');
  f.ship('C-SKYLINE');

  // Week 5
  f.at(8, '13:00');
  const ch5 = f.chocolateBatch();
  f.mix(ch5, 'R-85', 60);
  f.mix(ch5, 'R-100', 50, 0);
  f.finishMixing(ch5);
  f.at(8, '08:00');
  const cb13 = f.startBeans({ lot: bundibugyo2 }, 150);
  f.at(8, '16:00');
  f.ship('C-LAKEVIEW');

  f.at(7, '07:00');
  f.deliver('Lecithin', 'S-NILE', 25);
  f.at(7, '09:00');
  f.makePieces();
  f.at(7, '07:30');
  f.finishBeans(cb13, { liquor: 'mixing', butter: 'mixing' });
  f.at(7, '13:00');
  f.mix(cb13, 'R-56', 100);
  f.mix(cb13, 'R-70', 60);
  f.finishMixing(cb13);
  f.at(7, '16:00');
  f.ship('C-GOLDENCRUST');

  f.at(6, '09:00');
  f.makePieces();
  f.at(6, '08:00');
  const cb14 = f.startBeans({ supplier: 'S-SEMULIKI' }, 100, { forSale: true });
  f.at(6, '16:00');
  f.ship('C-CAPITAL');

  f.at(5, '07:00');
  const kuapa2 = f.deliver('Cocoa beans', 'S-KUAPA', 600);
  f.deliver('Cocoa butter', 'S-EQUATOR', 100);
  f.at(5, '07:30');
  f.finishBeans(cb14, { liquor: 'stock', butter: 'stock' });
  f.at(5, '16:00');
  f.ship('C-FRESHMART');

  f.at(4, '13:00');
  const ch6 = f.chocolateBatch();
  f.mix(ch6, 'R-MILK', 100);
  f.mix(ch6, 'R-MILK50', 60, 0);
  f.mix(ch6, 'R-54', 80);
  f.finishMixing(ch6);
  f.at(4, '08:00');
  const waitingAtMixing = f.startBeans({ lot: kuapa2 }, 150);
  const waitingToComplete = f.startBeans({ lot: kuapa2 }, 150, { forSale: true });
  f.at(4, '16:00');
  f.ship('C-SHOP');

  // This week: batches still on the line
  f.at(3, '07:00');
  const semuliki2 = f.deliver('Cocoa beans', 'S-SEMULIKI', 500);
  f.at(3, '09:00');
  f.makePieces();
  f.at(3, '07:30');
  f.finishBeans(waitingAtMixing, { liquor: 'mixing', butter: 'mixing' });
  f.finishBeans(waitingToComplete, { liquor: 'stock', butter: 'stock' }, false);
  f.at(3, '16:00');
  f.ship('C-LAKEVIEW');

  f.at(2, '08:00');
  const atSieving = f.startBeans({ lot: bundibugyo2 }, 150, { winnowingLoss: [0.024, 0.026] });
  const atFiltering = f.startBeans({ lot: kuapa2 }, 150);
  f.at(2, '14:30');
  f.press(atFiltering);
  f.at(2, '16:00');
  f.ship('C-CAPITAL');

  f.at(1, '07:30');
  f.press(atSieving);
  f.grind(atSieving, 'stock');
  f.sieve(atFiltering);
  f.grind(atFiltering, 'stock');
  f.roastPowder(atFiltering);
  f.at(1, '10:00');
  f.storedNibs(f.nibLots(cb12));
  f.at(1, '13:00');
  const ch7 = f.chocolateBatch();
  f.mix(ch7, 'R-70', 100);
  f.mix(ch7, 'R-85', 50);
  f.finishMixing(ch7);
  f.at(1, '08:00');
  const atRoasting = f.receive({ lot: semuliki2 }, 120);
  f.sort(atRoasting);
  // The batch waiting at winnowing: 90.40 kg of roasted Kuapa beans
  const atWinnowing = f.receive({ lot: kuapa2 }, 100);
  f.sort(atWinnowing);
  f.roast(atWinnowing, { roastedKg: 90.4 });
  f.startBeans({ lot: semuliki2 }, 150);
  f.at(1, '16:00');
  f.ship('C-FRESHMART');

  // Today
  f.at(0, '07:10');
  f.chocolateBatch();
  f.at(0, '07:30');
  f.receive({ lot: semuliki2 }, 130);
  f.hold(atRoasting, 'Moisture 8.4% after sorting, above the 7.5% limit. Dry before roasting.');

  return f.state;
}

type Out = [name: string, kind: OutputKind, share: number, to: Destination, container?: string];
type Source = { lot: string } | { supplier: string };

/** Short codes for the suppliers' own batch numbers and the kind of paper that came with a delivery */
const paper: Record<string, [code: string, note: string]> = {
  'S-KUAPA': ['KK', 'DN'], 'S-BUNDIBUGYO': ['BCG', 'DN'], 'S-SEMULIKI': ['SCC', 'DN'], 'S-MZANSI': ['MZ', 'INV'], 'S-LAKESIDE': ['LSW', 'INV'],
  'S-GOLDEN': ['GB', 'INV'], 'S-EQUATOR': ['ECP', 'INV'], 'S-RWENZORI': ['RHD', 'DN'], 'S-NILE': ['NFI', 'INV'],
};

/** How each chocolate type is made into pieces: shares of the chocolate in sizes other than 45 g bars, which take the rest */
const pieceSizes: Record<string, Record<string, number>> = {
  'R-70': { 'PK-80': 0.3, 'PK-7': 0.08 },
  'R-85': { 'PK-80': 0.25, 'PK-7': 0.05 },
  'R-100': { 'PK-200': 0.4, 'PK-1000': 0.4 },
  'R-54': { 'PK-80': 0.3, 'PK-1000': 0.2 },
  'R-56': { 'PK-80': 0.25, 'PK-1000': 0.25 },
  'R-MILK': { 'PK-7': 0.25, 'PK-80': 0.15 },
  'R-MILK50': { 'PK-80': 0.25, 'PK-7': 0.15 },
  'R-WHITE': { 'PK-7': 0.2, 'PK-1000': 0.2 },
};

/** What each customer usually orders: products and quantities (pieces, or kg for what is sold by weight) */
const orders: Record<string, [material: string, quantity: number][]> = {
  'C-FRESHMART': [['70% Dark · 45 g bar', 800], ['40% Milk · 45 g bar', 900], ['85% Dark · 45 g bar', 300], ['50% Milk · 45 g bar', 350], ['34% White · 45 g bar', 200], ['54% Dark · 45 g bar', 250], ['56% Dark · 45 g bar', 200], ['70% Dark · 80 g bar', 150], ['40% Milk · 80 g bar', 100]],
  'C-LAKEVIEW': [['40% Milk · 7 g bar', 2500], ['70% Dark · 7 g bar', 700], ['50% Milk · 7 g bar', 600], ['34% White · 7 g bar', 400], ['85% Dark · 7 g bar', 150], ['56% Dark · 1 kg pack', 4]],
  'C-CAPITAL': [['70% Dark · 45 g bar', 300], ['40% Milk · 45 g bar', 300], ['54% Dark · 80 g bar', 120], ['50% Milk · 80 g bar', 100], ['85% Dark · 80 g bar', 60], ['56% Dark · 80 g bar', 60], ['70% Dark · 80 g bar', 100], ['Nibs for sale', 10]],
  'C-GOLDENCRUST': [['54% Dark · 1 kg pack', 12], ['56% Dark · 1 kg pack', 10], ['34% White · 1 kg pack', 6], ['100% Dark · 1 kg pack', 8], ['Fine cocoa powder', 30], ['Butter for sale', 10]],
  'C-SKYLINE': [['70% Dark · 80 g bar', 120], ['85% Dark · 80 g bar', 60], ['100% Dark · 200 g sachet', 50], ['54% Dark · 80 g bar', 60], ['40% Milk · 80 g bar', 60]],
  'C-SHOP': [['70% Dark · 45 g bar', 100], ['40% Milk · 45 g bar', 100], ['40% Milk · 7 g bar', 300], ['34% White · 45 g bar', 50], ['100% Dark · 200 g sachet', 10], ['Nibs for sale', 6], ['Whole roasted beans', 4], ['Fine cocoa powder', 6], ['Butter for sale', 4], ['Silk butter', 2]],
};

/** How each customer numbers its orders, and the first number in the demo */
const orderNumbers: Record<string, [prefix: string, first: number]> = {
  'C-FRESHMART': ['PO-FM-', 1041], 'C-LAKEVIEW': ['LV-', 331], 'C-CAPITAL': ['CF/ORD/', 218], 'C-GOLDENCRUST': ['GCB-', 77], 'C-SKYLINE': ['SDF-', 5521],
};

const kg1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');

/** The factory's working days, Monday to Saturday, newest first: [0] is today (or the Saturday before a Sunday) */
function workingDays(today: string, count: number) {
  const days: string[] = [];
  const day = new Date(`${today}T12:00:00Z`);
  while (days.length < count) {
    if (day.getUTCDay() !== 0) days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return days;
}

/** The demo's factory floor: a clock, the people at each part of the line, and one method per thing they do */
class Factory {
  state = seedState();
  private readonly days: string[];
  private now = '';
  private daysAgo = 0;
  private ids = 0;
  private random = 20260907;
  private notes = 4100;

  constructor(today: string) {
    this.days = workingDays(today, 31);
  }

  /** Sets the clock: `daysAgo` working days before today, at hh:mm */
  at(daysAgo: number, time: string) {
    this.daysAgo = daysAgo;
    this.now = `${this.days[daysAgo]}T${time}:00`;
  }

  // People, taking turns by day
  private get beanTeam() { return this.daysAgo % 2 ? 'U-AB' : 'U-GN'; }
  private get butterTeam() { return this.daysAgo % 2 ? 'U-BO' : 'U-KM'; }
  private get packTeam() { return this.daysAgo % 2 ? 'U-LF' : 'U-JA'; }

  /** A number between lo and hi, the same every time the demo is made (mulberry32) */
  private between(lo: number, hi: number) {
    let t = (this.random += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return lo + (hi - lo) * (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  }

  /** Runs one command as the server does: checked against its schema, recorded `minutes` after the last one */
  private run<T = unknown>(command: Command, who: string, minutes: number): T {
    const [hours, mins] = this.now.slice(11, 16).split(':').map(Number);
    const time = Math.min(hours * 60 + mins + minutes, 23 * 60 + 59);
    this.now = `${this.now.slice(0, 10)}T${pad(Math.floor(time / 60))}:${pad(time % 60)}:00`;
    const outcome = applyCommand(this.state, commandSchema.parse(command), { userId: who, actorId: who, now: this.now, newId: () => `demo${++this.ids}` });
    this.state = outcome.state;
    return outcome.result as T;
  }

  private batch(id: string) { return this.state.batches.find((b) => b.id === id)!; }
  private lot(id: string) { return this.state.lots.find((l) => l.id === id)!; }

  private container(name: string | undefined, weight: number): ContainerUse | undefined {
    const found = name && this.state.containers.find((c) => c.name === name);
    return found ? { name: found.name, tare: found.tare, gross: round2(weight + found.tare) } : undefined;
  }

  /** A delivery weighed into the store, with the supplier's batch number and the delivery note or invoice */
  deliver(material: string, supplierId: string, kg: number): string {
    const [code, note] = paper[supplierId];
    const date = this.now.slice(2, 10).replace(/-/g, '');
    const supplierBatch = `${code}-${date}-${Math.floor(this.between(1, 9))}`;
    return this.run<string>({
      type: 'receiveLot',
      input: { material, category: material === 'Liquor' ? 'Intermediate' : 'Raw material', quantity: kg, unit: 'kg', supplierId, reference: `${note}-${(this.notes += Math.floor(this.between(3, 40)))}`, supplierBatch },
    }, 'U-AM', 15);
  }

  /** Beans weighed onto the line, from a lot in store or straight off a supplier's lorry; returns the new batch */
  receive(from: Source, kg: number): string {
    const lot = 'lot' in from ? this.lot(from.lot) : undefined;
    const supplierId = lot ? (lot.source as { supplierId: string }).supplierId : (from as { supplier: string }).supplier;
    const rejected = kg1(kg * this.between(0.006, 0.014));
    const accepted = kg1(kg - rejected - kg * this.between(0.001, 0.003));
    return this.run<string>({
      type: 'receiveDelivery',
      batch: { productId: 'P-BEANS', name: suggestBatchName(this.state, supplierId, this.now.slice(0, 10)), startWeight: kg, supplierId, lotUses: lot ? [{ lotId: lot.id, quantity: kg }] : [] },
      input: { weight: kg, container: lot ? undefined : this.container('Jute sack', kg) },
      outputs: [{ name: 'Accepted beans', kind: 'useful', weight: accepted, destination: 'continue:sorting' }, { name: 'Rejected beans', kind: 'waste', weight: rejected, destination: 'waste' }],
    }, this.beanTeam, 20);
  }

  /**
   * Weighs a station of a batch: each of `others` is a share of what the batch carried there, `loss` the
   * share nobody weighs (moisture, dust), and the main output is what is left, unless it is given.
   */
  private weigh(batchId: string, station: StationId, main: [name: string, to: Destination, container?: string], others: Out[], loss: [number, number], who: string, mainKg?: number) {
    const input = nextInput(this.batch(batchId), station).weight;
    const rows = others.map(([name, kind, share, destination, container]) => ({ name, kind, weight: kg1(input * share * this.between(0.85, 1.15)), destination, container })).filter((r) => r.weight > 0);
    const weight = mainKg ?? kg1(input - rows.reduce((sum, r) => sum + r.weight, 0) - input * this.between(...loss));
    const order = stationById[station].rows.map((r) => r.name);
    const outputs = [{ name: main[0], kind: 'useful' as const, weight, destination: main[1], container: main[2] }, ...rows]
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
      .map(({ container, ...o }) => ({ ...o, container: this.container(container, o.weight) }));
    this.run({ type: 'saveRecord', batchId, station, input: { weight: input }, outputs, expectRecord: null }, who, 45);
  }

  sort(id: string) {
    this.weigh(id, 'sorting', ['Sorted beans', 'continue:roasting', 'Bean crate'], [['Sorted-out beans', 'waste', 0.017, 'waste']], [0.001, 0.003], this.beanTeam);
  }

  roast(id: string, { forSale = false, roastedKg }: { forSale?: boolean; roastedKg?: number } = {}) {
    this.weigh(id, 'roasting', ['Roasted beans', 'continue:winnowing', 'Bean crate'], [['Whole roasted beans', 'useful', forSale ? 0.015 : 0, 'sale'], ['Unusable beans', 'waste', 0.007, 'waste']], [0.06, 0.07], this.beanTeam, roastedKg);
  }

  winnow(id: string, { nibs = 'continue:pressing', loss = [0.004, 0.007] }: { nibs?: Destination; loss?: [number, number] } = {}) {
    this.weigh(id, 'winnowing', ['Nibs for liquor', 'continue:grinding', 'Nib bucket'], [['Nibs for butter', 'useful', 0.21, nibs, 'Nib bucket'], ['Nibs for sale', 'useful', 0.03, 'sale'], ['Husks', 'waste', 0.172, 'waste', 'Husk bin']], loss, this.beanTeam);
  }

  press(id: string, cake: Destination = 'continue:powder-roasting') {
    this.weigh(id, 'pressing', ['Cocoa cake (powder)', cake], [['Brown butter', 'useful', 0.45, 'continue:sieving', 'Butter tub'], ['Waste', 'waste', 0.005, 'waste']], [0.003, 0.006], this.butterTeam);
  }

  sieve(id: string, particles: Destination = 'continue:grinding') {
    this.weigh(id, 'sieving', ['Sieved butter', 'continue:filtering', 'Butter tub'], [['Sieved particles', 'useful', 0.04, particles]], [0.005, 0.01], this.butterTeam);
  }

  filter(id: string, butter: Destination) {
    this.weigh(id, 'filtering', ['Cocoa butter', butter, 'Butter tub'], [['Silk butter', 'useful', 0.12, 'stock'], ['Butter for sale', 'useful', 0.18, 'sale'], ['Filter residue', 'waste', 0.015, 'waste']], [0.002, 0.004], this.butterTeam);
  }

  roastPowder(id: string) {
    this.weigh(id, 'powder-roasting', ['Roasted powder', 'continue:powder-crushing', 'Powder tray'], [['Waste', 'waste', 0.008, 'waste']], [0.005, 0.01], this.butterTeam);
  }

  crush(id: string) {
    this.weigh(id, 'powder-crushing', ['Fine cocoa powder', 'sale', 'Powder tray'], [['Waste', 'waste', 0.004, 'waste']], [0.002, 0.004], this.butterTeam);
  }

  grind(id: string, liquor: 'mixing' | 'stock') {
    this.weigh(id, 'grinding', ['Liquor', liquor === 'mixing' ? 'continue:mixing' : 'stock', 'Liquor pail'], [['Waste', 'waste', 0.003, 'waste']], [0.001, 0.003], 'U-KM');
  }

  /** Receiving to winnowing in one morning */
  startBeans(from: Source, kg: number, options: { forSale?: boolean; nibs?: Destination; winnowingLoss?: [number, number] } = {}) {
    const id = this.receive(from, kg);
    this.sort(id);
    this.roast(id, { forSale: options.forSale });
    this.winnow(id, { nibs: options.nibs, loss: options.winnowingLoss });
    return id;
  }

  /**
   * The next day: the nibs for butter pressed (unless they were stored), butter and powder made, the liquor
   * ground. Liquor and cocoa butter go on to mixing or into the store; a batch with nothing at mixing is completed.
   */
  finishBeans(id: string, { liquor, butter, cake = 'continue:powder-roasting' }: { liquor: 'mixing' | 'stock'; butter: 'mixing' | 'stock'; cake?: Destination }, complete = true) {
    const pressed = waitingAt(this.batch(id)).includes('pressing');
    if (pressed) {
      this.press(id, cake);
      this.sieve(id);
    }
    this.grind(id, liquor);
    if (pressed) {
      this.filter(id, butter === 'mixing' ? 'continue:mixing' : 'stock');
      if (cake === 'continue:powder-roasting') this.roastPowder(id);
      this.crush(id);
    }
    if (complete && !waitingAt(this.batch(id)).includes('mixing')) this.complete(id);
  }

  /** The nibs for butter a batch kept in store */
  nibLots(batchId: string) {
    return this.state.lots.filter((l) => l.material === 'Nibs for butter' && l.source.type === 'batch' && l.source.batchId === batchId && l.available > 0).map((l) => l.id);
  }

  /** A batch of the nibs for butter kept in store: made into butter and powder that day when `cake` says where the cake goes, else left waiting at pressing */
  storedNibs(lotIds: string[], cake?: Destination) {
    const lotUses = lotIds.map((lotId) => ({ lotId, quantity: this.lot(lotId).available }));
    const id = this.run<string>({ type: 'createBatch', input: { productId: 'P-LIQUOR', startWeight: round2(lotUses.reduce((sum, u) => sum + u.quantity, 0)), lotUses } }, this.butterTeam, 10);
    if (!cake) return id;
    this.press(id, cake);
    this.sieve(id, 'stock');
    this.filter(id, 'stock');
    if (cake === 'continue:powder-roasting') this.roastPowder(id);
    this.crush(id);
    this.complete(id);
    return id;
  }

  /** A "Chocolate from store" batch: its chocolate is mixed from lots in store */
  chocolateBatch() {
    return this.run<string>({ type: 'createBatch', input: { productId: 'P-CHOC', startWeight: 0, lotUses: [] } }, 'U-KM', 10);
  }

  /**
   * One chocolate type made at mixing on top of what the mixer holds, as the changeover sheet says. When the
   * type cannot be made on top of it, the mixer is emptied first. Liquor and cocoa butter come from the batch
   * itself while it has some, then from the oldest lots in store. Returns the chocolate lot.
   */
  mix(batchId: string, recipeId: string, toRun: number, keep = this.state.mixerKeepsKg): string {
    const recipe = this.state.recipes.find((r) => r.id === recipeId)!;
    const target = versionOf(recipe)!.ingredients;
    const inMixer = () => this.state.mixer.holds && { kg: this.state.mixer.holds.kg, ingredients: ingredientsOf(this.state, this.state.mixer.holds.recipeId, this.state.mixer.holds.recipeVersion) };
    const first = inMixer();
    if (first) {
      const plan = changeover(target, toRun, first);
      if (plan.blocked.length || plan.minRun > toRun) this.run({ type: 'emptyMixer', expectMixer: mixerStamp(this.state.mixer) }, 'U-KM', 15);
    }
    const held = inMixer();
    const own = new Map(batchMaterialAtMixing(this.batch(batchId)).map((m) => [m.name, m.left]));
    const ingredients: { name: string; actual: number; lotId?: string }[] = [];
    for (const line of changeover(target, toRun, held ?? undefined).lines) {
      if (line.add <= 0) continue;
      let rest = kg1(line.add + this.between(-0.1, 0.1));
      const fromBatch = round2(Math.min(rest, own.get(line.name) ?? 0));
      if (fromBatch > 0) {
        ingredients.push({ name: line.name, actual: fromBatch });
        rest = round2(rest - fromBatch);
      }
      const lots = this.state.lots.filter((l) => l.material === line.name && l.unit === 'kg' && l.available > 0.004).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
      for (const lot of lots) {
        if (rest <= 0) break;
        const take = round2(Math.min(rest, lot.available));
        ingredients.push({ name: line.name, actual: take, lotId: lot.id });
        rest = round2(rest - take);
      }
      if (rest > 0.005) throw new Error(`The demo ran out of ${line.name.toLowerCase()} on ${this.now.slice(0, 10)}.`);
    }
    const weighed = ingredients.reduce((sum, i) => sum + i.actual, 0);
    const made = kg1(weighed + (held?.kg ?? 0) - keep - this.between(0.2, 0.5));
    return this.run<string>({ type: 'saveMixingRun', batchId, recipeId, toRun, ingredients, made, kept: keep, expectMixer: mixerStamp(this.state.mixer) }, 'U-KM', 70);
  }

  finishMixing(batchId: string) {
    this.run({ type: 'finishMixing', batchId }, 'U-KM', 15);
    if (!waitingAt(this.batch(batchId)).some((s) => s !== 'completion')) this.complete(batchId);
  }

  complete(batchId: string) {
    this.run({ type: 'completeBatch', batchId }, this.packTeam, 10);
  }

  /**
   * The packing team makes every chocolate lot from an earlier day into pieces: the sizes of its type, then
   * 45 g bars, with 7 g bars making up the last grams so the lot is used up.
   */
  makePieces() {
    const today = this.now.slice(0, 10);
    for (const lot of chocolateWaiting(this.state).filter((l) => l.receivedAt.slice(0, 10) < today)) {
      const total = Math.round(lot.available * 1000);
      const grams = (pack: string) => this.state.packSizes.find((p) => p.id === pack)!.grams;
      const shares = pieceSizes[lot.chocolate!.recipeId] ?? {};
      const counts = new Map<string, number>();
      let left = total;
      for (const [pack, share] of Object.entries(shares)) {
        if (pack === 'PK-7') continue;
        const count = Math.floor((total * share) / grams(pack));
        counts.set(pack, count);
        left -= count * grams(pack);
      }
      const sevens = Math.floor((total * (shares['PK-7'] ?? 0)) / 7);
      let bars = Math.max(0, Math.floor((left - sevens * 7) / 45));
      while (bars > 0 && (left - bars * 45) % 7 !== 0) bars -= 1;
      counts.set('PK-45', bars);
      counts.set('PK-7', Math.floor((left - bars * 45) / 7));
      const pieces = Array.from(counts, ([packSizeId, count]) => ({ packSizeId, count })).filter((p) => p.count > 0).sort((a, b) => grams(a.packSizeId) - grams(b.packSizeId));
      this.run({ type: 'recordPieces', lotId: lot.id, pieces }, this.packTeam, 35);
    }
  }

  hold(batchId: string, reason: string) {
    this.run({ type: 'placeHold', batchId, reason }, 'U-SO', 10);
  }

  release(batchId: string, note: string) {
    this.run({ type: 'releaseHold', batchId, note }, 'U-SO', 90);
  }

  /** Quality corrects a weight written down wrong, by `change` kg */
  correct(batchId: string, station: StationId, output: string, change: number, reason: string) {
    const record = this.batch(batchId).records.find((r) => r.station === station)!;
    const weight = record.outputs.find((o) => o.name === output)!.weight;
    this.run({ type: 'addCorrection', batchId, recordId: record.id, output, corrected: kg1(weight + change), reason }, 'U-SO', 20);
  }

  /**
   * An order sent out: each product taken from its oldest lots in store, as much as there is of it. Answers
   * the dispatch note, or nothing when none of the order is in store.
   */
  ship(customerId: string, order = orders[customerId]): string | undefined {
    const lines: { lotId: string; quantity: number }[] = [];
    for (const [material, wanted] of order) {
      const lots = this.state.lots.filter((l) => l.material === material && l.category !== 'Raw material' && l.available > 0.004).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
      lines.push(...takeOldestFirst(lots, wanted).lines.filter((l) => l.quantity > 0));
    }
    if (lines.length === 0) return undefined;
    const numbering = orderNumbers[customerId];
    const reference = numbering ? `${numbering[0]}${numbering[1]++}` : undefined;
    const note = customerId === 'C-SHOP' ? 'Restocking the factory shop.' : undefined;
    return this.run<string>({ type: 'dispatchGoods', customerId, reference, note, lines }, 'U-AM', 20);
  }

  /** A dispatch entered by mistake, taken back: its goods return to their lots */
  cancelDispatch(dispatchId: string, reason: string) {
    this.run({ type: 'cancelDispatch', dispatchId, reason }, 'U-AM', 10);
  }

  /** The production plan in pieces, counted from today */
  plan(note: string, lines: [recipeId: string, packSizeId: string, pieces: number][]) {
    this.run({ type: 'setPlan', from: this.now.slice(0, 10), note, lines: lines.map(([recipeId, packSizeId, pieces]) => ({ recipeId, packSizeId, pieces })) }, 'U-AM', 10);
  }
}
