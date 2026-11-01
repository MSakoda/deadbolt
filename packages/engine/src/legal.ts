import type { Action, GameState, Survivor } from './types';
import { applyAction } from './apply';
import { getSurvivor } from './core';
import { neighbors, visible, graphFor } from './map';
import { ITEMS } from './data/items';

/**
 * Every action the seat could take right now, except free-form `reorganize`
 * (only self hand-swaps are listed; applyAction accepts any valid arrangement).
 * Each candidate is dry-run through applyAction, so the list never lies.
 */
export function legalActions(state: GameState, seat: string): Action[] {
  if (state.status !== 'active' || !state.turn) return [];
  const actor = getSurvivor(state, state.turn.survivorId);
  if (actor.owner !== seat) return [];
  return candidates(state, actor).filter((a) => applyAction(state, a).ok);
}

function candidates(s: GameState, actor: Survivor): Action[] {
  if (s.pending) {
    const out: Action[] = [{ type: 'resolve_search', keep: null }];
    const full = actor.slots.every((x) => x !== null);
    s.pending.cards.forEach((_, i) => {
      if (!full) out.push({ type: 'resolve_search', keep: i });
      else actor.slots.forEach((_c, slot) => out.push({ type: 'resolve_search', keep: i, replaceSlot: slot }));
    });
    return out;
  }
  const out: Action[] = [{ type: 'end_turn' }, { type: 'search' }, { type: 'noise' }, { type: 'take_objective' }, { type: 'start_truck' }];
  const g = graphFor(s.scenarioId);
  for (const n of g.adj.get(actor.zone) ?? []) {
    out.push({ type: 'move', to: n.to });
    if (n.edge.door) out.push({ type: 'open_door', to: n.to });
  }
  const seen = visible(s, actor.zone);
  const targets = [...seen.keys()];
  for (const slot of [0, 1, 'both'] as const) for (const target of targets) out.push({ type: 'attack', slot, target });
  actor.slots.forEach((card, i) => {
    if (card && ITEMS[card.item].reload) out.push({ type: 'reload', slot: i });
  });
  for (let a = 0; a < actor.slots.length; a++) for (let b = a + 1; b < actor.slots.length; b++) out.push({ type: 'combine', a, b });
  for (let pack = 2; pack < actor.slots.length; pack++) {
    for (const hand of [0, 1]) {
      if (!actor.slots[pack]) continue;
      const slots = actor.slots.map((x) => x?.id ?? null);
      const tmp = slots[hand] ?? null;
      slots[hand] = slots[pack] ?? null;
      slots[pack] = tmp;
      out.push({ type: 'reorganize', arrangements: { [actor.id]: slots } });
    }
  }
  const allies = Object.values(s.survivors).filter((v) => v.alive && v.id !== actor.id && v.zone === actor.zone);
  for (const v of [actor, ...allies]) out.push({ type: 'first_aid', target: v.id });
  for (const ally of allies) {
    for (const to of neighbors(s, actor.zone)) out.push({ type: 'grant', target: ally.id, then: { type: 'move', to } });
    for (const n of g.adj.get(actor.zone) ?? []) {
      if (n.edge.door) out.push({ type: 'grant', target: ally.id, then: { type: 'open_door', to: n.to } });
    }
    for (const slot of [0, 1] as const) for (const target of targets) out.push({ type: 'grant', target: ally.id, then: { type: 'attack', slot, target } });
  }
  return out;
}
