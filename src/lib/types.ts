export type OutputKind = 'useful' | 'byproduct' | 'waste';

export type StationId =
  | 'receiving' | 'sorting' | 'roasting' | 'winnowing'
  | 'pressing' | 'sieving' | 'filtering' | 'powder-roasting' | 'powder-crushing'
  | 'grinding'
  | 'mixing' | 'refining' | 'conching' | 'tempering'
  | 'moulding' | 'packaging' | 'completion';

export type StationGroup = 'Bean processing' | 'Butter & powder' | 'Liquor' | 'Chocolate making' | 'Finishing';

export interface OutputRowDef {
  name: string;
  kind: OutputKind;
  /** Destination suggested when the row is first saved; must be allowed by the station */
  to?: Destination;
}

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
  form: 'weights' | 'mixing' | 'pieces' | 'completion';
  /** What this station's unaccounted weight usually is, where it has a known cause (roasting: moisture driven off) */
  lossLabel?: string;
  help: string;
  /** No longer part of the line; kept so older records still show */
  retired?: boolean;
}

/**
 * Where a recorded output goes after the station is saved. 'sale' stores it as a finished-goods lot.
 * 'mixer' is chocolate left in the mixer for the next run; only mixing records it.
 */
export type Destination = `continue:${StationId}` | 'stock' | 'sale' | 'rework' | 'waste' | 'mixer';

/** A container weighed together with the material. Its empty weight (tare) is subtracted from the scale reading. */
export interface Container { id: string; name: string; tare: number }

/** How a net weight was worked out: the scale reading (gross) minus the container's tare */
export interface ContainerUse { name: string; tare: number; gross: number }

export interface RecordedOutput {
  name: string;
  kind: OutputKind;
  /** Net weight in kg */
  weight: number;
  container?: ContainerUse;
  destination: Destination;
  /** Inventory lot created when the output was sent to stock, sale or rework */
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
  /** Set when the input was reweighed in a container */
  inputContainer?: ContainerUse;
  inputLotIds: string[];
  outputs: RecordedOutput[];
  packaging?: PackagingResult;
  /** Mixing: the chocolate types made, one run after another */
  runs?: MixingRun[];
  recordedAt: string;
  recordedBy: string;
  /** New on every save, so two saves of the same station in the same second are still told apart */
  rev?: string;
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
  /** Supplier of the delivered beans, so labels made from this batch trace back to them */
  supplierId?: string;
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
  /** supplierBatch is the supplier's own batch number, as printed on the bag or the delivery note */
  | { type: 'supplier'; supplierId: string; reference?: string; supplierBatch?: string }
  | { type: 'batch'; batchId: string; station: StationId };

export interface LotUse {
  batchId: string;
  quantity: number;
  station: StationId;
  at: string;
  /** The mixing run that weighed it in, so the run can be undone */
  runId?: string;
  /** The lot of pieces made from it */
  madeLot?: string;
}

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
  /** Chocolate made at mixing: its type and the run that made it */
  chocolate?: { type: string; recipeId: string; recipeVersion: number; runId: string };
  /** Pieces of one size made from a chocolate lot; the lot counts pieces */
  pieces?: { type: string; recipeId: string; packSizeId: string; size: string; grams: number; fromLotId: string; recordedBy: string };
}

export interface RecipeIngredient { name: string; percent: number }
export interface RecipeVersion { version: number; createdAt: string; ingredients: RecipeIngredient[]; note?: string }
/** A chocolate type and its recipe versions. Older data linked each recipe to a product. */
export interface Recipe { id: string; name: string; productId?: string; currentVersion: number; versions: RecipeVersion[] }

/** One line of the production plan: pieces of one size of one chocolate type */
export interface PlanLine { recipeId: string; packSizeId: string; pieces: number }

/** What the factory plans to make, in pieces. Pieces made on or after `from` count towards it. */
export interface ProductionPlan { lines: PlanLine[]; from: string; note?: string; updatedAt: string; updatedBy: string }

/** Chocolate the mixer holds between runs; the next run is made on top of it */
export interface MixerContents { kg: number; type: string; recipeId: string; recipeVersion: number; batchId: string; runId: string; lotId: string }

/** The mixer: what it holds now, and the last run, which is the only one that can be undone */
export interface Mixer { holds: MixerContents | null; lastRunId: string | null }

/** One ingredient weighed into a mixing run: from the batch's own liquor or cocoa butter, or from a lot */
export interface RunIngredient { name: string; expected: number; actual: number; lotId?: string }

/** One chocolate type made at mixing, on top of whatever the mixer still held */
export interface MixingRun {
  id: string;
  recipeId: string;
  type: string;
  recipeVersion: number;
  /** Fresh ingredients planned, kg: the sheet's "To run" */
  toRun: number;
  /** What the mixer held when the run started */
  held?: MixerContents;
  ingredients: RunIngredient[];
  /** Chocolate taken out, kg */
  made: number;
  /** Chocolate left in the mixer for the next run, kg */
  kept: number;
  lotId: string;
  /** The lot the kept chocolate became when it was taken out of the mixer instead of used by the next run */
  takenOut?: string;
  recordedAt: string;
  recordedBy: string;
}

export interface Product {
  id: string;
  name: string;
  prefix: string;
  route: RouteId;
  recipeId?: string;
}

export interface Route { id: RouteId; name: string; stations: StationId[]; startMaterial: string; note: string }
export interface PackSize { id: string; name: string; grams: number }
export interface Supplier { id: string; name: string; supplies: string; contact: string }
/** Operators see their own work; managers also see reports, recipes and setup */
export type Access = 'operator' | 'manager';

/** A staff account as the app sees it. Passwords and PINs stay on the server, hashed. */
export interface User {
  id: string;
  name: string;
  role: string;
  initials: string;
  email: string;
  access: Access;
  /** Stations this person works at; their "My work" page shows batches waiting there */
  stations: StationId[];
}

export interface BusinessDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface OutputCategory extends OutputRowDef { id: string; station: StationId; custom?: boolean }

export interface Thresholds {
  /** Allowed unaccounted variance per station, in percent of input */
  variancePct: Record<StationId, number>;
  /** Allowed recorded waste (not by-products) at any station, in percent of input */
  wastePct: number;
  /** Minimum available kg before a raw-material lot is flagged */
  lowStockKg: number;
}

/**
 * Highest number given out so far for each ID prefix, batches and lots counted apart. Counters only
 * go up, so a removed batch or lot never has its ID given to another and old labels stay true.
 */
export interface IdCounters { batches: Record<string, number>; lots: Record<string, number> }

export interface Alert {
  id: string;
  kind: 'variance' | 'waste' | 'hold' | 'stock';
  message: string;
  href: string;
}
