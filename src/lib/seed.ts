import { stations } from './stations';
import type {
  Batch, Container, Customer, Dispatch, IdCounters, Lot, Mixer, ProductionPlan, OutputCategory, PackSize, Product, Recipe, Route, Supplier, Thresholds, User, BusinessDetails,
} from './types';

export interface State {
  batches: Batch[];
  lots: Lot[];
  recipes: Recipe[];
  products: Product[];
  routes: Route[];
  packSizes: PackSize[];
  suppliers: Supplier[];
  /** Who the factory sells or sends goods to */
  customers: Customer[];
  /** Goods that left the factory, one dispatch note each */
  dispatches: Dispatch[];
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

/** At least two for every material bought: cocoa beans, sugar, cocoa butter, milk powder, lecithin and liquor */
export const suppliers: Supplier[] = [
  { id: 'S-KUAPA', name: 'Kuapa Kokoo', supplies: 'Cocoa beans', contact: 'orders@kuapa.example' },
  { id: 'S-BUNDIBUGYO', name: 'Bundibugyo Cocoa Growers', supplies: 'Cocoa beans', contact: 'sales@bundibugyo-cocoa.example' },
  { id: 'S-SEMULIKI', name: 'Semuliki Cocoa Cooperative', supplies: 'Cocoa beans, liquor', contact: 'office@semuliki-coop.example' },
  { id: 'S-MZANSI', name: 'Mzansi Sugar', supplies: 'Sugar', contact: '+27 11 555 0142' },
  { id: 'S-LAKESIDE', name: 'Lakeside Sugar Works', supplies: 'Sugar', contact: 'depot@lakeside-sugar.example' },
  { id: 'S-GOLDEN', name: 'Golden Butter Co', supplies: 'Cocoa butter, lecithin, milk powder', contact: 'sales@goldenbutter.example' },
  { id: 'S-EQUATOR', name: 'Equator Cocoa Processors', supplies: 'Cocoa butter, liquor', contact: 'trade@equatorcocoa.example' },
  { id: 'S-RWENZORI', name: 'Rwenzori Highland Dairies', supplies: 'Milk powder', contact: 'orders@rwenzori-dairies.example' },
  { id: 'S-NILE', name: 'Nile Food Ingredients', supplies: 'Lecithin', contact: 'info@nile-ingredients.example' },
];

/** The demo's customers: shops, a hotel, a bakery, a distributor and the factory's own shop */
export const customers: Customer[] = [
  { id: 'C-FRESHMART', name: 'FreshMart Supermarkets', address: 'Central warehouse, Kampala', contact: 'buying@freshmart.example' },
  { id: 'C-LAKEVIEW', name: 'Lakeview Hotel', address: 'Entebbe', contact: 'stores@lakeviewhotel.example' },
  { id: 'C-CAPITAL', name: 'Capital Foods Distributors', address: 'Industrial Area, Kampala', contact: 'orders@capitalfoods.example' },
  { id: 'C-GOLDENCRUST', name: 'Golden Crust Bakery', address: 'Jinja', contact: 'kitchen@goldencrust.example' },
  { id: 'C-SKYLINE', name: 'Skyline Duty Free', address: 'Entebbe International Airport', contact: 'supply@skylinedutyfree.example' },
  { id: 'C-SHOP', name: 'Factory shop', address: 'At the factory', contact: '' },
];

/** Demo accounts, only created in demo mode. Every one signs in with the password "cocoa123" or the PIN "1234". */
export const users: User[] = [
  { id: 'U-AM', name: 'Alex Morgan', role: 'Production manager', initials: 'AM', email: 'alex.morgan@cocoafactory.example', access: 'manager', stations: [] },
  { id: 'U-AB', name: 'Ama Boateng', role: 'Bean processing operator', initials: 'AB', email: 'ama.boateng@cocoafactory.example', access: 'operator', stations: ['receiving', 'sorting', 'roasting', 'winnowing'] },
  { id: 'U-KM', name: 'Kwame Mensah', role: 'Butter, liquor & chocolate maker', initials: 'KM', email: 'kwame.mensah@cocoafactory.example', access: 'operator', stations: ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing', 'grinding', 'mixing'] },
  { id: 'U-LF', name: 'Lena Fischer', role: 'Packaging lead', initials: 'LF', email: 'lena.fischer@cocoafactory.example', access: 'operator', stations: ['packaging', 'completion'] },
  { id: 'U-SO', name: 'Sam Osei', role: 'Quality', initials: 'SO', email: 'sam.osei@cocoafactory.example', access: 'manager', stations: [] },
  { id: 'U-GN', name: 'Grace Namutebi', role: 'Bean processing operator', initials: 'GN', email: 'grace.namutebi@cocoafactory.example', access: 'operator', stations: ['receiving', 'sorting', 'roasting', 'winnowing'] },
  { id: 'U-BO', name: 'Brian Okello', role: 'Butter & powder operator', initials: 'BO', email: 'brian.okello@cocoafactory.example', access: 'operator', stations: ['pressing', 'sieving', 'filtering', 'powder-roasting', 'powder-crushing'] },
  { id: 'U-JA', name: 'Joan Achieng', role: 'Pieces & packing', initials: 'JA', email: 'joan.achieng@cocoafactory.example', access: 'operator', stations: ['packaging', 'completion'] },
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

const business: BusinessDetails = {
  name: 'Chocolate Factory',
  address: 'Kampala, Uganda',
  phone: '+256 700 000 000',
  email: 'production@cocoafactory.example',
};

/**
 * The line configuration with the demo's staff, suppliers and contact details, and no records yet. The demo's
 * weeks of production are made on top of it by demoState() in src/server/demo.ts.
 */
export function seedState(): State {
  return structuredClone({
    batches: [], lots: [], recipes, products, routes, packSizes, suppliers, customers, dispatches: [], users,
    thresholds, outputCategories, business, containers, idleMinutes: 10, workflowVersion: WORKFLOW_VERSION,
    idCounters: { batches: {}, lots: {} },
    mixer: { holds: null, lastRunId: null },
    mixerKeepsKg: 10,
    plan: null,
  });
}

/** A real factory's first start: the line configuration only. People, suppliers, contact details and records are added by the factory. */
export function configState(): State {
  return { ...seedState(), suppliers: [], customers: [], users: [], business: { name: business.name, address: '', phone: '', email: '' } };
}
