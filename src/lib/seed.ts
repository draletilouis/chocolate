import { mixingTotals } from './mixing';
import { stations } from './stations';
import type {
  Batch, Container, Destination, IdCounters, Lot, Mixer, MixingRun, ProductionPlan, OutputCategory, OutputKind, PackSize, Product, Recipe, RecordedOutput, Route,
  StationId, StationRecord, Supplier, Thresholds, User, BusinessDetails,
} from './types';

export interface State {
  batches: Batch[];
  lots: Lot[];
  recipes: Recipe[];
  products: Product[];
  routes: Route[];
  packSizes: PackSize[];
  suppliers: Supplier[];
  users: User[];
  thresholds: Thresholds;
  outputCategories: OutputCategory[];
  business: BusinessDetails;
  /** Containers with their empty weight, subtracted from scale readings */
  containers: Container[];
  /** Minutes without activity before a shared device returns to the sign-in screen (0 = never) */
  idleMinutes: number;
  /** Version of the line layout the stored rows and routes were made for */
  workflowVersion: number;
  /** Highest batch and lot numbers ever issued, so none is issued twice (see nextBatchId() and nextLotId()) */
  idCounters: IdCounters;
  /** What the mixer holds between runs, and the last run made on it */
  mixer: Mixer;
  /** Chocolate usually left in the mixer for the next run, kg; suggested on each run */
  mixerKeepsKg: number;
  /** The current production plan in pieces, shared by everyone; null until a manager sets one */
  plan: ProductionPlan | null;
}

/**
 * 2: sorting, butter & powder and liquor as separate parts of the line. 3: chocolate made in mixing runs.
 * 4: the chocolate types of the regular recipes table. Data from an older version is brought up to
 * date by upgradeConfiguration().
 */
const WORKFLOW_VERSION = 4;

const at = (day: string, time: string) => `${day}T${time}:00`;

type SeedOutput = [name: string, kind: OutputKind, weight: number, destination: Destination, lotId?: string];

function record(
  station: StationId, inputMaterial: string, inputWeight: number, inputLotIds: string[],
  outputs: SeedOutput[], recordedAt: string, recordedBy: string,
): StationRecord {
  return {
    id: `${station}-${recordedAt}`,
    station, inputMaterial, inputWeight, inputLotIds,
    outputs: outputs.map(([name, kind, weight, destination, lotId]): RecordedOutput => ({ name, kind, weight, destination, lotId })),
    recordedAt, recordedBy, destinationsSaved: true,
  };
}

