import type {
  AbilityId, Card, Danger, GameEvent, GameState, ItemId, Survivor, SurvivorId, TurnState, ZombieType, ZoneId,
} from './types';
import { Rng, must } from './rng';
import { CHARACTER_BY_ID } from './data/characters';
import { LEVEL_XP, ZOMBIE_DEFS, entryFor } from './data/spawn';
import { getScenario } from './map';

export class RuleError extends Error {}
export function fail(msg: string): never {
  throw new RuleError(msg);
}

export interface Ctx {
  s: GameState;
  ev: GameEvent[];
  rng: Rng;
}

export const emit = (c: Ctx, type: string, data: Record<string, unknown> = {}): void => {
  c.ev.push({ type, ...data });
};

export const newId = (c: Ctx, prefix: string): string => `${prefix}${c.s.nextId++}`;
export const makeCard = (c: Ctx, item: ItemId): Card => ({ id: newId(c, 'c'), item });

export const getSurvivor = (s: GameState, id: SurvivorId): Survivor => must(s.survivors[id], `unknown survivor ${id}`);

export function abilities(sv: Survivor): Set<AbilityId> {
  const ladder = must(CHARACTER_BY_ID[sv.charId], `unknown character ${sv.charId}`).ladder;
  return new Set(ladder.slice(0, sv.level + 1));
}
export const has = (sv: Survivor, a: AbilityId): boolean => abilities(sv).has(a);

export const livingSurvivors = (s: GameState): Survivor[] => Object.values(s.survivors).filter((v) => v.alive);
export const survivorsIn = (s: GameState, zone: ZoneId): Survivor[] =>
  s.turnOrder.map((id) => getSurvivor(s, id)).filter((v) => v.alive && v.zone === zone);
export const zombiesIn = (s: GameState, zone: ZoneId) => s.zombies.filter((z) => z.zone === zone);
export const woundCount = (sv: Survivor): number => sv.slots.filter((x) => x?.item === 'wound').length;

export function danger(s: GameState): Danger {
  let d = 0;
  for (const v of livingSurvivors(s)) d = Math.max(d, v.level);
  return d as Danger;
}

/** Noise in a zone: tokens plus each survivor (Light Step survivors are silent). */
export function noiseAt(s: GameState, zone: ZoneId): number {
  const people = survivorsIn(s, zone).filter((v) => !has(v, 'light_step')).length;
  return (s.noise[zone] ?? 0) + people;
}

export const addNoise = (c: Ctx, zone: ZoneId, n = 1): void => {
  c.s.noise[zone] = (c.s.noise[zone] ?? 0) + n;
  emit(c, 'noise', { zone, count: n });
};

export function activeSurvivor(s: GameState): Survivor | null {
  return s.turn ? getSurvivor(s, s.turn.survivorId) : null;
}

export function turnOf(c: Ctx): TurnState {
  return c.s.turn ?? fail('no active turn');
}

// ---- decks ----

export function drawSearchCard(c: Ctx): Card | null {
  const s = c.s;
  if (s.searchDeck.length === 0) {
    s.searchDeck = c.rng.shuffle(s.searchDiscard);
    s.searchDiscard = [];
    emit(c, 'search_deck_reshuffled');
  }
  return s.searchDeck.pop() ?? null;
}

export const discardCard = (c: Ctx, card: Card): void => {
  if (card.item === 'wound') return;
  c.s.searchDiscard.push({ id: card.id, item: card.item });
};

function drawSpawnCard(c: Ctx): string {
  const s = c.s;
  if (s.spawnDeck.length === 0) {
    s.spawnDeck = c.rng.shuffle(s.spawnDiscard);
    s.spawnDiscard = [];
    emit(c, 'spawn_deck_reshuffled');
  }
  return must(s.spawnDeck.pop(), 'spawn deck empty');
}

// ---- zombies ----

export function addZombie(c: Ctx, zone: ZoneId, type: ZombieType, reason: string): void {
  const z = { id: newId(c, 'z'), type, zone };
  c.s.zombies.push(z);
  emit(c, 'zombie_spawned', { id: z.id, zombieType: type, zone, reason });
}

function addBrute(c: Ctx, zone: ZoneId, reason: string): void {
  addZombie(c, zone, 'brute', reason);
  addZombie(c, zone, 'shambler', reason);
  addZombie(c, zone, 'shambler', reason);
}

/** Spawn volume scales with the number of survivors in play (4 is the baseline). */
export const SPAWN_SCALE = [0.5, 0.5, 0.75, 1, 1.25, 1.5] as const;
export function scaleCount(s: GameState, n: number): number {
  const k = Math.min(6, Math.max(1, s.turnOrder.length));
  return Math.max(1, Math.round(n * must(SPAWN_SCALE[k - 1])));
}

/**
 * Draw one spawn card for a zone at the current danger level and place the
 * zombies. Returns true if the card was a Surge.
 */
