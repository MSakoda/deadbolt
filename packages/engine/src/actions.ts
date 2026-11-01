import type { Action, Card, ItemId, Survivor, TurnState, ZombieType, ZoneId } from './types';
import {
  type Ctx, addNoise, addZombie, discardCard, drawSearchCard, emit, fail, fillBuilding, getSurvivor,
  has, killZombie, makeCard, survivorsIn, turnOf, woundCount, woundSurvivor, zombiesIn,
} from './core';
import { COMBINES, ITEMS } from './data/items';
import { ZOMBIE_DEFS } from './data/spawn';
import { edgeBetween, edgePassable, getScenario, visible, zoneDef } from './map';
import { must } from './rng';
import { advanceTurn } from './turns';

const SCRATCH = (): Pick<TurnState, 'quietShotUsed' | 'ammoUsed' | 'frenzyUsed'> => ({
  quietShotUsed: false, ammoUsed: false, frenzyUsed: false,
});

/** Per-turn flags only apply to the survivor whose turn it is. */
function flagsFor(c: Ctx, actor: Survivor): Pick<TurnState, 'quietShotUsed' | 'ammoUsed' | 'frenzyUsed'> {
  const t = c.s.turn;
  return t && t.survivorId === actor.id ? t : SCRATCH();
}

function spend(c: Ctx, cost: number, free: boolean): void {
  if (free || cost === 0) return;
  const t = turnOf(c);
  if (t.actionsLeft < cost) fail('not enough actions');
  t.actionsLeft -= cost;
}

const handCards = (sv: Survivor): Card[] => [sv.slots[0], sv.slots[1]].filter((x): x is Card => !!x);

// ---------- movement and doors ----------

function doMove(c: Ctx, actor: Survivor, to: ZoneId, free: boolean): void {
  const s = c.s;
  const edge = edgeBetween(s, actor.zone, to);
  if (!edge || !edgePassable(s, edge)) fail('cannot move there');
  const zombiesHere = zombiesIn(s, actor.zone).length;
  const extra = has(actor, 'slip_past') ? 0 : zombiesHere;
  const t = c.s.turn;
  const isActive = !!t && t.survivorId === actor.id;
  if (free) {
    if (zombiesHere > 0 && extra > 0) fail('too dangerous for a free move');
  } else {
    let base = 1;
    if (isActive && t && t.free.move > 0) {
      base = 0;
    }
    spend(c, base + extra, false);
    if (base === 0 && t) t.free.move -= 1;
  }
  const from = actor.zone;
  actor.zone = to;
  emit(c, 'moved', { survivor: actor.id, from, to });
}

function doOpenDoor(c: Ctx, actor: Survivor, to: ZoneId, free: boolean): void {
  const s = c.s;
  const edge = edgeBetween(s, actor.zone, to);
  if (!edge || !edge.door) fail('no door there');
  if (s.doors[edge.id]) fail('door is already open');
  const tools = handCards(actor)
    .map((card) => ITEMS[card.item])
    .filter((d) => d.door !== 'none');
  if (tools.length === 0) fail('you need a door-opening weapon in hand');
  const tool = tools.find((d) => d.door === 'silent') ?? must(tools[0]);
  spend(c, 1, free);
  s.doors[edge.id] = true;
  emit(c, 'door_opened', { survivor: actor.id, edge: edge.id, from: actor.zone, to, tool: tool.id });
  if (tool.door === 'noisy' && !has(actor, 'quiet_hands')) addNoise(c, actor.zone);
  for (const zid of [edge.a, edge.b]) {
    const b = zoneDef(s, zid).building;
    if (b) fillBuilding(c, b);
  }
}

// ---------- searching ----------

function startSearchDraw(c: Ctx, actor: Survivor, count: number, source: 'search' | 'supplies'): void {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawSearchCard(c);
    if (!card) break;
    if (card.item === 'alarm') {
      discardCard(c, card);
      for (const d of drawn) discardCard(c, d);
      emit(c, 'alarm', { survivor: actor.id, zone: actor.zone });
      addZombie(c, actor.zone, 'shambler', 'alarm');
      return;
    }
    drawn.push(card);
  }
  emit(c, 'cards_drawn', { survivor: actor.id, count: drawn.length, source });
  if (drawn.length === 0) return;
  c.s.pending = { kind: 'search', survivorId: actor.id, cards: drawn, source };
}

