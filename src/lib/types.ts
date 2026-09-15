export type OutputKind = 'useful' | 'byproduct' | 'waste';

export type StationId =
  | 'receiving' | 'roasting' | 'winnowing' | 'grinding'
  | 'pressing'
  | 'mixing' | 'refining' | 'conching' | 'tempering'
  | 'moulding' | 'packaging' | 'completion';

export type StationGroup = 'Bean processing' | 'Pressing' | 'Chocolate making' | 'Finishing';

export interface OutputRowDef { name: string; kind: OutputKind }

export interface Station {
  id: StationId;
  name: string;
  group: StationGroup;
  /** Plain-language input material shown on the production line */
  input: string;
  /** Plain-language output summary shown on the production line */
  output: string;
  /** Predefined rows the worker weighs at this station */
  rows: OutputRowDef[];
  /** Stations a carried-forward output can continue to (first is the default) */
  next: StationId[];
  form: 'weights' | 'packaging' | 'completion';
  help: string;
}

/** Where a recorded output goes after the station is saved */
export type Destination = `continue:${StationId}` | 'stock' | 'rework' | 'waste';

export interface RecordedOutput {
  name: string;
  kind: OutputKind;
  weight: number;
  destination: Destination;
  /** Inventory lot created when the output was sent to stock or rework */
  lotId?: string;
}

export interface Balance {
  input: number;
  measured: number;
  useful: number;
  byproduct: number;
  waste: number;
  /** Recorded waste + by-products */
  recordedWaste: number;
  /** Input that no measured output explains */
  variance: number;
  accountedPct: number;
  yieldPct: number;
  wastePct: number;
  variancePct: number;
}

export interface PackagingResult {
  packSizeId: string;
  packGrams: number;
  totalUnits: number;
  rejectedUnits: number;
  acceptedUnits: number;
  /** Nominal weight of accepted units in kg */
  acceptedWeight: number;
}

export interface StationRecord {
  id: string;
  station: StationId;
  inputMaterial: string;
  inputWeight: number;
  inputLotIds: string[];
  outputs: RecordedOutput[];
  packaging?: PackagingResult;
  recordedAt: string;
  recordedBy: string;
  note?: string;
  destinationsSaved: boolean;
}

export type BatchStatus = 'active' | 'hold' | 'completed';

export interface Ingredient { name: string; expected: number; actual: number; lotId?: string }

export interface Hold {
  id: string;
  reason: string;
  placedAt: string;
  placedBy: string;
  station: StationId | null;
  releasedAt?: string;
  releaseNote?: string;
}

export interface Correction {
  id: string;
  recordId: string;
  station: StationId;
  output: string;
  previous: number;
  corrected: number;
  reason: string;
  correctedAt: string;
  correctedBy: string;
}

export type RouteId = 'beans' | 'pressing' | 'chocolate';

export interface Batch {
  id: string;
  /** Optional operator-facing name; id remains the immutable system identifier. */
  name?: string;
  productId: string;
  product: string;
  route: RouteId;
  startedAt: string;
  status: BatchStatus;
  /** Station that should be recorded next; null once the batch is completed */
  nextStation: StationId | null;
  startInput: { material: string; weight: number; lotIds: string[] };
  recipeId?: string;
  recipeVersion?: number;
  ingredients?: Ingredient[];
  records: StationRecord[];
  holds: Hold[];
  corrections: Correction[];
  completedAt?: string;
  note?: string;
}

export type LotSource =
  | { type: 'supplier'; supplierId: string; reference?: string }
  | { type: 'batch'; batchId: string; station: StationId };

export interface LotUse { batchId: string; quantity: number; station: StationId; at: string }

export type LotCategory = 'Raw material' | 'Intermediate' | 'By-product' | 'Rework' | 'Finished goods';

export interface Lot {
  id: string;
  material: string;
  category: LotCategory;
  received: number;
  available: number;
  unit: 'kg' | 'units';
  source: LotSource;
  receivedAt: string;
  uses: LotUse[];
}

export interface RecipeIngredient { name: string; percent: number }
export interface RecipeVersion { version: number; createdAt: string; ingredients: RecipeIngredient[]; note?: string }
export interface Recipe { id: string; name: string; productId: string; currentVersion: number; versions: RecipeVersion[] }

export interface Product {
  id: string;
  name: string;
  prefix: string;
  route: RouteId;
  recipeId?: string;
  /** Printed on the paper form, but not ready to start until its recipe is configured. */
  catalogOnly?: boolean;
}

export interface Route { id: RouteId; name: string; stations: StationId[]; startMaterial: string; note: string }
export interface PackSize { id: string; name: string; grams: number }
export interface Supplier { id: string; name: string; supplies: string; contact: string }
export interface User { id: string; name: string; role: string; initials: string; email: string; password: string }

export interface OutputCategory extends OutputRowDef { station: StationId; custom?: boolean }

export interface Thresholds {
  /** Allowed unaccounted variance per station, in percent of input */
  variancePct: Record<StationId, number>;
  /** Allowed recorded waste (not by-products) at any station, in percent of input */
  wastePct: number;
  /** Minimum available kg before a raw-material lot is flagged */
  lowStockKg: number;
}

/** Printed row labels transcribed from the factory's paper summaries. */
export interface PaperCatalog {
  source: string;
  chocolateStrengths: string[];
  productionSummary: {
    usage: string[];
    productOutput: string[];
    specialOutput: string[];
  };
  beanSummary: {
    inputAndSorting: string[];
    usage: string[];
    derivatives: string[];
  };
  temperingSummary: {
    products: string[];
    columns: { label: string; unit: string }[];
  };
  readyProducts: {
    section: string;
    items: string[];
  }[];
  weeklyUsage: string[];
}

export interface Alert {
  id: string;
  kind: 'variance' | 'waste' | 'hold' | 'stock';
  message: string;
  href: string;
}
