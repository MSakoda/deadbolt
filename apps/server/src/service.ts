import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  applyAction,
  CHARACTERS,
  SPAWN_CARDS,
  createGame,
  legalActions,
  RULES_VERSION,
  type Action,
  type GameEvent,
  type GameState,
} from '@deadbolt/engine';
import type { Mailer } from './mail';
import type { Store } from './store';
import {
  HttpError,
  type EmailJob,
  type Game,
  type LogEntry,
  type LoginToken,
  type Member,
  type Session,
  type User,
} from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const LOGIN_TTL = 30 * MINUTE;
/** Links in invite and turn emails sit in an inbox for days. */
export const MAIL_LINK_TTL = 7 * DAY;
export const SESSION_TTL = 30 * DAY;
const DEFAULT_NUDGE_HOURS = [24, 72, 168];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface Deps {
  store: Store;
  mailer: Mailer;
  baseUrl: string;
  now?: () => number;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const pad = (n: number) => String(n).padStart(14, '0');
export const normEmail = (e: string) => e.trim().toLowerCase();

const DIGEST_HOUR = 8;
/** A valid card id, so client-side dry runs of the zombie phase do not throw. */
const SPAWN_PLACEHOLDER = SPAWN_CARDS[0]!.id;

/** Local calendar date (YYYY-MM-DD) and hour in an IANA timezone. */
export function localTime(ms: number, tz: string): { date: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function activeOwner(state: GameState): string | null {
  if (state.status !== 'active') return null;
  const id = state.turnOrder[state.turnIndex];
  return (id && state.survivors[id]?.owner) || null;
}

/** What a viewer may see: deck sizes only, no deck order, no seed, hidden markers masked, a pending search only for its owner. */
export function redact(state: GameState, viewerId: string): GameState {
  const s = structuredClone(state);
  // Same length (so client-side previews behave), no information about order.
  s.searchDeck = s.searchDeck.map((_, i) => ({ id: 'hidden' + i, item: 'wound' as const }));
  s.spawnDeck = s.spawnDeck.map(() => SPAWN_PLACEHOLDER);
  s.rng = 0;
  if (s.pending && activeOwner(state) !== viewerId) s.pending = null;
  for (const tok of Object.values(s.objectives)) if (tok.hidden) tok.kind = 'supplies';
  return s;
}

export class Service {
  private locks = new Map<string, Promise<unknown>>();
  readonly store: Store;
  readonly mailer: Mailer;
  readonly baseUrl: string;
  readonly now: () => number;

  constructor(d: Deps) {
    this.store = d.store;
    this.mailer = d.mailer;
    this.baseUrl = d.baseUrl.replace(/\/$/, '');
    this.now = d.now ?? Date.now;
  }

  /** Serialises work per game so two requests never read-modify-write the same game. */
  private lock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(gameId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(gameId, run.catch(() => undefined));
    return run;
  }

  // ---- users and auth ----

  async userByEmail(email: string): Promise<User | undefined> {
    const e = normEmail(email);
    return (await this.store.list<User>('users')).find((u) => u.email === e);
  }

  async ensureUser(email: string): Promise<User> {
    const e = normEmail(email);
    if (!EMAIL_RE.test(e)) throw new HttpError(400, 'invalid email');
    const found = await this.userByEmail(e);
    if (found) return found;
    const u: User = { id: randomUUID(), email: e, name: e.split('@')[0] ?? e, createdAt: this.now() };
    await this.store.put('users', u.id, u);
    return u;
  }

  async getUser(id: string): Promise<User> {
    const u = await this.store.get<User>('users', id);
    if (!u) throw new HttpError(404, 'no such user');
    return u;
  }

  async setName(userId: string, name: string): Promise<User> {
    const u = await this.getUser(userId);
    const n = (name ?? '').trim().slice(0, 40);
    if (!n) throw new HttpError(400, 'name required');
    u.name = n;
    await this.store.put('users', u.id, u);
    return u;
  }

  async setTimezone(userId: string, tz: string): Promise<User> {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      throw new HttpError(400, 'unknown timezone');
    }
    const u = await this.getUser(userId);
    u.tz = tz;
    await this.store.put('users', u.id, u);
    return u;
  }

  private safeNext(next: string | undefined): string {
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  }

  /** Creates a single-use token and returns the link to put in an email. */
  private async loginLink(email: string, next: string, ttl: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const t: LoginToken = {
      hash: sha(token),
      email: normEmail(email),
      expires: this.now() + ttl,
      used: false,
      next: this.safeNext(next),
      createdAt: this.now(),
    };
    await this.store.put('tokens', t.hash, t);
    return `${this.baseUrl}/api/auth/verify?token=${token}`;
  }

  async requestLogin(email: string, next?: string): Promise<void> {
    const e = normEmail(email ?? '');
    if (!EMAIL_RE.test(e)) throw new HttpError(400, 'invalid email');
    const recent = (await this.store.list<LoginToken>('tokens')).filter(
      (t) => t.email === e && t.createdAt > this.now() - HOUR,
    );
    if (recent.length >= 5) throw new HttpError(429, 'too many sign-in requests; try again later');
    const link = await this.loginLink(e, next ?? '/', LOGIN_TTL);
    await this.mailer.send({
      to: e,
      subject: 'Your Deadbolt sign-in link',
      text: `Open this link to sign in (valid for 30 minutes, works once):\n\n${link}\n`,
    });
  }

  /** Consumes a token; returns a session id (cookie value) and the page to land on. */
  async verifyLogin(token: string): Promise<{ session: string; next: string }> {
    const t = await this.store.get<LoginToken>('tokens', sha(token));
    if (!t || t.used || t.expires < this.now()) throw new HttpError(400, 'this link is invalid or has expired');
    t.used = true;
    await this.store.put('tokens', t.hash, t);
    const user = await this.ensureUser(t.email);
    const session = randomBytes(32).toString('base64url');
    const s: Session = { hash: sha(session), userId: user.id, expires: this.now() + SESSION_TTL };
    await this.store.put('sessions', s.hash, s);
    return { session, next: t.next };
  }

  async userForSession(session: string | undefined): Promise<User | undefined> {
    if (!session) return undefined;
    const s = await this.store.get<Session>('sessions', sha(session));
    if (!s || s.expires < this.now()) return undefined;
    return this.store.get<User>('users', s.userId);
  }

  async logout(session: string | undefined): Promise<void> {
    if (!session) return;
    const s = await this.store.get<Session>('sessions', sha(session));
    if (s) await this.store.put('sessions', s.hash, { ...s, expires: 0 });
  }

  // ---- games ----

  async getGame(id: string): Promise<Game> {
    const g = await this.store.get<Game>('games', id);
    if (!g) throw new HttpError(404, 'no such game');
    return g;
  }

  private saveGame(g: Game): Promise<void> {
    return this.store.put('games', g.id, g);
  }

  private member(g: Game, userId: string): Member | undefined {
    return g.members.find((m) => m.userId === userId);
  }

  private requireMember(g: Game, userId: string): Member {
    const m = this.member(g, userId);
    if (!m) throw new HttpError(404, 'no such game'); // do not reveal that it exists
    return m;
  }

  private requireHost(g: Game, userId: string): void {
    if (this.requireMember(g, userId).role !== 'host') throw new HttpError(403, 'host only');
  }

  async createGame(
    host: User,
    input: {
      name: string;
      players: { email: string; charIds?: string[] }[];
      survivorsPerPlayer?: number;
      scenarioId?: string;
    },
  ): Promise<Game> {
    const name = (input.name ?? '').trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'game name required');
    const per = input.survivorsPerPlayer ?? 1;
    const others = (input.players ?? []).map((p) => ({ ...p, email: normEmail(p.email) })).filter((p) => p.email !== host.email);
    // The host is always seat 1; other players follow in the order given.
    const emails = [host.email, ...others.map((p) => p.email)];
    if (new Set(emails).size !== emails.length) throw new HttpError(400, 'duplicate player');
    if (emails.length < 2 || emails.length > 6) throw new HttpError(400, '2 to 6 players');
    if (!Number.isInteger(per) || per < 1 || emails.length * per > 6)
      throw new HttpError(400, 'at most 6 survivors in total');
    const chosen = new Map(others.map((p) => [p.email, p.charIds]));
    const known = new Set(CHARACTERS.map((c) => c.id));
    const taken = new Set(others.flatMap((p) => p.charIds ?? []));
    if ([...taken].some((c) => !known.has(c))) throw new HttpError(400, 'unknown character');
    const pool = CHARACTERS.map((c) => c.id).filter((id) => !taken.has(id));
    const members: Member[] = [];
    for (const email of emails) {
      const user = await this.ensureUser(email);
      const charIds = [...(chosen.get(email) ?? [])];
      while (charIds.length < per) {
        const next = pool.shift();
        if (!next) throw new HttpError(400, 'not enough characters');
        charIds.push(next);
      }
      const isHost = email === host.email;
      members.push({
        userId: user.id,
        role: isHost ? 'host' : 'player',
        status: isHost ? 'joined' : 'invited',
        charIds,
        lastSeenSeq: 0,
      });
    }
    const g: Game = {
      id: randomUUID(),
      name,
      scenarioId: input.scenarioId ?? 'long_block',
      status: 'lobby',
      hostId: host.id,
      members,
      seed: randomInt(1, 2 ** 31 - 1),
      state: null,
      seq: 0,
      activeOwner: null,
      turnKey: 0,
      activeSince: null,
      settings: { nudgeHours: DEFAULT_NUDGE_HOURS },
      createdAt: this.now(),
    };
    await this.saveGame(g);
    for (const m of members) {
      if (m.status === 'joined') continue;
      const u = await this.getUser(m.userId);
      const link = await this.loginLink(u.email, `/games/${g.id}`, MAIL_LINK_TTL);
      await this.mailer.send({
        to: u.email,
        subject: `${host.name} invited you to play "${g.name}"`,
        text: `${host.name} invited you to a Deadbolt game, "${g.name}".\n\nOpen the game and join:\n${link}\n`,
      });
    }
    return g;
  }

  async join(gameId: string, userId: string): Promise<Game> {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      const m = this.requireMember(g, userId);
      m.status = 'joined';
      await this.saveGame(g);
      return g;
    });
  }

  async start(gameId: string, userId: string): Promise<Game> {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, userId);
      if (g.status !== 'lobby') throw new HttpError(409, 'game already started');
      if (g.members.some((m) => m.status !== 'joined')) throw new HttpError(409, 'waiting for players to join');
      const { state, events } = createGame({
        scenarioId: g.scenarioId,
        seed: g.seed,
        survivors: g.members.flatMap((m) => m.charIds.map((charId) => ({ charId, owner: m.userId }))),
      });
      g.state = state;
      g.status = 'active';
      await this.append(g, userId, 'host', { type: 'start', rulesVersion: RULES_VERSION }, events);
      await this.afterChange(g);
      return g;
    });
  }

  private async append(g: Game, actor: string, kind: LogEntry['kind'], action: unknown, events: GameEvent[]) {
    g.seq += 1;
    const e: LogEntry = { gameId: g.id, seq: g.seq, at: this.now(), actor, kind, action, events };
    await this.store.put('log', `${g.id}:${String(g.seq).padStart(8, '0')}`, e);
  }

  async log(gameId: string, since = 0): Promise<LogEntry[]> {
    const all = await this.store.list<LogEntry>('log', `${gameId}:`);
    return all.filter((e) => e.seq > since);
  }

  /** Updates status and, when the active owner changed, starts a new turn clock and queues emails. */
  private async afterChange(g: Game): Promise<void> {
    const st = g.state;
    if (!st) return;
    if (st.status !== 'active') {
      g.status = st.status;
      g.activeOwner = null;
      g.activeSince = null;
      await this.saveGame(g);
      return;
    }
    const owner = activeOwner(st);
    if (owner !== g.activeOwner) {
      g.activeOwner = owner;
      g.turnKey += 1;
      g.activeSince = this.now();
      if (owner) await this.queueTurnJobs(g, owner);
    }
    await this.saveGame(g);
  }

  private async queueTurnJobs(g: Game, userId: string): Promise<void> {
    const at = this.now();
    const job = (type: EmailJob['type'], sendAt: number, to: string, n?: number): Promise<void> => {
      const j: EmailJob = { id: randomUUID(), gameId: g.id, userId: to, type, sendAt, turnKey: g.turnKey, ...(n ? { n } : {}) };
      return this.store.put('jobs', `${pad(sendAt)}:${j.id}`, j);
    };
    await job('turn', at, userId);
    const hours = g.settings.nudgeHours;
    for (const [i, h] of hours.entries()) await job('nudge', at + h * HOUR, userId, i + 1);
    const last = hours[hours.length - 1];
    if (last !== undefined) await job('host_prompt', at + last * HOUR, g.hostId);
  }

  /** Sends due emails. Safe to call often (an external cron pings this). */
  async runJobs(): Promise<{ sent: number; skipped: number }> {
    const now = this.now();
    let sent = 0;
    let skipped = 0;
    for (const j of await this.store.list<EmailJob>('jobs')) {
      if (j.sentAt || j.skipped || j.sendAt > now) continue;
      const g = await this.store.get<Game>('games', j.gameId);
      const key = `${pad(j.sendAt)}:${j.id}`;
      if (!g || g.status !== 'active' || g.turnKey !== j.turnKey) {
        await this.store.put('jobs', key, { ...j, skipped: true });
        skipped += 1;
        continue;
      }
      await this.sendJob(j, g);
      await this.store.put('jobs', key, { ...j, sentAt: now });
      sent += 1;
    }
    sent += await this.runDigests();
    return { sent, skipped };
  }

  /**
   * Daily digest: from 8 AM in each player's timezone, at most once per local
   * day, and only if other people did something in their games since the last one.
   */
  private async runDigests(): Promise<number> {
    const now = this.now();
    const games = await this.store.list<Game>('games');
    let sent = 0;
    for (const u of await this.store.list<User>('users')) {
      const { date, hour } = localTime(now, u.tz ?? 'UTC');
      if (hour < DIGEST_HOUR || u.digest?.date === date) continue;
      const seqs = { ...(u.digest?.seqs ?? {}) };
      const lines: string[] = [];
      for (const g of games.filter((x) => x.members.some((m) => m.userId === u.id))) {
        const log = (await this.log(g.id, seqs[g.id] ?? 0)).filter((e) => e.actor !== u.id);
        seqs[g.id] = g.seq;
        const acts = log.filter((e) => e.kind === 'action').length;
        const host = log.filter((e) => e.kind === 'host' && (e.action as { type: string }).type !== 'start').length;
        if (!acts && !host && g.status !== 'won' && g.status !== 'lost') continue;
        const bits = [`${acts} action${acts === 1 ? '' : 's'} by others`];
        if (host) bits.push(`${host} host change${host === 1 ? '' : 's'}`);
        if (g.status === 'won' || g.status === 'lost') bits.push(`game ${g.status}`);
        if (g.activeOwner === u.id) bits.push('IT IS YOUR TURN');
        lines.push(`- ${g.name} (round ${g.state?.round ?? 0}): ${bits.join(', ')}`);
      }
      if (!lines.length) continue;
      const link = await this.loginLink(u.email, '/', MAIL_LINK_TTL);
      await this.mailer.send({
        to: u.email,
        subject: 'Deadbolt: what happened in your games',
        text: `Since your last digest:\n\n${lines.join('\n')}\n\n${link}\n`,
      });
      u.digest = { date, seqs };
      await this.store.put('users', u.id, u);
      sent += 1;
    }
    return sent;
  }

  private async sendJob(j: EmailJob, g: Game): Promise<void> {
    const user = await this.getUser(j.userId);
    const active = g.activeOwner ? await this.getUser(g.activeOwner) : undefined;
    const link = await this.loginLink(user.email, `/games/${g.id}`, MAIL_LINK_TTL);
    const round = g.state?.round ?? 1;
    if (j.type === 'turn') {
      await this.mailer.send({
        to: user.email,
        subject: `[${g.name}] Your turn - round ${round}`,
        text: `It is your turn in "${g.name}" (round ${round}).\n\n${link}\n`,
      });
    } else if (j.type === 'nudge') {
      await this.mailer.send({
        to: user.email,
        subject: `[${g.name}] Reminder: the group is waiting on you`,
        text: `Your turn in "${g.name}" has been waiting since ${new Date(g.activeSince ?? 0).toUTCString()}.\n\n${link}\n`,
      });
    } else {
      const who = active?.name ?? 'A player';
      await this.mailer.send({
        to: user.email,
        subject: `[${g.name}] ${who} has not moved - skip or hand over?`,
        text: `${who} has not taken their turn after the last reminder.\nAs host you can skip their turn or hand their survivor to someone else:\n\n${link}\n`,
      });
    }
  }

  // ---- playing ----

  async listGames(userId: string) {
    const games = (await this.store.list<Game>('games')).filter((g) => this.member(g, userId));
    return games.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      round: g.state?.round ?? 0,
      yourTurn: g.activeOwner === userId,
      activeSince: g.activeSince,
      updated: g.seq,
    }));
  }

  async view(gameId: string, userId: string, since?: number) {
    const g = await this.getGame(gameId);
    const me = this.requireMember(g, userId);
    const from = since ?? me.lastSeenSeq;
    const users = new Map<string, User>();
    for (const m of g.members) users.set(m.userId, await this.getUser(m.userId));
    const isHost = me.role === 'host';
    return {
      game: {
        id: g.id,
        name: g.name,
        status: g.status,
        hostId: g.hostId,
        activeOwner: g.activeOwner,
        activeSince: g.activeSince,
        seq: g.seq,
        settings: g.settings,
        members: g.members.map((m) => ({
          userId: m.userId,
          name: users.get(m.userId)?.name,
          // Emails are visible only to the host who invited them.
          ...(isHost ? { email: users.get(m.userId)?.email } : {}),
          role: m.role,
          status: m.status,
          charIds: m.charIds,
        })),
      },
      you: { userId, role: me.role },
      state: g.state ? redact(g.state, userId) : null,
      legal: this.legalFor(g, userId),
      recap: (await this.log(gameId, from)).map(({ seq, at, actor, kind, action, events }) => ({
        seq, at, actor, kind, action, events,
      })),
    };
  }

  async markSeen(gameId: string, userId: string, seq: number): Promise<void> {
    await this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      const m = this.requireMember(g, userId);
      m.lastSeenSeq = Math.max(m.lastSeenSeq, Math.min(Number(seq) || 0, g.seq));
      await this.saveGame(g);
    });
  }

  /** Legal actions are computed against the full state, since the client only has a redacted one. */
  private legalFor(g: Game, userId: string): Action[] {
    return g.state && g.state.status === 'active' && g.activeOwner === userId ? legalActions(g.state, userId) : [];
  }

  async legal(gameId: string, userId: string): Promise<Action[]> {
    const g = await this.getGame(gameId);
    this.requireMember(g, userId);
    return this.legalFor(g, userId);
  }

  /**
   * Applies a batch of actions in order, all or nothing. The client batches
   * the reversible steps it previewed locally with the step that needs the
   * server's dice or decks.
   */
  async act(gameId: string, userId: string, actions: Action[]) {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireMember(g, userId);
      if (g.status !== 'active' || !g.state) throw new HttpError(409, 'game is not running');
      if (!Array.isArray(actions) || actions.length === 0 || actions.length > 40) throw new HttpError(400, 'actions required');
      let st = g.state;
      const done: { action: Action; events: GameEvent[] }[] = [];
      for (const [i, action] of actions.entries()) {
        if (!action || typeof action.type !== 'string') throw new HttpError(400, 'action required');
        if (activeOwner(st) !== userId) throw new HttpError(403, 'not your turn');
        const r = applyAction(st, action);
        if (!r.ok) throw new HttpError(422, actions.length > 1 ? `action ${i + 1}: ${r.error}` : r.error);
        st = r.state;
        done.push({ action, events: r.events });
      }
      g.state = st;
      for (const d of done) await this.append(g, userId, 'action', d.action, d.events);
      await this.afterChange(g);
      return {
        events: done.flatMap((d) => d.events),
        seq: g.seq,
        state: redact(st, userId),
        legal: this.legalFor(g, userId),
      };
    });
  }

  // ---- host controls ----

  /** The active survivor holds position and the turn ends. */
  async skipTurn(gameId: string, hostId: string) {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, hostId);
      if (g.status !== 'active' || !g.state) throw new HttpError(409, 'game is not running');
      let st = g.state;
      const events: GameEvent[] = [];
      if (st.pending) {
        const p = applyAction(st, { type: 'resolve_search', keep: null });
        if (!p.ok) throw new HttpError(422, p.error);
        st = p.state;
        events.push(...p.events);
      }
      const r = applyAction(st, { type: 'end_turn' });
      if (!r.ok) throw new HttpError(422, r.error);
      g.state = r.state;
      events.push(...r.events);
      await this.append(g, hostId, 'host', { type: 'skip', owner: g.activeOwner }, events);
      await this.afterChange(g);
      await this.notifyAll(g, `[${g.name}] Turn skipped by the host`, `The host skipped a turn in "${g.name}".\n\n${this.baseUrl}/games/${g.id}\n`);
      return { seq: g.seq };
    });
  }

  async handover(gameId: string, hostId: string, charId: string, toUserId: string) {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, hostId);
      if (g.status !== 'active' || !g.state) throw new HttpError(409, 'game is not running');
      const sv = g.state.survivors[charId];
      const to = this.member(g, toUserId);
      if (!sv || !sv.alive) throw new HttpError(404, 'no such living survivor');
      if (!to || to.status !== 'joined') throw new HttpError(404, 'no such player');
      const from = this.member(g, sv.owner);
      if (from) from.charIds = from.charIds.filter((c) => c !== charId);
      to.charIds.push(charId);
      sv.owner = toUserId;
      await this.append(g, hostId, 'host', { type: 'handover', charId, from: from?.userId, to: toUserId }, []);
      await this.afterChange(g);
      await this.notifyAll(g, `[${g.name}] A survivor changed hands`, `The host handed a survivor to another player in "${g.name}".\n\n${this.baseUrl}/games/${g.id}\n`);
      return { seq: g.seq };
    });
  }

  async transferHost(gameId: string, hostId: string, toUserId: string) {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, hostId);
      const to = this.member(g, toUserId);
      if (!to || to.status !== 'joined') throw new HttpError(404, 'no such player');
      this.requireMember(g, hostId).role = 'player';
      to.role = 'host';
      g.hostId = toUserId;
      await this.append(g, hostId, 'host', { type: 'transfer_host', to: toUserId }, []);
      await this.saveGame(g);
      await this.notifyAll(g, `[${g.name}] New host`, `The host role in "${g.name}" moved to a new player.\n\n${this.baseUrl}/games/${g.id}\n`);
      return { seq: g.seq };
    });
  }

  async setNudges(gameId: string, hostId: string, hours: number[]) {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, hostId);
      if (!Array.isArray(hours) || hours.length > 5 || hours.some((h) => !Number.isFinite(h) || h < 1 || h > 24 * 60))
        throw new HttpError(400, 'nudge hours must be up to 5 numbers between 1 and 1440');
      g.settings.nudgeHours = [...hours].sort((a, b) => a - b);
      await this.saveGame(g);
      return g.settings;
    });
  }

  /** Host-pressed nudge: an immediate reminder to whoever is up. */
  async nudgeNow(gameId: string, hostId: string): Promise<void> {
    return this.lock(gameId, async () => {
      const g = await this.getGame(gameId);
      this.requireHost(g, hostId);
      if (g.status !== 'active' || !g.activeOwner) throw new HttpError(409, 'nobody is up');
      await this.sendJob(
        { id: randomUUID(), gameId: g.id, userId: g.activeOwner, type: 'nudge', sendAt: this.now(), turnKey: g.turnKey },
        g,
      );
    });
  }

  private async notifyAll(g: Game, subject: string, text: string): Promise<void> {
    for (const m of g.members) {
      const u = await this.getUser(m.userId);
      await this.mailer.send({ to: u.email, subject, text });
    }
  }
}