function doSearch(c: Ctx, actor: Survivor, free: boolean): void {
  const s = c.s;
  const t = turnOf(c);
  if (zoneDef(s, actor.zone).kind !== 'room') fail('you can only search indoors');
  if (zombiesIn(s, actor.zone).length > 0) fail('cannot search with zombies in the zone');
  if (t.searches >= (has(actor, 'second_look') ? 2 : 1)) fail('already searched this turn');
  spend(c, 1, free);
  t.searches++;
  const two = has(actor, 'sharp_eye') || actor.slots.some((x) => x?.item === 'flashlight');
  startSearchDraw(c, actor, two ? 2 : 1, 'search');
}

function doResolveSearch(c: Ctx, actor: Survivor, a: Extract<Action, { type: 'resolve_search' }>): void {
  const p = c.s.pending ?? fail('nothing to resolve');
  if (p.survivorId !== actor.id) fail('not your search');
  let kept: Card | null = null;
  if (a.keep !== null) {
    kept = p.cards[a.keep] ?? fail('no such card');
    const slot = a.replaceSlot ?? actor.slots.findIndex((x) => x === null);
    if (a.replaceSlot === undefined && slot < 0) fail('inventory is full: choose a slot to replace');
    if (slot < 0 || slot >= actor.slots.length) fail('bad slot');
    const old = actor.slots[slot];
    if (old) {
      if (old.item === 'wound') fail('cannot replace a Wounded card');
      discardCard(c, old);
    }
    actor.slots[slot] = kept;
  }
  p.cards.forEach((card, i) => {
    if (i !== a.keep) discardCard(c, card);
  });
  emit(c, 'card_kept', { survivor: actor.id, item: kept?.item ?? null });
  c.s.pending = null;
  if (c.s.turn && c.s.turn.survivorId === actor.id) c.s.turn.freeReorg = true;
}

// ---------- combat ----------

interface AttackResult { kills: number }

function rollDice(c: Ctx, n: number): number[] {
  return Array.from({ length: n }, () => c.rng.d6());
}

function rerollMisses(c: Ctx, rolls: number[], acc: number, max: number, why: string): number {
  let used = 0;
  for (let i = 0; i < rolls.length && used < max; i++) {
    if (must(rolls[i]) < acc) {
      const from = must(rolls[i]);
      rolls[i] = c.rng.d6();
      used++;
      emit(c, 'reroll', { why, from, to: rolls[i] });
    }
  }
  return used;
}

const AUTO_PRIORITY: ZombieType[] = ['shambler', 'brute', 'mutant', 'sprinter'];
const MELEE_PRIORITY: ZombieType[] = ['sprinter', 'brute', 'mutant', 'shambler'];

function pickZombie(c: Ctx, zone: ZoneId, order: ZombieType[], damage: number): string | null {
  for (const type of order) {
    if (ZOMBIE_DEFS[type].toughness > damage) continue;
    const z = zombiesIn(c.s, zone).find((x) => x.type === type);
    if (z) return z.id;
  }
  return null;
}

