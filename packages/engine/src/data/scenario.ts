import type { ScenarioDef, ZoneDef, EdgeDef } from '../types';

const zones: ZoneDef[] = [
  // North row, upper
  { id: 'stock_room', name: 'Stock room', kind: 'room', col: 0, row: 0, building: 'shop' },
  { id: 'bedroom', name: 'Bedroom', kind: 'room', col: 1, row: 0, building: 'hall' },
  { id: 'office', name: 'Office', kind: 'room', col: 2, row: 0, building: 'workshop' },
  // North row, street side
  { id: 'shop', name: 'Shop', kind: 'room', col: 0, row: 1, building: 'shop' },
  { id: 'hall', name: 'Hall', kind: 'room', col: 1, row: 1, building: 'hall' },
  { id: 'workshop', name: 'Workshop', kind: 'room', col: 2, row: 1, building: 'workshop' },
  // Street
  { id: 'west_end', name: 'West end', kind: 'street', col: 0, row: 2 },
  { id: 'main_street', name: 'Main street', kind: 'street', col: 1, row: 2 },
  { id: 'crossroads', name: 'Crossroads', kind: 'street', col: 2, row: 2 },
  { id: 'east_end', name: 'East end', kind: 'street', col: 3, row: 2 },
  // South row
  { id: 'lobby', name: 'Lobby', kind: 'room', col: 0, row: 3, building: 'lobby' },
  { id: 'yard', name: 'Yard', kind: 'yard', col: 1, row: 3, spawn: {} },
  { id: 'dining', name: 'Dining room', kind: 'room', col: 2, row: 3, building: 'dining' },
  { id: 'flat', name: 'Flat', kind: 'room', col: 0, row: 4, building: 'lobby' },
  { id: 'kitchen', name: 'Kitchen', kind: 'room', col: 2, row: 4, building: 'dining', spawn: { afterBuilding: 'dining' } },
];

const edges: EdgeDef[] = [
  // Street
  { id: 'west_main', a: 'west_end', b: 'main_street', door: false },
  { id: 'main_cross', a: 'main_street', b: 'crossroads', door: false },
  { id: 'cross_east', a: 'crossroads', b: 'east_end', door: false },
  // Street-side doors
  { id: 'door_shop', a: 'shop', b: 'west_end', door: true, startOpen: true },
  { id: 'door_hall', a: 'hall', b: 'main_street', door: true },
  { id: 'door_workshop', a: 'workshop', b: 'crossroads', door: true },
  { id: 'door_lobby', a: 'lobby', b: 'west_end', door: true },
  { id: 'door_dining', a: 'dining', b: 'crossroads', door: true },
  // Yard is open to the street
  { id: 'yard_main', a: 'yard', b: 'main_street', door: false },
  // Inner doors
  { id: 'door_stock_shop', a: 'stock_room', b: 'shop', door: true },
  { id: 'door_bedroom_hall', a: 'bedroom', b: 'hall', door: true },
  { id: 'door_office_workshop', a: 'office', b: 'workshop', door: true },
  { id: 'door_lobby_flat', a: 'lobby', b: 'flat', door: true },
  { id: 'door_dining_kitchen', a: 'dining', b: 'kitchen', door: true },
];

export const LONG_BLOCK: ScenarioDef = {
  id: 'long_block',
  name: 'The Long Block',
  zones,
  edges,
  buildings: [
    { id: 'shop', name: 'Shop', rooms: ['shop', 'stock_room'], keepEmpty: ['shop'] },
    { id: 'hall', name: 'Hall', rooms: ['hall', 'bedroom'], keepEmpty: [] },
    { id: 'workshop', name: 'Workshop', rooms: ['workshop', 'office'], keepEmpty: [] },
    { id: 'lobby', name: 'Lobby', rooms: ['lobby', 'flat'], keepEmpty: [] },
    { id: 'dining', name: 'Dining room', rooms: ['dining', 'kitchen'], keepEmpty: [] },
  ],
  startZone: 'west_end',
  exitZone: 'east_end',
  hiddenMarkers: ['stock_room', 'bedroom', 'flat'],
  fixedObjectives: [{ zone: 'workshop', kind: 'fuel' }],
};

export const SCENARIOS: Record<string, ScenarioDef> = {
  [LONG_BLOCK.id]: LONG_BLOCK,
};
