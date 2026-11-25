const base = import.meta.env.BASE_URL;

export const portraitUrl = (charId: string): string => `${base}portraits/${charId}.png`;
export const zombieUrl = (type: string): string => `${base}zombies/${type}.png`;

/** Zombie types that have artwork in public/zombies. Any other type falls back to a coloured shape. */
export const ZOMBIE_ART: readonly string[] = ['shambler', 'sprinter', 'brute', 'mutant'];

export const itemUrl = (id: string): string => `${base}items/${id}.png`;

/** Item ids that have artwork in public/items. Others show as text only. */
export const ITEM_ART: readonly string[] = [
  'frying_pan', 'crowbar', 'fire_axe', 'machete', 'chainsaw', 'pistol', 'sawed_off', 'smg', 'rifle',
  'rifle_scope', 'scope', 'glass_bottle', 'gasoline', 'molotov', 'goalie_mask', 'flashlight', 'plenty_of_ammo', 'alarm', 'wound',
];

export const boardUrl = (name: string): string => `${base}board/${name}.png`;
export const logoUrl = `${base}logo.png`;

/** Board pieces with artwork in public/board. */
export const BOARD_ART: readonly string[] = ['mystery', 'keys', 'fuel', 'supplies', 'truck', 'padlock', 'spawn'];

export const tileUrl = (name: string): string => `${base}tiles/${name}.png`;

/** Floor tiles in public/tiles (square, 256 px). */
export const FLOOR_ART: readonly string[] = [
  'street_plain', 'street_line', 'street_cross', 'street_end', 'yard', 'sidewalk',
  'shop', 'stock_room', 'hall', 'bedroom', 'office', 'workshop', 'lobby', 'flat', 'dining', 'kitchen',
];

/** Wall pieces in public/tiles, stored as wall_<name>.png. */
export const WALL_ART: readonly string[] = ['solid', 'window', 'door_closed', 'door_open', 'door_broken', 'fence', 'curb', 'post'];

/** Zones whose floor is not simply their own id. Other scenarios fall back to a tile by zone kind. */
const FLOOR_BY_ZONE: Record<string, string> = {
  west_end: 'street_plain', main_street: 'street_line', crossroads: 'street_cross', east_end: 'street_end',
};

export function floorFor(zone: { id: string; kind: string }): string | null {
  const own = FLOOR_BY_ZONE[zone.id] ?? zone.id;
  if (FLOOR_ART.includes(own)) return own;
  if (zone.kind === 'street') return 'street_plain';
  if (zone.kind === 'yard') return 'yard';
  return null;
}
