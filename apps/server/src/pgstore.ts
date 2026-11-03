import pg from 'pg';
import type { Store } from './store';

/** Postgres-backed store: one jsonb table `docs (col, id, doc)`. Created on first connect. */
export class PgStore implements Store {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 20_000 });
    this.ready = this.pool
      .query('CREATE TABLE IF NOT EXISTS docs (col text NOT NULL, id text NOT NULL, doc jsonb NOT NULL, PRIMARY KEY (col, id))')
      .then(() => undefined);
  }

  async get<T>(col: string, id: string): Promise<T | undefined> {
    await this.ready;
    const r = await this.pool.query('SELECT doc FROM docs WHERE col = $1 AND id = $2', [col, id]);
    return r.rows[0]?.doc as T | undefined;
  }

  async put<T>(col: string, id: string, doc: T): Promise<void> {
    await this.ready;
    await this.pool.query(
      'INSERT INTO docs (col, id, doc) VALUES ($1, $2, $3) ON CONFLICT (col, id) DO UPDATE SET doc = EXCLUDED.doc',
      [col, id, JSON.stringify(doc)],
    );
  }

  async list<T>(col: string, prefix = ''): Promise<T[]> {
    await this.ready;
    const r = await this.pool.query('SELECT doc FROM docs WHERE col = $1 AND starts_with(id, $2) ORDER BY id COLLATE "C"', [col, prefix]);
    return r.rows.map((x) => x.doc as T);
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
