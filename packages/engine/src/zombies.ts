import type { Zombie, ZoneId } from './types';
import {
  type Ctx, emit, getSurvivor, noiseAt, spawnAt, survivorsIn, woundCount, woundSurvivor, danger,
} from './core';
import { distances, getScenario, neighbors, visible } from './map';
import { must } from './rng';
import { ZOMBIE_DEFS } from './data/spawn';

/** Attacks each survivor has soaked up this phase, so hits spread out evenly. */
const soaked = new WeakMap<object, Map<string, number>>();

function attack(c: Ctx, z: Zombie): void {
  const targets = survivorsIn(c.s, z.zone);
  if (targets.length === 0) return;
  // Hits are spread out: fewest wounds first, then fewest attacks taken this phase.
  const tally = soaked.get(c.s) ?? new Map<string, number>();
  soaked.set(c.s, tally);
  const load = (id: string): number => tally.get(id) ?? 0;
  const target = [...targets].sort((a, b) => woundCount(a) - woundCount(b) || load(a.id) - load(b.id))[0];
  if (!target) return;
  tally.set(target.id, load(target.id) + 1);
  emit(c, 'zombie_attacked', { id: z.id, zombieType: z.type, zone: z.zone, target: target.id });
  woundSurvivor(c, target, z.id);
}

/** Where a zombie group standing in `from` wants to go, or null to stay put. */
export function chooseTarget(c: Ctx, from: ZoneId): ZoneId | null {
  const s = c.s;
  const dist = distances(s, from);
  const seen = visible(s, from);
  const sighted = [...seen.keys()].filter(
    (z) => z !== from && dist.has(z) && survivorsIn(s, z).length > 0,
  );
  if (sighted.length > 0) {
    sighted.sort(
      (a, b) =>
        must(dist.get(a)) - must(dist.get(b)) || noiseAt(s, b) - noiseAt(s, a) || a.localeCompare(b),
    );
    return sighted[0] ?? null;
  }
  const noisy = [...dist.keys()].filter((z) => z !== from && noiseAt(s, z) > 0);
  if (noisy.length === 0) return null;
  noisy.sort(
    (a, b) => noiseAt(s, b) - noiseAt(s, a) || must(dist.get(a)) - must(dist.get(b)) || a.localeCompare(b),
  );
  return noisy[0] ?? null;
}

function activate(c: Ctx, filter: (z: Zombie) => boolean): void {
  const s = c.s;
  const byZone = new Map<ZoneId, string[]>();
  for (const z of s.zombies) {
    if (!filter(z)) continue;
    const list = byZone.get(z.zone) ?? [];
    list.push(z.id);
    byZone.set(z.zone, list);
  }
  for (const zone of [...byZone.keys()].sort()) {
    const ids = must(byZone.get(zone));
    if (survivorsIn(s, zone).length > 0) {
      for (const id of ids) {
        const z = s.zombies.find((x) => x.id === id);
        if (z) attack(c, z);
      }
      continue;
    }
    const target = chooseTarget(c, zone);
    if (!target) continue;
    const dt = distances(s, target);
    const here = dt.get(zone);
    if (here === undefined) continue;
    const steps = neighbors(s, zone).filter((n) => dt.get(n) === here - 1);
    if (steps.length === 0) continue;
    const order = c.rng.shuffle([...steps]);
    c.rng.shuffle(ids);
    ids.forEach((id, i) => {
      const z = s.zombies.find((x) => x.id === id);
      if (!z) return;
      const to = must(order[i % order.length]);
      emit(c, 'zombie_moved', { id: z.id, zombieType: z.type, from: z.zone, to });
      z.zone = to;
    });
  }
}

export function runZombiePhase(c: Ctx): void {
  const s = c.s;
  soaked.delete(s);
  emit(c, 'zombie_phase_start', { round: s.round, zombies: s.zombies.length });
  activate(c, () => true);
  // Sprinters take a second action after everyone else.
  activate(c, (z) => ZOMBIE_DEFS[z.type].actions > 1);
  if (s.status !== 'active') return;

  let surge = false;
  const sc = getScenario(s.scenarioId);
  for (const zone of sc.zones) {
    if (!zone.spawn) continue;
    const after = zone.spawn.afterBuilding;
    if (after && !s.filled[after]) continue;
    if (spawnAt(c, zone.id, 'spawn_point')) surge = true;
  }
  if (surge && danger(s) > 0) {
    emit(c, 'surge_activation');
    activate(c, (z) => z.type === 'sprinter');
  }
  s.noise = {};
  emit(c, 'zombie_phase_end', { zombies: s.zombies.length });
  void getSurvivor;
}
