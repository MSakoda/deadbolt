import { describe, it, expect } from 'vitest';
import { woundCount } from '../src';
import { mk, give, zombie, activate, clearHands, apart, run, err, Scripted, types } from './helpers';

describe('movement', () => {
  it('a move costs 1 action and updates position', () => {
    const s = mk();
    const r = run(s, { type: 'move', to: 'main_street' });
    expect(r.state.survivors['dana']!.zone).toBe('main_street');
    expect(r.state.turn!.actionsLeft).toBe(2);
    expect(s.survivors['dana']!.zone).toBe('west_end'); // input not mutated
  });
  it('cannot walk through closed doors or diagonally', () => {
    const s = mk();
    expect(err(s, { type: 'move', to: 'lobby' })).toMatch(/cannot move/);
    expect(err(s, { type: 'move', to: 'crossroads' })).toMatch(/cannot move/);
  });
  it('leaving a zone with zombies costs 1 extra action per zombie', () => {
    const s = mk();
    zombie(s, 'shambler', 'west_end');
    zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'move', to: 'main_street' });
    expect(r.state.turn!.actionsLeft).toBe(0);
    const s2 = mk();
    zombie(s2, 'shambler', 'west_end');
    zombie(s2, 'shambler', 'west_end');
    s2.turn!.actionsLeft = 2;
    expect(err(s2, { type: 'move', to: 'main_street' })).toMatch(/not enough/);
  });
  it('Slip Past ignores the extra cost; Quick Feet gives a free move', () => {
    const s = mk({ chars: ['jonah', 'ray'] });
    zombie(s, 'shambler', 'west_end');
    s.survivors['jonah']!.level = 2;
    s.turn!.free.move = 0;
    expect(run(s, { type: 'move', to: 'main_street' }).state.turn!.actionsLeft).toBe(2);
    const t = mk({ chars: ['jonah', 'ray'] });
    expect(t.turn!.free.move).toBe(1);
    const a = run(t, { type: 'move', to: 'main_street' }).state;
    expect(a.turn!.actionsLeft).toBe(3);
    expect(run(a, { type: 'move', to: 'crossroads' }).state.turn!.actionsLeft).toBe(2);
  });
});

describe('doors and buildings', () => {
  it('needs a door-opening weapon in hand', () => {
    const s = mk();
    clearHands(s, 'dana');
    give(s, 'dana', 'frying_pan', 0);
    s.survivors['dana']!.zone = 'main_street';
    expect(err(s, { type: 'open_door', to: 'hall' })).toMatch(/door-opening/);
    give(s, 'dana', 'machete', 1);
    expect(err(s, { type: 'open_door', to: 'hall' })).toMatch(/door-opening/);
  });
  it('a crowbar opens silently; an axe is noisy; Quiet Hands silences it', () => {
    const base = () => { const s = mk(); clearHands(s, 'dana'); s.survivors['dana']!.zone = 'main_street'; return s; };
    const a = base(); give(a, 'dana', 'crowbar', 0);
    expect(run(a, { type: 'open_door', to: 'hall' }).state.noise['main_street'] ?? 0).toBe(0);
    const b = base(); give(b, 'dana', 'fire_axe', 0);
    expect(run(b, { type: 'open_door', to: 'hall' }).state.noise['main_street']).toBe(1);
    const c = mk({ chars: ['hannah', 'ray'] }); clearHands(c, 'hannah'); give(c, 'hannah', 'fire_axe', 0);
    c.survivors['hannah']!.zone = 'main_street'; c.survivors['hannah']!.level = 2;
    expect(run(c, { type: 'open_door', to: 'hall' }).state.noise['main_street'] ?? 0).toBe(0);
  });
  it('first opening fills every room of the building, once', () => {
    const s = mk();
    clearHands(s, 'dana'); give(s, 'dana', 'crowbar', 0);
    s.survivors['dana']!.zone = 'main_street';
    s.spawnDeck = ['trickle', 'trickle', 'trickle'];
    s.survivors['dana']!.level = 1; // Restless: Trickle gives 3 shamblers
    const r = run(s, { type: 'open_door', to: 'hall' });
    expect(r.state.filled['hall']).toBe(true);
    expect(r.state.zombies.filter((z) => z.zone === 'hall').length).toBe(3);
    expect(r.state.zombies.filter((z) => z.zone === 'bedroom').length).toBe(3);
    expect(types(r.events)).toContain('building_opened');
    // opening the inner door afterwards spawns nothing new
    const inner = r.state;
    inner.survivors['dana']!.zone = 'hall';
    inner.zombies = [];
    activate(inner, 'dana');
    expect(run(inner, { type: 'open_door', to: 'bedroom' }).state.zombies.length).toBe(0);
  });
  it('the shop starts open and empty; its stock room fills when the inner door opens', () => {
    const s = mk();
    clearHands(s, 'dana'); give(s, 'dana', 'crowbar', 0);
    s.survivors['dana']!.zone = 'shop';
    s.spawnDeck = ['trickle', 'trickle'];
    s.survivors['dana']!.level = 1;
    const r = run(s, { type: 'open_door', to: 'stock_room' });
    expect(r.state.zombies.every((z) => z.zone === 'stock_room')).toBe(true);
    expect(r.state.zombies.length).toBe(3);
  });
});

