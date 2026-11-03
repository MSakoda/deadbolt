import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { applyAction, legalActions, type Action } from '@deadbolt/engine';
import { buildApp } from '../src/app';
import { ConsoleMailer } from '../src/mail';
import { LOGIN_TTL, Service } from '../src/service';
import { MemoryStore } from '../src/store';

let clock = Date.UTC(2023, 10, 14, 3, 0);
let mailer: ConsoleMailer;
let service: Service;
let app: FastifyInstance;

beforeEach(() => {
  clock = Date.UTC(2023, 10, 14, 3, 0);
  mailer = new ConsoleMailer(true);
  service = new Service({ store: new MemoryStore(), mailer, baseUrl: 'http://x.test', now: () => clock });
  app = buildApp({ service, jobSecret: 'secret' });
});

const tokenIn = (mail: { text: string }) => /token=([\w-]+)/.exec(mail.text)![1]!;
const lastMail = (to: string) => [...mailer.outbox].reverse().find((m) => m.to === to)!;

/** Full magic-link sign-in; returns the cookie header. */
async function signIn(email: string, next?: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email, next } });
  const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${tokenIn(lastMail(email))}` });
  expect(res.statusCode).toBe(302);
  return String(res.headers['set-cookie']).split(';')[0]!;
}

const call = async (cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
  const res = await app.inject({ method, url, headers: { cookie }, payload: payload as object });
  return { status: res.statusCode, json: res.json() as any };
};

async function startedGame() {
  const a = await signIn('a@x.com');
  const created = await call(a, 'POST', '/api/games', { name: 'Group A', players: [{ email: 'b@x.com' }] });
  expect(created.status).toBe(201);
  const id = created.json.game.id as string;
  const b = await signIn('b@x.com');
  expect((await call(b, 'POST', `/api/games/${id}/join`)).status).toBe(200);
  expect((await call(a, 'POST', `/api/games/${id}/start`)).status).toBe(200);
  return { a, b, id };
}

/** Whichever of the two cookies owns the active survivor. */
async function whoIsUp(g: { a: string; b: string; id: string }) {
  const v = await call(g.a, 'GET', `/api/games/${g.id}`);
  return v.json.game.activeOwner === v.json.you.userId ? { up: g.a, other: g.b } : { up: g.b, other: g.a };
}

describe('magic-link login', () => {
  it('signs in once, creates the user and sets an HttpOnly cookie', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'New@X.com' } });
    const mail = lastMail('new@x.com');
    const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${tokenIn(mail)}` });
    expect(res.statusCode).toBe(302);
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/);
    const cookie = String(res.headers['set-cookie']).split(';')[0]!;
    expect((await call(cookie, 'GET', '/api/me')).json.user.email).toBe('new@x.com');
  });

  it('rejects reuse of a link', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'a@x.com' } });
    const t = tokenIn(lastMail('a@x.com'));
    expect((await app.inject({ method: 'GET', url: `/api/auth/verify?token=${t}` })).statusCode).toBe(302);
    expect((await app.inject({ method: 'GET', url: `/api/auth/verify?token=${t}` })).statusCode).toBe(400);
  });

  it('rejects an expired link', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'a@x.com' } });
    clock += LOGIN_TTL + 1;
    const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${tokenIn(lastMail('a@x.com'))}` });
    expect(res.statusCode).toBe(400);
  });

  it('stores only a hash of the token and refuses open redirects', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'a@x.com', next: '//evil.test' } });
    const t = tokenIn(lastMail('a@x.com'));
    const stored = await service.store.list<{ hash: string }>('tokens');
    expect(JSON.stringify(stored)).not.toContain(t);
    const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${t}` });
    expect(res.headers.location).toBe('http://x.test/');
  });

  it('rate-limits sign-in requests per address', async () => {
    for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'a@x.com' } });
    const res = await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email: 'a@x.com' } });
    expect(res.statusCode).toBe(429);
  });

  it('requires a session for game routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/games/nope' })).statusCode).toBe(401);
  });

  it('logout kills the session', async () => {
    const a = await signIn('a@x.com');
    await call(a, 'POST', '/api/auth/logout');
    expect((await call(a, 'GET', '/api/me')).status).toBe(401);
  });
});

