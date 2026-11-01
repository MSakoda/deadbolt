import { describe, it, expect } from 'vitest';
import { createGame, defaultSurvivorsPerPlayer, SEARCH_DECK, SPAWN_CARDS } from '../src';
import { mk } from './helpers';

describe('setup', () => {
  it('decks have the planned sizes', () => {
    const s = mk();
    expect(s.searchDeck.length).toBe(30);
    expect(SEARCH_DECK.reduce((n, [, c]) => n + c, 0)).toBe(30);
    expect(s.spawnDeck.length).toBe(22);
    expect(SPAWN_CARDS.reduce((n, c) => n + c.copies, 0)).toBe(22);
  });
  it('places one key and two supplies markers, fuel in the workshop, shop door open', () => {
    const s = mk();
    const hidden = ['stock_room', 'bedroom', 'flat'].map((z) => s.objectives[z]!);
    expect(hidden.filter((o) => o.kind === 'keys').length).toBe(1);
    expect(hidden.filter((o) => o.kind === 'supplies').length).toBe(2);
    expect(hidden.every((o) => o.hidden)).toBe(true);
    expect(s.objectives['workshop']).toEqual({ kind: 'fuel', hidden: false });
    expect(s.doors['door_shop']).toBe(true);
    expect(Object.values(s.doors).filter(Boolean).length).toBe(1);
    expect(s.zombies.length).toBe(0);
  });
  it('deals each survivor one starting card and starts at the west end', () => {
    const s = mk();
    for (const sv of Object.values(s.survivors)) {
      expect(sv.zone).toBe('west_end');
      expect(sv.slots.filter(Boolean).length).toBe(1);
      expect(sv.slots.length).toBe(5);
    }
    const six = mk({ chars: ['dana', 'ray', 'lena', 'amara', 'jonah', 'hannah'] });
    const gear = Object.values(six.survivors).map((v) => v.slots[0]!.item);
    expect(gear).toContain('fire_axe');
    expect(gear).toContain('crowbar');
    expect(gear).toContain('pistol');
  });
  it('starts with the first survivor in the fixed order, 3 actions', () => {
    const s = mk();
    expect(s.turn?.survivorId).toBe('dana');
    expect(s.turn?.actionsLeft).toBe(3);
    expect(s.turnOrder).toEqual(['dana', 'ray', 'lena', 'amara']);
  });
  it('base-game survivor table', () => {
    expect([1, 2, 3, 4, 5, 6].map(defaultSurvivorsPerPlayer)).toEqual([4, 3, 2, 1, 1, 1]);
  });
  it('rejects duplicates and unknown characters', () => {
    expect(() => createGame({ seed: 1, survivors: [{ charId: 'dana', owner: 'a' }, { charId: 'dana', owner: 'b' }] })).toThrow();
    expect(() => createGame({ seed: 1, survivors: [{ charId: 'nobody', owner: 'a' }] })).toThrow();
  });
});