describe('searching', () => {
  const inShop = () => { const s = mk(); s.survivors['dana']!.zone = 'shop'; return s; };
  it('only indoors and only without zombies', () => {
    expect(err(mk(), { type: 'search' })).toMatch(/indoors/);
    const s = inShop(); zombie(s, 'shambler', 'shop');
    expect(err(s, { type: 'search' })).toMatch(/zombies/);
  });
  it('draws a card, lets you keep or discard, then allows a free reorganize', () => {
    const s = inShop();
    s.searchDeck.push({ id: 'x1', item: 'machete' });
    const a = run(s, { type: 'search' }).state;
    expect(a.pending?.cards.map((c) => c.item)).toEqual(['machete']);
    expect(err(a, { type: 'move', to: 'west_end' })).toMatch(/resolve/);
    const b = run(a, { type: 'resolve_search', keep: 0 }).state;
    expect(b.survivors['dana']!.slots[1]!.item).toBe('machete');
    expect(b.pending).toBeNull();
    expect(b.turn!.freeReorg).toBe(true);
    const slots = b.survivors['dana']!.slots.map((c) => c?.id ?? null);
    const before = b.turn!.actionsLeft;
    const c = run(b, { type: 'reorganize', arrangements: { dana: [slots[1]!, slots[0]!, null, null, null] } }).state;
    expect(c.turn!.actionsLeft).toBe(before);
    expect(c.turn!.freeReorg).toBe(false);
  });
  it('a full inventory requires choosing a slot to replace; wounds cannot be replaced', () => {
    const s = inShop();
    const sv = s.survivors['dana']!;
    sv.slots = [0, 1, 2, 3, 4].map((i) => ({ id: `f${i}`, item: i === 4 ? ('wound' as const) : ('flashlight' as const) }));
    s.searchDeck.push({ id: 'x1', item: 'machete' });
    const a = run(s, { type: 'search' }).state;
    expect(err(a, { type: 'resolve_search', keep: 0 })).toMatch(/full/);
    expect(err(a, { type: 'resolve_search', keep: 0, replaceSlot: 4 })).toMatch(/Wounded/);
    expect(run(a, { type: 'resolve_search', keep: 0, replaceSlot: 2 }).state.survivors['dana']!.slots[2]!.item).toBe('machete');
  });
  it('an alarm ends the search and spawns a shambler', () => {
    const s = inShop();
    s.searchDeck.push({ id: 'x1', item: 'alarm' });
    const r = run(s, { type: 'search' });
    expect(r.state.pending).toBeNull();
    expect(r.state.zombies.length).toBe(1);
    expect(r.state.zombies[0]!.zone).toBe('shop');
  });
  it('flashlight and Sharp Eye draw two; Second Look allows a second search', () => {
    const s = inShop();
    give(s, 'dana', 'flashlight', 2);
    s.searchDeck.push({ id: 'a', item: 'machete' }, { id: 'b', item: 'pistol' });
    expect(run(s, { type: 'search' }).state.pending!.cards.length).toBe(2);
    const h = mk({ chars: ['hannah', 'ray'] }); h.survivors['hannah']!.zone = 'shop';
    h.survivors['hannah']!.level = 3;
    h.searchDeck.push({ id: 'a', item: 'machete' }, { id: 'b', item: 'pistol' }, { id: 'c', item: 'crowbar' }, { id: 'd', item: 'rifle' });
    const one = run(run(h, { type: 'search' }).state, { type: 'resolve_search', keep: 0 }).state;
    expect(run(one, { type: 'search' }).state.pending).not.toBeNull();
    const plain = inShop(); plain.searchDeck.push({ id: 'a', item: 'machete' }, { id: 'b', item: 'pistol' });
    const done = run(run(plain, { type: 'search' }).state, { type: 'resolve_search', keep: null }).state;
    expect(err(done, { type: 'search' })).toMatch(/already/);
  });
});

