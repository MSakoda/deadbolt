import type { ReactNode } from 'react';
import type { Action, GameEvent, GameState } from '@deadbolt/engine';
import type { LogLine } from './log';

/** What the board needs to play a game that lives on the server. */
export interface Online {
  myId: string;
  /** userId -> display name. */
  names: Record<string, string>;
  send(actions: Action[]): Promise<{ state: GameState; events: GameEvent[] } | { error: string }>;
  /** Newer server state pushed by polling (bump identity to apply). */
  remote?: { state: GameState; events: GameEvent[]; lines: LogLine[] };
  /** Link token for the replay once the game has ended. */
  replayToken?: string;
  topExtra?: ReactNode;
}
