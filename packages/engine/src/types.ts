// Core types for the Deadbolt rules engine. Everything here is plain JSON so
// state can be stored in a database, sent over the wire and replayed.

export type ZoneId = string;
export type SurvivorId = string;

export type ZombieType = 'shambler' | 'sprinter' | 'brute' | 'mutant';

export type ItemId =
  | 'frying_pan'
  | 'crowbar'
  | 'fire_axe'
  | 'machete'
  | 'chainsaw'
  | 'pistol'
  | 'sawed_off'
  | 'smg'
  | 'rifle'
  | 'rifle_scope'
  | 'scope'
  | 'glass_bottle'
  | 'gasoline'
  | 'molotov'
  | 'goalie_mask'
  | 'flashlight'
  | 'plenty_of_ammo'
  | 'alarm'
  | 'wound';

export type ItemKind = 'melee' | 'ranged' | 'thrown' | 'part' | 'gear' | 'trap' | 'wound';

export interface ItemDef {
  id: ItemId;
  name: string;
  kind: ItemKind;
  /** [min, max] range in zones (melee is [0,0]). */
  range?: [number, number];
  dice?: number;
  /** A die hits on a roll >= accuracy. */
  accuracy?: number;
  damage?: number;
  /** Attacking with it makes a noise token. */
  noisy?: boolean;
  /** Two copies in both hands fire together as one action. */
  dual?: boolean;
  /** 'silent' / 'noisy' = can open doors, 'none' = cannot. */
  door: 'none' | 'silent' | 'noisy';
  /** Must be reloaded (1 action) between shots; reloads free at turn end. */
  reload?: boolean;
  /** Rifle with scope: shooter picks targets. */
  chooseTargets?: boolean;
}

export interface Card {
  id: string;
  item: ItemId;
  /** For reload weapons: fired and not yet reloaded. */
  spent?: boolean;
}

export type Danger = 0 | 1 | 2 | 3; // Quiet, Restless, Swarming, Overrun
export const DANGER_NAMES = ['Quiet', 'Restless', 'Swarming', 'Overrun'] as const;

export type AbilityId =
  // Dana
  | 'roll_call' | 'second_wind' | 'rally_point' | 'plan_b'
  // Ray
  | 'heavy_swing' | 'thick_skin' | 'crowd_breaker' | 'frenzy'
  // Lena
  | 'steady_aim' | 'practiced_hands' | 'quiet_shot' | 'clean_kill'
  // Amara
  | 'first_aid' | 'triage' | 'steady_presence' | 'field_hospital'
  // Jonah
  | 'quick_feet' | 'light_step' | 'slip_past' | 'sprint'
  // Hannah
  | 'sharp_eye' | 'deep_pockets' | 'quiet_hands' | 'second_look';

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  blurb: string;
  /** Index 0 = start, 1 = Restless, 2 = Swarming, 3 = Overrun. */
  ladder: [AbilityId, AbilityId, AbilityId, AbilityId];
}

export interface Survivor {
  id: SurvivorId;
  charId: string;
  /** The player (seat) who controls this survivor. */
  owner: string;
  zone: ZoneId;
  /** Slots 0 and 1 are the hands. */
  slots: (Card | null)[];
  xp: number;
  level: 0 | 1 | 2 | 3;
  alive: boolean;
  /** Per-round ability usage. */
  roundFlags: { thickSkin: boolean; secondWind: boolean; steadyPresence: boolean };
}

export interface Zombie {
  id: string;
  type: ZombieType;
  zone: ZoneId;
}

export interface TurnState {
  survivorId: SurvivorId;
  actionsLeft: number;
  free: { move: number; melee: number };
  searches: number;
  freeReorg: boolean;
  rollCall: boolean;
  rally: boolean;
  firstAid: number;
  quietShotUsed: boolean;
  ammoUsed: boolean;
  frenzyUsed: boolean;
}

export interface PendingSearch {
  kind: 'search';
  survivorId: SurvivorId;
  cards: Card[];
  source: 'search' | 'supplies';
}

export type ObjectiveKind = 'keys' | 'supplies' | 'fuel';
export interface ObjectiveToken {
  kind: ObjectiveKind;
  /** Face-down '?' markers hide their kind from clients until taken. */
  hidden: boolean;
}

export type GameStatus = 'active' | 'won' | 'lost';

export interface GameState {
  rulesVersion: string;
  scenarioId: string;
  status: GameStatus;
  round: number;
  /** Fixed survivor turn order, set at game start. */
  turnOrder: SurvivorId[];
  turnIndex: number;
  turn: TurnState | null;
  pending: PendingSearch | null;
  survivors: Record<SurvivorId, Survivor>;
  zombies: Zombie[];
  noise: Record<ZoneId, number>;
  /** Door edge id -> open? */
  doors: Record<string, boolean>;
  /** Building id -> has spawned its zombies. */
  filled: Record<string, boolean>;
  objectives: Record<ZoneId, ObjectiveToken>;
  team: { keys: boolean; fuel: boolean };
  searchDeck: Card[];
  searchDiscard: Card[];
  spawnDeck: string[];
  spawnDiscard: string[];
  nextId: number;
  rng: number;
}

export type Action =
  | { type: 'move'; to: ZoneId }
  | { type: 'open_door'; to: ZoneId }
  | { type: 'search' }
  | { type: 'resolve_search'; keep: number | null; replaceSlot?: number }
  | { type: 'attack'; slot: 0 | 1 | 'both'; target: ZoneId; prefer?: ZombieType[] }
  | { type: 'reload'; slot: number }
  | { type: 'reorganize'; arrangements: Record<SurvivorId, (string | null)[]> }
  | { type: 'combine'; a: number; b: number }
  | { type: 'noise' }
  | { type: 'take_objective' }
  | { type: 'start_truck' }
  | { type: 'first_aid'; target: SurvivorId }
  | { type: 'grant'; target: SurvivorId; then: Action }
  | { type: 'end_turn' };

export type GameEvent = { type: string } & Record<string, unknown>;

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

// ---- scenario definition ----

export interface ZoneDef {
  id: ZoneId;
  name: string;
  kind: 'street' | 'room' | 'yard';
  col: number;
  row: number;
  building?: string;
  /** Spawn point. Active always, or only once the named building has filled. */
  spawn?: { afterBuilding?: string };
}

export interface EdgeDef {
  id: string;
  a: ZoneId;
  b: ZoneId;
  door: boolean;
  startOpen?: boolean;
}

export interface BuildingDef {
  id: string;
  name: string;
  rooms: ZoneId[];
  /** Rooms skipped the first time the building fills. */
  keepEmpty: ZoneId[];
}

export interface ScenarioDef {
  id: string;
  name: string;
  zones: ZoneDef[];
  edges: EdgeDef[];
  buildings: BuildingDef[];
  startZone: ZoneId;
  exitZone: ZoneId;
  /** Zones holding shuffled '?' markers (one keys, rest supplies). */
  hiddenMarkers: ZoneId[];
  fixedObjectives: { zone: ZoneId; kind: ObjectiveKind }[];
}