describe('combat', () => {
  it('melee: hits on accuracy or better, kills, gives XP', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'fire_axe', 0);
    zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([4]));
    expect(r.state.zombies.length).toBe(0);
    expect(r.state.survivors['dana']!.xp).toBe(1);
    const miss = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([3]));
    expect(miss.state.zombies.length).toBe(1);
  });
  it('damage must meet toughness: crowbar cannot kill a brute, axe can', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'crowbar', 0); zombie(s, 'brute', 'west_end');
    const r = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([6]));
    expect(r.state.zombies.length).toBe(1);
    expect(types(r.events)).toContain('hit_wasted');
    clearHands(s, 'dana'); give(s, 'dana', 'fire_axe', 0);
    expect(run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([4])).state.zombies.length).toBe(0);
  });
  it('melee attacker picks targets; default goes after sprinters first', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'fire_axe', 0);
    zombie(s, 'shambler', 'west_end'); zombie(s, 'sprinter', 'west_end');
    expect(run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([5])).state.zombies[0]!.type).toBe('shambler');
    expect(run(s, { type: 'attack', slot: 0, target: 'west_end', prefer: ['shambler'] }, new Scripted([5])).state.zombies[0]!.type).toBe('sprinter');
  });
  it('ranged: range and line of sight are enforced, pistol is noisy', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'pistol', 0);
    zombie(s, 'shambler', 'crossroads');
    expect(err(s, { type: 'attack', slot: 0, target: 'crossroads' })).toMatch(/range/);
    const z2 = mk(); clearHands(z2, 'dana'); give(z2, 'dana', 'pistol', 0); zombie(z2, 'shambler', 'main_street');
    const r = run(z2, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([6]));
    expect(r.state.zombies.length).toBe(0);
    expect(r.state.noise['west_end']).toBe(1);
  });
  it('rifle cannot shoot its own zone but reaches 3 zones', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'rifle', 0); zombie(s, 'shambler', 'east_end');
    expect(run(s, { type: 'attack', slot: 0, target: 'east_end' }, new Scripted([4])).state.zombies.length).toBe(0);
    const t = mk(); clearHands(t, 'dana'); give(t, 'dana', 'rifle', 0); zombie(t, 'shambler', 'west_end');
    expect(err(t, { type: 'attack', slot: 0, target: 'west_end' })).toMatch(/range/);
  });
  it('ranged hits are auto-assigned to survivors first (friendly fire)', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'pistol', 0);
    s.survivors['ray']!.zone = 'main_street';
    zombie(s, 'shambler', 'main_street');
    const r = run(s, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([6]));
    expect(woundCount(r.state.survivors['ray']!)).toBe(1);
    expect(r.state.zombies.length).toBe(1);
  });
  it('a scoped rifle lets the shooter choose targets and ignore survivors', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'rifle_scope', 0);
    s.survivors['ray']!.zone = 'main_street';
    zombie(s, 'sprinter', 'main_street'); zombie(s, 'shambler', 'main_street');
    const r = run(s, { type: 'attack', slot: 0, target: 'main_street', prefer: ['sprinter'] }, new Scripted([6]));
    expect(woundCount(r.state.survivors['ray']!)).toBe(0);
    expect(r.state.zombies.map((z) => z.type)).toEqual(['shambler']);
  });
  it('dual pistols fire as one action with one noise token', () => {
    const s = mk(); apart(s); clearHands(s, 'dana'); give(s, 'dana', 'pistol', 0); give(s, 'dana', 'pistol', 1);
    zombie(s, 'shambler', 'west_end'); zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'attack', slot: 'both', target: 'west_end' }, new Scripted([5, 5]));
    expect(r.state.zombies.length).toBe(0);
    expect(r.state.turn!.actionsLeft).toBe(2);
    expect(r.state.noise['west_end']).toBe(1);
    const bad = mk(); apart(bad); clearHands(bad, 'dana'); give(bad, 'dana', 'pistol', 0); give(bad, 'dana', 'crowbar', 1); zombie(bad, 'shambler', 'west_end');
    expect(err(bad, { type: 'attack', slot: 'both', target: 'west_end' })).toMatch(/matching/);
  });
  it('sawed-off needs a reload action between shots and reloads free at turn end', () => {
    const s = mk(); apart(s); clearHands(s, 'dana'); give(s, 'dana', 'sawed_off', 0);
    zombie(s, 'brute', 'west_end'); zombie(s, 'brute', 'west_end');
    const a = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([3, 3])).state;
    expect(a.zombies.length).toBe(0);
    zombie(a, 'shambler', 'west_end');
    expect(err(a, { type: 'attack', slot: 0, target: 'west_end' })).toMatch(/reload/);
    const b = run(a, { type: 'reload', slot: 0 }).state;
    expect(run(b, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([6, 6])).state.turn).not.toBeNull();
    const c = run(a, { type: 'end_turn' }).state;
    expect(c.survivors['dana']!.slots[0]!.spent).toBeUndefined();
  });
  it('Molotov kills everything in the target zone, burns survivors there, and is consumed', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'molotov', 0);
    for (let i = 0; i < 4; i++) zombie(s, i === 0 ? 'brute' : 'shambler', 'main_street');
    const r = run(s, { type: 'attack', slot: 0, target: 'main_street' });
    expect(r.state.zombies.length).toBe(0);
    expect(r.state.survivors['dana']!.slots[0]).toBeNull();
    expect(r.state.survivors['dana']!.xp).toBe(4);
  });
  it('combining parts', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'glass_bottle', 2); give(s, 'dana', 'gasoline', 3);
    give(s, 'dana', 'rifle', 0); give(s, 'dana', 'scope', 4);
    const a = run(s, { type: 'combine', a: 2, b: 3 }).state;
    expect(a.survivors['dana']!.slots[2]!.item).toBe('molotov');
    expect(run(a, { type: 'combine', a: 0, b: 4 }).state.survivors['dana']!.slots[0]!.item).toBe('rifle_scope');
    expect(err(a, { type: 'combine', a: 0, b: 2 })).toMatch(/combine/);
    expect(a.turn!.actionsLeft).toBe(3);
  });
});

