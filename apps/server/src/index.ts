import { buildApp } from './app';
import { ConsoleMailer } from './mail';
import { Service } from './service';
import { MemoryStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const service = new Service({
  store: new MemoryStore(process.env.DATA_FILE ?? 'deadbolt-data.json'),
  mailer: new ConsoleMailer(),
  baseUrl,
});
const app = buildApp({ service, jobSecret: process.env.JOB_SECRET });

app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`deadbolt server on ${baseUrl}`));
