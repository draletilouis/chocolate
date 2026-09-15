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

// The first-use dataset intentionally contains no transactional history. Operators receive
// real material and start real batches from this point onward; setup rows and paper labels remain seeded.
const batches: Batch[] = [];
const lots: Lot[] = [];

export function seedState(): State {
  return structuredClone({
    batches, lots, recipes, products, routes, packSizes, suppliers, users,
    currentUserId: 'U-AM', thresholds, outputCategories, paperCatalog,
  });
}