describe('games', () => {
  it('invites by email and starts once everyone joined', async () => {
    const a = await signIn('a@x.com');
    const created = await call(a, 'POST', '/api/games', { name: 'G', players: [{ email: 'b@x.com' }] });
    const id = created.json.game.id as string;
    expect(lastMail('b@x.com').subject).toMatch(/invited/);
    expect((await call(a, 'POST', `/api/games/${id}/start`)).status).toBe(409);
    // The invite link signs the invitee in and lands on the game.
    const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${tokenIn(lastMail('b@x.com'))}` });
    expect(res.headers.location).toBe(`http://x.test/games/${id}`);
    const b = String(res.headers['set-cookie']).split(';')[0]!;
    await call(b, 'POST', `/api/games/${id}/join`);
    expect((await call(a, 'POST', `/api/games/${id}/start`)).status).toBe(200);
  });

  it('rejects a host who invites themself, in any letter case', async () => {
    const a = await signIn('a@x.com');
    const r = await call(a, 'POST', '/api/games', { name: 'G', players: [{ email: 'b@x.com' }, { email: ' A@X.com ' }] });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/your own email/);
    expect((await call(a, 'GET', '/api/me')).json.games).toEqual([]);
  });

  it('hides games from non-members and emails from non-hosts', async () => {
    const g = await startedGame();
    const c = await signIn('c@x.com');
    expect((await call(c, 'GET', `/api/games/${g.id}`)).status).toBe(404);
    const asHost = (await call(g.a, 'GET', `/api/games/${g.id}`)).json.game.members;
    const asPlayer = (await call(g.b, 'GET', `/api/games/${g.id}`)).json.game.members;
    expect(asHost.every((m: any) => m.email)).toBe(true);
    expect(asPlayer.some((m: any) => m.email)).toBe(false);
  });

  it('lets one email play in several games', async () => {
    const a = await signIn('a@x.com');
    await call(a, 'POST', '/api/games', { name: 'One', players: [{ email: 'b@x.com' }] });
    await call(a, 'POST', '/api/games', { name: 'Two', players: [{ email: 'c@x.com' }] });
    expect((await call(a, 'GET', '/api/me')).json.games).toHaveLength(2);
  });

  it('never sends deck order or the seed to clients', async () => {
    const g = await startedGame();
    const v = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect(v.state.searchDeck.every((c: any) => c.item === 'wound')).toBe(true);
    expect(new Set(v.state.spawnDeck).size).toBe(1);
    expect(v.state.rng).toBe(0);
    expect(JSON.stringify(v)).not.toContain('"seed"');
    expect(Object.values(v.state.objectives as Record<string, any>).filter((o) => o.hidden).every((o) => o.kind === 'supplies')).toBe(true);
  });
});