function doAttack(c: Ctx, actor: Survivor, a: Extract<Action, { type: 'attack' }>, free: boolean): AttackResult {
  const s = c.s;
  const slots = a.slot === 'both' ? [0, 1] : [a.slot];
  const cards = slots.map((i) => actor.slots[i] ?? fail('no weapon in that hand'));
  const defs = cards.map((card) => ITEMS[card.item]);
  const def = must(defs[0]);
  if (def.kind === 'thrown') return doThrow(c, actor, a, cards, free);
  if (def.kind !== 'melee' && def.kind !== 'ranged') fail('that is not a weapon');
  if (cards.length === 2) {
    if (!def.dual || defs[1]?.id !== def.id) fail('both hands need matching dual-wield weapons');
  }
  for (const card of cards) if (card.spent) fail('weapon needs reloading');

  const range = must(def.range);
  const seen = visible(s, actor.zone);
  const dist = seen.get(a.target);
  if (def.kind === 'melee') {
    if (a.target !== actor.zone) fail('melee only hits your own zone');
  } else if (dist === undefined || dist < range[0] || dist > range[1]) {
    fail('target out of range or sight');
  }
  if (zombiesIn(s, a.target).length === 0) fail('no zombies there');

  // Cost: a free melee action covers a melee attack.
  const t = s.turn;
  const isActive = !!t && t.survivorId === actor.id;
  if (!free) {
    if (def.kind === 'melee' && isActive && t && t.free.melee > 0) t.free.melee -= 1;
    else spend(c, 1, false);
  }

  const flags = flagsFor(c, actor);
  const perWeapon = def.dice! + (def.kind === 'melee' ? (has(actor, 'heavy_swing') ? 1 : 0) : has(actor, 'practiced_hands') ? 1 : 0);
  const acc = def.accuracy!;
  const rolls = rollDice(c, perWeapon * cards.length);
  const initial = [...rolls];
  if (def.kind === 'ranged' && has(actor, 'steady_aim')) rerollMisses(c, rolls, acc, 1, 'steady_aim');
  const wind = survivorsIn(s, actor.zone).find((m) => has(m, 'second_wind') && !m.roundFlags.secondWind);
  if (wind && rolls.some((r) => r < acc)) {
    if (rerollMisses(c, rolls, acc, 1, 'second_wind') > 0) wind.roundFlags.secondWind = true;
  }
  if (def.kind === 'ranged' && !flags.ammoUsed && actor.slots.some((x) => x?.item === 'plenty_of_ammo') && rolls.some((r) => r < acc)) {
    flags.ammoUsed = true;
    rerollMisses(c, rolls, acc, rolls.length, 'plenty_of_ammo');
  }
  const hits = rolls.filter((r) => r >= acc).length;
  emit(c, 'attack', { survivor: actor.id, weapon: def.id, dual: cards.length === 2, target: a.target, initialRolls: initial, rolls, hits, needs: acc, damage: (def.damage ?? 1) + (def.kind === 'ranged' && has(actor, 'clean_kill') ? 1 : 0) });

  // Noise: one token per action.
  let noisy = !!def.noisy;
  if (def.kind === 'ranged' && has(actor, 'quiet_shot') && !flags.quietShotUsed) {
    flags.quietShotUsed = true;
    noisy = false;
  }
  if (noisy) addNoise(c, actor.zone);
  if (def.reload) for (const card of cards) card.spent = true;

  // Apply hits.
  const damage = (def.damage ?? 1) + (def.kind === 'ranged' && has(actor, 'clean_kill') ? 1 : 0);
  const choose = def.kind === 'melee' || !!def.chooseTargets;
  const order = a.prefer && a.prefer.length > 0 ? a.prefer : def.kind === 'melee' ? MELEE_PRIORITY : AUTO_PRIORITY;
  let kills = 0;
  for (let i = 0; i < hits; i++) {
    if (!choose) {
      const friends = survivorsIn(s, a.target).filter((v) => v.id !== actor.id);
      const victim = friends[0];
      if (victim) {
        emit(c, 'friendly_fire', { shooter: actor.id, victim: victim.id });
        woundSurvivor(c, victim, `friendly:${actor.id}`);
        continue;
      }
    }
    const zid = pickZombie(c, a.target, order, damage) ?? (choose ? null : pickZombie(c, a.target, AUTO_PRIORITY, damage));
    if (!zid) {
      emit(c, 'hit_wasted', { survivor: actor.id });
      continue;
    }
    killZombie(c, zid, actor, 'attack');
    kills++;
  }
  if (kills > 0 && def.kind === 'melee' && has(actor, 'frenzy') && !flags.frenzyUsed && s.turn && s.turn.survivorId === actor.id) {
    flags.frenzyUsed = true;
    s.turn.free.melee += 1;
    emit(c, 'free_action_gained', { survivor: actor.id, why: 'frenzy' });
  }
  return { kills };
}

