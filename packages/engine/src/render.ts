import type { GameState, ZombieType } from './types';
import { getScenario } from './map';
import { DANGER_NAMES } from './types';
import { danger, zombiesIn, survivorsIn, woundCount, getSurvivor } from './core';

const W = 17;
const pad = (t: string, n = W): string => (t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length));
const LETTER: Record<ZombieType, string> = { shambler: 'S', sprinter: 'R', brute: 'B', mutant: 'M' };

export function renderBoard(s: GameState): string {
  const sc = getScenario(s.scenarioId);
  const rows = Math.max(...sc.zones.map((z) => z.row)) + 1;
  const cols = Math.max(...sc.zones.map((z) => z.col)) + 1;
  const out: string[] = [];
  const rule = '+' + Array.from({ length: cols }, () => '-'.repeat(W)).join('+') + '+';
  for (let r = 0; r < rows; r++) {
    out.push(rule);
    const cells = Array.from({ length: cols }, (_, c) => sc.zones.find((z) => z.col === c && z.row === r));
    const line = (f: (z: (typeof cells)[number] & object) => string, blank = '#'.repeat(W)) =>
      '|' + cells.map((z) => (z ? pad(f(z)) : blank)).join('|') + '|';
    out.push(line((z) => ` ${z.name}${s.objectives[z.id] ? ' (?)' : ''}`));
    out.push(
      line((z) => {
        const counts: Record<string, number> = {};
        for (const zb of zombiesIn(s, z.id)) counts[LETTER[zb.type]] = (counts[LETTER[zb.type]] ?? 0) + 1;
        const txt = Object.entries(counts).map(([k, n]) => `${n}${k}`).join(' ');
        return ' Z:' + (txt || '-');
      }),
    );
    out.push(line((z) => ' P:' + (survivorsIn(s, z.id).map((v) => v.id.slice(0, 2).toUpperCase()).join(' ') || '-')));
    out.push(line((z) => ((s.noise[z.id] ?? 0) > 0 ? ` noise x${s.noise[z.id]}` : '')));
  }
  out.push(rule);
  const closed = sc.edges.filter((e) => e.door && !s.doors[e.id]).length;
  out.push(
    `Round ${s.round} | Danger ${DANGER_NAMES[danger(s)]} | Zombies ${s.zombies.length} | Closed doors ${closed} | keys ${s.team.keys ? 'yes' : 'no'} fuel ${s.team.fuel ? 'yes' : 'no'}`,
  );
  for (const id of s.turnOrder) {
    const v = getSurvivor(s, id);
    const items = v.slots.map((c) => (c ? c.item : '.')).join(',');
    out.push(`  ${v.alive ? (s.turn?.survivorId === id ? '>' : ' ') : 'x'} ${id.padEnd(7)} L${v.level} xp${String(v.xp).padEnd(3)} W${woundCount(v)} [${items}]`);
  }
  return out.join('\n');
}
