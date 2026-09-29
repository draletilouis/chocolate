import { stations } from './stations';
import type {
  Batch, Destination, Lot, OutputCategory, OutputKind, PackSize, Product, Recipe, RecordedOutput, Route,
  StationId, StationRecord, Supplier, Thresholds, User,
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
  currentUserId: string;
  thresholds: Thresholds;
  outputCategories: OutputCategory[];
}

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
  { id: 'beans', name: 'Beans to liquor', stations: ['roasting', 'winnowing', 'grinding', 'completion'], startMaterial: 'Raw beans', note: 'Each batch is one sack: it starts at the bag weight and is assigned to the supplier of its beans. Nibs split at winnowing: nibs for liquor are ground and the liquor is stored for chocolate; nibs for butter are stored for pressing; nibs for inclusion and sale leave production.' },
  { id: 'pressing', name: 'Nibs to butter and powder', stations: ['pressing', 'completion'], startMaterial: 'Nibs', note: 'Butter and powder together must equal the nibs pressed. Butter is stored for chocolate; powder is sold or discarded.' },
  { id: 'chocolate', name: 'Liquor to chocolate', stations: ['refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion'], startMaterial: 'Liquor + recipe additions', note: 'The liquor becomes chocolate: it goes into the refiner with the butter, sugar and milk powder from the recipe.' },
];

export const products: Product[] = [
  { id: 'P-BEANS', name: 'Cocoa beans', prefix: 'CB', route: 'beans' },
  { id: 'P-PRESS', name: 'Nib pressing', prefix: 'PB', route: 'pressing' },
  { id: 'P-WHITE', name: '34% White chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-WHITE' },
  { id: 'P-MILK', name: '40% Milk chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-MILK' },
  { id: 'P-50', name: '50% Dark milk chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-50' },
  { id: 'P-54', name: '54% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-54' },
  { id: 'P-56', name: '56% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-56' },
  { id: 'P-70', name: '70% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-70' },
  { id: 'P-85', name: '85% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-85' },
  { id: 'P-100', name: '100% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-100' },
];

/** The factory's recipe sheet ("Dark Chocolate types Changeover Recipes.xlsx", Regular recipes), as percent of the batch */
const factoryNote = 'Factory recipe sheet';
const factory = (id: string, name: string, productId: string, ingredients: [string, number][]): Recipe => ({
  id, name, productId, currentVersion: 1,
  versions: [{ version: 1, createdAt: at('2026-09-24', '09:00'), ingredients: ingredients.map(([ingredient, percent]) => ({ name: ingredient, percent })), note: factoryNote }],
});

export const recipes: Recipe[] = [
  factory('R-WHITE', '34% White chocolate', 'P-WHITE', [['Cocoa butter', 35], ['Sugar', 35], ['Milk powder', 30]]),
  factory('R-MILK', '40% Milk chocolate', 'P-MILK', [['Liquor', 11], ['Cocoa butter', 30], ['Sugar', 34], ['Milk powder', 25]]),
  factory('R-50', '50% Dark milk chocolate', 'P-50', [['Liquor', 25], ['Cocoa butter', 25], ['Sugar', 25], ['Milk powder', 25]]),
  factory('R-54', '54% Dark chocolate', 'P-54', [['Liquor', 44], ['Cocoa butter', 10], ['Sugar', 46]]),
  factory('R-56', '56% Dark chocolate', 'P-56', [['Liquor', 50], ['Cocoa butter', 10], ['Sugar', 40]]),
  factory('R-70', '70% Dark chocolate', 'P-70', [['Liquor', 60], ['Cocoa butter', 10], ['Sugar', 30]]),
  factory('R-85', '85% Dark chocolate', 'P-85', [['Liquor', 75], ['Cocoa butter', 10], ['Sugar', 15]]),
  factory('R-100', '100% Dark chocolate', 'P-100', [['Liquor', 90], ['Cocoa butter', 10]]),
];