function doThrow(c: Ctx, actor: Survivor, a: Extract<Action, { type: 'attack' }>, cards: Card[], free: boolean): AttackResult {
  const s = c.s;
  if (cards.length !== 1) fail('throw one Molotov at a time');
  const dist = visible(s, actor.zone).get(a.target);
  if (dist === undefined || dist > 1) fail('target out of range or sight');
  const victims = zombiesIn(s, a.target);
  if (victims.length === 0) fail('no zombies there');
  spend(c, 1, free);
  const slot = actor.slots.findIndex((x) => x?.id === must(cards[0]).id);
  actor.slots[slot] = null;
  emit(c, 'molotov', { survivor: actor.id, target: a.target });
  let kills = 0;
  for (const z of victims) {
    killZombie(c, z.id, actor, 'molotov');
    kills++;
  }
  for (const v of survivorsIn(s, a.target)) woundSurvivor(c, v, 'molotov');
  return { kills };
}

// ---------- inventory ----------

function doReload(c: Ctx, actor: Survivor, slot: number, free: boolean): void {
  const card = actor.slots[slot] ?? fail('nothing there');
  if (!ITEMS[card.item].reload || !card.spent) fail('nothing to reload');
  spend(c, 1, free);
  delete card.spent;
  emit(c, 'reloaded', { survivor: actor.id, slot });
}

function doCombine(c: Ctx, actor: Survivor, a: number, b: number): void {
  if (a === b) fail('pick two different cards');
  const ca = actor.slots[a] ?? fail('nothing in slot');
  const cb = actor.slots[b] ?? fail('nothing in slot');
  const combo = COMBINES.find(([x, y]) => (x === ca.item && y === cb.item) || (y === ca.item && x === cb.item));
  if (!combo) fail('those do not combine');
  const result: ItemId = combo[2];
  actor.slots[a] = makeCard(c, result);
  actor.slots[b] = null;
  emit(c, 'combined', { survivor: actor.id, result });
}

function doReorganize(c: Ctx, actor: Survivor, a: Extract<Action, { type: 'reorganize' }>, free: boolean): void {
  const s = c.s;
  const ids = Object.keys(a.arrangements);
  if (!ids.includes(actor.id)) fail('include your own inventory');
  if (ids.length > 2) fail('trade with at most one other survivor');
  const people = ids.map((id) => getSurvivor(s, id));
  for (const p of people) {
    if (!p.alive) fail('that survivor is dead');
    if (p.zone !== actor.zone) fail('survivors must share a zone');
  }
  const pool = new Map<string, Card>();
  for (const p of people) for (const card of p.slots) if (card) pool.set(card.id, card);
  const used = new Set<string>();
  const next = new Map<string, (Card | null)[]>();
  for (const p of people) {
    const arr = must(a.arrangements[p.id]);
    if (arr.length !== p.slots.length) fail('wrong number of slots');
    const out = arr.map((id) => {
      if (id === null) return null;
      const card = pool.get(id) ?? fail('unknown card');
      if (used.has(id)) fail('card used twice');
      used.add(id);
      return card;
    });
    for (const card of p.slots) {
      if (card?.item === 'wound' && !out.includes(card)) fail('Wounded cards cannot be moved or discarded');
    }
    for (const card of out) {
      if (card?.item === 'wound' && !p.slots.includes(card)) fail('Wounded cards cannot be traded');
    }
    next.set(p.id, out);
  }
  const t = s.turn;
  if (t && t.freeReorg && !free) t.freeReorg = false;
  else spend(c, 1, free);
  for (const [id, card] of pool) {
    if (!used.has(id)) {
      discardCard(c, card);
      emit(c, 'item_discarded', { survivor: actor.id, item: card.item });
    }
  }
  for (const p of people) p.slots = must(next.get(p.id));
  emit(c, 'reorganized', { survivor: actor.id, with: ids.filter((i) => i !== actor.id) });
}

// ---------- misc ----------

