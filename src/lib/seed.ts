import { stations } from './stations';
import type {
  Batch, Destination, Lot, OutputCategory, OutputKind, PackSize, Product, Recipe, RecordedOutput, Route,
  PaperCatalog, StationId, StationRecord, Supplier, Thresholds, User,
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
  paperCatalog: PaperCatalog;
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
  { id: 'beans', name: 'Beans to liquor', stations: ['receiving', 'roasting', 'winnowing', 'grinding', 'completion'], startMaterial: 'Cocoa beans delivered', note: 'Liquor from grinding can continue to pressing or mixing, or be stored.' },
  { id: 'pressing', name: 'Liquor to butter and cake', stations: ['pressing', 'completion'], startMaterial: 'Cocoa liquor', note: 'Butter and cake are recorded separately and go to their own destinations.' },
  { id: 'chocolate', name: 'Chocolate making', stations: ['mixing', 'refining', 'conching', 'tempering', 'moulding', 'packaging', 'completion'], startMaterial: 'Recipe ingredients', note: 'Starts from a recipe version; actual ingredient weights are recorded at mixing.' },
];

export const products: Product[] = [
  { id: 'P-BEANS', name: 'Cocoa beans', prefix: 'CB', route: 'beans' },
  { id: 'P-LIQUOR', name: 'Cocoa liquor (pressing)', prefix: 'CL', route: 'pressing' },
  { id: 'P-34', name: '34% White chocolate', prefix: 'CH', route: 'chocolate', catalogOnly: true },
  { id: 'P-70', name: '70% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-70' },
  { id: 'P-85', name: '85% Dark chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-85' },
  { id: 'P-MILK', name: '40% Milk chocolate', prefix: 'CH', route: 'chocolate', recipeId: 'R-MILK' },
  { id: 'P-50', name: '50% Dark Milk chocolate', prefix: 'CH', route: 'chocolate', catalogOnly: true },
  { id: 'P-56', name: '56% Dark chocolate', prefix: 'CH', route: 'chocolate', catalogOnly: true },
  { id: 'P-100', name: '100% Dark chocolate', prefix: 'CH', route: 'chocolate', catalogOnly: true },
];

export const recipes: Recipe[] = [
  {
    id: 'R-70', name: '70% Dark chocolate', productId: 'P-70', currentVersion: 3,
    versions: [
      { version: 1, createdAt: at('2026-03-02', '09:00'), ingredients: [{ name: 'Liquor', percent: 60 }, { name: 'Cocoa butter', percent: 10 }, { name: 'Sugar', percent: 29.5 }, { name: 'Lecithin', percent: 0.5 }], note: 'Original recipe.' },
      { version: 2, createdAt: at('2026-05-18', '14:20'), ingredients: [{ name: 'Liquor', percent: 61 }, { name: 'Cocoa butter', percent: 9 }, { name: 'Sugar', percent: 29.6 }, { name: 'Lecithin', percent: 0.4 }], note: 'Less butter for a firmer snap.' },
      { version: 3, createdAt: at('2026-08-01', '10:05'), ingredients: [{ name: 'Liquor', percent: 62 }, { name: 'Cocoa butter', percent: 8 }, { name: 'Sugar', percent: 29.7 }, { name: 'Lecithin', percent: 0.3 }], note: 'Current recipe.' },
    ],
  },
  {
    id: 'R-85', name: '85% Dark chocolate', productId: 'P-85', currentVersion: 1,
    versions: [{ version: 1, createdAt: at('2026-04-11', '11:30'), ingredients: [{ name: 'Liquor', percent: 78 }, { name: 'Cocoa butter', percent: 7 }, { name: 'Sugar', percent: 14.7 }, { name: 'Lecithin', percent: 0.3 }] }],
  },
  {
    id: 'R-MILK', name: '40% Milk chocolate', productId: 'P-MILK', currentVersion: 1,
    versions: [{ version: 1, createdAt: at('2026-06-22', '08:45'), ingredients: [{ name: 'Liquor', percent: 25 }, { name: 'Cocoa butter', percent: 15 }, { name: 'Sugar', percent: 40 }, { name: 'Milk powder', percent: 19.6 }, { name: 'Lecithin', percent: 0.4 }] }],
  },
];

