import type { EdgeDef, GameState, ScenarioDef, ZoneDef, ZoneId } from './types';
import { SCENARIOS } from './data/scenario';
import { must } from './rng';

interface Graph {
  scenario: ScenarioDef;
  zones: Map<ZoneId, ZoneDef>;
  edges: Map<string, EdgeDef>;
  /** zone -> [{ to, edge }] for every connection (doors included). */
  adj: Map<ZoneId, { to: ZoneId; edge: EdgeDef }[]>;
}

const cache = new Map<string, Graph>();

export function getScenario(id: string): ScenarioDef {
  return must(SCENARIOS[id], `unknown scenario ${id}`);
}

export function graphFor(scenarioId: string): Graph {
  const hit = cache.get(scenarioId);
  if (hit) return hit;
  const scenario = getScenario(scenarioId);
  const zones = new Map(scenario.zones.map((z) => [z.id, z]));
  const edges = new Map(scenario.edges.map((e) => [e.id, e]));
  const adj = new Map<ZoneId, { to: ZoneId; edge: EdgeDef }[]>();
  for (const z of scenario.zones) adj.set(z.id, []);
  for (const e of scenario.edges) {
    must(adj.get(e.a)).push({ to: e.b, edge: e });
    must(adj.get(e.b)).push({ to: e.a, edge: e });
  }
  const g: Graph = { scenario, zones, edges, adj };
  cache.set(scenarioId, g);
  return g;
}

export const zoneDef = (s: GameState, id: ZoneId): ZoneDef => must(graphFor(s.scenarioId).zones.get(id), `unknown zone ${id}`);

export const isOutdoor = (z: ZoneDef): boolean => z.kind !== 'room';

export function edgeBetween(s: GameState, a: ZoneId, b: ZoneId): EdgeDef | undefined {
  return graphFor(s.scenarioId).adj.get(a)?.find((n) => n.to === b)?.edge;
}

export const edgePassable = (s: GameState, e: EdgeDef): boolean => !e.door || s.doors[e.id] === true;

/** Zones you can walk to from `zone` right now (closed doors block). */
export function neighbors(s: GameState, zone: ZoneId): ZoneId[] {
  const g = graphFor(s.scenarioId);
  return (g.adj.get(zone) ?? []).filter((n) => edgePassable(s, n.edge)).map((n) => n.to);
}

/** Breadth-first distances from `from` over passable connections. */
export function distances(s: GameState, from: ZoneId): Map<ZoneId, number> {
  const dist = new Map<ZoneId, number>([[from, 0]]);
  const queue: ZoneId[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = must(queue[i]);
    const d = must(dist.get(cur));
    for (const n of neighbors(s, cur)) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Like `distances` but treats closed doors as walkable (for planning routes). */
export function planningDistances(s: GameState, from: ZoneId): Map<ZoneId, number> {
  const g = graphFor(s.scenarioId);
  const dist = new Map<ZoneId, number>([[from, 0]]);
  const queue: ZoneId[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = must(queue[i]);
    const d = must(dist.get(cur));
    for (const n of g.adj.get(cur) ?? []) {
      if (!dist.has(n.to)) {
        dist.set(n.to, d + 1);
        queue.push(n.to);
      }
    }
  }
  return dist;
}

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Line of sight. Returns visible zones with their distance (own zone = 0).
 * Rules: sight runs in straight lines through open connections. Outdoor zones
 * (street, yard) do not stop sight, so you can see along the whole street.
 * Entering an indoor zone stops sight, so you see at most one zone inside.
 */
export function visible(s: GameState, from: ZoneId): Map<ZoneId, number> {
  const g = graphFor(s.scenarioId);
  const out = new Map<ZoneId, number>([[from, 0]]);
  const origin = zoneDef(s, from);
  for (const [dc, dr] of DIRS) {
    let cur = origin;
    let dist = 0;
    for (;;) {
      const nextDef = [...g.zones.values()].find((z) => z.col === cur.col + dc && z.row === cur.row + dr);
      if (!nextDef) break;
      const edge = edgeBetween(s, cur.id, nextDef.id);
      if (!edge || !edgePassable(s, edge)) break;
      dist++;
      const prev = out.get(nextDef.id);
      if (prev === undefined || dist < prev) out.set(nextDef.id, dist);
      if (!isOutdoor(nextDef)) break;
      cur = nextDef;
    }
  }
  return out;
}
