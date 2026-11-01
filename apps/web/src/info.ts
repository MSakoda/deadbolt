import { ITEMS, ZOMBIE_DEFS, abilities } from '@deadbolt/engine';
import type { Card, ItemId, Survivor } from '@deadbolt/engine';

export interface WeaponInfo { dice: number; need: number; dmg: number; eachPct: number; anyPct: number; range: string; melee: boolean }

/** Attack numbers for a weapon card as this survivor would roll it right now. */
export function weaponInfo(actor: Survivor | null, card: Card | null | undefined): WeaponInfo | null {
  if (!card) return null;
  const d = ITEMS[card.item];
  if (d.kind !== 'melee' && d.kind !== 'ranged') return null;
  const ab = actor ? abilities(actor) : new Set<string>();
  const melee = d.kind === 'melee';
  const dice = d.dice! + (melee ? (ab.has('heavy_swing') ? 1 : 0) : ab.has('practiced_hands') ? 1 : 0);
  const dmg = d.damage! + (!melee && ab.has('clean_kill') ? 1 : 0);
  const each = (7 - d.accuracy!) / 6;
  return {
    dice, need: d.accuracy!, dmg, melee,
    eachPct: Math.round(each * 100),
    anyPct: Math.round((1 - Math.pow(1 - each, dice)) * 100),
    range: melee ? 'your zone' : `range ${d.range![0]}-${d.range![1]}`,
  };
}

export function weaponLine(actor: Survivor | null, card: Card | null | undefined): string {
  const w = weaponInfo(actor, card);
  if (!w) return '';
  return `${w.dice} ${w.dice === 1 ? 'die' : 'dice'}, each hits on ${w.need}+ (${w.eachPct}%), damage ${w.dmg}`;
}

/** Names of weapons that can kill a zombie type with a single hit. */
export function killers(type: keyof typeof ZOMBIE_DEFS): string[] {
  const t = ZOMBIE_DEFS[type].toughness;
  const out: string[] = [];
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const d = ITEMS[id];
    if ((d.kind === 'melee' || d.kind === 'ranged') && id !== 'rifle_scope' && (d.damage ?? 0) >= t) out.push(d.name);
  }
  return out;
}