export const routes: Route[] = [
  { id: 'beans', name: 'Beans to chocolate', stations: ['receiving', 'sorting', 'roasting', 'winnowing', 'pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'grinding', 'mixing', 'completion'], startMaterial: 'Cocoa beans delivered', note: 'Nibs split at winnowing: some for liquor, some for butter, some for sale. The liquor and cocoa butter go on to mixing, where the chocolate types are made one after another.' },
  { id: 'pressing', name: 'Nibs to butter and powder', stations: ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'mixing', 'completion'], startMaterial: 'Nibs for butter', note: 'For stored nibs. Brown butter is sieved and filtered; the cake becomes powder. Cocoa butter can go on to mixing.' },
  { id: 'chocolate', name: 'Chocolate from stored liquor and butter', stations: ['mixing', 'completion'], startMaterial: 'Stored liquor and cocoa butter', note: 'For liquor and cocoa butter already in store: the chocolate types are made at mixing from their lots.' },
];

/** What chocolate is made from; each is the material name of the lots weighed in */
export const chocolateIngredients = ['Liquor', 'Cocoa butter', 'Sugar', 'Milk powder'] as const;

/**
 * The chocolate types and their recipes, as in the factory's "Regular recipes" table: percentages
 * of the batch weight in liquor, cocoa butter, sugar and milk powder.
 */
const chocolateTypes: [id: string, name: string, liquor: number, butter: number, sugar: number, milk: number][] = [
  ['WHITE', '34% White', 0, 35, 35, 30],
  ['MILK', '40% Milk', 11, 30, 34, 25],
  ['MILK50', '50% Milk', 25, 25, 25, 25],
  ['54', '54% Dark', 44, 10, 46, 0],
  ['56', '56% Dark', 50, 10, 40, 0],
  ['70', '70% Dark', 60, 10, 30, 0],
  ['85', '85% Dark', 75, 10, 15, 0],
  ['100', '100% Dark', 90, 10, 0, 0],
];

/** Types earlier versions started with that the table does not have */
export const retiredChocolateTypes = ['R-55'];

export const products: Product[] = [
  { id: 'P-BEANS', name: 'Cocoa beans', prefix: 'CB', route: 'beans' },
  { id: 'P-LIQUOR', name: 'Stored nibs (butter & powder)', prefix: 'CL', route: 'pressing' },
  { id: 'P-CHOC', name: 'Chocolate from store', prefix: 'CH', route: 'chocolate' },
];

export const recipes: Recipe[] = chocolateTypes.map(([id, name, liquor, butter, sugar, milk]) => ({
  id: `R-${id}`, name, currentVersion: 1,
  versions: [{
    version: 1, createdAt: at('2026-09-01', '08:00'), note: 'From the regular recipes table.',
    // Ingredients at 0% are left out: white chocolate has no liquor, 100% Dark no sugar.
    ingredients: [liquor, butter, sugar, milk].map((percent, i) => ({ name: chocolateIngredients[i], percent })).filter((i) => i.percent > 0),
  }],
}));

export const suppliers: Supplier[] = [
  { id: 'S-KUAPA', name: 'Kuapa Kokoo', supplies: 'Cocoa beans', contact: 'orders@kuapa.example' },
  { id: 'S-MZANSI', name: 'Mzansi Sugar', supplies: 'Sugar', contact: '+27 11 555 0142' },
  { id: 'S-GOLDEN', name: 'Golden Butter Co', supplies: 'Cocoa butter, lecithin, milk powder', contact: 'sales@goldenbutter.example' },
];

/** Demo accounts, only created in demo mode. Every one signs in with the password "cocoa123" or the PIN "1234". */
export const users: User[] = [
  { id: 'U-AM', name: 'Alex Morgan', role: 'Production manager', initials: 'AM', email: 'alex.morgan@cocoafactory.example', access: 'manager', stations: [] },
  { id: 'U-AB', name: 'Ama Boateng', role: 'Bean processing operator', initials: 'AB', email: 'ama.boateng@cocoafactory.example', access: 'operator', stations: ['receiving', 'sorting', 'roasting', 'winnowing'] },
  { id: 'U-KM', name: 'Kwame Mensah', role: 'Butter, liquor & chocolate maker', initials: 'KM', email: 'kwame.mensah@cocoafactory.example', access: 'operator', stations: ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'grinding', 'mixing'] },
  { id: 'U-LF', name: 'Lena Fischer', role: 'Packaging lead', initials: 'LF', email: 'lena.fischer@cocoafactory.example', access: 'operator', stations: ['packaging', 'completion'] },
  { id: 'U-SO', name: 'Sam Osei', role: 'Quality', initials: 'SO', email: 'sam.osei@cocoafactory.example', access: 'manager', stations: [] },
];

export const demoCredentials = { password: 'cocoa123', pin: '1234' };

/** Common containers on the line and their empty weight in kg */
export const containers: Container[] = [
  { id: 'C-SACK', name: 'Jute sack', tare: 0.5 },
  { id: 'C-CRATE', name: 'Bean crate', tare: 2.4 },
  { id: 'C-HUSK', name: 'Husk bin', tare: 2.3 },
  { id: 'C-BUCKET', name: 'Nib bucket', tare: 1.2 },
  { id: 'C-TUB', name: 'Butter tub', tare: 0.8 },
  { id: 'C-TRAY', name: 'Powder tray', tare: 1.5 },
  { id: 'C-PAIL', name: 'Liquor pail', tare: 1.6 },
];

