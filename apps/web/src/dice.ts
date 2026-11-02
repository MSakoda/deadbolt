import type { GameEvent } from '@deadbolt/engine';

/** One attack roll, ready to animate: the dice, the hit threshold, rerolls, and what the hits did. */
export interface Roll {
  id: string;
  survivor: string;
  weapon: string;
  target: string;
  dual: boolean;
  needs: number;
  initial: number[];
  rerolls: { why: string; from: number; to: number }[];
  hits: number;
  killed: number;
  wasted: number;
  friendly: number;
}

let counter = 0;

/** Pulls every attack roll out of an event list. Rerolls are emitted just before the attack they belong to. */
export function extractRolls(events: GameEvent[]): Roll[] {
  const out: Roll[] = [];
  let rerolls: Roll['rerolls'] = [];
  let cur: Roll | null = null;
  for (const e of events) {
    if (e.type === 'reroll') {
      rerolls.push({ why: String(e['why']), from: Number(e['from']), to: Number(e['to']) });
    } else if (e.type === 'attack') {
      cur = {
        id: `roll${++counter}`,
        survivor: String(e['survivor']),
        weapon: String(e['weapon']),
        target: String(e['target']),
        dual: !!e['dual'],
        needs: Number(e['needs']),
        initial: (e['initialRolls'] as number[]).slice(),
        rerolls,
        hits: Number(e['hits']),
        killed: 0,
        wasted: 0,
        friendly: 0,
      };
      rerolls = [];
      out.push(cur);
    } else if (cur && e.type === 'zombie_killed') cur.killed += 1;
    else if (cur && e.type === 'hit_wasted') cur.wasted += 1;
    else if (cur && e.type === 'friendly_fire') cur.friendly += 1;
    else if (e.type === 'turn_ended' || e.type === 'zombie_phase_start') cur = null;
  }
  return out;
}
