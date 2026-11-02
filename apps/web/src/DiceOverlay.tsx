import { useEffect, useRef, useState } from 'react';
import { CHARACTER_BY_ID, ITEMS, getScenario } from '@deadbolt/engine';
import type { ItemId } from '@deadbolt/engine';
import type { Roll } from './dice';

// Pip positions on a 3x3 grid (0..8, row by row).
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

type DieState = 'rolling' | 'hit' | 'miss';
interface DieView { value: number; state: DieState }

const rand6 = () => 1 + Math.floor(Math.random() * 6);

function Die({ d, i, needs }: { d: DieView; i: number; needs: number }) {
  return (
    <div className={'die ' + d.state} style={{ ['--i' as string]: i }} title={d.state === 'rolling' ? 'rolling' : `${d.value} (needs ${needs}+)`}>
      <div className="pips3">
        {Array.from({ length: 9 }, (_, k) => <span key={k} className={PIPS[d.value]?.includes(k) ? 'pip3 on' : 'pip3'} />)}
      </div>
      {d.state === 'hit' && <b className="mark">&#10003;</b>}
      {d.state === 'miss' && <b className="mark">&#10005;</b>}
    </div>
  );
}

/**
 * Plays attack rolls one after another: dice tumble, settle one by one as hit or miss, rerolled
 * misses tumble again, then a verdict. Click it to skip. It never blocks the board.
 */
export function DiceOverlay({ queue, zoneName, onDone }: { queue: Roll[]; zoneName(id: string): string; onDone(): void }) {
  const roll = queue[0];
  const [dice, setDice] = useState<DieView[]>([]);
  const [label, setLabel] = useState('');
  const [verdict, setVerdict] = useState<{ hit: boolean; text: string } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!roll) return;
    let alive = true;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (alive) fn(); }, ms)); };
    const who = CHARACTER_BY_ID[roll.survivor]?.name.split(' ')[0] ?? roll.survivor;
    const weapon = ITEMS[roll.weapon as ItemId]?.name ?? roll.weapon;
    const setOne = (i: number, v: DieView) => setDice((d) => d.map((x, j) => (j === i ? v : x)));

    setDice(roll.initial.map(() => ({ value: rand6(), state: 'rolling' as const })));
    setLabel(`${who} attacks ${zoneName(roll.target)} with ${weapon}${roll.dual ? ' (both hands)' : ''}. Hit on ${roll.needs}+`);
    setVerdict(null);
    const tick = window.setInterval(() => {
      setDice((d) => d.map((x) => (x.state === 'rolling' ? { ...x, value: rand6() } : x)));
    }, 85);

    let t = 850;
    roll.initial.forEach((v, i) => {
      at(t + i * 160, () => setOne(i, { value: v, state: v >= roll.needs ? 'hit' : 'miss' }));
    });
    t += (roll.initial.length - 1) * 160 + 650;

    // Rerolls: the first failing die showing the old value is the one that was rerolled.
    const shown = [...roll.initial];
    for (const r of roll.rerolls) {
      const i = shown.findIndex((v) => v === r.from && v < roll.needs);
      if (i < 0) continue;
      shown[i] = r.to;
      at(t, () => { setLabel(`${r.why.replace(/_/g, ' ')}: rerolling a miss`); setOne(i, { value: rand6(), state: 'rolling' }); });
      at(t + 800, () => setOne(i, { value: r.to, state: r.to >= roll.needs ? 'hit' : 'miss' }));
      t += 1350;
    }

    at(t, () => {
      const hit = roll.hits > 0;
      const bits = [hit ? `${roll.hits} hit${roll.hits === 1 ? '' : 's'}` : 'no hits'];
      if (roll.killed) bits.push(`${roll.killed} zombie${roll.killed === 1 ? '' : 's'} down`);
      if (roll.wasted) bits.push(`${roll.wasted} too weak to kill`);
      if (roll.friendly) bits.push('friendly fire!');
      setVerdict({ hit, text: bits.join(' · ') });
    });
    at(t + 1700, () => done.current());

    return () => { alive = false; timers.forEach(clearTimeout); clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll?.id]);

  if (!roll) return null;
  return (
    <div className="dice-overlay" onClick={() => done.current()} role="status" aria-live="polite" title="Click to skip">
      <div className="dice-label">{label}</div>
      <div className="dice-row">
        {dice.map((d, i) => <Die key={i} d={d} i={i} needs={roll.needs} />)}
      </div>
      <div className={'dice-verdict' + (verdict ? (verdict.hit ? ' win' : ' lose') : '')}>
        {verdict && (
          <>
            <span className="burst" aria-hidden />
            <b>{verdict.hit ? 'HIT!' : 'MISS'}</b> <span>{verdict.text}</span>
          </>
        )}
      </div>
      {queue.length > 1 && <small className="dim">{queue.length - 1} more roll{queue.length === 2 ? '' : 's'} queued</small>}
    </div>
  );
}

export const zoneNameFor = (scenarioId: string) => (id: string): string =>
  getScenario(scenarioId).zones.find((z) => z.id === id)?.name ?? id;
