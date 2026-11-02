import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Action } from '@deadbolt/engine';
import { Service, SESSION_TTL } from './service';
import { HttpError, type User } from './types';

const COOKIE = 'deadbolt_session';

export interface AppOptions {
  service: Service;
  /** Shared secret for POST /jobs/run (the external cron). Unset disables the endpoint. */
  jobSecret?: string;
}

function cookieOf(req: FastifyRequest): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return undefined;
}

export function buildApp({ service, jobSecret }: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const secure = service.baseUrl.startsWith('https');

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    console.error(err);
    return reply.code(500).send({ error: 'server error' });
  });

  const auth = async (req: FastifyRequest): Promise<User> => {
    const u = await service.userForSession(cookieOf(req));
    if (!u) throw new HttpError(401, 'sign in required');
    return u;
  };

  type P = { id: string };
  const body = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;

  app.get('/health', async () => ({ ok: true }));

  app.register(async (app) => {

  // ---- auth ----
  app.post('/auth/request', async (req) => {
    const b = body(req);
    await service.requestLogin(String(b.email ?? ''), typeof b.next === 'string' ? b.next : undefined);
    // Same answer whether or not the address is known.
    return { ok: true };
  });

  app.get('/auth/verify', async (req: FastifyRequest, reply: FastifyReply) => {
    const { token } = req.query as { token?: string };
    const { session, next } = await service.verifyLogin(String(token ?? ''));
    reply.header(
      'set-cookie',
      `${COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`,
    );
    return reply.redirect(`${service.baseUrl}${next}`);
  });

  app.post('/auth/logout', async (req, reply) => {
    await service.logout(cookieOf(req));
    reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  // ---- account ----
  app.get('/me', async (req) => {
    const u = await auth(req);
    return { user: { id: u.id, email: u.email, name: u.name, tz: u.tz }, games: await service.listGames(u.id) };
  });
  app.patch('/me', async (req) => {
    const u = await auth(req);
    const b = body(req);
    let n = u;
    if (b.name !== undefined) n = await service.setName(u.id, String(b.name));
    if (b.tz !== undefined) n = await service.setTimezone(u.id, String(b.tz));
    return { user: { id: n.id, email: n.email, name: n.name, tz: n.tz } };
  });

  // ---- games ----
  app.post('/games', async (req, reply) => {
    const u = await auth(req);
    const b = body(req);
    const g = await service.createGame(u, {
      name: String(b.name ?? ''),
      players: Array.isArray(b.players) ? (b.players as { email: string; charIds?: string[] }[]) : [],
      survivorsPerPlayer: typeof b.survivorsPerPlayer === 'number' ? b.survivorsPerPlayer : undefined,
      scenarioId: typeof b.scenarioId === 'string' ? b.scenarioId : undefined,
    });
    return reply.code(201).send(await service.view(g.id, u.id));
  });

  app.get('/games/:id', async (req) => {
    const u = await auth(req);
    const since = (req.query as { since?: string }).since;
    return service.view((req.params as P).id, u.id, since === undefined ? undefined : Number(since));
  });

  app.get('/games/:id/legal', async (req) => {
    const u = await auth(req);
    return { actions: await service.legal((req.params as P).id, u.id) };
  });

  app.post('/games/:id/join', async (req) => {
    const u = await auth(req);
    await service.join((req.params as P).id, u.id);
    return service.view((req.params as P).id, u.id);
  });

  app.post('/games/:id/start', async (req) => {
    const u = await auth(req);
    await service.start((req.params as P).id, u.id);
    return service.view((req.params as P).id, u.id);
  });

  app.post('/games/:id/actions', async (req) => {
    const u = await auth(req);
    const b = body(req);
    return service.act((req.params as P).id, u.id, (Array.isArray(b.actions) ? b.actions : [b.action]) as Action[]);
  });

  app.post('/games/:id/seen', async (req) => {
    const u = await auth(req);
    await service.markSeen((req.params as P).id, u.id, Number(body(req).seq));
    return { ok: true };
  });

  // ---- host ----
  app.post('/games/:id/host/skip', async (req) => service.skipTurn((req.params as P).id, (await auth(req)).id));
  app.post('/games/:id/host/nudge', async (req) => {
    await service.nudgeNow((req.params as P).id, (await auth(req)).id);
    return { ok: true };
  });
  app.post('/games/:id/host/handover', async (req) => {
    const b = body(req);
    return service.handover((req.params as P).id, (await auth(req)).id, String(b.charId ?? ''), String(b.to ?? ''));
  });
  app.post('/games/:id/host/transfer', async (req) =>
    service.transferHost((req.params as P).id, (await auth(req)).id, String(body(req).to ?? '')),
  );
  app.put('/games/:id/host/nudges', async (req) =>
    service.setNudges((req.params as P).id, (await auth(req)).id, body(req).hours as number[]),
  );

  // ---- cron ----
  app.post('/jobs/run', async (req) => {
    if (!jobSecret || req.headers['x-job-secret'] !== jobSecret) throw new HttpError(403, 'forbidden');
    return service.runJobs();
  });

  }, { prefix: '/api' });

  return app;
}
