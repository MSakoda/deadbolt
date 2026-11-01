// Small deterministic PRNG (mulberry32). The state is a single 32-bit integer
// that lives inside GameState, so every roll is reproducible from the action log.

export class Rng {
  state: number;
  constructor(state: number) {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  d6(): number {
    return this.int(6) + 1;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  }
}

export function must<T>(v: T | undefined | null, msg = 'unexpected missing value'): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}
