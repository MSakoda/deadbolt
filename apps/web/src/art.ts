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
