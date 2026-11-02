export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** JSON call to the Deadbolt server. Throws ApiError (status 0 when the server cannot be reached). */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server');
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON: no API behind this origin */ }
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string } | null)?.error ?? `Server error ${res.status}`);
  if (json === null) throw new ApiError(0, 'Cannot reach the server');
  return json as T;
}

export interface Me {
  user: { id: string; email: string; name: string; tz?: string };
  games: GameSummary[];
}

export interface GameSummary {
  id: string;
  name: string;
  status: 'lobby' | 'active' | 'won' | 'lost' | 'abandoned';
  round: number;
  yourTurn: boolean;
  activeSince: number | null;
}

export interface MemberView {
  userId: string;
  name?: string;
  email?: string;
  role: 'host' | 'player';
  status: 'invited' | 'joined';
  charIds: string[];
}

export interface GameView {
  game: {
    id: string;
    name: string;
    status: GameSummary['status'];
    hostId: string;
    activeOwner: string | null;
    activeSince: number | null;
    seq: number;
    settings: { nudgeHours: number[] };
    members: MemberView[];
  };
  you: { userId: string; role: 'host' | 'player' };
  state: import('@deadbolt/engine').GameState | null;
  recap: { seq: number; at: number; actor: string; kind: 'action' | 'host'; action: unknown; events: import('@deadbolt/engine').GameEvent[] }[];
}
