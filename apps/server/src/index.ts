import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { ConsoleMailer, GmailMailer, ResendMailer, type Mailer } from './mail';
import { PgStore } from './pgstore';
import { Service } from './service';
import { MemoryStore, type Store } from './store';

// Local development keeps secrets in the repo-root .env (git-ignored); hosting sets real env vars.
try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch { /* no .env */ }

const port = Number(process.env.PORT ?? 8787);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const store: Store = process.env.DATABASE_URL
  ? new PgStore(process.env.DATABASE_URL)
  : new MemoryStore(process.env.DATA_FILE ?? 'deadbolt-data.json');
console.log(process.env.DATABASE_URL ? 'store: Postgres' : 'store: local JSON file (set DATABASE_URL for Postgres)');

// Mail goes through Gmail (GMAIL_* variables), else Resend (RESEND_API_KEY), else it is printed to this log (sign-in links appear here).
// MAIL_FROM defaults to Resend's test sender, which can only deliver to the Resend account owner until a domain is verified.
const gmail = process.env;
const mailer: Mailer = gmail.GMAIL_REFRESH_TOKEN && gmail.GMAIL_CLIENT_ID && gmail.GMAIL_CLIENT_SECRET && gmail.GMAIL_USER
  ? new GmailMailer({ user: gmail.GMAIL_USER, clientId: gmail.GMAIL_CLIENT_ID, clientSecret: gmail.GMAIL_CLIENT_SECRET, refreshToken: gmail.GMAIL_REFRESH_TOKEN, name: gmail.MAIL_FROM_NAME ?? 'Deadbolt' })
  : process.env.RESEND_API_KEY
    ? new ResendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM ?? 'Deadbolt <onboarding@resend.dev>')
    : new ConsoleMailer();
console.log(mailer instanceof GmailMailer ? `mail: Gmail (${gmail.GMAIL_USER})` : mailer instanceof ResendMailer ? 'mail: Resend' : 'mail: printed to this log (set the GMAIL_* variables to send real email)');

const service = new Service({
  store,
  mailer,
  baseUrl,
});
// Production: serve the built web app from this same server (npm run build first).
const staticDir = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
console.log(existsSync(staticDir) ? `serving web app from ${staticDir}` : 'no web build found (use npm run dev for the web app)');
const app = buildApp({ service, jobSecret: process.env.JOB_SECRET, staticDir });

app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`deadbolt server on ${baseUrl}`));
