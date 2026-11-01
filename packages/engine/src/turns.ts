import type { Survivor } from './types';
import { type Ctx, emit, getSurvivor, has } from './core';
import { runZombiePhase } from './zombies';

export function beginTurn(c: Ctx, sv: Survivor): void {
  const actions = 3 + (sv.level >= 1 ? 1 : 0) + (has(sv, 'plan_b') ? 1 : 0);
  c.s.turn = {
    survivorId: sv.id,
    actionsLeft: actions,
    free: {
      move: (has(sv, 'quick_feet') ? 1 : 0) + (has(sv, 'sprint') ? 1 : 0),
      melee: has(sv, 'crowd_breaker') ? 1 : 0,
    },
    searches: 0,
    freeReorg: false,
    rollCall: false,
    rally: false,
    firstAid: 0,
    quietShotUsed: false,
    ammoUsed: false,
    frenzyUsed: false,
  };
  emit(c, 'turn_started', { survivor: sv.id, owner: sv.owner, round: c.s.round, actions });
}

/** Finish the current turn and move to the next living survivor, running the zombie phase if the round is over. */
export function advanceTurn(c: Ctx): void {
  const s = c.s;
  const finished = s.turn ? getSurvivor(s, s.turn.survivorId) : null;
  if (finished) {
    for (const card of finished.slots) if (card) delete card.spent;
    emit(c, 'turn_ended', { survivor: finished.id });
  }
  s.turn = null;
  s.pending = null;
  for (let guard = 0; guard < 1000; guard++) {
    s.turnIndex++;
    if (s.turnIndex >= s.turnOrder.length) {
      runZombiePhase(c);
      if (s.status !== 'active') return;
      s.round++;
      s.turnIndex = 0;
      for (const v of Object.values(s.survivors)) {
        v.roundFlags = { thickSkin: false, secondWind: false, steadyPresence: false };
      }
      emit(c, 'round_started', { round: s.round });
    }
    const id = s.turnOrder[s.turnIndex];
    const sv = id ? getSurvivor(s, id) : undefined;
    if (sv?.alive) {
      beginTurn(c, sv);
      return;
    }
  }
}
