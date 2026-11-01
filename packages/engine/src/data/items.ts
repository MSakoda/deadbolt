import type { ItemDef, ItemId } from '../types';

export const ITEMS: Record<ItemId, ItemDef> = {
  frying_pan: { id: 'frying_pan', name: 'Frying pan', kind: 'melee', range: [0, 0], dice: 1, accuracy: 6, damage: 1, door: 'none' },
  crowbar: { id: 'crowbar', name: 'Crowbar', kind: 'melee', range: [0, 0], dice: 1, accuracy: 4, damage: 1, door: 'silent' },
  fire_axe: { id: 'fire_axe', name: 'Fire axe', kind: 'melee', range: [0, 0], dice: 1, accuracy: 4, damage: 2, door: 'noisy' },
  machete: { id: 'machete', name: 'Machete', kind: 'melee', range: [0, 0], dice: 1, accuracy: 4, damage: 1, dual: true, door: 'none' },
  chainsaw: { id: 'chainsaw', name: 'Chainsaw', kind: 'melee', range: [0, 0], dice: 5, accuracy: 5, damage: 2, noisy: true, door: 'noisy' },
  pistol: { id: 'pistol', name: 'Pistol', kind: 'ranged', range: [0, 1], dice: 1, accuracy: 4, damage: 1, noisy: true, dual: true, door: 'none' },
  sawed_off: { id: 'sawed_off', name: 'Sawed-off shotgun', kind: 'ranged', range: [0, 1], dice: 2, accuracy: 3, damage: 2, noisy: true, dual: true, reload: true, door: 'none' },
  smg: { id: 'smg', name: 'Sub-machine gun', kind: 'ranged', range: [0, 1], dice: 3, accuracy: 5, damage: 1, noisy: true, dual: true, door: 'none' },
  rifle: { id: 'rifle', name: 'Rifle', kind: 'ranged', range: [1, 3], dice: 1, accuracy: 4, damage: 1, noisy: true, door: 'none' },
  rifle_scope: { id: 'rifle_scope', name: 'Rifle with scope', kind: 'ranged', range: [1, 3], dice: 1, accuracy: 4, damage: 1, noisy: true, chooseTargets: true, door: 'none' },
  scope: { id: 'scope', name: 'Scope', kind: 'part', door: 'none' },
  glass_bottle: { id: 'glass_bottle', name: 'Glass bottle', kind: 'part', door: 'none' },
  gasoline: { id: 'gasoline', name: 'Gasoline', kind: 'part', door: 'none' },
  molotov: { id: 'molotov', name: 'Molotov', kind: 'thrown', range: [0, 1], door: 'none' },
  goalie_mask: { id: 'goalie_mask', name: 'Goalie mask', kind: 'gear', door: 'none' },
  flashlight: { id: 'flashlight', name: 'Flashlight', kind: 'gear', door: 'none' },
  plenty_of_ammo: { id: 'plenty_of_ammo', name: 'Plenty of ammo', kind: 'gear', door: 'none' },
  alarm: { id: 'alarm', name: 'Alarm', kind: 'trap', door: 'none' },
  wound: { id: 'wound', name: 'Wounded', kind: 'wound', door: 'none' },
};

/** Search deck contents (30 cards). The frying pan is starting gear only. */
export const SEARCH_DECK: [ItemId, number][] = [
  ['crowbar', 2],
  ['fire_axe', 2],
  ['machete', 2],
  ['chainsaw', 1],
  ['pistol', 3],
  ['sawed_off', 2],
  ['smg', 1],
  ['rifle', 2],
  ['scope', 2],
  ['glass_bottle', 2],
  ['gasoline', 2],
  ['goalie_mask', 2],
  ['flashlight', 2],
  ['plenty_of_ammo', 2],
  ['alarm', 3],
];

/** Part + part -> result. Order does not matter. */
export const COMBINES: [ItemId, ItemId, ItemId][] = [
  ['glass_bottle', 'gasoline', 'molotov'],
  ['rifle', 'scope', 'rifle_scope'],
];

export const isWeapon = (id: ItemId): boolean => {
  const k = ITEMS[id].kind;
  return k === 'melee' || k === 'ranged' || k === 'thrown';
};