export const suppliers: Supplier[] = [
  { id: 'S-KUAPA', name: 'Kuapa Kokoo', supplies: 'Cocoa beans', contact: 'orders@kuapa.example' },
  { id: 'S-MZANSI', name: 'Mzansi Sugar', supplies: 'Sugar', contact: '+27 11 555 0142' },
  { id: 'S-GOLDEN', name: 'Golden Butter Co', supplies: 'Cocoa butter, lecithin, milk powder', contact: 'sales@goldenbutter.example' },
];

/** Demo accounts. Every sample user signs in with the password "cocoa123". */
export const users: User[] = [
  { id: 'U-AM', name: 'Alex Morgan', role: 'Production manager', initials: 'AM', email: 'alex.morgan@cocoafactory.example', password: 'cocoa123' },
  { id: 'U-AB', name: 'Ama Boateng', role: 'Roasting operator', initials: 'AB', email: 'ama.boateng@cocoafactory.example', password: 'cocoa123' },
  { id: 'U-KM', name: 'Kwame Mensah', role: 'Chocolate maker', initials: 'KM', email: 'kwame.mensah@cocoafactory.example', password: 'cocoa123' },
  { id: 'U-LF', name: 'Lena Fischer', role: 'Packaging lead', initials: 'LF', email: 'lena.fischer@cocoafactory.example', password: 'cocoa123' },
  { id: 'U-SO', name: 'Sam Osei', role: 'Quality', initials: 'SO', email: 'sam.osei@cocoafactory.example', password: 'cocoa123' },
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
    receiving: 1, roasting: 8, winnowing: 2, grinding: 2, pressing: 2,
    mixing: 1.5, refining: 1.5, conching: 2, tempering: 1.5, moulding: 2, packaging: 3, completion: 0,
  },
  wastePct: 5,
  lowStockKg: 50,
};

export const outputCategories: OutputCategory[] = stations.flatMap((s) => s.rows.map((row) => ({ ...row, station: s.id })));

