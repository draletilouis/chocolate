import type { Station, StationGroup, StationId } from './types';

export const stations: Station[] = [
  {
    id: 'receiving', name: 'Receiving', group: 'Bean processing',
    input: 'Cocoa beans delivered', output: 'Accepted beans · rejected beans',
    rows: [{ name: 'Accepted beans', kind: 'useful', to: 'continue:sorting' }, { name: 'Rejected beans', kind: 'waste', to: 'waste' }],
    next: ['sorting'], form: 'weights',
    help: 'Weigh the beans you accept from the delivery and any you reject.',
  },
  {
    id: 'sorting', name: 'Sorting', group: 'Bean processing',
    input: 'Accepted beans', output: 'Sorted beans · sorted-out beans',
    rows: [{ name: 'Sorted beans', kind: 'useful', to: 'continue:roasting' }, { name: 'Sorted-out beans', kind: 'waste', to: 'waste' }],
    next: ['roasting'], form: 'weights',
    help: 'Sort the beans by hand, then reweigh the sorted beans and what was taken out.',
  },
  {
    id: 'roasting', name: 'Roasting', group: 'Bean processing',
    input: 'Sorted beans', output: 'Roasted beans · whole beans taken off',
    rows: [{ name: 'Roasted beans', kind: 'useful', to: 'continue:winnowing' }, { name: 'Whole roasted beans', kind: 'useful', to: 'sale' }, { name: 'Unusable beans', kind: 'waste', to: 'waste' }],
    next: ['winnowing'], form: 'weights',
    help: 'Whole roasted beans taken off for sale or other use are weighed separately. Moisture lost in the roaster shows up as variance.',
  },
  {
    id: 'winnowing', name: 'Winnowing', group: 'Bean processing',
    input: 'Roasted beans', output: 'Nibs for liquor, butter or sale · husks',
    rows: [
      { name: 'Nibs for liquor', kind: 'useful', to: 'continue:grinding' },
      { name: 'Nibs for butter', kind: 'useful', to: 'continue:pressing' },
      { name: 'Nibs for sale', kind: 'useful', to: 'sale' },
      { name: 'Husks', kind: 'waste', to: 'waste' },
    ],
    next: ['pressing', 'grinding'], form: 'weights',
    help: 'Weigh the crushed nibs in portions: for liquor, for butter and for sale. Husks are waste.',
  },
  {
    id: 'pressing', name: 'Pressing', group: 'Butter & powder',
    input: 'Nibs for butter', output: 'Brown butter · cake (powder)',
    rows: [{ name: 'Brown butter', kind: 'useful', to: 'continue:sieving' }, { name: 'Cocoa cake (powder)', kind: 'useful', to: 'continue:powder-roasting' }, { name: 'Waste', kind: 'waste', to: 'waste' }],
    next: ['sieving', 'powder-roasting', 'powder-crushing'], form: 'weights',
    help: 'Nibs are pressed into brown butter and cake. The cake is the powder.',
  },
  {
    id: 'sieving', name: 'Butter sieving', group: 'Butter & powder',
    input: 'Brown butter', output: 'Sieved butter · particles for liquor',
    rows: [{ name: 'Sieved butter', kind: 'useful', to: 'continue:filtering' }, { name: 'Sieved particles', kind: 'useful', to: 'continue:grinding' }, { name: 'Waste', kind: 'waste', to: 'waste' }],
    next: ['filtering', 'grinding'], form: 'weights',
    help: 'Sieve the brown butter. The particles caught go to the liquor at grinding.',
  },
  {
    id: 'filtering', name: 'Filter pan', group: 'Butter & powder',
    input: 'Sieved butter', output: 'Clear butter: silk butter · for sale · for production',
    rows: [
      { name: 'Silk butter', kind: 'useful', to: 'stock' },
      { name: 'Butter for sale', kind: 'useful', to: 'sale' },
      { name: 'Cocoa butter', kind: 'useful', to: 'stock' },
      { name: 'Filter residue', kind: 'waste', to: 'waste' },
    ],
    next: ['mixing'], form: 'weights',
    help: 'Pass the sieved butter through the filter pan and weigh the clear butter in portions: silk butter, for sale, and cocoa butter kept for production.',
  },
  {
    id: 'powder-roasting', name: 'Powder roasting', group: 'Butter & powder',
    input: 'Cocoa cake (powder)', output: 'Roasted powder',
    rows: [{ name: 'Roasted powder', kind: 'useful', to: 'continue:powder-crushing' }, { name: 'Waste', kind: 'waste', to: 'waste' }],
    next: ['powder-crushing'], form: 'weights',
    help: 'Optional second roast of the powder. Skip it by sending the cake straight to crushing.',
  },
  {
    id: 'powder-crushing', name: 'Powder crushing', group: 'Butter & powder',
    input: 'Roasted powder', output: 'Fine cocoa powder for sale',
    rows: [{ name: 'Fine cocoa powder', kind: 'useful', to: 'sale' }, { name: 'Waste', kind: 'waste', to: 'waste' }],
    next: [], form: 'weights',
    help: 'Crush to a finer powder, weigh it again, and pack it for sale.',
  },
  {
    id: 'grinding', name: 'Liquor grinding', group: 'Liquor',
    input: 'Nibs for liquor + sieved particles', output: 'Cocoa liquor (labelled)',
    rows: [{ name: 'Liquor', kind: 'useful', to: 'stock' }, { name: 'Waste', kind: 'waste', to: 'waste' }],
    next: ['mixing'], form: 'weights',
    help: 'Grind twice: coarse, then fine. Weigh the liquor only after fine grinding, then print its label with the batch name.',
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

/** The parts of the line. Each has its own page and sidebar entry. */
export const stationGroups: StationGroupDef[] = [
  { name: 'Bean processing', slug: 'bean-processing', note: 'Receive, sort, roast and winnow the beans.', from: 'Cocoa beans', to: 'Nibs · whole beans · husks' },
  { name: 'Butter & powder', slug: 'butter-powder', note: 'Press nibs into brown butter and cake. The butter is sieved and filtered; the cake becomes powder.', from: 'Nibs for butter', to: 'Clear butter · cocoa powder' },
  { name: 'Liquor', slug: 'liquor', note: 'Grind nibs twice, weigh after fine grinding, then label the liquor with the batch name.', from: 'Nibs for liquor', to: 'Labelled cocoa liquor' },
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
