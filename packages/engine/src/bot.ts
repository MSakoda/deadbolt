import type { Action, GameState, ItemId, Survivor, ZoneId } from './types';
import { legalActions } from './legal';
import { getSurvivor, woundCount, zombiesIn, survivorsIn } from './core';
import { ITEMS } from './data/items';
import { getScenario, planningDistances, edgeBetween } from './map';

/** A deliberately simple greedy player used for smoke tests and balance sims. */
const VALUE: Partial<Record<ItemId, number>> = {
  chainsaw: 10, sawed_off: 9, smg: 8, fire_axe: 7, pistol: 7, rifle_scope: 7, rifle: 6, goalie_mask: 6,
  molotov: 6, crowbar: 5, machete: 5, flashlight: 3, plenty_of_ammo: 3, scope: 3, glass_bottle: 2, gasoline: 2, frying_pan: 1,
};
const val = (id: ItemId | undefined): number => (id ? VALUE[id] ?? 0 : 0);

function goalFor(s: GameState, from: ZoneId): ZoneId {
  const sc = getScenario(s.scenarioId);
  if (s.team.keys && s.team.fuel) return sc.exitZone;
  const targets = Object.entries(s.objectives)
    .filter(([, tok]) => tok.kind === 'fuel' || (tok.hidden && !s.team.keys) || (tok.kind === 'keys'))
    .filter(([, tok]) => !(tok.kind === 'fuel' && s.team.fuel))
    .map(([zone]) => zone);
  if (targets.length === 0) return sc.exitZone;
  const dist = planningDistances(s, from);
  targets.sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99));
  return targets[0] ?? sc.exitZone;
}

function expectedHits(item: ItemId, both: boolean): number {
  const d = ITEMS[item];
  if (!d.dice || !d.accuracy) return 0;
  return d.dice * ((7 - d.accuracy) / 6) * (both ? 2 : 1);
}

export function scoreAction(s: GameState, actor: Survivor, a: Action): number {
  switch (a.type) {
    case 'start_truck': return 1000;
    case 'take_objective': return 90;
    case 'end_turn': return 5;
    case 'noise': return -100;
    case 'grant': return -50;
    case 'search': return 35;
    case 'reload': return 40;
    case 'combine': return 70;
    case 'first_aid': {
      const t = getSurvivor(s, a.target);
      return woundCount(t) > 0 ? 65 : -100;
    }
    case 'resolve_search': {
      if (a.keep === null) return 200;
      const card = s.pending?.cards[a.keep];
      const gain = val(card?.item) - val(actor.slots[a.replaceSlot ?? -1]?.item);
      return a.replaceSlot !== undefined && gain <= 0 ? 150 : 200 + gain;
    }
    case 'reorganize': {
      const mine = a.arrangements[actor.id] ?? [];
      const byId = new Map(actor.slots.map((c) => [c?.id, c?.item]));
      const gain = [0, 1].reduce((sum, i) => sum + val(byId.get(mine[i] ?? undefined)) - val(actor.slots[i]?.item), 0);
      return gain > 0 ? 55 + 5 * gain : -100;
    }
    case 'attack': {
      const zs = zombiesIn(s, a.target).length;
      const cards = a.slot === 'both' ? [actor.slots[0], actor.slots[1]] : [actor.slots[a.slot]];
      const first = cards[0];
      if (!first) return -100;
      const def = ITEMS[first.item];
      const friends = survivorsIn(s, a.target).filter((v) => v.id !== actor.id).length;
      if (def.kind === 'thrown') return friends > 0 || a.target === actor.zone ? -100 : zs >= 3 ? 85 : 20;
      if (def.kind === 'ranged' && !def.chooseTargets && friends > 0) return -100;
      const exp = Math.min(zs, expectedHits(first.item, a.slot === 'both'));
      const here = a.target === actor.zone ? 1 : 0;
      return 50 + 18 * exp + 15 * here;
    }
    case 'open_door': {
      const goal = goalFor(s, actor.zone);
      const dist = planningDistances(s, goal);
      return (dist.get(a.to) ?? 99) < (dist.get(actor.zone) ?? 99) ? 45 : 5;
    }
    case 'move': {
      const goal = goalFor(s, actor.zone);
      const dist = planningDistances(s, goal);
      const gain = (dist.get(actor.zone) ?? 99) - (dist.get(a.to) ?? 99);
      const zs = zombiesIn(s, a.to).length;
      const edge = edgeBetween(s, actor.zone, a.to);
      void edge;
      if (gain <= 0) return -10;
      return 30 + 12 * gain - 6 * zs;
    }
  }
  return 0;
}

export function chooseAction(s: GameState): Action {
  if (!s.turn) throw new Error('no active turn');
  const actor = getSurvivor(s, s.turn.survivorId);
  const options = legalActions(s, actor.owner);
  let best: Action = { type: 'end_turn' };
  let bestScore = -Infinity;
  for (const a of options) {
    const sc = scoreAction(s, actor, a);
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  return bestScore < 5 ? { type: 'end_turn' } : best;
}