export const suppliers: Supplier[] = [
  { id: 'S-KUAPA', name: 'Kuapa Kokoo', supplies: 'Cocoa beans', contact: 'orders@kuapa.example' },
  { id: 'S-HILLSIDE', name: 'Hillside Cocoa Growers', supplies: 'Cocoa beans', contact: 'sales@hillside.example' },
  { id: 'S-MZANSI', name: 'Mzansi Sugar', supplies: 'Sugar', contact: '+27 11 555 0142' },
  { id: 'S-GOLDEN', name: 'Golden Butter Co', supplies: 'Cocoa butter, lecithin, milk powder', contact: 'sales@goldenbutter.example' },
];

/** People named on the sample records. Sign-in accounts are created with `npm run init-db`. */
export const users: User[] = [
  { id: 'U-AM', name: 'Alex Morgan', role: 'Production manager', initials: 'AM', email: 'alex.morgan@cocoafactory.example' },
  { id: 'U-AB', name: 'Ama Boateng', role: 'Roasting operator', initials: 'AB', email: 'ama.boateng@cocoafactory.example' },
  { id: 'U-KM', name: 'Kwame Mensah', role: 'Chocolate maker', initials: 'KM', email: 'kwame.mensah@cocoafactory.example' },
  { id: 'U-LF', name: 'Lena Fischer', role: 'Packaging lead', initials: 'LF', email: 'lena.fischer@cocoafactory.example' },
  { id: 'U-SO', name: 'Sam Osei', role: 'Quality', initials: 'SO', email: 'sam.osei@cocoafactory.example' },
];

/** The sizes on the tempering summary */
export const packSizes: PackSize[] = [
  { id: 'PK-7', name: '7 g bar', grams: 7 },
  { id: 'PK-45', name: '45 g bar', grams: 45 },
  { id: 'PK-80', name: '80 g bar', grams: 80 },
  { id: 'PK-1000', name: '1 kg bar', grams: 1000 },
];

export const thresholds: Thresholds = {
  variancePct: {
    roasting: 8, winnowing: 2, grinding: 2, pressing: 0,
    refining: 1.5, conching: 2, tempering: 1.5, moulding: 2, packaging: 3, completion: 0,
  },
  wastePct: 5,
  lowStockKg: 50,
};

export const outputCategories: OutputCategory[] = stations.flatMap((s) => s.rows.map((row) => ({ ...row, station: s.id })));

