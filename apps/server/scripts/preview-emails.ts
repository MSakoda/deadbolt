// Previews every email Deadbolt sends, without sending anything. It plays a pretend game through the real
// server code, captures each message, and writes them to apps/server/email-preview/ with an index page.
// Run from the repo root:  npm run email-preview -w @deadbolt/server   then open email-preview/index.html
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApp } from '../src/app';
import { escapeHtml } from '../src/email';
import { ConsoleMailer, type Mail } from '../src/mail';
import { Service } from '../src/service';
import { MemoryStore } from '../src/store';

const outDir = fileURLToPath(new URL('../email-preview/', import.meta.url));
const logoFile = pathToFileURL(fileURLToPath(new URL('../../web/public/logo.png', import.meta.url))).href;
const baseUrl = 'https://deadbolt.example.com';

let clock = Date.UTC(2026, 10, 14, 16, 0);
const mailer = new ConsoleMailer(true);
const service = new Service({ store: new MemoryStore(), mailer, baseUrl, now: () => clock });
const app = buildApp({ service, jobSecret: 'x' });

const lastTo = (to: string): Mail => [...mailer.outbox].reverse().find((m) => m.to === to)!;
async function signIn(email: string, name: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/api/auth/request', payload: { email } });
  const token = /token=([\w-]+)/.exec(lastTo(email).text)![1];
  const res = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${token}` });
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  await app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { name } });
  return cookie;
}
const call = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload }).then((r) => r.json() as any);

const marcus = await signIn('marcus@example.com', 'Marcus');
const dana = await signIn('dana@example.com', 'Dana');
const game = (await call(marcus, 'POST', '/api/games', { name: 'Friday group', players: [{ email: 'dana@example.com' }] })).game.id as string;
await call(dana, 'POST', `/api/games/${game}/join`);
await call(marcus, 'POST', `/api/games/${game}/start`);
await service.runJobs(); // the "your turn" email

// Whoever is up takes a turn, so there is something for the daily summary.
const up = (await call(marcus, 'GET', `/api/games/${game}`)).game.activeOwner === (await call(marcus, 'GET', `/api/games/${game}`)).you.userId ? marcus : dana;
await call(up, 'POST', `/api/games/${game}/actions`, { actions: [{ type: 'end_turn' }] });
await service.runJobs();

clock += 26 * 3600_000; // reminder
await service.runJobs();
clock += 150 * 3600_000; // later reminder and the host prompt
await service.runJobs();
await call(marcus, 'POST', `/api/games/${game}/host/skip`);
await call(marcus, 'POST', `/api/games/${game}/host/cancel`);

// One file per kind of email: the first message with each distinct subject pattern.
const seen = new Set<string>();
const picked: { mail: Mail; slug: string }[] = [];
for (const m of mailer.outbox) {
  const key = m.subject.replace(/^\[[^\]]*\]\s*/, '').replace(/\d+/g, '#');
  if (seen.has(key)) continue;
  seen.add(key);
  picked.push({ mail: m, slug: key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) });
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const rows: string[] = [];
picked.forEach(({ mail, slug }, i) => {
  const name = `${String(i + 1).padStart(2, '0')}-${slug}`;
  const html = (mail.html ?? '').split(`${baseUrl}/logo.png`).join(logoFile);
  writeFileSync(`${outDir}${name}.html`, html);
  writeFileSync(`${outDir}${name}.txt`, mail.text);
  rows.push(`<tr><td><a href="${name}.html">${escapeHtml(mail.subject)}</a></td><td>to ${escapeHtml(mail.to)}</td><td><a href="${name}.txt">plain text</a></td></tr>`);
});
writeFileSync(
  `${outDir}index.html`,
  `<!doctype html><meta charset="utf-8"><title>Deadbolt email preview</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;background:#12151b;color:#e6e9ef">
<h1>Deadbolt emails</h1><p style="color:#8d97a8">Nothing here was sent. Each is the real message the server builds, shown as a mail app would.</p>
<table cellpadding="8" style="border-collapse:collapse;width:100%">${rows.join('\n')}</table>
<style>a{color:#4fc3f7}td{border-bottom:1px solid #2c3340}</style></body>`,
);
console.log(`Wrote ${picked.length} emails. Open:\n${outDir}index.html`);
