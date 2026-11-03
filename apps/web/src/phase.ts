import { getScenario } from '@deadbolt/engine';
import type { GameEvent, GameState } from '@deadbolt/engine';

/** `alert` is for surprises (an alarm, a building filling up), `phase` for the routine zombie phase. */
export interface Banner { title: string; sub?: string; kind?: 'alert' }

export interface Names { zone(id: string): string; building(id: string): string }

export const namesFor = (scenarioId: string): Names => ({
  zone: (id) => getScenario(scenarioId).zones.find((z) => z.id === id)?.name ?? id,
  building: (id) => getScenario(scenarioId).buildings.find((b) => b.id === id)?.name ?? id,
});

/** One step of the playback: show the banner, apply the events to the board, wait. */
export interface Beat { banner?: Banner; events: GameEvent[]; wait: number }

export interface PhasePlan {
  /** Everything before the zombie phase (the last survivor's own actions). */
  pre: GameEvent[];
  beats: Beat[];
}

const pretty = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Turns the events of an End turn that ran the zombie phase into beats: zombies advance together,
 * each bite one at a time, sprinters act again, then each spawn card with its new zombies, and any surge.
 * Returns null when the events contain no zombie phase.
 */
export function planPhase(events: GameEvent[], zoneName: (id: string) => string): PhasePlan | null {
  const start = events.findIndex((e) => e.type === 'zombie_phase_start');
  if (start < 0) return null;
  let end = events.findIndex((e, i) => i > start && e.type === 'zombie_phase_end');
  if (end < 0) end = events.length;
  const inner = events.slice(start + 1, end);

  const beats: Beat[] = [{ banner: { title: 'ZOMBIE PHASE', sub: 'The horde moves' }, events: [], wait: 1200 }];
  let mode: 'act' | 'spawn' = 'act';
  let acts: GameEvent[] = [];
  let modeBanner: Banner | undefined;
  let modeStart = beats.length;

  /** Moves go together; each bite (and what it did to the survivor) is its own beat. */
  const flush = () => {
    if (acts.length) {
      const moves = acts.filter((e) => e.type === 'zombie_moved');
      const bites: GameEvent[][] = [];
      for (const e of acts) {
        if (e.type === 'zombie_attacked') bites.push([e]);
        else if (e.type !== 'zombie_moved') bites[bites.length - 1]?.push(e);
      }
      if (moves.length) beats.push({ events: moves, wait: 1000 });
      for (const b of bites) beats.push({ events: b, wait: 700 });
      acts = [];
    }
    // The banner only appears if that stage actually did something.
    const first = beats[modeStart];
    if (modeBanner && first && !first.banner && beats.length > modeStart) first.banner = modeBanner;
  };
  const begin = (banner: Banner, m: 'act' | 'spawn') => {
    flush();
    mode = m;
    modeBanner = banner;
    modeStart = beats.length;
  };

  for (const e of inner) {
    if (e.type === 'zombie_step') {
      if (e['step'] === 'sprint') begin({ title: 'SPRINTERS', sub: 'Sprinters act again' }, 'act');
      else if (e['step'] === 'spawn') begin({ title: 'REINFORCEMENTS', sub: 'New zombies arrive' }, 'act');
      if (e['step'] === 'spawn') mode = 'spawn';
    } else if (e.type === 'surge_activation') {
      begin({ title: 'SURGE!', sub: 'Sprinters run again' }, 'act');
    } else if (mode === 'spawn' && e.type === 'spawn_card') {
      beats.push({ banner: { title: 'SPAWN', sub: `${zoneName(String(e['zone']))}: ${pretty(String(e['card']))}` }, events: [e], wait: 1150 });
    } else if (mode === 'spawn') {
      beats[beats.length - 1]?.events.push(e);
    } else {
      acts.push(e);
    }
  }
  flush();
  return { pre: events.slice(0, start), beats };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Zombies that appear outside the zombie phase: an Alarm card drawn while searching, and every room
 * of a building filling up when its first door opens. Each gets a beat with an alert banner; the rest
 * of the events come back as `instant`.
 */
function alertBeats(events: GameEvent[], names: Names): { instant: GameEvent[]; beats: Beat[] } {
  const instant: GameEvent[] = [];
  const beats: Beat[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.type === 'alarm') {
      const group = [e];
      while (events[i + 1]?.type === 'zombie_spawned' && events[i + 1]!['reason'] === 'alarm') group.push(events[++i]!);
      beats.push({
        banner: { title: 'ALARM!', sub: `A Shambler appears in ${names.zone(String(e['zone']))}`, kind: 'alert' },
        events: group,
        wait: 1800,
      });
    } else if (e.type === 'building_opened') {
      const group = [e];
      const isFill = (x?: GameEvent) => !!x && (x.type === 'spawn_card' || x.type === 'zombie_spawned') && String(x['reason']).startsWith('building:');
      while (isFill(events[i + 1])) group.push(events[++i]!);
      const spawned = group.filter((x) => x.type === 'zombie_spawned');
      const rooms = [...new Set(spawned.map((x) => names.zone(String(x['zone']))))];
      const name = names.building(String(e['building']));
      beats.push({
        banner: {
          title: `${name.toUpperCase()} IS OPEN`,
          sub: spawned.length ? `${plural(spawned.length, 'zombie')} in ${rooms.join(' and ')}` : 'The rooms are empty',
          kind: spawned.length ? 'alert' : undefined,
        },
        events: group,
        wait: spawned.length ? 2000 : 1100,
      });
    } else instant.push(e);
  }
  return { instant, beats };
}