describe('abilities and levels', () => {
  it('kills give XP and crossing 7 XP grants Restless with a 4th action immediately', () => {
    const s = mk(); clearHands(s, 'dana'); give(s, 'dana', 'fire_axe', 0);
    s.survivors['dana']!.xp = 6;
    zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([4]));
    expect(r.state.survivors['dana']!.level).toBe(1);
    expect(r.state.turn!.actionsLeft).toBe(3); // 3 - 1 spent + 1 gained
    expect(types(r.events)).toContain('level_up');
  });
  it('a Mutant is worth 5 XP and skips straight past a level', () => {
    const s = mk(); apart(s); clearHands(s, 'dana'); give(s, 'dana', 'molotov', 0);
    s.survivors['dana']!.xp = 15;
    zombie(s, 'mutant', 'main_street');
    const r = run(s, { type: 'attack', slot: 0, target: 'main_street' });
    expect(r.state.survivors['dana']!.xp).toBe(20);
    expect(r.state.survivors['dana']!.level).toBe(2);
  });
  it('Heavy Swing adds a die; Steady Aim rerolls a miss; Clean Kill adds damage', () => {
    const s = mk({ chars: ['ray', 'dana'] }); clearHands(s, 'ray'); give(s, 'ray', 'crowbar', 0);
    zombie(s, 'shambler', 'west_end'); zombie(s, 'shambler', 'west_end');
    const r = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([5, 5]));
    expect(r.state.zombies.length).toBe(0);
    const l = mk({ chars: ['lena', 'dana'] }); clearHands(l, 'lena'); give(l, 'lena', 'pistol', 0);
    zombie(l, 'shambler', 'main_street');
    const lr = run(l, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([1, 6]));
    expect(lr.state.zombies.length).toBe(0);
    const c = mk({ chars: ['lena', 'dana'] }); c.survivors['lena']!.level = 3; clearHands(c, 'lena'); give(c, 'lena', 'pistol', 0);
    zombie(c, 'brute', 'main_street');
    expect(run(c, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([6, 6])).state.zombies.length).toBe(0);
  });
  it('Quiet Shot: first ranged attack each turn is silent', () => {
    const s = mk({ chars: ['lena', 'dana'] }); s.survivors['lena']!.level = 2; clearHands(s, 'lena'); give(s, 'lena', 'pistol', 0);
    for (let i = 0; i < 4; i++) zombie(s, 'shambler', 'main_street');
    s.survivors['dana']!.zone = 'crossroads';
    const a = run(s, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([6, 6, 6]));
    expect(a.state.noise['west_end'] ?? 0).toBe(0);
    expect(run(a.state, { type: 'attack', slot: 0, target: 'main_street' }, new Scripted([6, 6, 6])).state.noise['west_end']).toBe(1);
  });
  it('Frenzy gives a free melee attack once per turn after a melee kill', () => {
    const s = mk({ chars: ['ray', 'dana'] }); s.survivors['ray']!.level = 3; clearHands(s, 'ray'); give(s, 'ray', 'fire_axe', 0);
    for (let i = 0; i < 6; i++) zombie(s, 'shambler', 'west_end');
    s.turn!.free.melee = 1; // Crowd Breaker, granted at turn start in a real game
    const a = run(s, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([6, 6, 6]));
    expect(a.state.turn!.actionsLeft).toBe(s.turn!.actionsLeft); // free action used
    expect(a.state.turn!.free.melee).toBe(1); // frenzy gave another
    const b = run(a.state, { type: 'attack', slot: 0, target: 'west_end' }, new Scripted([6, 6, 6]));
    expect(b.state.turn!.actionsLeft).toBe(s.turn!.actionsLeft);
    expect(b.state.turn!.free.melee).toBe(0);
  });
  it('First Aid heals a wound as a free action (once per turn, twice with Triage)', () => {
    const s = mk({ chars: ['amara', 'dana'] });
    s.survivors['dana']!.slots[2] = { id: 'w1', item: 'wound' };
    s.survivors['amara']!.slots[2] = { id: 'w2', item: 'wound' };
    s.survivors['dana']!.zone = 'west_end';
    const a = run(s, { type: 'first_aid', target: 'dana' }).state;
    expect(woundCount(a.survivors['dana']!)).toBe(0);
    expect(a.turn!.actionsLeft).toBe(3);
    expect(err(a, { type: 'first_aid', target: 'amara' })).toMatch(/already/);
    a.survivors['amara']!.level = 1;
    expect(woundCount(run(a, { type: 'first_aid', target: 'amara' }).state.survivors['amara']!)).toBe(0);
  });
  it('Rally Point / Roll Call grant free actions to another survivor', () => {
    const s = mk({ chars: ['dana', 'ray'] });
    const r = run(s, { type: 'grant', target: 'ray', then: { type: 'move', to: 'main_street' } });
    expect(r.state.survivors['ray']!.zone).toBe('main_street');
    expect(r.state.turn!.actionsLeft).toBe(3);
    expect(err(r.state, { type: 'grant', target: 'ray', then: { type: 'move', to: 'west_end' } })).toBeTruthy();
  });
});