function doTakeObjective(c: Ctx, actor: Survivor, free: boolean): void {
  const tok = c.s.objectives[actor.zone] ?? fail('nothing to take here');
  spend(c, 1, free);
  delete c.s.objectives[actor.zone];
  emit(c, 'objective_taken', { survivor: actor.id, zone: actor.zone, kind: tok.kind, wasHidden: tok.hidden });
  if (tok.kind === 'keys') c.s.team.keys = true;
  else if (tok.kind === 'fuel') c.s.team.fuel = true;
  else startSearchDraw(c, actor, 1, 'supplies');
}

function doStartTruck(c: Ctx, actor: Survivor, free: boolean): void {
  const s = c.s;
  if (!s.team.keys || !s.team.fuel) fail('you need the keys and the fuel');
  const exit = zoneDef(s, actor.zone);
  if (!isExit(c, exit.id)) fail('the truck is at the exit zone');
  const alive = Object.values(s.survivors).filter((v) => v.alive);
  if (alive.some((v) => v.zone !== actor.zone)) fail('all living survivors must be at the truck');
  spend(c, 1, free);
  s.status = 'won';
  s.turn = null;
  s.pending = null;
  emit(c, 'game_won', { round: s.round });
}

const isExit = (c: Ctx, zone: ZoneId): boolean => getScenario(c.s.scenarioId).exitZone === zone;

function doFirstAid(c: Ctx, actor: Survivor, targetId: string): void {
  const t = turnOf(c);
  if (!has(actor, 'first_aid')) fail('you are not a medic');
  if (t.survivorId !== actor.id) fail('only on your own turn');
  if (t.firstAid >= (has(actor, 'triage') ? 2 : 1)) fail('First Aid already used');
  const target = getSurvivor(c.s, targetId);
  if (!target.alive || target.zone !== actor.zone) fail('target must be in your zone');
  const n = has(actor, 'field_hospital') ? 2 : 1;
  if (woundCount(target) === 0) fail('nobody to heal');
  let healed = 0;
  for (let i = 0; i < target.slots.length && healed < n; i++) {
    if (target.slots[i]?.item === 'wound') {
      target.slots[i] = null;
      healed++;
    }
  }
  t.firstAid++;
  emit(c, 'healed', { medic: actor.id, target: target.id, wounds: healed });
}

function doGrant(c: Ctx, actor: Survivor, a: Extract<Action, { type: 'grant' }>): void {
  const t = turnOf(c);
  if (t.survivorId !== actor.id) fail('only on your own turn');
  const target = getSurvivor(c.s, a.target);
  if (!target.alive || target.id === actor.id || target.zone !== actor.zone) fail('target must be another survivor in your zone');
  const then = a.then;
  if (then.type === 'move' && has(actor, 'roll_call') && !t.rollCall) {
    t.rollCall = true;
  } else if (has(actor, 'rally_point') && !t.rally && (then.type === 'move' || then.type === 'open_door' || then.type === 'attack')) {
    t.rally = true;
  } else {
    fail('that grant is not available');
  }
  emit(c, 'free_action_granted', { by: actor.id, to: target.id, action: then.type });
  perform(c, target, then, true);
}

// ---------- dispatcher ----------

export function perform(c: Ctx, actor: Survivor, a: Action, free: boolean): void {
  const s = c.s;
  if (s.status !== 'active') fail('the game is over');
  if (a.type !== 'resolve_search' && s.pending) fail('resolve the search first');
  switch (a.type) {
    case 'move': return doMove(c, actor, a.to, free);
    case 'open_door': return doOpenDoor(c, actor, a.to, free);
    case 'search': return doSearch(c, actor, free);
    case 'resolve_search': return doResolveSearch(c, actor, a);
    case 'attack': { doAttack(c, actor, a, free); return; }
    case 'reload': return doReload(c, actor, a.slot, free);
    case 'reorganize': return doReorganize(c, actor, a, free);
    case 'combine': return doCombine(c, actor, a.a, a.b);
    case 'noise': spend(c, 1, free); addNoise(c, actor.zone); return;
    case 'take_objective': return doTakeObjective(c, actor, free);
    case 'start_truck': return doStartTruck(c, actor, free);
    case 'first_aid': return doFirstAid(c, actor, a.target);
    case 'grant': return doGrant(c, actor, a);
    case 'end_turn': advanceTurn(c); return;
  }
}

