import type { Destination, OutputKind, Station, StationGroup, StationId } from './types';

export const stations: Station[] = [
  {
    id: 'roasting', name: 'Roasting', group: 'Bean processing',
    input: 'Raw beans (bag weight)', output: 'Roasted beans · beans taken off · unusable beans sorted off',
    rows: [{ name: 'Roasted beans', kind: 'useful' }, { name: 'Beans taken off', kind: 'useful' }, { name: 'Unusable beans sorted off', kind: 'waste' }, { name: 'Other measured loss', kind: 'waste' }],
    next: ['winnowing'], form: 'weights',
    help: 'The whole sack goes into the roaster. Weigh the roasted beans going on to winnowing, any beans taken off and the unusable beans sorted off: together they are the weight after roasting. Moisture lost in the roaster shows up as variance.',
  },
  {
    id: 'winnowing', name: 'Winnowing', group: 'Bean processing',
    input: 'Roasted beans', output: 'Crushed nibs for liquor, butter and other · nibs for inclusion and sale · whole peeled beans · husks and rubbish',
    rows: [
      { name: 'Crushed nibs for liquor', kind: 'useful' },
      { name: 'Crushed nibs for butter', kind: 'useful' },
      { name: 'Crushed nibs for other', kind: 'useful' },
      { name: 'Nibs for inclusion and sale', kind: 'useful' },
      { name: 'Whole peeled beans', kind: 'useful' },
      { name: 'Husks and rubbish', kind: 'byproduct' },
    ],
    next: ['grinding'], form: 'weights',
    help: 'Split the nibs by use, as on the bean summary: nibs for liquor continue to grinding, nibs for butter are stored for pressing, and nibs for inclusion and sale leave production.',
  },
  {
    id: 'grinding', name: 'Grinding', group: 'Bean processing',
    input: 'Crushed nibs for liquor', output: 'Cocoa liquor',
    rows: [{ name: 'Liquor', kind: 'useful' }, { name: 'Waste', kind: 'waste' }],
    next: [], form: 'weights',
    help: 'Nibs are ground into liquor. The liquor is stored as a lot; chocolate batches start from it.',
  },
  {
    id: 'pressing', name: 'Pressing', group: 'Pressing',
    input: 'Crushed nibs for butter', output: 'Cocoa butter · powder',
    rows: [{ name: 'Cocoa butter', kind: 'useful' }, { name: 'Powder', kind: 'useful' }],
    next: [], form: 'weights', strictBalance: true, yieldOf: { output: 'Cocoa butter', label: 'Butter yield from nibs pressed' },
    help: 'Butter and powder are the only outputs: together they must weigh exactly the nibs pressed. Butter is stored for chocolate; powder is sold or discarded.',
  },
  {
    id: 'refining', name: 'Refining', group: 'Chocolate making',
    input: 'Liquor + recipe additions', output: 'Refined chocolate',
    rows: [{ name: 'Refined chocolate', kind: 'useful' }, { name: 'Machine residue', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['conching'], form: 'weights',
    help: 'The liquor goes into the refiner with the recipe additions and becomes chocolate. Weigh the refined mass and any residue cleaned from the refiner.',
  },
  {
    id: 'conching', name: 'Conching', group: 'Chocolate making',
    input: 'Refined chocolate', output: 'Conched chocolate',
    rows: [{ name: 'Conched chocolate', kind: 'useful' }, { name: 'Machine residue', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['tempering'], form: 'weights',
    help: 'Weigh the conched mass when the conche is emptied.',
  },
  {
    id: 'tempering', name: 'Tempering', group: 'Chocolate making',
    input: 'Conched chocolate', output: 'Tempered chocolate',
    rows: [{ name: 'Tempered chocolate', kind: 'useful' }, { name: 'Machine residue', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['moulding'], form: 'weights',
    help: 'Weigh the tempered chocolate going to the moulds.',
  },
  {
    id: 'moulding', name: 'Moulding', group: 'Finishing',
    input: 'Tempered chocolate', output: 'Finished chocolate · recoverable chocolate',
    rows: [{ name: 'Finished chocolate', kind: 'useful' }, { name: 'Recoverable chocolate', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['packaging'], form: 'weights',
    help: 'Recoverable chocolate can be reworked. Only unusable material is waste.',
  },
  {
    id: 'packaging', name: 'Packaging', group: 'Finishing',
    input: 'Finished chocolate', output: 'Accepted units · rejected units',
    rows: [],
    next: ['completion'], form: 'packaging',
    help: 'Count every unit made, then the rejected units. Accepted units are calculated.',
  },
  {
    id: 'completion', name: 'Completion', group: 'Finishing',
    input: 'Recorded stations', output: 'Completed batch record',
    rows: [],
    next: [], form: 'completion',
    help: 'Check the record, then close the batch.',
  },
];

export interface StationGroupDef { name: StationGroup; slug: string; note: string; from: string; to: string }

/** The four parts of the line. Each has its own page and sidebar entry. */
export const stationGroups: StationGroupDef[] = [
  { name: 'Bean processing', slug: 'bean-processing', note: 'Roast each sack, winnow it into nibs and grind the liquor.', from: 'Raw beans', to: 'Cocoa liquor' },
  { name: 'Pressing', slug: 'pressing', note: 'Crushed nibs for butter are pressed. Butter and powder must equal the nibs pressed.', from: 'Crushed nibs for butter', to: 'Cocoa butter · powder' },
  { name: 'Chocolate making', slug: 'chocolate-making', note: 'The liquor becomes chocolate: refined with the recipe additions, then conched and tempered.', from: 'Liquor + recipe additions', to: 'Tempered chocolate' },
  { name: 'Finishing', slug: 'finishing', note: 'Mould, count units, complete the batch.', from: 'Tempered chocolate', to: 'Packed units' },
];

export const groupBySlug = (slug: string) => stationGroups.find((g) => g.slug === slug);
export const groupOf = (id: StationId) => stationGroups.find((g) => g.name === stationById[id].group)!;

export const stationById = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, Station>;

export const isStationId = (value: string): value is StationId => value in stationById;

/** Display name for a station. Records from a retired station (such as mixing or receiving) keep its id, so fall back to a readable form of it. */
export function stationName(id: StationId | null | undefined) {
  if (!id) return 'Not started';
  return stationById[id]?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Outputs that may only go to these destinations (first entry is the default). Everything else may go anywhere. */
const restrictedDestinations: Partial<Record<StationId, Record<string, Destination[]>>> = {
  roasting: { 'Beans taken off': ['stock', 'sale', 'waste'] },
  winnowing: {
    'Crushed nibs for butter': ['stock'], 'Crushed nibs for other': ['stock', 'sale', 'rework', 'waste'], 'Nibs for inclusion and sale': ['sale', 'stock'],
    // Names these rows had before they followed the bean summary, for records saved under them
    'Nibs for butter': ['stock'], 'Nibs for sale': ['sale', 'stock'],
  },
  pressing: { 'Cocoa butter': ['stock'], Powder: ['sale', 'waste'] },
};

export const allowedDestinations = (station: StationId, output: string): Destination[] | undefined =>
  restrictedDestinations[station]?.[output];

/** Destinations offered for an output at a station. Restricted outputs only offer what the process allows. */
export function destinationOptions(station: Station, output: string): Destination[] {
  return allowedDestinations(station.id, output)
    ?? [...station.next.map((n): Destination => `continue:${n}`), 'stock', 'sale', 'rework', 'waste'];
}

/** Destination a fresh output starts with before the worker picks one. */
export function defaultDestination(station: StationId, output: { name: string; kind: OutputKind }, index: number): Destination {
  const allowed = allowedDestinations(station, output.name);
  if (allowed) return allowed[0];
  if (output.kind === 'waste') return 'waste';
  if (output.kind === 'byproduct') return 'stock';
  return index === 0 && stationById[station].next[0] ? `continue:${stationById[station].next[0]}` : 'stock';
}
