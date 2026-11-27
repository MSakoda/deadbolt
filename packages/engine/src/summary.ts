import type { GameEvent, GameState, ObjectiveKind, SurvivorId, ZombieType } from './types';

const ZOMBIE_TYPES: ZombieType[] = ['shambler', 'sprinter', 'brute', 'mutant'];
const emptyKills = (): Record<ZombieType, number> => ({ shambler: 0, sprinter: 0, brute: 0, mutant: 0 });

export interface SurvivorSummary {
  id: SurvivorId;
  charId: string;
  owner: string;
  level: number;
  xp: number;
  alive: boolean;
  kills: Record<ZombieType, number>;
  killTotal: number;
  /** Wounds taken over the whole game (healed ones included). */
  wounds: number;
  /** Wounds this survivor healed on others as the medic. */
  healed: number;
  doorsOpened: number;
  /** Objectives this survivor picked up, in order. */
  objectives: ObjectiveKind[];
}

export interface GameSummary {
  outcome: 'won' | 'lost' | 'active';
  rounds: number;
  survivors: SurvivorSummary[];
  /** Everything killed, including zombies nobody gets credit for (fire, friendly accidents). */
  kills: Record<ZombieType, number>;
  killTotal: number;
  survivorsLost: number;
  doorsOpened: number;
}

/**
 * Totals for a game, read from its final state and the events of every step. Pure: the same inputs
 * always give the same summary, so hot-seat, the server and emails can all use it.
 */
export function summarizeGame(state: GameState, events: GameEvent[]): GameSummary {
  const by = new Map<SurvivorId, SurvivorSummary>();
  for (const id of state.turnOrder) {
    const sv = state.survivors[id]!;
    by.set(id, {
      id, charId: sv.charId, owner: sv.owner, level: sv.level, xp: sv.xp, alive: sv.alive,
      kills: emptyKills(), killTotal: 0, wounds: 0, healed: 0, doorsOpened: 0, objectives: [],
    });
  }
  const kills = emptyKills();
  let doorsOpened = 0;
  for (const e of events) {
    const who = (key: string): SurvivorSummary | undefined => {
      const v = e[key];
      return typeof v === 'string' ? by.get(v) : undefined;
    };
    switch (e.type) {
      case 'zombie_killed': {
        const t = e['zombieType'] as ZombieType;
        if (!ZOMBIE_TYPES.includes(t)) break;
        kills[t] += 1;
        const k = who('by');
        if (k) { k.kills[t] += 1; k.killTotal += 1; }
        break;
      }
      case 'wounded': { const s = who('survivor'); if (s) s.wounds += 1; break; }
      case 'healed': { const s = who('medic'); if (s) s.healed += Number(e['wounds']) || 1; break; }
      case 'door_opened': { const s = who('survivor'); if (s) s.doorsOpened += 1; doorsOpened += 1; break; }
      case 'objective_taken': { const s = who('survivor'); if (s) s.objectives.push(e['kind'] as ObjectiveKind); break; }
    }
  }
  const list = [...by.values()];
  return {
    outcome: state.status,
    rounds: state.round,
    survivors: list,
    kills,
    killTotal: ZOMBIE_TYPES.reduce((n, t) => n + kills[t], 0),
    survivorsLost: list.filter((s) => !s.alive).length,
    doorsOpened,
  };
}
