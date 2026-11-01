import { describe, it, expect } from 'vitest';
import { applyAction, createGame, legalActions } from '../src';
import type { Action, GameState } from '../src';
import { chooseAction } from '../src/bot';
import { mk, run, err, zombie } from './helpers';

const CHARS = ['dana', 'ray', 'lena', 'amara', 'jonah', 'hannah'];
const newGame = (seed: number, n = 4) =>
  createGame({ seed, survivors: CHARS.slice(0, n).map((c, i) => ({ charId: c, owner: `p${i % 3}` })) }).state;

function botGame(seed: number, n: number, maxActions = 3000): { state: GameState; log: Action[] } {
  let state = newGame(seed, n);
  const log: Action[] = [];
  while (state.status === 'active' && state.round <= 40 && log.length < maxActions) {
    const a = chooseAction(state);
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`bot played illegal ${JSON.stringify(a)}: ${r.error}`);
    state = r.state; log.push(a);
  }
  return { state, log };
}

describe('turn flow', () => {
  it('turn order is fixed and survivors act in sequence', () => {
    let s = mk();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { seen.push(s.turn!.survivorId); s = run(s, { type: 'end_turn' }).state; }
    expect(seen).toEqual(['dana', 'ray', 'lena', 'amara']);
    expect(s.round).toBe(2);
    expect(s.turn!.survivorId).toBe('dana');
  });
  it('dead survivors are skipped', () => {
    let s = mk(); s.survivors['ray']!.alive = false; s.survivors['ray']!.slots = s.survivors['ray']!.slots.map(() => null);
    s = run(s, { type: 'end_turn' }).state;
    expect(s.turn!.survivorId).toBe('lena');
  });
  it('Restless survivors get 4 actions, Plan B a fifth', () => {
    let s = mk({ chars: ['dana', 'ray'] }); s.survivors['dana']!.level = 3;
    s = run(run(s, { type: 'end_turn' }).state, { type: 'end_turn' }).state;
    expect(s.turn!.actionsLeft).toBe(5);
  });
  it('cannot end the turn or act with a search pending', () => {
    const s = mk(); s.survivors['dana']!.zone = 'shop'; s.searchDeck.push({ id: 'q', item: 'pistol' });
    const a = run(s, { type: 'search' }).state;
    expect(err(a, { type: 'end_turn' })).toMatch(/resolve/);
  });
  it('cannot spend more actions than you have', () => {
    let s = mk({ chars: ['dana'] });
    for (let i = 0; i < 3; i++) s = run(s, { type: 'noise' }).state;
    expect(err(s, { type: 'noise' })).toMatch(/not enough/);
  });
  it('a survivor who dies on their own turn passes the turn on', () => {
    const s = mk({ chars: ['dana', 'ray'] });
    s.survivors['dana']!.slots = [{ id: 'm', item: 'molotov' }, null, { id: 'w', item: 'wound' }, null, null];
    zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'attack', slot: 0, target: 'west_end' });
    expect(r.state.survivors['dana']!.alive).toBe(false);
    expect(r.state.turn!.survivorId).toBe('ray');
  });
});

describe('legal actions', () => {
  it('only lists actions for the active seat, and every one applies', () => {
    const s = newGame(11, 4);
    expect(legalActions(s, 'nobody')).toEqual([]);
    expect(legalActions(s, 'p1')).toEqual([]); // Ray's seat, Dana's turn
    const acts = legalActions(s, 'p0');
    expect(acts.length).toBeGreaterThan(3);
    for (const a of acts) expect(applyAction(s, a).ok).toBe(true);
    expect(acts).toContainEqual({ type: 'end_turn' });
    expect(acts).toContainEqual({ type: 'move', to: 'main_street' });
  });
  it('lists resolve_search choices while a search is pending', () => {
    const s = mk(); s.survivors['dana']!.zone = 'shop'; s.searchDeck.push({ id: 'q', item: 'pistol' });
    const a = run(s, { type: 'search' }).state;
    const acts = legalActions(a, 'p0');
    expect(acts.every((x) => x.type === 'resolve_search')).toBe(true);
    expect(acts.length).toBe(2);
  });
  it('nothing is legal once the game is over', () => {
    const s = mk(); s.status = 'lost'; s.turn = null;
    expect(legalActions(s, 'p0')).toEqual([]);
  });
});

describe('determinism and replay', () => {
  it('same seed and actions give an identical game', () => {
    const a = botGame(21, 4), b = botGame(21, 4);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
  it('a different seed diverges', () => {
    expect(JSON.stringify(botGame(21, 4).state)).not.toBe(JSON.stringify(botGame(22, 4).state));
  });
  it('replaying the action log from the seed rebuilds the final state', () => {
    const { state, log } = botGame(33, 3);
    let s = newGame(33, 3);
    for (const a of log) { const r = applyAction(s, a); if (!r.ok) throw new Error(r.error); s = r.state; }
    expect(JSON.stringify(s)).toBe(JSON.stringify(state));
  });
  it('state survives a JSON round trip mid-game', () => {
    const { log } = botGame(44, 4);
    let s = newGame(44, 4);
    for (const a of log.slice(0, 40)) s = JSON.parse(JSON.stringify(applyAction(s, a).ok ? (applyAction(s, a) as any).state : s));
    const next = chooseAction(s);
    expect(applyAction(s, next).ok).toBe(true);
  });
  it('applyAction never mutates its input', () => {
    const s = newGame(5, 4); const before = JSON.stringify(s);
    applyAction(s, { type: 'move', to: 'main_street' }); applyAction(s, { type: 'end_turn' });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('bot smoke test with invariants', () => {
  it('plays many games to completion without an illegal move or broken state', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const n = [1, 2, 3, 4, 5, 6][seed % 6]!;
      let s = newGame(seed, n); let steps = 0;
      while (s.status === 'active' && s.round <= 40 && steps++ < 3000) {
        const r = applyAction(s, chooseAction(s));
        if (!r.ok) throw new Error(`seed ${seed}: ${r.error}`);
        s = r.state;
        const ids = new Set<string>();
        for (const sv of Object.values(s.survivors)) {
          expect(sv.slots.filter((c) => c?.item === 'wound').length).toBeLessThanOrEqual(sv.alive ? 1 : 0 + 1);
          if (!sv.alive) expect(sv.slots.every((c) => c === null)).toBe(true);
          for (const c of sv.slots) if (c) { expect(ids.has(c.id)).toBe(false); ids.add(c.id); }
        }
        for (const z of s.zombies) expect(z.zone).toBeTruthy();
        if (s.status === 'active') expect(s.turn).not.toBeNull();
        if (s.turn) expect(s.turn.actionsLeft).toBeGreaterThanOrEqual(0);
      }
      expect(s.status === 'active' ? s.round > 40 || steps >= 3000 : true).toBe(true);
    }
  });
});
