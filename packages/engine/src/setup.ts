import type { Card, GameState, ObjectiveToken, Survivor } from './types';
import { Rng, must } from './rng';
import { SEARCH_DECK } from './data/items';
import { SPAWN_CARDS } from './data/spawn';
import { CHARACTER_BY_ID } from './data/characters';
import { getScenario } from './map';
import { RULES_VERSION } from './version';
import { beginTurn } from './turns';
import { type Ctx, emit, makeCard } from './core';
import type { GameEvent, ItemId } from './types';

export interface CreateOptions {
  scenarioId?: string;
  rulesVersion?: string;
  seed: number;
  /** Survivors in fixed turn order. `owner` is the player/seat id. */
  survivors: { charId: string; owner: string }[];
}

/** Base-game table: survivors per player, capped at 6 survivors in total. */
export function defaultSurvivorsPerPlayer(players: number): number {
  if (players <= 1) return 4;
  if (players === 2) return 3;
  if (players === 3) return 2;
  return 1;
}

export function createGame(opts: CreateOptions): { state: GameState; events: GameEvent[] } {
  const sc = getScenario(opts.scenarioId ?? 'long_block');
  if (opts.survivors.length < 1 || opts.survivors.length > 6) throw new Error('1 to 6 survivors');
  const seen = new Set<string>();
  for (const sv of opts.survivors) {
    if (!CHARACTER_BY_ID[sv.charId]) throw new Error(`unknown character ${sv.charId}`);
    if (seen.has(sv.charId)) throw new Error(`duplicate character ${sv.charId}`);
    seen.add(sv.charId);
  }
  const rng = new Rng(opts.seed);
  const state: GameState = {
    rulesVersion: opts.rulesVersion ?? RULES_VERSION,
    scenarioId: sc.id,
    status: 'active',
    round: 1,
    turnOrder: opts.survivors.map((s) => s.charId),
    turnIndex: 0,
    turn: null,
    pending: null,
    survivors: {},
    zombies: [],
    noise: {},
    doors: Object.fromEntries(sc.edges.filter((e) => e.door).map((e) => [e.id, !!e.startOpen])),
    filled: Object.fromEntries(sc.buildings.map((b) => [b.id, false])),
    objectives: {},
    team: { keys: false, fuel: false },
    searchDeck: [],
    searchDiscard: [],
    spawnDeck: [],
    spawnDiscard: [],
    nextId: 1,
    rng: 0,
  };
  const c: Ctx = { s: state, ev: [], rng };

  // Decks
  for (const [item, n] of SEARCH_DECK) for (let i = 0; i < n; i++) state.searchDeck.push(makeCard(c, item));
  rng.shuffle(state.searchDeck);
  for (const card of SPAWN_CARDS) for (let i = 0; i < card.copies; i++) state.spawnDeck.push(card.id);
  rng.shuffle(state.spawnDeck);

  // Objectives
  const kinds = rng.shuffle(sc.hiddenMarkers.map((_, i) => (i === 0 ? 'keys' : 'supplies') as ObjectiveToken['kind']));
  sc.hiddenMarkers.forEach((zone, i) => {
    state.objectives[zone] = { kind: must(kinds[i]), hidden: true };
  });
  for (const o of sc.fixedObjectives) state.objectives[o.zone] = { kind: o.kind, hidden: false };

  // Starting gear: one card each from a shuffled pool.
  const pool: ItemId[] = ['fire_axe', 'crowbar', 'pistol'];
  while (pool.length < opts.survivors.length) pool.push('frying_pan');
  rng.shuffle(pool);
  opts.survivors.forEach((o, i) => {
    const slots: (Card | null)[] = [null, null, null, null, null];
    slots[0] = makeCard(c, must(pool[i]));
    const sv: Survivor = {
      id: o.charId,
      charId: o.charId,
      owner: o.owner,
      zone: sc.startZone,
      slots,
      xp: 0,
      level: 0,
      alive: true,
      roundFlags: { thickSkin: false, secondWind: false, steadyPresence: false },
    };
    state.survivors[sv.id] = sv;
  });

  emit(c, 'game_started', { scenario: sc.id, survivors: state.turnOrder });
  beginTurn(c, must(state.survivors[must(state.turnOrder[0])]));
  state.rng = rng.state;
  return { state, events: c.ev };
}
