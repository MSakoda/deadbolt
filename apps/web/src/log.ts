import { CHARACTER_BY_ID, ITEMS, getScenario } from '@deadbolt/engine';
import type { GameEvent, GameState } from '@deadbolt/engine';

export interface LogLine { text: string; kind: 'turn' | 'info' | 'bad' | 'good' | 'zombie'; round: number }

const sname = (id: unknown): string => CHARACTER_BY_ID[String(id)]?.name.split(' ')[0] ?? String(id);
const item = (id: unknown): string => ITEMS[id as keyof typeof ITEMS]?.name ?? String(id);

export function describe(s: GameState, e: GameEvent): LogLine | null {
  const zn = (id: unknown): string => getScenario(s.scenarioId).zones.find((z) => z.id === id)?.name ?? String(id);
  const L = (text: string, kind: LogLine['kind'] = 'info'): LogLine => ({ text, kind, round: s.round });
  switch (e.type) {
    case 'game_started': return L('The group gathers at the West end. Find the keys and fuel, then drive out from the East end.', 'turn');
    case 'turn_started': return L(`Round ${e['round']}: ${sname(e['survivor'])}'s turn (${e['actions']} actions)`, 'turn');
    case 'moved': return L(`${sname(e['survivor'])} moves to ${zn(e['to'])}`);
    case 'door_opened': return L(`${sname(e['survivor'])} opens the door to ${zn(e['to'])}`);
    case 'building_opened': return L(`The building is open. Zombies pour into every room.`, 'bad');
    case 'noise': return L(`Noise in ${zn(e['zone'])}`);
    case 'cards_drawn': return L(`${sname(e['survivor'])} finds ${e['count']} item${e['count'] === 1 ? '' : 's'}`);
    case 'card_kept': return L(e['item'] ? `${sname(e['survivor'])} keeps the ${item(e['item'])}` : `${sname(e['survivor'])} leaves everything`);
    case 'alarm': return L(`An alarm goes off in ${zn(e['zone'])}!`, 'bad');
    case 'attack': return L(`${sname(e['survivor'])} attacks ${zn(e['target'])} with ${item(e['weapon'])}${e['dual'] ? ' (dual)' : ''}: ${(e['rolls'] as number[]).join(', ')} -> ${e['hits']} hit${e['hits'] === 1 ? '' : 's'}`);
    case 'reroll': return L(`Reroll (${String(e['why']).replace(/_/g, ' ')}): ${e['from']} -> ${e['to']}`);
    case 'zombie_killed': return L(`${e['zombieType']} killed in ${zn(e['zone'])} (+${e['xp']} XP)`, 'good');
    case 'hit_wasted': return L('A hit was too weak to kill', 'info');
    case 'friendly_fire': return L(`Friendly fire! ${sname(e['shooter'])} hits ${sname(e['victim'])}`, 'bad');
    case 'molotov': return L(`${sname(e['survivor'])} throws a Molotov into ${zn(e['target'])}`, 'good');
    case 'level_up': return L(`${sname(e['survivor'])} reaches level ${e['level']}: unlocks ${String(e['ability']).replace(/_/g, ' ')}`, 'good');
    case 'wounded': return L(`${sname(e['survivor'])} is wounded (${e['wounds']}/2)`, 'bad');
    case 'wound_prevented': return L(`${sname(e['survivor'])} avoids a wound (${String(e['by']).replace(/_/g, ' ')})`, 'good');
    case 'item_lost': return L(`${sname(e['survivor'])} drops the ${item(e['item'])}`, 'bad');
    case 'survivor_died': return L(`${sname(e['survivor'])} is down!`, 'bad');
    case 'healed': return L(`${sname(e['medic'])} patches up ${sname(e['target'])}`, 'good');
    case 'combined': return L(`${sname(e['survivor'])} makes a ${item(e['result'])}`, 'good');
    case 'reloaded': return L(`${sname(e['survivor'])} reloads`);
    case 'reorganized': return L(`${sname(e['survivor'])} reorganizes${(e['with'] as string[]).length ? ' and trades' : ''}`);
    case 'objective_taken': return L(`${sname(e['survivor'])} takes the ${e['kind']}`, 'good');
    case 'free_action_granted': return L(`${sname(e['by'])} gives ${sname(e['to'])} a free ${String(e['action']).replace('_', ' ')}`, 'good');
    case 'free_action_gained': return L(`${sname(e['survivor'])} gains a free action (${e['why']})`, 'good');
    case 'zombie_phase_start': return L(`Zombie phase (${e['zombies']} on the board)`, 'zombie');
    case 'zombie_attacked': return L(`A ${e['zombieType']} bites ${sname(e['target'])}`, 'zombie');
    case 'spawn_card': return e['reason'] === 'spawn_point' ? L(`Spawn in ${zn(e['zone'])} (${['Quiet', 'Restless', 'Swarming', 'Overrun'][e['danger'] as number]})`, 'zombie') : null;
    case 'surge': return L('Surge! Sprinters get another action', 'zombie');
    case 'round_started': return L(`Round ${e['round']} begins`, 'turn');
    case 'game_won': return L('The truck roars to life. You made it out!', 'good');
    case 'game_lost': return L('Everyone has fallen.', 'bad');
    default: return null;
  }
}

export function describeAll(s: GameState, events: GameEvent[]): LogLine[] {
  const out: LogLine[] = [];
  for (const e of events) {
    if (e.type === 'zombie_moved' || e.type === 'zombie_spawned' || e.type === 'turn_ended') continue;
    const d = describe(s, e);
    if (d) out.push(d);
  }
  return out;
}
