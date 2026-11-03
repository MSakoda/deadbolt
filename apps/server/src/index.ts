import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { ConsoleMailer } from './mail';
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

const service = new Service({
  store,
  mailer: new ConsoleMailer(),
  baseUrl,
});
const app = buildApp({ service, jobSecret: process.env.JOB_SECRET });

app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`deadbolt server on ${baseUrl}`));
