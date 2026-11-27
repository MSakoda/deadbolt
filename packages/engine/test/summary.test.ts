import { describe, it, expect } from 'vitest';
import { summarizeGame, type GameEvent } from '../src';
import { mk } from './helpers';

describe('game summary', () => {
  it('credits kills, wounds, doors, healing and objectives to the right survivor', () => {
    const s = mk();
    const [a, b] = s.turnOrder as [string, string];
    const ev: GameEvent[] = [
      { type: 'zombie_killed', id: 'z1', zombieType: 'shambler', zone: 'west_end', by: a, how: 'melee', xp: 1 },
      { type: 'zombie_killed', id: 'z2', zombieType: 'shambler', zone: 'west_end', by: a, how: 'melee', xp: 1 },
      { type: 'zombie_killed', id: 'z3', zombieType: 'brute', zone: 'shop', by: b, how: 'melee', xp: 3 },
      { type: 'zombie_killed', id: 'z4', zombieType: 'sprinter', zone: 'shop', by: null, how: 'fire', xp: 0 },
      { type: 'wounded', survivor: b, source: 'shambler', wounds: 1 },
      { type: 'healed', medic: a, target: b, wounds: 1 },
      { type: 'door_opened', survivor: b, edge: 'door_shop', from: 'west_end', to: 'shop', tool: 'crowbar' },
      { type: 'objective_taken', survivor: a, zone: 'workshop', kind: 'fuel', wasHidden: false },
      { type: 'objective_taken', survivor: b, zone: 'bedroom', kind: 'keys', wasHidden: true },
      { type: 'attack', survivor: a },
    ];
    const sum = summarizeGame(s, ev);
    const sa = sum.survivors.find((x) => x.id === a)!;
    const sb = sum.survivors.find((x) => x.id === b)!;
    expect(sa.kills.shambler).toBe(2);
    expect(sa.killTotal).toBe(2);
    expect(sa.healed).toBe(1);
    expect(sa.objectives).toEqual(['fuel']);
    expect(sb.killTotal).toBe(1);
    expect(sb.wounds).toBe(1);
    expect(sb.doorsOpened).toBe(1);
    expect(sb.objectives).toEqual(['keys']);
    // The unattributed kill still counts for the team.
    expect(sum.killTotal).toBe(4);
    expect(sum.kills.sprinter).toBe(1);
    expect(sum.doorsOpened).toBe(1);
    expect(sum.outcome).toBe('active');
  });
});
