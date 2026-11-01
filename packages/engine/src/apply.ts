import type { Action, ActionResult, GameState } from './types';
import { Rng } from './rng';
import { type Ctx, RuleError, fail, getSurvivor } from './core';
import { perform } from './actions';
import { advanceTurn } from './turns';

/**
 * Apply one action to a game state. Pure: the input is never mutated, and all
 * randomness comes from the PRNG state stored inside the game state (or the
 * `rng` you pass in, which is advanced in place).
 */
export function applyAction(state: GameState, action: Action, rng?: Rng): ActionResult {
  const s = structuredClone(state);
  const r = rng ?? new Rng(s.rng);
  const c: Ctx = { s, ev: [], rng: r };
  try {
    if (s.status !== 'active') fail('the game is over');
    const t = s.turn ?? fail('no active turn');
    const actor = getSurvivor(s, t.survivorId);
    perform(c, actor, action, false);
    // The active survivor can die to their own molotov or friendly fire.
    if (s.status === 'active' && s.turn && !getSurvivor(s, s.turn.survivorId).alive) advanceTurn(c);
    s.rng = r.state;
    return { ok: true, state: s, events: c.ev };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