const batches: Batch[] = [
  {
    id: 'CB-023', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-10', '07:30'), status: 'completed', nextStation: null, supplierId: 'S-KUAPA',
    startInput: { material: 'Raw beans', weight: 200, lotIds: ['BEAN-0905'] }, completedAt: at('2026-09-10', '16:40'),
    records: [
      record('roasting', 'Raw beans', 200, ['BEAN-0905'], [['Roasted beans', 'useful', 182.9, 'continue:winnowing'], ['Beans taken off', 'useful', 2, 'sale', 'RST-023'], ['Unusable beans sorted off', 'waste', 3.5, 'waste']], at('2026-09-10', '10:10'), 'U-AB'),
      record('winnowing', 'Roasted beans', 182.9, [], [['Crushed nibs for liquor', 'useful', 130.3, 'continue:grinding'], ['Crushed nibs for butter', 'useful', 18, 'stock', 'NIB-023'], ['Nibs for inclusion and sale', 'useful', 4, 'sale', 'NIB-023S'], ['Whole peeled beans', 'useful', 3.1, 'rework', 'REW-023'], ['Husks and rubbish', 'byproduct', 25.4, 'stock', 'HUSK-023']], at('2026-09-10', '12:30'), 'U-AB'),
      record('grinding', 'Crushed nibs for liquor', 130.3, [], [['Liquor', 'useful', 128.9, 'stock', 'LIQ-023'], ['Waste', 'waste', 1.1, 'waste']], at('2026-09-10', '16:00'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'CB-024', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-13', '07:20'), status: 'completed', nextStation: null, supplierId: 'S-KUAPA',
    startInput: { material: 'Raw beans', weight: 80, lotIds: ['BEAN-0905'] }, completedAt: at('2026-09-13', '15:10'),
    records: [
      record('roasting', 'Raw beans', 80, ['BEAN-0905'], [['Roasted beans', 'useful', 74, 'continue:winnowing'], ['Unusable beans sorted off', 'waste', 1.4, 'waste']], at('2026-09-13', '09:50'), 'U-AB'),
      record('winnowing', 'Roasted beans', 74, [], [['Crushed nibs for liquor', 'useful', 45, 'continue:grinding'], ['Crushed nibs for butter', 'useful', 12, 'stock', 'NIB-024'], ['Nibs for inclusion and sale', 'useful', 3, 'sale', 'NIB-024S'], ['Whole peeled beans', 'useful', 1.5, 'rework', 'REW-024'], ['Husks and rubbish', 'byproduct', 11.1, 'stock', 'HUSK-024']], at('2026-09-13', '11:40'), 'U-AB'),
      record('grinding', 'Crushed nibs for liquor', 45, [], [['Liquor', 'useful', 44.6, 'stock', 'LIQ-024'], ['Waste', 'waste', 0.3, 'waste']], at('2026-09-13', '14:45'), 'U-KM'),
    ],
    holds: [],
    corrections: [{ id: 'c-1', recordId: 'winnowing-2026-09-13T11:40:00', station: 'winnowing', output: 'Husks and rubbish', previous: 11.7, corrected: 11.1, reason: 'Tare weight of the husk bin was not subtracted.', correctedAt: at('2026-09-13', '12:05'), correctedBy: 'U-SO' }],
  },
  {
    id: 'CB-025', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-14', '07:15'), status: 'active', nextStation: 'winnowing', supplierId: 'S-HILLSIDE',
    startInput: { material: 'Raw beans', weight: 100, lotIds: ['BEAN-0912'] },
    records: [
      record('roasting', 'Raw beans', 100, ['BEAN-0912'], [['Roasted beans', 'useful', 92.4, 'continue:winnowing'], ['Unusable beans sorted off', 'waste', 2.1, 'waste']], at('2026-09-14', '09:40'), 'U-AB'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'PB-007', productId: 'P-PRESS', product: 'Nib pressing', route: 'pressing', startedAt: at('2026-09-11', '08:00'), status: 'completed', nextStation: null, supplierId: 'S-KUAPA',
    startInput: { material: 'Nibs', weight: 18, lotIds: ['NIB-023'] }, completedAt: at('2026-09-11', '10:10'),
    records: [
      record('pressing', 'Nibs', 18, ['NIB-023'], [['Cocoa butter', 'useful', 8.1, 'stock', 'BUT-007'], ['Powder', 'useful', 9.9, 'sale', 'PWD-007']], at('2026-09-11', '09:40'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'PB-008', productId: 'P-PRESS', product: 'Nib pressing', route: 'pressing', startedAt: at('2026-09-14', '08:00'), status: 'active', nextStation: 'pressing', supplierId: 'S-KUAPA',
    startInput: { material: 'Nibs', weight: 12, lotIds: ['NIB-024'] },
    records: [], holds: [], corrections: [],
  },
  {
    id: 'CH-017', productId: 'P-70', product: '70% Dark chocolate', route: 'chocolate', startedAt: at('2026-09-13', '08:30'), status: 'hold', nextStation: 'conching', supplierId: 'S-KUAPA',
    startInput: { material: 'Liquor + recipe additions', weight: 100, lotIds: ['LIQ-023', 'BUT-019', 'SUG-031'] },
    recipeId: 'R-70', recipeVersion: 1,
    ingredients: [
      { name: 'Liquor', expected: 60, actual: 60, lotId: 'LIQ-023' }, { name: 'Cocoa butter', expected: 10, actual: 10, lotId: 'BUT-019' },
      { name: 'Sugar', expected: 30, actual: 30, lotId: 'SUG-031' },
    ],
    records: [
      record('refining', 'Liquor + recipe additions', 100, ['LIQ-023', 'BUT-019', 'SUG-031'], [['Refined chocolate', 'useful', 95.2, 'continue:conching'], ['Machine residue', 'byproduct', 1, 'rework', 'REW-017'], ['Waste', 'waste', 0.5, 'waste']], at('2026-09-13', '13:10'), 'U-KM'),
    ],
    holds: [{ id: 'h-1', reason: 'Refining variance above limit. Waiting for quality check before conching.', placedAt: at('2026-09-13', '13:25'), placedBy: 'U-SO', station: 'conching' }],
    corrections: [],
  },
  {
    id: 'CH-018', productId: 'P-70', product: '70% Dark chocolate', route: 'chocolate', startedAt: at('2026-09-14', '06:50'), status: 'active', nextStation: 'moulding', supplierId: 'S-KUAPA',
    startInput: { material: 'Liquor + recipe additions', weight: 100.1, lotIds: ['LIQ-023', 'BUT-019', 'SUG-031'] },
    recipeId: 'R-70', recipeVersion: 1,
    ingredients: [
      { name: 'Liquor', expected: 60, actual: 60.1, lotId: 'LIQ-023' }, { name: 'Cocoa butter', expected: 10, actual: 9.9, lotId: 'BUT-019' },
      { name: 'Sugar', expected: 30, actual: 30.1, lotId: 'SUG-031' },
    ],
    records: [
      record('refining', 'Liquor + recipe additions', 100.1, ['LIQ-023', 'BUT-019', 'SUG-031'], [['Refined chocolate', 'useful', 98.6, 'continue:conching'], ['Machine residue', 'byproduct', 0.5, 'rework', 'REW-018'], ['Waste', 'waste', 0.3, 'waste']], at('2026-09-14', '09:15'), 'U-KM'),
      record('conching', 'Refined chocolate', 98.6, [], [['Conched chocolate', 'useful', 97.9, 'continue:tempering'], ['Machine residue', 'byproduct', 0.4, 'waste'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-14', '11:05'), 'U-KM'),
      record('tempering', 'Conched chocolate', 97.9, [], [['Tempered chocolate', 'useful', 96.8, 'continue:moulding'], ['Machine residue', 'byproduct', 0.6, 'waste'], ['Waste', 'waste', 0.2, 'waste']], at('2026-09-14', '12:10'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
];

const lots: Lot[] = [
  { id: 'BEAN-0905', material: 'Cocoa beans', category: 'Raw material', received: 400, available: 120, unit: 'kg', source: { type: 'supplier', supplierId: 'S-KUAPA', reference: 'DN-2211' }, receivedAt: at('2026-09-05', '10:00'), uses: [{ batchId: 'CB-023', quantity: 200, station: 'roasting', at: at('2026-09-10', '07:30') }, { batchId: 'CB-024', quantity: 80, station: 'roasting', at: at('2026-09-13', '07:20') }] },
  { id: 'BEAN-0912', material: 'Cocoa beans', category: 'Raw material', received: 300, available: 200, unit: 'kg', source: { type: 'supplier', supplierId: 'S-HILLSIDE', reference: 'DN-2238' }, receivedAt: at('2026-09-12', '09:15'), uses: [{ batchId: 'CB-025', quantity: 100, station: 'roasting', at: at('2026-09-14', '07:15') }] },
  { id: 'SUG-031', material: 'Sugar', category: 'Raw material', received: 500, available: 439.9, unit: 'kg', source: { type: 'supplier', supplierId: 'S-MZANSI', reference: 'INV-88120' }, receivedAt: at('2026-09-01', '13:00'), uses: [{ batchId: 'CH-017', quantity: 30, station: 'refining', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 30.1, station: 'refining', at: at('2026-09-14', '06:50') }] },
  { id: 'BUT-019', material: 'Cocoa butter', category: 'Raw material', received: 80, available: 60.1, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4471' }, receivedAt: at('2026-08-28', '11:20'), uses: [{ batchId: 'CH-017', quantity: 10, station: 'refining', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 9.9, station: 'refining', at: at('2026-09-14', '06:50') }] },
  { id: 'LEC-004', material: 'Lecithin', category: 'Raw material', received: 10, available: 10, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4471' }, receivedAt: at('2026-08-28', '11:20'), uses: [] },
  { id: 'MLK-002', material: 'Milk powder', category: 'Raw material', received: 60, available: 38, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4390' }, receivedAt: at('2026-08-14', '10:00'), uses: [] },
  { id: 'LIQ-023', material: 'Liquor', category: 'Intermediate', received: 128.9, available: 8.8, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'grinding' }, receivedAt: at('2026-09-10', '16:00'), uses: [{ batchId: 'CH-017', quantity: 60, station: 'refining', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 60.1, station: 'refining', at: at('2026-09-14', '06:50') }] },
  { id: 'LIQ-024', material: 'Liquor', category: 'Intermediate', received: 44.6, available: 44.6, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'grinding' }, receivedAt: at('2026-09-13', '14:45'), uses: [] },
  { id: 'RST-023', material: 'Beans taken off', category: 'Finished goods', received: 2, available: 2, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'roasting' }, receivedAt: at('2026-09-10', '10:10'), uses: [] },
  { id: 'NIB-023', material: 'Crushed nibs for butter', category: 'Intermediate', received: 18, available: 0, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [{ batchId: 'PB-007', quantity: 18, station: 'pressing', at: at('2026-09-11', '08:00') }] },
  { id: 'NIB-023S', material: 'Nibs for inclusion and sale', category: 'Finished goods', received: 4, available: 4, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'NIB-024', material: 'Crushed nibs for butter', category: 'Intermediate', received: 12, available: 0, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [{ batchId: 'PB-008', quantity: 12, station: 'pressing', at: at('2026-09-14', '08:00') }] },
  { id: 'NIB-024S', material: 'Nibs for inclusion and sale', category: 'Finished goods', received: 3, available: 3, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'BUT-007', material: 'Cocoa butter', category: 'Intermediate', received: 8.1, available: 8.1, unit: 'kg', source: { type: 'batch', batchId: 'PB-007', station: 'pressing' }, receivedAt: at('2026-09-11', '09:40'), uses: [] },
  { id: 'PWD-007', material: 'Powder', category: 'Finished goods', received: 9.9, available: 9.9, unit: 'kg', source: { type: 'batch', batchId: 'PB-007', station: 'pressing' }, receivedAt: at('2026-09-11', '09:40'), uses: [] },
  { id: 'HUSK-023', material: 'Husks and rubbish', category: 'By-product', received: 25.4, available: 25.4, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'HUSK-024', material: 'Husks and rubbish', category: 'By-product', received: 11.1, available: 11.1, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'REW-023', material: 'Whole peeled beans', category: 'Rework', received: 3.1, available: 3.1, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'REW-024', material: 'Whole peeled beans', category: 'Rework', received: 1.5, available: 1.5, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'REW-017', material: 'Machine residue', category: 'Rework', received: 1, available: 1, unit: 'kg', source: { type: 'batch', batchId: 'CH-017', station: 'refining' }, receivedAt: at('2026-09-13', '13:10'), uses: [] },
  { id: 'REW-018', material: 'Machine residue', category: 'Rework', received: 0.5, available: 0.5, unit: 'kg', source: { type: 'batch', batchId: 'CH-018', station: 'refining' }, receivedAt: at('2026-09-14', '09:15'), uses: [] },
];

export function seedState(): State {
  return structuredClone({
    batches, lots, recipes, products, routes, packSizes, suppliers, users,
    currentUserId: 'U-AM', thresholds, outputCategories,
  });
}
