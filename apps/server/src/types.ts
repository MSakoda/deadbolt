import type { GameEvent, GameState } from '@deadbolt/engine';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  /** IANA timezone, used to time the daily digest. */
  tz?: string;
  /** Last digest sent: local date and the log seq covered per game. */
  digest?: { date: string; seqs: Record<string, number> };
}

export type GameStatus = 'lobby' | 'active' | 'won' | 'lost' | 'abandoned';

export interface Member {
  userId: string;
  role: 'host' | 'player';
  status: 'invited' | 'joined';
  /** Characters this member controls, in turn order. */
  charIds: string[];
  /** Highest log seq this member has seen (for the recap). */
  lastSeenSeq: number;
}

export interface Game {
  id: string;
  name: string;
  scenarioId: string;
  status: GameStatus;
  hostId: string;
  members: Member[];
  seed: number;
  state: GameState | null;
  /** Seq of the last log entry. */
  seq: number;
  /** Owner of the active survivor, or null when not running. */
  activeOwner: string | null;
  /** Bumped whenever the active owner changes; ties emails to one turn. */
  turnKey: number;
  activeSince: number | null;
  settings: { nudgeHours: number[] };
  createdAt: number;
  /** Unguessable id for the public replay link; set when the game ends. */
  replayToken?: string;
}

export interface LogEntry {
  gameId: string;
  seq: number;
  at: number;
  actor: string;
  kind: 'action' | 'host';
  /** Engine action for `action`; `{ type, ... }` description for `host`. */
  action: unknown;
  events: GameEvent[];
}

export interface LoginToken {
  hash: string;
  email: string;
  expires: number;
  used: boolean;
  next: string;
  createdAt: number;
}

export interface Session {
  hash: string;
  userId: string;
  expires: number;
}

export interface EmailJob {
  id: string;
  gameId: string;
  userId: string;
  type: 'turn' | 'nudge' | 'host_prompt';
  sendAt: number;
  turnKey: number;
  /** Which nudge (1-based) for `nudge` jobs. */
  n?: number;
  sentAt?: number;
  skipped?: boolean;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
