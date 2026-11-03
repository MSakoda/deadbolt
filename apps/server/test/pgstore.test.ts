import { describe, expect, it } from 'vitest';
import { PgStore } from '../src/pgstore';

try { process.loadEnvFile(new URL('../../../.env', import.meta.url)); } catch { /* no .env */ }
const url = process.env.DATABASE_URL;

// Runs only when DATABASE_URL is set (from the repo-root .env or the environment).
describe.skipIf(!url)('PgStore', () => {
  it('round-trips docs, lists by prefix in order, and overwrites', async () => {
    const s = new PgStore(url!);
    const col = 'test_' + Math.random().toString(36).slice(2);
    try {
      expect(await s.get(col, 'x')).toBeUndefined();
      await s.put(col, 'b:2', { n: 2, nested: { a: [1, 2] } });
      await s.put(col, 'b:1', { n: 1 });
      await s.put(col, 'c:1', { n: 3 });
      expect(await s.get(col, 'b:2')).toEqual({ n: 2, nested: { a: [1, 2] } });
      expect((await s.list<{ n: number }>(col, 'b:')).map((d) => d.n)).toEqual([1, 2]);
      expect(await s.list(col)).toHaveLength(3);
      await s.put(col, 'b:1', { n: 9 });
      expect(await s.get(col, 'b:1')).toEqual({ n: 9 });
      expect(await s.list(col, 'zzz')).toEqual([]);
    } finally {
      await (s as unknown as { pool: { query(q: string, p: unknown[]): Promise<unknown> } }).pool.query('DELETE FROM docs WHERE col = $1', [col]);
      await s.close();
    }
  });
});
