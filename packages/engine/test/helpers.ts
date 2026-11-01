import { expect } from 'vitest';
import { applyAction, createGame, Rng } from '../src';
import type { Action, GameEvent, GameState, ItemId, ZombieType } from '../src';

export class Scripted extends Rng {
  constructor(private seq: number[], seed = 1) { super(seed); }
  override d6(): number { return this.seq.shift() ?? 1; }
}

export function mk(opts: { seed?: number; chars?: string[] } = {}): GameState {
  const chars = opts.chars ?? ['dana', 'ray', 'lena', 'amara'];
  const { state } = createGame({ seed: opts.seed ?? 7, survivors: chars.map((c, i) => ({ charId: c, owner: `p${i}` })) });
  return state;
}

let uid = 1000;
export function give(s: GameState, who: string, item: ItemId, slot: number): void {
  const sv = s.survivors[who]!;
  while (sv.slots.length <= slot) sv.slots.push(null);
  sv.slots[slot] = { id: `t${uid++}`, item };
}
export function zombie(s: GameState, type: ZombieType, zone: string): string {
  const id = `tz${uid++}`;
  s.zombies.push({ id, type, zone });
  return id;
}
/** Make `who` the active survivor with a fresh set of actions. */
export function activate(s: GameState, who: string): void {
  s.turnIndex = s.turnOrder.indexOf(who);
  const sv = s.survivors[who]!;
  s.turn = {
    survivorId: who, actionsLeft: 3 + (sv.level >= 1 ? 1 : 0), free: { move: 0, melee: 0 }, searches: 0, freeReorg: false,
    rollCall: false, rally: false, firstAid: 0, quietShotUsed: false, ammoUsed: false, frenzyUsed: false,
  };
}
export function clearHands(s: GameState, who: string): void {
  s.survivors[who]!.slots = s.survivors[who]!.slots.map(() => null);
}
export function run(s: GameState, a: Action, rng?: Rng): { state: GameState; events: GameEvent[] } {
  const r = applyAction(s, a, rng);
  if (!r.ok) throw new Error(`expected ok but got: ${r.error}`);
  return r;
}
export function err(s: GameState, a: Action, rng?: Rng): string {
  const r = applyAction(s, a, rng);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}
export const types = (ev: GameEvent[]): string[] => ev.map((e) => e.type);

/** Move every survivor except the active one away so ranged fire has no friendly-fire targets. */
export function apart(s: GameState): void {
  for (const sv of Object.values(s.survivors)) if (sv.id !== s.turn!.survivorId) sv.zone = 'east_end';
}
