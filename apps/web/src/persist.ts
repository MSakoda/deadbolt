import type { GameState } from '@deadbolt/engine';
import type { ReplayStep } from './replayFrames';
import type { LogLine } from './log';

export interface Saved {
  state: GameState;
  log: LogLine[];
  players: string[];
  /** Starting position and every step so far, for the end-of-game replay. Absent in older saves. */
  replay?: { initial: GameState; steps: ReplayStep[] };
}
const KEY = 'deadbolt-hotseat-v1';

export function save(s: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch { return null; }
}
export function clear(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
