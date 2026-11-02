import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Minimal document store: collections of JSON docs keyed by id. A Postgres
 * implementation is one jsonb table `(col, id, doc)`; ids sort by prefix.
 */
export interface Store {
  get<T>(col: string, id: string): Promise<T | undefined>;
  put<T>(col: string, id: string, doc: T): Promise<void>;
  list<T>(col: string, prefix?: string): Promise<T[]>;
}

/** In-memory store, optionally mirrored to a JSON file so dev restarts keep games. */
export class MemoryStore implements Store {
  private data = new Map<string, Map<string, unknown>>();

  constructor(private file?: string) {
    if (file && existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
      for (const [col, docs] of Object.entries(raw)) this.data.set(col, new Map(Object.entries(docs)));
    }
  }

  async get<T>(col: string, id: string): Promise<T | undefined> {
    const d = this.data.get(col)?.get(id);
    return d === undefined ? undefined : (structuredClone(d) as T);
  }

  async put<T>(col: string, id: string, doc: T): Promise<void> {
    let c = this.data.get(col);
    if (!c) this.data.set(col, (c = new Map()));
    c.set(id, structuredClone(doc));
    this.flush();
  }

  async list<T>(col: string, prefix = ''): Promise<T[]> {
    const c = this.data.get(col);
    if (!c) return [];
    return [...c.entries()]
      .filter(([id]) => id.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, d]) => structuredClone(d) as T);
  }

  private flush(): void {
    if (!this.file) return;
    const out: Record<string, Record<string, unknown>> = {};
    for (const [col, docs] of this.data) out[col] = Object.fromEntries(docs);
    writeFileSync(this.file + '.tmp', JSON.stringify(out));
    renameSync(this.file + '.tmp', this.file);
  }
}