export const packSizes: PackSize[] = [
  { id: 'PK-7', name: '7 g bar', grams: 7 },
  { id: 'PK-45', name: '45 g bar', grams: 45 },
  { id: 'PK-80', name: '80 g bar', grams: 80 },
  { id: 'PK-200', name: '200 g sachet', grams: 200 },
  { id: 'PK-1000', name: '1 kg pack', grams: 1000 },
];

export const thresholds: Thresholds = {
  variancePct: {
    receiving: 1, sorting: 1, roasting: 8, winnowing: 2, pressing: 2, sieving: 2, filtering: 2, 'powder-roasting': 3, 'powder-crushing': 2, grinding: 2,
    mixing: 1.5, refining: 1.5, conching: 2, tempering: 1.5, moulding: 2, packaging: 3, completion: 0,
  },
  wastePct: 5,
  lowStockKg: 50,
};

const slugOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const outputCategories: OutputCategory[] = stations.flatMap((s) => s.rows.map((row) => ({ ...row, id: `${s.id}:${slugOf(row.name)}`, station: s.id })));

/**
 * CH-017 made two types on the mixer: 70% Dark from empty, then 85% Dark on top of the 10 kg of 70% it
 * kept, as in the changeover sheet (liquor 30 − 6 = 24, butter 4 − 1 = 3, sugar 6 − 3 = 3 to add).
 */
const ch017Run70: MixingRun = {
  id: 'run-ch017-1', recipeId: 'R-70', type: '70% Dark', recipeVersion: 1, toRun: 100,
  ingredients: [{ name: 'Liquor', expected: 60, actual: 60.1, lotId: 'LIQ-024' }, { name: 'Cocoa butter', expected: 10, actual: 9.9, lotId: 'BUT-019' }, { name: 'Sugar', expected: 30, actual: 30, lotId: 'SUG-031' }],
  made: 90, kept: 10, lotId: 'D70-0001', recordedAt: at('2026-09-15', '09:10'), recordedBy: 'U-KM',
};
const ch017Run85: MixingRun = {
  id: 'run-ch017-2', recipeId: 'R-85', type: '85% Dark', recipeVersion: 1, toRun: 30,
  held: { kg: 10, type: '70% Dark', recipeId: 'R-70', recipeVersion: 1, batchId: 'CH-017', runId: 'run-ch017-1', lotId: 'D70-0001' },
  ingredients: [{ name: 'Liquor', expected: 24, actual: 24, lotId: 'LIQ-023' }, { name: 'Cocoa butter', expected: 3, actual: 3, lotId: 'BUT-019' }, { name: 'Sugar', expected: 3, actual: 3, lotId: 'SUG-031' }],
  made: 29.8, kept: 10, lotId: 'D85-0001', recordedAt: at('2026-09-15', '12:40'), recordedBy: 'U-KM',
};

/** A finished mixing record; its input and outputs follow from the runs */
function mixingRecord(runs: MixingRun[], recordedAt: string): StationRecord {
  return {
    id: `mixing-${runs[0].recordedAt}`, station: 'mixing', inputMaterial: 'Chocolate ingredients', ...mixingTotals(runs),
    inputLotIds: Array.from(new Set(runs.flatMap((r) => r.ingredients.flatMap((i) => (i.lotId ? [i.lotId] : []))))),
    runs, recordedAt, recordedBy: 'U-KM', destinationsSaved: true,
  };
}