export const paperCatalog: PaperCatalog = {
  source: 'Printed row labels transcribed from the supplied Tempering, Production, Bean and stock/usage summary photographs.',
  chocolateStrengths: ['34% White', '40% Milk', '50% Dark Milk', '56% Dark', '70% Dark', '85% Dark', '100% Dark'],
  productionSummary: {
    usage: ['Liquor usage', 'Butter usage production', 'Butter usage for Silk', 'Sugar usage', 'Milk Powder usage'],
    productOutput: ['34% White on', '40% Milk on', '50% Dark Milk on', '56% Dark on', '70% Dark on', '85% Dark on', '100% Dark on'],
    specialOutput: ['Marzipan made', 'Any other (1)', 'Any other (2)', 'Any other (3)'],
  },
  beanSummary: {
    inputAndSorting: ['Date', 'Supplier', 'Bag weight', 'Weight after roasting', 'Unusable Beans sorted off', 'Husks and Rubbish'],
    usage: ['Crushed nibs for liquor', 'Crushed nibs for butter', 'Crushed nibs for other', 'Nibs for inclusion and sale', 'Whole peeled beans', 'Yield of total usage from bag', 'Yield of winnower'],
    derivatives: ['Liquor produced from this sack', 'Butter produced from this sack', 'Powder produced from this sack', 'Butter yield from nibs pressed'],
  },
  temperingSummary: {
    products: ['34%', '40%', '50%', '56%', '70%', '85%', '100%', 'Other (1)', 'Other (2)', 'Other (3)', 'Silk Butter', 'Plain truffle', 'Whisky truffle'],
    columns: [{ label: '7 g', unit: 'pc' }, { label: '45 g', unit: 'pc' }, { label: '1 kg', unit: 'pc' }, { label: 'Total', unit: 'kg' }],
  },
  readyProducts: [
    { section: '7 g bars', items: ['7g Bars 34%', '7g Bars 40%', '7g Bars 50%', '7g Bars 70%', '7g Bars 85%', '7g Bars 100%'] },
    { section: '45 g budget bars', items: ['45g Budget Bars 34%', '45g Budget Bars 40%', '45g Budget Bars 70%', '45g Budget Bars 85%'] },
    { section: '45 g premium bars', items: ['45g Premium Bars 34%', '45g Premium Bars 40%', '45g Premium Bars 50%', '45g Premium Bars 70%', '45g Premium Bars 85%', '45g Premium Bars 100%'] },
    { section: '80 g premium bars', items: ['80g Premium Bars 34%', '80g Premium Bars 40%', '80g Premium Bars 50%', '80g Premium Bars 70%', '80g Premium Bars 85%', '80g Premium Bars 100%'] },
    { section: '1 kg bars', items: ['1kg Bars 34%', '1kg Bars 40%', '1kg Bars 50%', '1kg Bars 56%', '1kg Bars 70%', '1kg Bars 85%', '1kg Bars 100%'] },
    { section: 'Cocoa and nib products', items: ['Cocoa Powder 200g sachets', 'Cocoa Powder 1kg packs', 'Cocoa Powder Ungraded kg', 'Whole Roasted Beans 200g sachets', 'Whole Roasted Beans 1kg packs', 'Crushed Nibs 200g sachets', 'Crushed Nibs 1kg packs', 'Coated Nibs 200g', 'Coated Nibs kg', 'Whisky Truffles', 'Plain Truffles'] },
    { section: 'Packaging production items', items: ['Kaveera rolls for 1kg bars', 'Glue Sticks', 'Aluminium Foil rolls', 'A4 sticker paper', 'Rubber Bands', 'Disposable Gloves', 'Hair Nets', 'Black Delivery Bags', 'Mini 8 Boxes', 'Taste Uganda Box', 'Gift 6x45 box', 'Gift 3x45 box', 'Black Boxes 45g/7g', 'Black Boxes 80g', 'Sachets 200g'] },
  ],
  weeklyUsage: ['Raw Beans', 'Roasted Beans', 'Nibs', 'Whole Roasted Peeled Beans', 'Liquor', 'Clear Butter', 'Brown Butter', 'Ungrounded Cocoa Powder', 'Milk Powder', 'Sugar', 'Lecithin', 'Machine 34%', 'Machine 40%', 'Machine 56%', 'Machine 70%', 'Machine 85%', 'Machine 100%', 'Warmer 34%', 'Warmer 40%', 'Warmer 56%', 'Warmer 70%', 'Warmer 85%', 'Warmer 100%'],
};