describe('objectives and the win', () => {
  it('taking keys and fuel, then driving away needs everyone at the truck', () => {
    const s = mk({ chars: ['dana', 'ray'] });
    s.objectives['shop'] = { kind: 'keys', hidden: true };
    s.survivors['dana']!.zone = 'shop';
    const a = run(s, { type: 'take_objective' }).state;
    expect(a.team.keys).toBe(true);
    a.team.fuel = true;
    a.survivors['dana']!.zone = 'east_end';
    expect(err(a, { type: 'start_truck' })).toMatch(/all living/);
    a.survivors['ray']!.zone = 'east_end';
    const w = run(a, { type: 'start_truck' });
    expect(w.state.status).toBe('won');
    expect(err(w.state, { type: 'end_turn' })).toMatch(/over/);
  });
  it('supplies give a free card; no keys/fuel, no start', () => {
    const s = mk();
    s.objectives['shop'] = { kind: 'supplies', hidden: true };
    s.survivors['dana']!.zone = 'shop';
    s.searchDeck.push({ id: 'z', item: 'goalie_mask' });
    const a = run(s, { type: 'take_objective' }).state;
    expect(a.pending!.source).toBe('supplies');
    const b = mk(); b.survivors['dana']!.zone = 'east_end';
    expect(err(b, { type: 'start_truck' })).toMatch(/keys/);
  });
});
