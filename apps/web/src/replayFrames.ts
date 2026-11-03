import type { GameEvent, GameState } from '@deadbolt/engine';
import { applyToDisplay } from './phase';

export interface ReplayStep { events: GameEvent[] }

/** Everything needed to replay a finished game on the board. */
export interface ReplayData {
  title?: string;
  outcome?: 'won' | 'lost';
  initial: GameState;
  steps: ReplayStep[];
  /** The true final state, so the last frame is exact even where the replay only approximates. */
  final?: GameState;
}

export interface Frame {
  state: GameState;
  /** Events to animate on the board for this frame (dice are left out). */
  events: GameEvent[];
  round: number;
  /** Whose turn it was while this happened. */
  survivor: string | null;
  note?: string;
}

/** Events that change something visible on the board. A step with none of these gets no frame. */
const VISUAL = new Set([
  'moved', 'door_opened', 'zombie_moved', 'zombie_spawned', 'zombie_killed', 'zombie_attacked',
  'survivor_died', 'objective_taken',
]);
const SKIP_FX = new Set(['attack', 'reroll', 'cards_drawn', 'card_kept']);

/**
 * Turns the recorded steps into board frames. Quiet steps (searching, reorganising) are dropped, and a
 * zombie phase becomes two frames: the horde moving and biting, then the new arrivals.
 */
export function buildFrames(data: ReplayData): Frame[] {
  let state = structuredClone(data.initial);
  let round = state.round;
  let survivor: string | null = state.turn?.survivorId ?? state.turnOrder[0] ?? null;
  const frames: Frame[] = [{ state, events: [], round, survivor, note: 'The group gathers' }];

  for (const step of data.steps) {
    const ev = step.events;
    const start = ev.findIndex((e) => e.type === 'zombie_phase_start');
    const spawn = ev.findIndex((e) => e.type === 'zombie_step' && e['step'] === 'spawn');
    const chunks: { events: GameEvent[]; note?: string }[] =
      start >= 0
        ? [
            { events: ev.slice(0, start) },
            { events: ev.slice(start, spawn > start ? spawn : ev.length), note: 'Zombie phase' },
            ...(spawn > start ? [{ events: ev.slice(spawn), note: 'Reinforcements' }] : []),
          ]
        : [{ events: ev }];
    for (const chunk of chunks) {
      if (chunk.events.some((e) => VISUAL.has(e.type))) {
        state = applyToDisplay(state, chunk.events);
        frames.push({ state, events: chunk.events.filter((e) => !SKIP_FX.has(e.type)), round, survivor, note: chunk.note });
      }
      // Turn and round changes take effect after the frame that ended them.
      for (const e of chunk.events) {
        if (e.type === 'turn_started') survivor = String(e['survivor']);
        else if (e.type === 'round_started') round = Number(e['round']);
      }
    }
  }
  if (data.final) frames.push({ state: data.final, events: [], round: data.final.round, survivor: null, note: data.outcome === 'won' ? 'The truck escapes' : 'The block is lost' });
  return frames;
}