/**
 * Everything worth playing back in one batch of events: surprise spawns first, then the zombie phase
 * if there was one (and `phaseOn`). Null when there is nothing to play.
 */
export function planPlayback(events: GameEvent[], names: Names, phaseOn: boolean): PhasePlan | null {
  const phase = events.some((e) => e.type === 'zombie_phase_start');
  if (phase && !phaseOn) return null;
  const start = phase ? events.findIndex((e) => e.type === 'zombie_phase_start') : events.length;
  const { instant, beats: alerts } = alertBeats(events.slice(0, start), names);
  const zp = phase ? planPhase(events, names.zone) : null;
  const beats = [...alerts, ...(zp?.beats ?? [])];
  return beats.length ? { pre: instant, beats } : null;
}

/** Applies just enough of the events (positions, spawns, kills, deaths) to show intermediate board states. */
export function applyToDisplay(base: GameState, events: GameEvent[]): GameState {
  const s = structuredClone(base);
  for (const e of events) {
    if (e.type === 'moved') {
      const sv = s.survivors[String(e['survivor'])];
      if (sv) sv.zone = String(e['to']);
    } else if (e.type === 'zombie_moved') {
      const z = s.zombies.find((q) => q.id === e['id']);
      if (z) z.zone = String(e['to']);
    } else if (e.type === 'zombie_spawned') {
      if (!s.zombies.some((q) => q.id === e['id'])) {
        s.zombies.push({ id: String(e['id']), type: e['zombieType'] as GameState['zombies'][number]['type'], zone: String(e['zone']) });
      }
    } else if (e.type === 'zombie_killed') {
      s.zombies = s.zombies.filter((q) => q.id !== e['id']);
    } else if (e.type === 'door_opened') {
      s.doors[String(e['edge'])] = true;
    } else if (e.type === 'objective_taken') {
      delete s.objectives[String(e['zone'])];
      if (e['kind'] === 'keys') s.team.keys = true;
      else if (e['kind'] === 'fuel') s.team.fuel = true;
    } else if (e.type === 'survivor_died') {
      const sv = s.survivors[String(e['survivor'])];
      if (sv) sv.alive = false;
    }
  }
  return s;
}