export function spawnAt(c: Ctx, zone: ZoneId, reason: string): boolean {
  const cardId = drawSpawnCard(c);
  c.s.spawnDiscard.push(cardId);
  const entry = entryFor(cardId, danger(c.s));
  emit(c, 'spawn_card', { zone, card: cardId, danger: danger(c.s), reason });
  if (entry.kind === 'none') return false;
  if (entry.kind === 'surge') {
    emit(c, 'surge');
    return true;
  }
  if (entry.kind === 'mutant') {
    if (c.s.zombies.some((z) => z.type === 'mutant')) addBrute(c, zone, reason);
    else addZombie(c, zone, 'mutant', reason);
    return false;
  }
  for (const [type, n] of Object.entries(entry.list) as [ZombieType, number][]) {
    const count = type === 'brute' ? n : scaleCount(c.s, n);
    for (let i = 0; i < count; i++) {
      if (type === 'brute') addBrute(c, zone, reason);
      else addZombie(c, zone, type, reason);
    }
  }
  return false;
}

/** First time a building is opened: draw a spawn card for every room. */
export function fillBuilding(c: Ctx, buildingId: string): void {
  if (c.s.filled[buildingId]) return;
  c.s.filled[buildingId] = true;
  const b = must(getScenario(c.s.scenarioId).buildings.find((x) => x.id === buildingId));
  emit(c, 'building_opened', { building: buildingId });
  for (const room of b.rooms) {
    if (b.keepEmpty.includes(room)) continue;
    spawnAt(c, room, `building:${buildingId}`);
  }
}

// ---- XP, levels, wounds ----

function onLevel(c: Ctx, sv: Survivor, level: number): void {
  const ability = must(CHARACTER_BY_ID[sv.charId]).ladder[level] as AbilityId;
  emit(c, 'level_up', { survivor: sv.id, level, ability });
  if (ability === 'deep_pockets') sv.slots.push(null);
  const t = c.s.turn;
  if (t && t.survivorId === sv.id) {
    if (level === 1) t.actionsLeft += 1; // Restless: permanent 4th action
    if (ability === 'plan_b') t.actionsLeft += 1;
    if (ability === 'sprint') t.free.move += 1;
    if (ability === 'crowd_breaker') t.free.melee += 1;
    if (ability === 'quick_feet') t.free.move += 1;
  }
}

export function gainXp(c: Ctx, sv: Survivor, n: number): void {
  sv.xp += n;
  while (sv.level < 3 && sv.xp >= must((LEVEL_XP as readonly number[])[sv.level])) {
    sv.level = (sv.level + 1) as 1 | 2 | 3;
    onLevel(c, sv, sv.level);
  }
}

export function killZombie(c: Ctx, zombieId: string, killer: Survivor | null, how = 'attack'): void {
  const idx = c.s.zombies.findIndex((z) => z.id === zombieId);
  if (idx < 0) return;
  const z = must(c.s.zombies[idx]);
  c.s.zombies.splice(idx, 1);
  const xp = ZOMBIE_DEFS[z.type].xp;
  emit(c, 'zombie_killed', { id: z.id, zombieType: z.type, zone: z.zone, by: killer?.id ?? null, how, xp });
  if (killer) gainXp(c, killer, xp);
}

export function eliminate(c: Ctx, sv: Survivor): void {
  sv.alive = false;
  for (const card of sv.slots) if (card) discardCard(c, card);
  sv.slots = sv.slots.map(() => null);
  emit(c, 'survivor_died', { survivor: sv.id, zone: sv.zone });
  if (livingSurvivors(c.s).length === 0) {
    c.s.status = 'lost';
    c.s.turn = null;
    c.s.pending = null;
    emit(c, 'game_lost');
  }
}

/** Deal one wound to a survivor. Returns true if it landed. */
export function woundSurvivor(c: Ctx, sv: Survivor, source: string): boolean {
  if (!sv.alive) return false;
  if (has(sv, 'thick_skin') && !sv.roundFlags.thickSkin) {
    sv.roundFlags.thickSkin = true;
    emit(c, 'wound_prevented', { survivor: sv.id, by: 'thick_skin', source });
    return false;
  }
  const medic = survivorsIn(c.s, sv.zone).find((m) => has(m, 'steady_presence') && !m.roundFlags.steadyPresence);
  if (medic) {
    medic.roundFlags.steadyPresence = true;
    emit(c, 'wound_prevented', { survivor: sv.id, by: 'steady_presence', medic: medic.id, source });
    return false;
  }
  const maskIdx = sv.slots.findIndex((x) => x?.item === 'goalie_mask');
  if (maskIdx >= 0) {
    discardCard(c, must(sv.slots[maskIdx]));
    sv.slots[maskIdx] = null;
    emit(c, 'wound_prevented', { survivor: sv.id, by: 'goalie_mask', source });
    return false;
  }
  let slot = sv.slots.findIndex((x) => x === null);
  if (slot < 0) {
    for (let i = sv.slots.length - 1; i >= 0; i--) {
      if (sv.slots[i]?.item !== 'wound') {
        slot = i;
        break;
      }
    }
    const lost = sv.slots[slot];
    if (lost) {
      discardCard(c, lost);
      emit(c, 'item_lost', { survivor: sv.id, item: lost.item });
    }
  }
  sv.slots[slot] = makeCard(c, 'wound');
  emit(c, 'wounded', { survivor: sv.id, source, wounds: woundCount(sv) });
  if (woundCount(sv) >= 2) eliminate(c, sv);
  return true;
}