describe('taking turns', () => {
  it('emails the active player when a turn starts', async () => {
    const g = await startedGame();
    const { up } = await whoIsUp(g);
    await service.runJobs();
    const email = (await call(up, 'GET', '/api/me')).json.user.email;
    expect(lastMail(email).subject).toMatch(/Your turn/);
  });

  it('rejects actions from the wrong seat', async () => {
    const g = await startedGame();
    const { other } = await whoIsUp(g);
    const res = await call(other, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    expect(res.status).toBe(403);
  });

  it('rejects illegal actions without changing the game', async () => {
    const g = await startedGame();
    const { up } = await whoIsUp(g);
    const before = (await call(up, 'GET', `/api/games/${g.id}`)).json.game.seq;
    const res = await call(up, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'move', to: 'nowhere' } });
    expect(res.status).toBe(422);
    expect((await call(up, 'GET', `/api/games/${g.id}`)).json.game.seq).toBe(before);
  });

  it('applies legal actions, passes the turn and emails the next player', async () => {
    const g = await startedGame();
    const { up, other } = await whoIsUp(g);
    await service.runJobs();
    const legal = (await call(up, 'GET', `/api/games/${g.id}/legal`)).json.actions as Action[];
    expect(legal.length).toBeGreaterThan(0);
    const res = await call(up, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    expect(res.status).toBe(200);
    const v = (await call(other, 'GET', `/api/games/${g.id}`)).json;
    expect(v.game.activeOwner).toBe(v.you.userId);
    mailer.outbox.length = 0;
    await service.runJobs();
    const email = (await call(other, 'GET', '/api/me')).json.user.email;
    expect(lastMail(email).subject).toMatch(/Your turn/);
  });

  it('rebuilds the same state by replaying the log from the seed', async () => {
    const g = await startedGame();
    for (let i = 0; i < 4; i++) {
      const { up } = await whoIsUp(g);
      const { actions } = (await call(up, 'GET', `/api/games/${g.id}/legal`)).json as { actions: Action[] };
      const pick = actions.find((a) => a.type !== 'end_turn') ?? { type: 'end_turn' };
      await call(up, 'POST', `/api/games/${g.id}/actions`, { action: pick });
    }
    const game = await service.getGame(g.id);
    const log = await service.log(g.id);
    const { createGame } = await import('@deadbolt/engine');
    let st = createGame({
      seed: game.seed,
      survivors: game.members.flatMap((m) => m.charIds.map((charId) => ({ charId, owner: m.userId }))),
    }).state;
    for (const e of log.filter((l) => l.kind === 'action')) {
      const r = applyAction(st, e.action as Action);
      if (!r.ok) throw new Error(r.error);
      st = r.state;
    }
    expect(st).toEqual(game.state);
    expect(legalActions(st, game.activeOwner!).length).toBeGreaterThan(0);
  });

  it('records the recap since you last looked', async () => {
    const g = await startedGame();
    const { up, other } = await whoIsUp(g);
    await call(up, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    const v = (await call(other, 'GET', `/api/games/${g.id}`)).json;
    expect(v.recap.length).toBeGreaterThan(0);
    await call(other, 'POST', `/api/games/${g.id}/seen`, { seq: v.game.seq });
    expect((await call(other, 'GET', `/api/games/${g.id}`)).json.recap).toHaveLength(0);
  });
});

describe('nudges and host controls', () => {
  it('sends nudges on schedule, then prompts the host, and not for stale turns', async () => {
    const g = await startedGame();
    const { up } = await whoIsUp(g);
    const upEmail = (await call(up, 'GET', '/api/me')).json.user.email;
    await service.runJobs();
    mailer.outbox.length = 0;
    clock += 25 * 3600_000;
    await service.runJobs();
    expect(mailer.outbox.map((m) => m.subject).join()).toMatch(/Reminder/);
    expect(mailer.outbox.every((m) => m.to === upEmail)).toBe(true);
    mailer.outbox.length = 0;
    clock += 7 * 24 * 3600_000;
    await service.runJobs();
    expect(mailer.outbox.some((m) => /skip or hand over/.test(m.subject) && m.to === 'a@x.com')).toBe(true);
  });

  it('skips queued reminders once the player has moved', async () => {
    const g = await startedGame();
    const { up } = await whoIsUp(g);
    const upEmail = (await call(up, 'GET', '/api/me')).json.user.email;
    await service.runJobs();
    await call(up, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    await service.runJobs();
    mailer.outbox.length = 0;
    clock += 30 * 3600_000;
    const r = await service.runJobs();
    expect(r.skipped).toBeGreaterThan(0);
    // The next player is now up and is nudged; the one who already moved is not.
    expect(mailer.outbox.filter((m) => /Reminder/.test(m.subject) && m.to === upEmail)).toHaveLength(0);
  });

  it('protects host actions and lets the host skip, hand over and transfer', async () => {
    const g = await startedGame();
    expect((await call(g.b, 'POST', `/api/games/${g.id}/host/skip`)).status).toBe(403);
    expect((await call(g.b, 'POST', `/api/games/${g.id}/host/nudge`)).status).toBe(403);

    const before = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect((await call(g.a, 'POST', `/api/games/${g.id}/host/skip`)).status).toBe(200);
    const after = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect(after.game.activeOwner).not.toBe(before.game.activeOwner);

    const members = after.game.members as { userId: string; charIds: string[]; role: string }[];
    const bMember = members.find((m) => m.role === 'player')!;
    const hostMember = members.find((m) => m.role === 'host')!;
    const hand = await call(g.a, 'POST', `/api/games/${g.id}/host/handover`, { charId: hostMember.charIds[0], to: bMember.userId });
    expect(hand.status).toBe(200);
    const moved = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect(moved.state.survivors[hostMember.charIds[0]!].owner).toBe(bMember.userId);

    expect((await call(g.a, 'POST', `/api/games/${g.id}/host/transfer`, { to: bMember.userId })).status).toBe(200);
    expect((await call(g.a, 'POST', `/api/games/${g.id}/host/skip`)).status).toBe(403);
    expect((await call(g.b, 'PUT', `/api/games/${g.id}/host/nudges`, { hours: [12, 48] })).json.nudgeHours).toEqual([12, 48]);
    const log = await service.log(g.id);
    expect(log.filter((e) => e.kind === 'host').map((e) => (e.action as any).type)).toEqual([
      'start', 'skip', 'handover', 'transfer_host',
    ]);
  });

  it('lets only the host cancel a game, stops turns and mail, and tells the others', async () => {
    const g = await startedGame();
    expect((await call(g.b, 'POST', `/api/games/${g.id}/host/cancel`)).status).toBe(403);
    const { up } = await whoIsUp(g);
    expect((await call(g.a, 'POST', `/api/games/${g.id}/host/cancel`)).status).toBe(200);
    expect(lastMail('b@x.com').subject).toMatch(/cancelled/);
    const v = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect(v.game.status).toBe('abandoned');
    expect(v.game.activeOwner).toBeNull();
    expect((await call(up, 'POST', `/api/games/${g.id}/actions`, { actions: [{ type: 'end_turn' }] })).status).toBe(409);
    expect((await call(g.a, 'POST', `/api/games/${g.id}/host/cancel`)).status).toBe(409);
    // Queued reminders for the cancelled game are dropped.
    const sent = mailer.outbox.length;
    clock += 200 * 3600_000;
    await service.runJobs();
    expect(mailer.outbox.slice(sent).filter((m) => /\[Group A\]/.test(m.subject))).toEqual([]);
  });

  it('cancels a game that has not started and blocks late joins', async () => {
    const a = await signIn('a@x.com');
    const id = (await call(a, 'POST', '/api/games', { name: 'G', players: [{ email: 'b@x.com' }] })).json.game.id as string;
    const b = await signIn('b@x.com');
    expect((await call(a, 'POST', `/api/games/${id}/host/cancel`)).status).toBe(200);
    expect((await call(b, 'POST', `/api/games/${id}/join`)).status).toBe(409);
    expect((await call(a, 'POST', `/api/games/${id}/start`)).status).toBe(409);
  });

  it('guards the cron endpoint with the shared secret', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/jobs/run' })).statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: '/api/jobs/run', headers: { 'x-job-secret': 'secret' } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('daily digest', () => {
  const digests = () => mailer.outbox.filter((m) => /what happened/.test(m.subject));

  it('sends at 8 AM in the player timezone, once a day, only when something happened', async () => {
    const g = await startedGame();
    const { up, other } = await whoIsUp(g);
    const otherEmail = (await call(other, 'GET', '/api/me')).json.user.email;
    await service.setTimezone((await call(other, 'GET', '/api/me')).json.user.id, 'Asia/Tokyo');
    // 2023-11-14 06:00 UTC is 15:00 in Tokyo (past 8) and 06:00 in UTC (before 8).
    clock = Date.UTC(2023, 10, 14, 6, 0);
    await service.runJobs();
    expect(digests()).toHaveLength(0); // nothing has happened yet that the others did
    await call(up, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    await service.runJobs();
    expect(digests().map((m) => m.to)).toEqual([otherEmail]);
    expect(digests()[0]!.text).toMatch(/YOUR TURN/);
    await service.runJobs();
    expect(digests()).toHaveLength(1); // once per local day
    clock = Date.UTC(2023, 10, 14, 23, 0); // the UTC player's 23:00: past 8 AM
    await call(other, 'POST', `/api/games/${g.id}/actions`, { action: { type: 'end_turn' } });
    await service.runJobs();
    expect(digests().some((m) => m.to !== otherEmail)).toBe(true);
  });

  it('rejects unknown timezones', async () => {
    const a = await signIn('a@x.com');
    const res = await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie: a }, payload: { tz: 'Mars/Base' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('batched actions', () => {
  it('applies a batch atomically: one bad action leaves the game untouched', async () => {
    const g = await startedGame();
    const { up } = await whoIsUp(g);
    const before = (await call(up, 'GET', `/api/games/${g.id}`)).json;
    const bad = await call(up, 'POST', `/api/games/${g.id}/actions`, {
      actions: [{ type: 'noise' }, { type: 'move', to: 'nowhere' }],
    });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toMatch(/action 2/);
    const after = (await call(up, 'GET', `/api/games/${g.id}`)).json;
    expect(after.game.seq).toBe(before.game.seq);
    expect(after.state).toEqual(before.state);
  });

  it('applies a legal batch and logs each action', async () => {
    const g = await startedGame();
    const { up, other } = await whoIsUp(g);
    const res = await call(up, 'POST', `/api/games/${g.id}/actions`, { actions: [{ type: 'noise' }, { type: 'end_turn' }] });
    expect(res.status).toBe(200);
    expect((await service.log(g.id)).filter((e) => e.kind === 'action')).toHaveLength(2);
    // Nothing may follow end_turn in the same batch: the seat has changed.
    const late = await call(other, 'POST', `/api/games/${g.id}/actions`, { actions: [{ type: 'end_turn' }, { type: 'noise' }] });
    expect(late.status).toBe(403);
  });
});

describe('replay', () => {
  it('creates a public replay link when the game ends, without leaking emails or the seed', async () => {
    const { chooseAction } = await import('@deadbolt/engine/src/bot');
    const g = await startedGame();
    let game = await service.getGame(g.id);
    expect(game.replayToken).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/api/replay/nope' })).statusCode).toBe(404);
    for (let i = 0; i < 6000 && game.status === 'active'; i++) {
      await service.act(g.id, game.activeOwner!, [chooseAction(game.state!)]);
      game = await service.getGame(g.id);
    }
    expect(['won', 'lost']).toContain(game.status);
    expect(game.replayToken).toBeTruthy();

    // Members see the token; the replay itself needs no login.
    const v = (await call(g.a, 'GET', `/api/games/${g.id}`)).json;
    expect(v.game.replay).toBe(game.replayToken);
    const res = await app.inject({ method: 'GET', url: `/api/replay/${game.replayToken}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe(game.status);
    expect(body.steps.length).toBeGreaterThan(5);
    expect(body.steps.every((st: any) => st.events.every((e: any) => e.type !== 'attack' && e.type !== 'cards_drawn'))).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('@x.com');
    expect(text).not.toContain('"seed"');
    expect(body.initial.searchDeck.every((c: any) => c.item === 'wound')).toBe(true);
  });
});

describe('serving the web app', () => {
  it('serves the built site with an SPA fallback for client routes and keeps /api as JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deadbolt-web-'));
    writeFileSync(join(dir, 'index.html'), '<html>deadbolt app</html>');
    const web = buildApp({ service, jobSecret: 'secret', staticDir: dir });
    const page = (url: string, accept = 'text/html') => web.inject({ method: 'GET', url, headers: { accept } });
    expect((await page('/')).body).toContain('deadbolt app');
    expect((await page('/games/abc123')).body).toContain('deadbolt app');
    expect((await page('/replay/tok_en-1')).body).toContain('deadbolt app');
    expect((await page('/api/me', 'application/json')).statusCode).toBe(401);
    const missing = await page('/api/nope', 'text/html');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('deadbolt app');
    expect((await page('/health')).json()).toEqual({ ok: true });
  });
});