const batches: Batch[] = [
  {
    id: 'CB-023', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-10', '07:30'), status: 'completed', nextStation: null,
    startInput: { material: 'Cocoa beans delivered', weight: 200, lotIds: ['BEAN-0905'] }, supplierId: 'S-KUAPA', completedAt: at('2026-09-10', '16:40'),
    records: [
      record('receiving', 'Cocoa beans delivered', 200, ['BEAN-0905'], [['Accepted beans', 'useful', 197.6, 'continue:sorting'], ['Rejected beans', 'waste', 2.1, 'waste']], at('2026-09-10', '07:45'), 'U-AB'),
      record('sorting', 'Accepted beans', 197.6, [], [['Sorted beans', 'useful', 193.8, 'continue:roasting'], ['Sorted-out beans', 'waste', 3.5, 'waste']], at('2026-09-10', '08:40'), 'U-AB'),
      record('roasting', 'Sorted beans', 193.8, [], [['Roasted beans', 'useful', 177, 'continue:winnowing'], ['Whole roasted beans', 'useful', 3, 'sale', 'WRB-023'], ['Unusable beans', 'waste', 1.2, 'waste']], at('2026-09-10', '10:10'), 'U-AB'),
      record('winnowing', 'Roasted beans', 177, [], [['Nibs for liquor', 'useful', 100, 'continue:grinding'], ['Nibs for butter', 'useful', 40, 'stock', 'NIB-023'], ['Nibs for sale', 'useful', 5, 'sale', 'NIB-023B'], ['Husks', 'waste', 31.2, 'waste']], at('2026-09-10', '12:30'), 'U-AB'),
      record('grinding', 'Nibs for liquor', 100, [], [['Liquor', 'useful', 99.4, 'stock', 'LIQ-023'], ['Waste', 'waste', 0.4, 'waste']], at('2026-09-10', '16:00'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'CB-024', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-13', '07:20'), status: 'completed', nextStation: null,
    startInput: { material: 'Cocoa beans delivered', weight: 150, lotIds: ['BEAN-0905'] }, supplierId: 'S-KUAPA', completedAt: at('2026-09-13', '17:10'),
    records: [
      record('receiving', 'Cocoa beans delivered', 150, ['BEAN-0905'], [['Accepted beans', 'useful', 148.5, 'continue:sorting'], ['Rejected beans', 'waste', 1.2, 'waste']], at('2026-09-13', '07:35'), 'U-AB'),
      record('sorting', 'Accepted beans', 148.5, [], [['Sorted beans', 'useful', 145.6, 'continue:roasting'], ['Sorted-out beans', 'waste', 2.6, 'waste']], at('2026-09-13', '08:20'), 'U-AB'),
      record('roasting', 'Sorted beans', 145.6, [], [['Roasted beans', 'useful', 133, 'continue:winnowing'], ['Whole roasted beans', 'useful', 2, 'sale', 'WRB-024'], ['Unusable beans', 'waste', 0.8, 'waste']], at('2026-09-13', '09:50'), 'U-AB'),
      record('winnowing', 'Roasted beans', 133, [], [['Nibs for liquor', 'useful', 80, 'continue:grinding'], ['Nibs for butter', 'useful', 25, 'continue:pressing'], ['Nibs for sale', 'useful', 4, 'sale', 'NIB-024'], ['Husks', 'waste', 23.4, 'waste']], at('2026-09-13', '11:40'), 'U-AB'),
      record('pressing', 'Nibs for butter', 25, [], [['Brown butter', 'useful', 11.1, 'continue:sieving'], ['Cocoa cake (powder)', 'useful', 13.5, 'continue:powder-crushing'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-13', '12:30'), 'U-KM'),
      record('sieving', 'Brown butter', 11.1, [], [['Sieved butter', 'useful', 10.5, 'continue:filtering'], ['Sieved particles', 'useful', 0.4, 'continue:grinding']], at('2026-09-13', '13:15'), 'U-KM'),
      record('filtering', 'Sieved butter', 10.5, [], [['Silk butter', 'useful', 2, 'stock', 'SILK-024'], ['Butter for sale', 'useful', 2.5, 'sale', 'BUT-024'], ['Cocoa butter', 'useful', 5.7, 'stock', 'BUT-024B'], ['Filter residue', 'waste', 0.2, 'waste']], at('2026-09-13', '14:30'), 'U-KM'),
      record('powder-crushing', 'Cocoa cake (powder)', 13.5, [], [['Fine cocoa powder', 'useful', 13.2, 'sale', 'PWD-024'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-13', '15:20'), 'U-KM'),
      record('grinding', 'Nibs for liquor + Sieved particles', 80.4, [], [['Liquor', 'useful', 79.6, 'stock', 'LIQ-024'], ['Waste', 'waste', 0.4, 'waste']], at('2026-09-13', '16:45'), 'U-KM'),
    ],
    holds: [],
    corrections: [{ id: 'c-1', recordId: 'winnowing-2026-09-13T11:40:00', station: 'winnowing', output: 'Husks', previous: 24, corrected: 23.4, reason: 'Tare weight of the husk bin was not subtracted.', correctedAt: at('2026-09-13', '12:05'), correctedBy: 'U-SO' }],
  },
  {
    id: 'CB-025', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-14', '07:15'), status: 'active', nextStation: 'winnowing',
    startInput: { material: 'Cocoa beans delivered', weight: 100, lotIds: ['BEAN-0912'] }, supplierId: 'S-KUAPA',
    records: [
      record('receiving', 'Cocoa beans delivered', 100, ['BEAN-0912'], [['Accepted beans', 'useful', 98.6, 'continue:sorting'], ['Rejected beans', 'waste', 1.2, 'waste']], at('2026-09-14', '07:30'), 'U-AB'),
      record('sorting', 'Accepted beans', 98.6, [], [['Sorted beans', 'useful', 96.9, 'continue:roasting'], ['Sorted-out beans', 'waste', 1.4, 'waste']], at('2026-09-14', '08:15'), 'U-AB'),
      record('roasting', 'Sorted beans', 96.9, [], [['Roasted beans', 'useful', 90.4, 'continue:winnowing'], ['Unusable beans', 'waste', 0.9, 'waste']], at('2026-09-14', '09:40'), 'U-AB'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'CL-007', productId: 'P-LIQUOR', product: 'Stored nibs (butter & powder)', route: 'pressing', startedAt: at('2026-09-14', '08:00'), status: 'active', nextStation: 'pressing',
    startInput: { material: 'Nibs for butter', weight: 40, lotIds: ['NIB-023'] },
    records: [], holds: [], corrections: [],
  },
  {
    id: 'CH-017', productId: 'P-CHOC', product: 'Chocolate from store', route: 'chocolate', startedAt: at('2026-09-15', '08:00'), status: 'completed', nextStation: null,
    startInput: { material: 'Stored liquor and cocoa butter', weight: 0, lotIds: [] }, completedAt: at('2026-09-15', '15:30'),
    records: [mixingRecord([ch017Run70, ch017Run85], at('2026-09-15', '12:40'))],
    holds: [], corrections: [],
  },
  {
    id: 'CH-018', productId: 'P-CHOC', product: 'Chocolate from store', route: 'chocolate', startedAt: at('2026-09-16', '07:30'), status: 'active', nextStation: 'mixing',
    startInput: { material: 'Stored liquor and cocoa butter', weight: 0, lotIds: [] },
    records: [], holds: [], corrections: [],
  },
];

const lots: Lot[] = [
  { id: 'BEAN-0905', material: 'Cocoa beans', category: 'Raw material', received: 420, available: 70, unit: 'kg', source: { type: 'supplier', supplierId: 'S-KUAPA', reference: 'DN-2211' }, receivedAt: at('2026-09-05', '10:00'), uses: [{ batchId: 'CB-023', quantity: 200, station: 'receiving', at: at('2026-09-10', '07:30') }, { batchId: 'CB-024', quantity: 150, station: 'receiving', at: at('2026-09-13', '07:20') }] },
  { id: 'BEAN-0912', material: 'Cocoa beans', category: 'Raw material', received: 300, available: 200, unit: 'kg', source: { type: 'supplier', supplierId: 'S-KUAPA', reference: 'DN-2238' }, receivedAt: at('2026-09-12', '09:15'), uses: [{ batchId: 'CB-025', quantity: 100, station: 'receiving', at: at('2026-09-14', '07:15') }] },
  { id: 'SUG-031', material: 'Sugar', category: 'Raw material', received: 500, available: 467, unit: 'kg', source: { type: 'supplier', supplierId: 'S-MZANSI', reference: 'INV-88120' }, receivedAt: at('2026-09-01', '13:00'), uses: [{ batchId: 'CH-017', quantity: 30, station: 'mixing', at: at('2026-09-15', '09:10'), runId: 'run-ch017-1' }, { batchId: 'CH-017', quantity: 3, station: 'mixing', at: at('2026-09-15', '12:40'), runId: 'run-ch017-2' }] },
  { id: 'BUT-019', material: 'Cocoa butter', category: 'Raw material', received: 80, available: 67.1, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4471' }, receivedAt: at('2026-08-28', '11:20'), uses: [{ batchId: 'CH-017', quantity: 9.9, station: 'mixing', at: at('2026-09-15', '09:10'), runId: 'run-ch017-1' }, { batchId: 'CH-017', quantity: 3, station: 'mixing', at: at('2026-09-15', '12:40'), runId: 'run-ch017-2' }] },
    { id: 'MLK-002', material: 'Milk powder', category: 'Raw material', received: 60, available: 38, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4390' }, receivedAt: at('2026-08-14', '10:00'), uses: [] },
  { id: 'LIQ-023', material: 'Liquor', category: 'Intermediate', received: 99.4, available: 75.4, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'grinding' }, receivedAt: at('2026-09-10', '16:00'), uses: [{ batchId: 'CH-017', quantity: 24, station: 'mixing', at: at('2026-09-15', '12:40'), runId: 'run-ch017-2' }] },
  { id: 'LIQ-024', material: 'Liquor', category: 'Intermediate', received: 79.6, available: 19.5, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'grinding' }, receivedAt: at('2026-09-13', '16:45'), uses: [{ batchId: 'CH-017', quantity: 60.1, station: 'mixing', at: at('2026-09-15', '09:10'), runId: 'run-ch017-1' }] },
  { id: 'WRB-023', material: 'Whole roasted beans', category: 'Finished goods', received: 3, available: 3, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'roasting' }, receivedAt: at('2026-09-10', '10:10'), uses: [] },
  { id: 'WRB-024', material: 'Whole roasted beans', category: 'Finished goods', received: 2, available: 2, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'roasting' }, receivedAt: at('2026-09-13', '09:50'), uses: [] },
  { id: 'NIB-023', material: 'Nibs for butter', category: 'Intermediate', received: 40, available: 0, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [{ batchId: 'CL-007', quantity: 40, station: 'pressing', at: at('2026-09-14', '08:00') }] },
  { id: 'NIB-023B', material: 'Nibs for sale', category: 'Finished goods', received: 5, available: 5, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'NIB-024', material: 'Nibs for sale', category: 'Finished goods', received: 4, available: 4, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'SILK-024', material: 'Silk butter', category: 'Intermediate', received: 2, available: 2, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'filtering' }, receivedAt: at('2026-09-13', '14:30'), uses: [] },
  { id: 'BUT-024', material: 'Butter for sale', category: 'Finished goods', received: 2.5, available: 2.5, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'filtering' }, receivedAt: at('2026-09-13', '14:30'), uses: [] },
  { id: 'BUT-024B', material: 'Cocoa butter', category: 'Intermediate', received: 5.7, available: 5.7, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'filtering' }, receivedAt: at('2026-09-13', '14:30'), uses: [] },
  { id: 'PWD-024', material: 'Fine cocoa powder', category: 'Finished goods', received: 13.2, available: 13.2, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'powder-crushing' }, receivedAt: at('2026-09-13', '15:20'), uses: [] },
  // CH-017's chocolate, part of it made into bars the next morning
  { id: 'D70-0001', material: '70% Dark', category: 'Intermediate', received: 90, available: 12, unit: 'kg', source: { type: 'batch', batchId: 'CH-017', station: 'mixing' }, receivedAt: at('2026-09-15', '09:10'), uses: [{ batchId: 'CH-017', quantity: 54, station: 'packaging', at: at('2026-09-16', '10:00'), madeLot: 'FIN-0001' }, { batchId: 'CH-017', quantity: 24, station: 'packaging', at: at('2026-09-16', '10:00'), madeLot: 'FIN-0002' }], chocolate: { type: '70% Dark', recipeId: 'R-70', recipeVersion: 1, runId: 'run-ch017-1' } },
  { id: 'D85-0001', material: '85% Dark', category: 'Intermediate', received: 29.8, available: 11.8, unit: 'kg', source: { type: 'batch', batchId: 'CH-017', station: 'mixing' }, receivedAt: at('2026-09-15', '12:40'), uses: [{ batchId: 'CH-017', quantity: 18, station: 'packaging', at: at('2026-09-16', '11:30'), madeLot: 'FIN-0003' }], chocolate: { type: '85% Dark', recipeId: 'R-85', recipeVersion: 1, runId: 'run-ch017-2' } },
  { id: 'FIN-0001', material: '70% Dark · 45 g bar', category: 'Finished goods', received: 1200, available: 1200, unit: 'units', source: { type: 'batch', batchId: 'CH-017', station: 'packaging' }, receivedAt: at('2026-09-16', '10:00'), uses: [], pieces: { type: '70% Dark', recipeId: 'R-70', packSizeId: 'PK-45', size: '45 g bar', grams: 45, fromLotId: 'D70-0001', recordedBy: 'U-LF' } },
  { id: 'FIN-0002', material: '70% Dark · 80 g bar', category: 'Finished goods', received: 300, available: 300, unit: 'units', source: { type: 'batch', batchId: 'CH-017', station: 'packaging' }, receivedAt: at('2026-09-16', '10:00'), uses: [], pieces: { type: '70% Dark', recipeId: 'R-70', packSizeId: 'PK-80', size: '80 g bar', grams: 80, fromLotId: 'D70-0001', recordedBy: 'U-LF' } },
  { id: 'FIN-0003', material: '85% Dark · 45 g bar', category: 'Finished goods', received: 400, available: 400, unit: 'units', source: { type: 'batch', batchId: 'CH-017', station: 'packaging' }, receivedAt: at('2026-09-16', '11:30'), uses: [], pieces: { type: '85% Dark', recipeId: 'R-85', packSizeId: 'PK-45', size: '45 g bar', grams: 45, fromLotId: 'D85-0001', recordedBy: 'U-LF' } },
];

const business: BusinessDetails = {
  name: 'Chocolate Factory',
  address: 'Kampala, Uganda',
  phone: '+256 700 000 000',
  email: 'production@cocoafactory.example',
};

/** The demo factory: sample batches, lots, suppliers and staff */
export function seedState(): State {
  return structuredClone({
    batches, lots, recipes, products, routes, packSizes, suppliers, users,
    thresholds, outputCategories, business, containers, idleMinutes: 10, workflowVersion: WORKFLOW_VERSION,
    // Empty: numbers continue from the sample IDs, and applyCommand() fills the counters in.
    idCounters: { batches: {}, lots: {} },
    // CH-017's last run left 10 kg of 85% Dark in the mixer.
    mixer: { holds: { kg: 10, type: '85% Dark', recipeId: 'R-85', recipeVersion: 1, batchId: 'CH-017', runId: 'run-ch017-2', lotId: 'D85-0001' }, lastRunId: 'run-ch017-2' },
    mixerKeepsKg: 10,
    plan: {
      from: '2026-09-14', updatedAt: at('2026-09-14', '07:00'), updatedBy: 'U-AM', note: 'Orders for the second half of September.',
      lines: [
        { recipeId: 'R-70', packSizeId: 'PK-45', pieces: 2000 }, { recipeId: 'R-70', packSizeId: 'PK-80', pieces: 500 },
        { recipeId: 'R-85', packSizeId: 'PK-45', pieces: 800 }, { recipeId: 'R-MILK', packSizeId: 'PK-45', pieces: 1000 },
        { recipeId: 'R-54', packSizeId: 'PK-80', pieces: 400 },
      ],
    },
  });
}

/** A real factory's first start: the line configuration only. People, suppliers, contact details and records are added by the factory. */
export function configState(): State {
  return { ...seedState(), batches: [], lots: [], suppliers: [], users: [], business: { name: business.name, address: '', phone: '', email: '' }, mixer: { holds: null, lastRunId: null }, plan: null };
}
