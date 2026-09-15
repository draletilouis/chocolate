import type { Station, StationGroup, StationId } from './types';

export const stations: Station[] = [
  {
    id: 'receiving', name: 'Receiving', group: 'Bean processing',
    input: 'Cocoa beans delivered', output: 'Accepted beans · rejected beans',
    rows: [{ name: 'Accepted beans', kind: 'useful' }, { name: 'Rejected beans', kind: 'waste' }],
    next: ['roasting'], form: 'weights',
    help: 'Weigh the beans you accept into production and the beans you reject.',
  },
  {
    id: 'roasting', name: 'Roasting', group: 'Bean processing',
    input: 'Accepted beans', output: 'Roasted beans · unusable beans',
    rows: [{ name: 'Roasted beans', kind: 'useful' }, { name: 'Unusable beans', kind: 'waste' }, { name: 'Other measured loss', kind: 'waste' }],
    next: ['winnowing'], form: 'weights',
    help: 'Moisture lost in the roaster shows up as variance. Only enter what you weigh.',
  },
  {
    id: 'winnowing', name: 'Winnowing', group: 'Bean processing',
    input: 'Roasted beans', output: 'Nibs · whole peeled beans · husks',
    rows: [{ name: 'Nibs', kind: 'useful' }, { name: 'Whole peeled beans', kind: 'useful' }, { name: 'Husks', kind: 'byproduct' }, { name: 'Unusable beans', kind: 'waste' }],
    next: ['grinding'], form: 'weights',
    help: 'Weigh nibs, peeled beans and husks separately.',
  },
  {
    id: 'grinding', name: 'Grinding', group: 'Bean processing',
    input: 'Nibs', output: 'Cocoa liquor · butter · powder',
    rows: [{ name: 'Liquor', kind: 'useful' }, { name: 'Butter', kind: 'useful' }, { name: 'Powder', kind: 'useful' }, { name: 'Waste', kind: 'waste' }],
    next: ['pressing', 'mixing'], form: 'weights',
    help: 'Liquor can continue to pressing, go straight to mixing, or be stored as a lot.',
  },
  {
    id: 'pressing', name: 'Pressing', group: 'Pressing',
    input: 'Cocoa liquor', output: 'Cocoa butter · cocoa cake',
    rows: [{ name: 'Cocoa butter', kind: 'useful' }, { name: 'Cocoa cake', kind: 'useful' }, { name: 'Waste', kind: 'waste' }],
    next: ['mixing'], form: 'weights',
    help: 'Liquor splits into butter and cake. Each output goes to its own destination.',
  },
  {
    id: 'mixing', name: 'Mixing', group: 'Chocolate making',
    input: 'Liquor + butter + sugar', output: 'Chocolate mix',
    rows: [{ name: 'Chocolate mix', kind: 'useful' }, { name: 'Machine residue', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['refining'], form: 'weights',
    help: 'Input is the total of the recipe ingredients actually weighed in.',
  },
  {
    id: 'refining', name: 'Refining', group: 'Chocolate making',
    input: 'Chocolate mix', output: 'Refined chocolate',
    rows: [{ name: 'Refined chocolate', kind: 'useful' }, { name: 'Machine residue', kind: 'byproduct' }, { name: 'Waste', kind: 'waste' }],
    next: ['conching'], form: 'weights',
    help: 'Weigh the refined mass and any residue cleaned from the refiner.',
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
  { name: 'Bean processing', slug: 'bean-processing', note: 'Turn delivered beans into liquor.', from: 'Cocoa beans', to: 'Cocoa liquor' },
  { name: 'Pressing', slug: 'pressing', note: 'A branch from liquor. Butter and cake are recorded as separate outputs.', from: 'Cocoa liquor', to: 'Cocoa butter · cocoa cake' },
  { name: 'Chocolate making', slug: 'chocolate-making', note: 'Combine ingredients, then develop texture and flavour.', from: 'Liquor + butter + sugar', to: 'Tempered chocolate' },
  { name: 'Finishing', slug: 'finishing', note: 'Mould, count units, complete the batch.', from: 'Tempered chocolate', to: 'Packed units' },
];

export const groupBySlug = (slug: string) => stationGroups.find((g) => g.slug === slug);
export const groupOf = (id: StationId) => stationGroups.find((g) => g.name === stationById[id].group)!;

export const stationById = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, Station>;

export const isStationId = (value: string): value is StationId => value in stationById;

export function stationName(id: StationId | null | undefined) {
  return id ? stationById[id].name : 'Not started';
}