const batches: Batch[] = [
  {
    id: 'CB-023', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-10', '07:30'), status: 'completed', nextStation: null,
    startInput: { material: 'Cocoa beans delivered', weight: 200, lotIds: ['BEAN-0905'] }, completedAt: at('2026-09-10', '16:40'),
    records: [
      record('receiving', 'Cocoa beans delivered', 200, ['BEAN-0905'], [['Accepted beans', 'useful', 197.6, 'continue:roasting'], ['Rejected beans', 'waste', 2.1, 'waste']], at('2026-09-10', '07:45'), 'U-AB'),
      record('roasting', 'Accepted beans', 197.6, [], [['Roasted beans', 'useful', 184.9, 'continue:winnowing'], ['Unusable beans', 'waste', 1.4, 'waste']], at('2026-09-10', '10:10'), 'U-AB'),
      record('winnowing', 'Roasted beans', 184.9, [], [['Nibs', 'useful', 152.3, 'continue:grinding'], ['Whole peeled beans', 'useful', 3.1, 'rework', 'REW-023'], ['Husks', 'byproduct', 27.4, 'stock', 'HUSK-023'], ['Unusable beans', 'waste', 1.6, 'waste']], at('2026-09-10', '12:30'), 'U-AB'),
      record('grinding', 'Nibs', 152.3, [], [['Liquor', 'useful', 150, 'stock', 'LIQ-023'], ['Waste', 'waste', 1.9, 'waste']], at('2026-09-10', '16:00'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'CB-024', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-13', '07:20'), status: 'completed', nextStation: null,
    startInput: { material: 'Cocoa beans delivered', weight: 80, lotIds: ['BEAN-0905'] }, completedAt: at('2026-09-13', '15:10'),
    records: [
      record('receiving', 'Cocoa beans delivered', 80, ['BEAN-0905'], [['Accepted beans', 'useful', 79, 'continue:roasting'], ['Rejected beans', 'waste', 0.8, 'waste']], at('2026-09-13', '07:35'), 'U-AB'),
      record('roasting', 'Accepted beans', 79, [], [['Roasted beans', 'useful', 74, 'continue:winnowing'], ['Unusable beans', 'waste', 0.6, 'waste']], at('2026-09-13', '09:50'), 'U-AB'),
      record('winnowing', 'Roasted beans', 74, [], [['Nibs', 'useful', 60, 'continue:grinding'], ['Whole peeled beans', 'useful', 1.5, 'rework', 'REW-024'], ['Husks', 'byproduct', 11.1, 'stock', 'HUSK-024'], ['Unusable beans', 'waste', 0.9, 'waste']], at('2026-09-13', '11:40'), 'U-AB'),
      record('grinding', 'Nibs', 60, [], [['Liquor', 'useful', 59.4, 'stock', 'LIQ-024'], ['Waste', 'waste', 0.3, 'waste']], at('2026-09-13', '14:45'), 'U-KM'),
    ],
    holds: [],
    corrections: [{ id: 'c-1', recordId: 'winnowing-2026-09-13T11:40:00', station: 'winnowing', output: 'Husks', previous: 11.7, corrected: 11.1, reason: 'Tare weight of the husk bin was not subtracted.', correctedAt: at('2026-09-13', '12:05'), correctedBy: 'U-SO' }],
  },
  {
    id: 'CB-025', productId: 'P-BEANS', product: 'Cocoa beans', route: 'beans', startedAt: at('2026-09-14', '07:15'), status: 'active', nextStation: 'winnowing',
    startInput: { material: 'Cocoa beans delivered', weight: 100, lotIds: ['BEAN-0912'] },
    records: [
      record('receiving', 'Cocoa beans delivered', 100, ['BEAN-0912'], [['Accepted beans', 'useful', 98.6, 'continue:roasting'], ['Rejected beans', 'waste', 1.2, 'waste']], at('2026-09-14', '07:30'), 'U-AB'),
      record('roasting', 'Accepted beans', 98.6, [], [['Roasted beans', 'useful', 92.4, 'continue:winnowing'], ['Unusable beans', 'waste', 0.9, 'waste']], at('2026-09-14', '09:40'), 'U-AB'),
    ],
    holds: [], corrections: [],
  },
  {
    id: 'CL-007', productId: 'P-LIQUOR', product: 'Cocoa liquor (pressing)', route: 'pressing', startedAt: at('2026-09-14', '08:00'), status: 'active', nextStation: 'pressing',
    startInput: { material: 'Cocoa liquor', weight: 40, lotIds: ['LIQ-024'] },
    records: [], holds: [], corrections: [],
  },
  {
    id: 'CH-017', productId: 'P-70', product: '70% Dark chocolate', route: 'chocolate', startedAt: at('2026-09-13', '08:30'), status: 'hold', nextStation: 'conching',
    startInput: { material: 'Recipe ingredients', weight: 100, lotIds: ['LIQ-023', 'BUT-019', 'SUG-031', 'LEC-004'] },
    recipeId: 'R-70', recipeVersion: 3,
    ingredients: [
      { name: 'Liquor', expected: 62, actual: 62, lotId: 'LIQ-023' }, { name: 'Cocoa butter', expected: 8, actual: 8, lotId: 'BUT-019' },
      { name: 'Sugar', expected: 29.7, actual: 29.7, lotId: 'SUG-031' }, { name: 'Lecithin', expected: 0.3, actual: 0.3, lotId: 'LEC-004' },
    ],
    records: [
      record('mixing', 'Liquor + butter + sugar', 100, ['LIQ-023', 'BUT-019', 'SUG-031', 'LEC-004'], [['Chocolate mix', 'useful', 99.1, 'continue:refining'], ['Machine residue', 'byproduct', 0.6, 'rework', 'REW-017'], ['Waste', 'waste', 0.2, 'waste']], at('2026-09-13', '09:20'), 'U-KM'),
      record('refining', 'Chocolate mix', 99.1, [], [['Refined chocolate', 'useful', 95.2, 'continue:conching'], ['Machine residue', 'byproduct', 0.4, 'rework', 'REW-017B'], ['Waste', 'waste', 0.3, 'waste']], at('2026-09-13', '13:10'), 'U-KM'),
    ],
    holds: [{ id: 'h-1', reason: 'Refining variance above limit. Waiting for quality check before conching.', placedAt: at('2026-09-13', '13:25'), placedBy: 'U-SO', station: 'conching' }],
    corrections: [],
  },
  {
    id: 'CH-018', productId: 'P-70', product: '70% Dark chocolate', route: 'chocolate', startedAt: at('2026-09-14', '06:50'), status: 'active', nextStation: 'moulding',
    startInput: { material: 'Recipe ingredients', weight: 100.1, lotIds: ['LIQ-023', 'BUT-019', 'SUG-031', 'LEC-004'] },
    recipeId: 'R-70', recipeVersion: 3,
    ingredients: [
      { name: 'Liquor', expected: 62, actual: 62.1, lotId: 'LIQ-023' }, { name: 'Cocoa butter', expected: 8, actual: 7.9, lotId: 'BUT-019' },
      { name: 'Sugar', expected: 29.7, actual: 29.8, lotId: 'SUG-031' }, { name: 'Lecithin', expected: 0.3, actual: 0.3, lotId: 'LEC-004' },
    ],
    records: [
      record('mixing', 'Liquor + butter + sugar', 100.1, ['LIQ-023', 'BUT-019', 'SUG-031', 'LEC-004'], [['Chocolate mix', 'useful', 99.2, 'continue:refining'], ['Machine residue', 'byproduct', 0.5, 'rework', 'REW-018'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-14', '07:40'), 'U-KM'),
      record('refining', 'Chocolate mix', 99.2, [], [['Refined chocolate', 'useful', 98.6, 'continue:conching'], ['Machine residue', 'byproduct', 0.3, 'waste'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-14', '09:15'), 'U-KM'),
      record('conching', 'Refined chocolate', 98.6, [], [['Conched chocolate', 'useful', 97.9, 'continue:tempering'], ['Machine residue', 'byproduct', 0.4, 'waste'], ['Waste', 'waste', 0.1, 'waste']], at('2026-09-14', '11:05'), 'U-KM'),
      record('tempering', 'Conched chocolate', 97.9, [], [['Tempered chocolate', 'useful', 96.8, 'continue:moulding'], ['Machine residue', 'byproduct', 0.6, 'waste'], ['Waste', 'waste', 0.2, 'waste']], at('2026-09-14', '12:10'), 'U-KM'),
    ],
    holds: [], corrections: [],
  },
];

const lots: Lot[] = [
  { id: 'BEAN-0905', material: 'Cocoa beans', category: 'Raw material', received: 400, available: 120, unit: 'kg', source: { type: 'supplier', supplierId: 'S-KUAPA', reference: 'DN-2211' }, receivedAt: at('2026-09-05', '10:00'), uses: [{ batchId: 'CB-023', quantity: 200, station: 'receiving', at: at('2026-09-10', '07:30') }, { batchId: 'CB-024', quantity: 80, station: 'receiving', at: at('2026-09-13', '07:20') }] },
  { id: 'BEAN-0912', material: 'Cocoa beans', category: 'Raw material', received: 300, available: 200, unit: 'kg', source: { type: 'supplier', supplierId: 'S-KUAPA', reference: 'DN-2238' }, receivedAt: at('2026-09-12', '09:15'), uses: [{ batchId: 'CB-025', quantity: 100, station: 'receiving', at: at('2026-09-14', '07:15') }] },
  { id: 'SUG-031', material: 'Sugar', category: 'Raw material', received: 500, available: 440.5, unit: 'kg', source: { type: 'supplier', supplierId: 'S-MZANSI', reference: 'INV-88120' }, receivedAt: at('2026-09-01', '13:00'), uses: [{ batchId: 'CH-017', quantity: 29.7, station: 'mixing', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 29.8, station: 'mixing', at: at('2026-09-14', '06:50') }] },
  { id: 'BUT-019', material: 'Cocoa butter', category: 'Raw material', received: 80, available: 64.1, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4471' }, receivedAt: at('2026-08-28', '11:20'), uses: [{ batchId: 'CH-017', quantity: 8, station: 'mixing', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 7.9, station: 'mixing', at: at('2026-09-14', '06:50') }] },
  { id: 'LEC-004', material: 'Lecithin', category: 'Raw material', received: 10, available: 9.4, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4471' }, receivedAt: at('2026-08-28', '11:20'), uses: [{ batchId: 'CH-017', quantity: 0.3, station: 'mixing', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 0.3, station: 'mixing', at: at('2026-09-14', '06:50') }] },
  { id: 'MLK-002', material: 'Milk powder', category: 'Raw material', received: 60, available: 38, unit: 'kg', source: { type: 'supplier', supplierId: 'S-GOLDEN', reference: 'GB-4390' }, receivedAt: at('2026-08-14', '10:00'), uses: [] },
  { id: 'LIQ-023', material: 'Liquor', category: 'Intermediate', received: 150, available: 25.9, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'grinding' }, receivedAt: at('2026-09-10', '16:00'), uses: [{ batchId: 'CH-017', quantity: 62, station: 'mixing', at: at('2026-09-13', '08:30') }, { batchId: 'CH-018', quantity: 62.1, station: 'mixing', at: at('2026-09-14', '06:50') }] },
  { id: 'LIQ-024', material: 'Liquor', category: 'Intermediate', received: 59.4, available: 19.4, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'grinding' }, receivedAt: at('2026-09-13', '14:45'), uses: [{ batchId: 'CL-007', quantity: 40, station: 'pressing', at: at('2026-09-14', '08:00') }] },
  { id: 'HUSK-023', material: 'Husks', category: 'By-product', received: 27.4, available: 27.4, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'HUSK-024', material: 'Husks', category: 'By-product', received: 11.1, available: 11.1, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'REW-023', material: 'Whole peeled beans', category: 'Rework', received: 3.1, available: 3.1, unit: 'kg', source: { type: 'batch', batchId: 'CB-023', station: 'winnowing' }, receivedAt: at('2026-09-10', '12:30'), uses: [] },
  { id: 'REW-024', material: 'Whole peeled beans', category: 'Rework', received: 1.5, available: 1.5, unit: 'kg', source: { type: 'batch', batchId: 'CB-024', station: 'winnowing' }, receivedAt: at('2026-09-13', '11:40'), uses: [] },
  { id: 'REW-017', material: 'Machine residue', category: 'Rework', received: 0.6, available: 0.6, unit: 'kg', source: { type: 'batch', batchId: 'CH-017', station: 'mixing' }, receivedAt: at('2026-09-13', '09:20'), uses: [] },
  { id: 'REW-017B', material: 'Machine residue', category: 'Rework', received: 0.4, available: 0.4, unit: 'kg', source: { type: 'batch', batchId: 'CH-017', station: 'refining' }, receivedAt: at('2026-09-13', '13:10'), uses: [] },
  { id: 'REW-018', material: 'Machine residue', category: 'Rework', received: 0.5, available: 0.5, unit: 'kg', source: { type: 'batch', batchId: 'CH-018', station: 'mixing' }, receivedAt: at('2026-09-14', '07:40'), uses: [] },
];

export function seedState(): State {
  return structuredClone({
    batches, lots, recipes, products, routes, packSizes, suppliers, users,
    currentUserId: 'U-AM', thresholds, outputCategories, paperCatalog,
  });
}
