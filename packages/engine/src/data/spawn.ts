import type { Danger, ZombieType } from '../types';

export type SpawnEntry =
  | { kind: 'none' }
  | { kind: 'surge' }
  | { kind: 'mutant' }
  | { kind: 'zombies'; list: Partial<Record<ZombieType, number>> };

const none: SpawnEntry = { kind: 'none' };
const z = (list: Partial<Record<ZombieType, number>>): SpawnEntry => ({ kind: 'zombies', list });

export interface SpawnCardDef {
  id: string;
  copies: number;
  /** Indexed by danger level: Quiet, Restless, Swarming, Overrun. */
  byDanger: [SpawnEntry, SpawnEntry, SpawnEntry, SpawnEntry];
}

export const SPAWN_CARDS: SpawnCardDef[] = [
  { id: 'trickle', copies: 8, byDanger: [z({ shambler: 2 }), z({ shambler: 3 }), z({ shambler: 4 }), z({ shambler: 6 })] },
  { id: 'quiet_street', copies: 4, byDanger: [z({ shambler: 1 }), z({ shambler: 2 }), z({ shambler: 3 }), z({ shambler: 4 })] },
  { id: 'pack', copies: 4, byDanger: [z({ shambler: 2 }), z({ sprinter: 2 }), z({ sprinter: 3 }), z({ sprinter: 4 })] },
  { id: 'heavy', copies: 3, byDanger: [none, z({ brute: 1 }), z({ brute: 1 }), z({ brute: 2 })] },
  { id: 'surge', copies: 2, byDanger: [none, { kind: 'surge' }, { kind: 'surge' }, { kind: 'surge' }] },
  { id: 'mutant', copies: 1, byDanger: [none, none, none, { kind: 'mutant' }] },
];

export const SPAWN_BY_ID: Record<string, SpawnCardDef> = Object.fromEntries(
  SPAWN_CARDS.map((c) => [c.id, c]),
);

export const entryFor = (cardId: string, danger: Danger): SpawnEntry => {
  const card = SPAWN_BY_ID[cardId];
  if (!card) throw new Error(`unknown spawn card ${cardId}`);
  return card.byDanger[danger];
};

export const ZOMBIE_DEFS: Record<ZombieType, { name: string; actions: number; toughness: number; xp: number }> = {
  shambler: { name: 'Shambler', actions: 1, toughness: 1, xp: 1 },
  sprinter: { name: 'Sprinter', actions: 2, toughness: 1, xp: 1 },
  brute: { name: 'Brute', actions: 1, toughness: 2, xp: 1 },
  mutant: { name: 'Mutant', actions: 1, toughness: 3, xp: 5 },
};

/** XP needed for Restless, Swarming, Overrun. */
export const LEVEL_XP = [7, 19, 43] as const;
