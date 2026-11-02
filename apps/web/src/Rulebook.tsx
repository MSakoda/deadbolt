import { useState } from 'react';
import {
  ABILITY_TEXT, CHARACTERS, ITEMS, LEVEL_XP, LONG_BLOCK, SEARCH_DECK, SPAWN_CARDS, SPAWN_SCALE, ZOMBIE_DEFS,
  defaultSurvivorsPerPlayer,
} from '@deadbolt/engine';
import type { ItemId, ZombieType } from '@deadbolt/engine';
import { Portrait, ZombieFace } from './Portrait';

const pct = (acc: number): string => `${Math.round(((7 - acc) / 6) * 100)}%`;
const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

function Table({ head, rows }: { head: string[]; rows: (string | number | JSX.Element)[][] }) {
  return (
    <div className="rb-tablewrap">
      <table className="rb-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const Tip = ({ children }: { children: React.ReactNode }) => <div className="rb-tip"><b>Tip.</b> {children}</div>;

// ---------- tabs ----------

function Overview() {
  return (
    <>
      <h3>The idea</h3>
      <p>Deadbolt is a cooperative game. Everybody wins together or loses together. A group of ordinary people is stuck on a town block overrun by zombies. They have to find the truck keys and a can of fuel, then get <b>every surviving member</b> to the truck and drive away.</p>
      <h3>How a game flows</h3>
      <ol>
        <li><b>Survivor turns.</b> Survivors act one at a time in a fixed order that never changes. On a turn you spend a few actions to move, open doors, search, fight and so on.</li>
        <li><b>Zombie phase.</b> After the <i>last</i> survivor has acted, the zombies take their turn: they bite anyone they can reach, walk toward survivors and noise, and new ones appear.</li>
        <li>A new round begins. Repeat until you escape or everybody is down.</li>
      </ol>
      <h3>Winning and losing</h3>
      <p><b>Win:</b> the group has the keys and the fuel, every living survivor stands in the East end, and one of them spends an action to <b>Start the truck</b>.</p>
      <p><b>Lose:</b> every survivor is down. Losing one survivor does not end the game, but the survivors left behind cannot be revived.</p>
      <h3>What makes it tense</h3>
      <ul>
        <li>Zombies <b>always hit</b> when they reach you. You only have 2 wounds.</li>
        <li><b>Noise</b> pulls zombies toward you. Guns are loud, and so is breaking down doors with an axe.</li>
        <li><b>Killing makes you stronger and the game harder.</b> Levelling up gives survivors new abilities, but zombies spawn in larger waves based on the most experienced survivor alive.</li>
        <li>Opening a building <b>wakes every room</b> inside it.</li>
      </ul>
      <Tip>Each tab in this rulebook covers one area. The Setup tab is a good place to start if you are deciding how many survivors to play.</Tip>
    </>
  );
}

function Turns() {
  return (
    <>
      <h3>Your turn</h3>
      <p>You get <b>3 actions</b>. The survivor whose turn it is has a white ring around their token. Most things cost 1 action; you may do the same thing more than once unless it says otherwise. When you are finished (or out of actions) press <b>End turn</b>.</p>
      <p>Reaching level 1 (<i>Restless</i>, 7 XP) permanently gives a <b>4th action</b>. Dana&rsquo;s level 3 ability, Plan B, adds a fifth.</p>
      <h3>Things you can do</h3>
      <Table head={['Action', 'Cost', 'Notes']} rows={[
        ['Move', '1 (+1 per zombie in the zone you leave)', 'One zone, no diagonals, only through open doors. Entering a zone with zombies is allowed.'],
        ['Open a door', '1', 'Needs a door-opening weapon in hand. Click the door.'],
        ['Search', '1', 'Indoors only, no zombies in the zone, once per turn. See Searching.'],
        ['Attack', '1', 'Choose a weapon in hand, then a target zone. See Combat.'],
        ['Reload', '1', 'Sawed-off shotguns only.'],
        ['Reorganize / trade', '1, or free right after a search', 'Rearrange your own items, or swap with one survivor in your zone. You may discard items here.'],
        ['Make noise', '1', 'Puts a noise token in your zone. Handy as bait; dangerous otherwise.'],
        ['Take objective', '1', 'Picks up the marker in your zone: keys, fuel or supplies.'],
        ['Start the truck', '1', 'Only at the East end with the keys, the fuel, and everyone present.'],
        ['Combine items', 'free', 'Scope + rifle, glass bottle + gasoline.'],
        ['First Aid', 'free', 'Medic ability.'],
        ['Free actions', 'free', 'Some abilities grant free moves or attacks.'],
      ]} />
      <h3>Undo</h3>
      <p>You can undo actions until you press End turn. Anything that rolled dice, drew a card, revealed a hidden marker, or woke a building locks in and clears the undo history, so no re-rolling by taking it back.</p>
      <h3>Inventory</h3>
      <p>Every survivor has <b>5 slots</b>: two <b>hands</b> and three <b>pack</b> spaces. <b>Weapons only work in a hand.</b> Gear such as the goalie mask, flashlight and ammo works from anywhere in your inventory. A Wounded card also takes a slot (see Combat). If you find something and your inventory is full, you choose what to drop.</p>
    </>
  );
}

function Movement() {
  return (
    <>
      <h3>Zones</h3>
      <p>The board is made of zones: <b>street</b> zones, <b>rooms</b> inside buildings, and the open <b>yard</b>. You move one zone at a time, up, down, left or right, never diagonally.</p>
      <h3>Doors</h3>
      <ul>
        <li>Doors start <b>locked</b> (brown bar). Opening one needs a weapon <b>in hand</b> that can: <b>Crowbar</b> (silent), <b>Fire axe</b> or <b>Chainsaw</b> (both noisy). Machetes, pistols, shotguns and the frying pan cannot.</li>
        <li>Once open, a door stays open for everyone, <b>zombies included</b>. There is no way to close it again.</li>
        <li>The first time any door of a building is opened, <b>every room in that building spawns zombies</b>. You can see and hear the whole building fill up, so be ready.</li>
        <li>The Shop&rsquo;s front door starts open with the Shop empty so the group can always get inside.</li>
      </ul>
      <h3>Line of sight</h3>
      <p>Weapons and zombies only act on zones they can <b>see</b>.</p>
      <ul>
        <li>Sight travels in straight lines through <b>open</b> connections. A closed door blocks it.</li>
        <li>Out in the open, you can see <b>along the whole street</b> in a straight line, and into the yard.</li>
        <li>Inside a building you only see <b>one zone</b> beyond your own: through a doorway into the next room, or out into the street.</li>
        <li>From the street you can see <b>one room</b> through an open door, and no further.</li>
        <li>Zombies use the same sight rules, so a closed door really does hide you.</li>
      </ul>
      <Tip>Leaving a zone with zombies in it costs 1 extra action <b>per zombie</b>. Kill them first, or accept the cost. Jonah&rsquo;s Slip Past ability removes it.</Tip>
    </>
  );
}

function Searching() {
  const total = SEARCH_DECK.reduce((n, [, c]) => n + c, 0);
  return (
    <>
      <h3>Searching</h3>
      <p>Search costs 1 action. You must be in a <b>room</b> (not the street or yard), with <b>no zombies in your zone</b>, and you can search once per turn. Draw a card from the search deck, then either <b>keep it</b> or <b>leave it</b>. If your inventory is full, pick something to drop. After searching you may <b>reorganize for free</b>.</p>
      <ul>
        <li><b>Flashlight</b> and Hannah&rsquo;s <b>Sharp Eye</b>: draw 2 cards, keep 1.</li>
        <li><b>Alarm</b> cards go off the moment they are drawn: the search ends and a Shambler appears in your zone.</li>
        <li><b>Supplies</b> markers give you one free draw when you take them.</li>
        <li>The deck has {total} cards. When it runs out, the discards are shuffled back in.</li>
      </ul>
      <h3>Search deck</h3>
      <Table head={['Card', 'Copies', 'What it is']} rows={SEARCH_DECK.map(([id, n]) => [ITEMS[id].name, n, itemText(id)])} />
      <p className="dim">The frying pan is starting gear only and is never found while searching.</p>
      <h3>Starting gear</h3>
      <p>Each survivor starts with one item, dealt at random. The pool is always a Fire axe, a Crowbar and a Pistol; any survivors beyond three get a Frying pan (a weak weapon that cannot open doors). With 1 or 2 survivors, some of those three are left out.</p>
      <h3>Combining</h3>
      <ul>
        <li><b>Glass bottle + Gasoline</b> makes a <b>Molotov</b>.</li>
        <li><b>Rifle + Scope</b> makes a scoped rifle: you choose which zombie each hit goes to.</li>
      </ul>
    </>
  );
}

function itemText(id: ItemId): string {
  const d = ITEMS[id];
  const bits: string[] = [];
  if (d.kind === 'melee' || d.kind === 'ranged') {
    bits.push(`${d.dice} ${d.dice === 1 ? 'die' : 'dice'}, hits on ${d.accuracy}+ (${pct(d.accuracy!)}), damage ${d.damage}`);
    bits.push(d.kind === 'melee' ? 'melee' : `range ${d.range![0]}-${d.range![1]}`);
    if (d.noisy) bits.push('noisy');
    else bits.push('silent');
    if (d.dual) bits.push('can be dual-wielded');
    if (d.reload) bits.push('reload after each shot');
    if (d.chooseTargets) bits.push('choose targets');
    if (d.door !== 'none') bits.push(`opens doors (${d.door})`);
  } else {
    const note: Partial<Record<ItemId, string>> = {
      scope: 'Combine with a rifle.', glass_bottle: 'Combine with gasoline.', gasoline: 'Combine with a glass bottle.',
      goalie_mask: 'Discard it to cancel one wound.', flashlight: 'Searching draws 2 cards, keep 1.',
      plenty_of_ammo: 'Once per turn, reroll the missed dice of a ranged attack.',
      alarm: 'Trap: ends your search and spawns a Shambler in your zone.',
      molotov: 'Thrown at range 0-1: kills every zombie in the target zone, and burns any survivor there. One use.',
    };
    bits.push(note[id] ?? '');
  }
  return bits.filter(Boolean).join(', ');
}

function Combat() {
  const rows = (['frying_pan', 'crowbar', 'fire_axe', 'machete', 'chainsaw', 'pistol', 'sawed_off', 'smg', 'rifle'] as ItemId[]).map((id) => {
    const d = ITEMS[id];
    const each = (7 - d.accuracy!) / 6;
    return [d.name, d.kind === 'melee' ? 'melee' : `${d.range![0]}-${d.range![1]}`, d.dice!, `${d.accuracy}+`, pct(d.accuracy!), `${(d.dice! * each).toFixed(1)}`, d.damage!, d.noisy ? 'yes' : 'no'];
  });
  return (
    <>
      <h3>Making an attack</h3>
      <p>Choose a weapon in one of your hands, then click a red target zone. You roll the weapon&rsquo;s dice. <b>Each die hits if it rolls the weapon&rsquo;s number or higher.</b> A weapon that says 4+ hits on a 4, 5 or 6, which is 50% per die.</p>
      <p>Every hit kills <b>one zombie</b>, as long as the weapon&rsquo;s <b>damage</b> is at least that zombie&rsquo;s <b>toughness</b>. Damage does not add up over several hits: a Brute (toughness 2) shrugs off a pistol (damage 1) no matter how many times you hit it.</p>
      <Table head={['Weapon', 'Range', 'Dice', 'Hits on', 'Per die', 'Avg hits', 'Damage', 'Noisy']} rows={rows} />
      <h3>Ranges</h3>
      <ul>
        <li><b>Melee</b> hits your own zone only, and you choose which zombies take the hits (automatic order: Sprinters first).</li>
        <li><b>Ranged</b> weapons hit a zone you can see within their range. <b>Rifles can&rsquo;t hit your own zone.</b></li>
        <li><b>Ranged hits are not aimed.</b> They land in this order: other <b>survivors</b> in the target zone (friendly fire wounds them!), then Shamblers, then Brutes and Mutants, then Sprinters. A scoped rifle lets you pick.</li>
      </ul>
      <Tip>Never shoot into a zone that has your friends standing in it, unless you have a scoped rifle.</Tip>
      <h3>Dual wielding</h3>
      <p>Two matching dual-capable weapons (machetes, pistols, sawed-off shotguns, SMGs) in both hands attack <b>together as one action</b> with all the dice, and make only one noise.</p>
      <h3>Reloading</h3>
      <p>The sawed-off shotgun is empty after firing. Reload it with an action. It also reloads for free at the end of your turn.</p>
      <h3>Wounds</h3>
      <p>Zombies <b>never miss</b>. Each bite gives the survivor a <b>Wounded</b> card that fills a slot, cannot be traded, and cannot be discarded. If your inventory is full, you lose an item to make room. <b>Two wounds and the survivor is down</b> for good.</p>
      <ul>
        <li>A <b>Goalie mask</b> is discarded to cancel one wound.</li>
        <li>Ray&rsquo;s <b>Thick Skin</b> ignores the first wound each round. Amara&rsquo;s <b>Steady Presence</b> cancels one wound each round for anyone in her zone.</li>
        <li>Amara&rsquo;s <b>First Aid</b> removes wounds.</li>
        <li>When several zombies bite a group, the wounds are spread out automatically: fewest wounds first.</li>
      </ul>
      <h3>Molotov</h3>
      <p>Throw it at a zone 0-1 away. <b>Every zombie there dies</b>, even a Mutant, and every survivor in that zone is wounded. Don&rsquo;t throw it at your feet.</p>
    </>
  );
}

function Zombies() {
  const names: Record<ZombieType, string> = { shambler: 'Shambler', sprinter: 'Sprinter', brute: 'Brute', mutant: 'Mutant' };
  const colour: Record<ZombieType, string> = { shambler: '#7cb342', sprinter: '#d4e157', brute: '#33691e', mutant: '#8e24aa' };
  const shape: Record<ZombieType, string> = { shambler: 'Face in a green ring', sprinter: 'Face in a yellow ring (R)', brute: 'Dark green square (B)', mutant: 'Purple hexagon (M)' };
  return (
    <>
      <h3>Zombie types</h3>
      <Table head={['Zombie', 'Looks like', 'Actions', 'Toughness', 'XP']} rows={(Object.keys(ZOMBIE_DEFS) as ZombieType[]).map((t) => [
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ZombieFace type={t} size={40} /><b style={{ color: colour[t] }}>{names[t]}</b></span>, shape[t], ZOMBIE_DEFS[t].actions, ZOMBIE_DEFS[t].toughness, ZOMBIE_DEFS[t].xp,
      ])} />
      <ul>
        <li><b>Brutes</b> always arrive with two Shamblers, and need a weapon with 2+ damage.</li>
        <li>There is only ever <b>one Mutant</b> on the board. A second Mutant card becomes a Brute. A Mutant needs 3 damage in one hit: a Molotov, or Lena (level 3) with a shotgun.</li>
      </ul>
      <h3>The zombie phase</h3>
      <p>After the last survivor ends their turn, in this order:</p>
      <ol>
        <li><b>Every zombie acts once.</b> If a survivor is in its zone, it <b>bites</b> (always a hit). Otherwise it <b>moves one zone</b>:
          <ul>
            <li>toward the <b>nearest survivor it can see</b>; if it sees none,</li>
            <li>toward the <b>noisiest zone</b> it can reach by an open route; if there is no noise, it stays put.</li>
            <li>Zombies take the shortest route. A group facing two equally short routes <b>splits up evenly</b>.</li>
            <li>Zombies can&rsquo;t open locked doors.</li>
          </ul>
        </li>
        <li><b>Sprinters act a second time.</b></li>
        <li><b>Spawning.</b> Each active spawn point draws a card from the spawn deck. See Spawning.</li>
        <li><b>Noise tokens are cleared.</b></li>
      </ol>
      <h3>Noise</h3>
      <p>Noise is how you steer zombies. A zone&rsquo;s noise is the <b>noise tokens</b> in it, plus <b>one for every survivor standing there</b> (Jonah&rsquo;s Light Step makes him silent). Tokens come from:</p>
      <ul>
        <li>attacking with a <b>noisy weapon</b> (pistol, shotgun, SMG, rifle, chainsaw) &ndash; one token per attack, even if dual-wielding,</li>
        <li>opening a door with a <b>fire axe</b> or <b>chainsaw</b> (a crowbar is silent),</li>
        <li>the <b>Make noise</b> action, and Alarm cards.</li>
      </ul>
      <Tip>You can lure zombies away from the objective with a deliberate noise, or keep a quiet team by using crowbars and melee weapons.</Tip>
    </>
  );
}

function Spawning() {
  const label = (id: string, d: 0 | 1 | 2 | 3): string => {
    const card = SPAWN_CARDS.find((c) => c.id === id)!;
    const e = card.byDanger[d];
    if (e.kind === 'none') return 'nothing';
    if (e.kind === 'surge') return 'Surge';
    if (e.kind === 'mutant') return 'Mutant';
    return Object.entries(e.list).map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`).join(', ');
  };
  const pretty: Record<string, string> = { trickle: 'Trickle', quiet_street: 'Quiet street', pack: 'Pack', heavy: 'Heavy', surge: 'Surge', mutant: 'Mutant' };
  return (
    <>
      <h3>Spawn points</h3>
      <p>Spawn points have a <b>red border</b> on the board. Each round, each active spawn point draws a card from the 22-card spawn deck. The <b>Yard</b> is always active; the <b>Kitchen</b> only becomes active once the dining room building has been opened.</p>
      <h3>Danger level</h3>
      <p>What the card produces depends on the <b>highest level of any living survivor</b>: Quiet (0), Restless (level 1), Swarming (level 2) or Overrun (level 3). The more experienced your best fighter, the bigger the waves. The card is read for that level:</p>
      <Table head={['Card', 'Copies', 'Quiet', 'Restless', 'Swarming', 'Overrun']} rows={SPAWN_CARDS.map((c) => [
        pretty[c.id] ?? c.id, c.copies, label(c.id, 0), label(c.id, 1), label(c.id, 2), label(c.id, 3),
      ])} />
      <ul>
        <li><b>Surge:</b> nothing spawns, but every Sprinter on the board gets an extra action.</li>
        <li>Opening a building draws one card <b>per room</b> (Surge does nothing there).</li>
      </ul>
      <h3>Scaling with group size</h3>
      <p>The numbers above are for <b>4 survivors</b>. Shamblers and Sprinters are scaled by how many survivors started the game:</p>
      <Table head={['Survivors', '1', '2', '3', '4', '5', '6']} rows={[['Spawn size', ...SPAWN_SCALE.map((x) => `×${x}`)]]} />
      <p className="dim">Brutes and Mutants are not scaled.</p>
    </>
  );
}

function Levels() {
  return (
    <>
      <h3>Experience</h3>
      <p>Each kill earns <b>1 XP</b>; a Mutant is worth <b>5</b>. XP belongs to the survivor who made the kill.</p>
      <Table head={['Level', 'Name', 'XP needed', 'You get']} rows={[
        [0, 'Quiet', 0, 'Your starting ability'],
        [1, 'Restless', LEVEL_XP[0], 'A 4th action each turn, and your next ability'],
        [2, 'Swarming', LEVEL_XP[1], 'Your next ability'],
        [3, 'Overrun', LEVEL_XP[2], 'Your final ability'],
      ]} />
      <p>Abilities stack. Each survivor has a fixed ladder of four (see the Survivors tab).</p>
      <h3>The trade-off</h3>
      <p>Levelling up makes you stronger, but the <b>danger level is set by your most experienced living survivor</b>. A single hero who levels up alone will drag the whole group into bigger waves. You may prefer to spread kills around, or to avoid unnecessary fights.</p>
      <Tip>Zombies you don&rsquo;t kill also hurt: they chase noise and block routes. Kill what stands in your way; avoid grinding.</Tip>
    </>
  );
}

function Survivors() {
  return (
    <>
      <p>Each survivor has four abilities that unlock in order: one at the start, and one at each level up.</p>
      {CHARACTERS.map((c) => (
        <div key={c.id} className="rb-char">
          <div className="rb-charh"><Portrait id={c.id} size={64} /><div><b>{c.name}</b> <span className="dim">{c.role}</span><div className="dim sm">{c.blurb}</div></div></div>
          <Table head={['Level', 'Ability', 'Effect']} rows={c.ladder.map((a, i) => [['Start', 'Restless', 'Swarming', 'Overrun'][i]!, ABILITY_TEXT[a]?.name ?? a, ABILITY_TEXT[a]?.text ?? ''])} />
        </div>
      ))}
    </>
  );
}

function Scenario() {
  return (
    <>
      <h3>The Long Block <span className="dim">(easy)</span></h3>
      <p>A short block of shops and flats: {LONG_BLOCK.zones.length} zones in all. Everyone starts together at the <b>West end</b>. The truck is parked at the <b>East end</b>. There are <b>no zombies</b> when the game begins; they arrive as you open buildings and as the spawn points feed in new ones.</p>
      <h3>What to find</h3>
      <ul>
        <li><b>Keys:</b> hidden under one of three <b>?</b> markers: the Stock room, the Bedroom and the Flat. The other two hold a free item each.</li>
        <li><b>Fuel can (F):</b> in the Workshop.</li>
      </ul>
      <h3>Buildings</h3>
      <Table head={['Building', 'Rooms', 'Notes']} rows={[
        ['Shop', 'Shop, Stock room', 'Front door starts open and the Shop is empty. The Stock room fills when the inner door is opened. ? marker in the Stock room.'],
        ['Hall', 'Hall, Bedroom', '? marker in the Bedroom.'],
        ['Workshop', 'Workshop, Office', 'The fuel can is in the Workshop.'],
        ['Lobby', 'Lobby, Flat', '? marker in the Flat.'],
        ['Dining room', 'Dining room, Kitchen', 'The Kitchen is a spawn point once this building has been opened.'],
      ]} />
      <p>The <b>Yard</b>, south of Main street, is open ground and a spawn point from the start.</p>
      <h3>Length</h3>
      <p>Expect roughly 8 to 10 rounds. Play more carefully and it can be longer; rush and you will meet the zombies sooner.</p>
    </>
  );
}

function Setup() {
  const per = [1, 2, 3, 4, 5, 6].map((p) => [p, defaultSurvivorsPerPlayer(p), Math.min(6, p * defaultSurvivorsPerPlayer(p))]);
  return (
    <>
      <h3>Players and survivors</h3>
      <p>The game is for 1 to 6 players with a total of <b>1 to 6 survivors</b>. A player can control more than one survivor. The suggested split matches the board game this one is inspired by:</p>
      <Table head={['Players', 'Survivors each', 'Total survivors']} rows={per} />
      <p>You can use any split you like in the lobby. You pick the survivors and their <b>turn order</b>, and the order stays the same for the whole game.</p>
      <h3>Choosing a team</h3>
      <ul>
        <li><b>Door opener.</b> Someone needs a crowbar or axe, and you can find more by searching.</li>
        <li><b>Melee and ranged.</b> Ray is a natural fighter; Lena&rsquo;s accuracy suits a rifle or shotgun.</li>
        <li><b>A medic.</b> Amara&rsquo;s First Aid is the only way to remove wounds.</li>
        <li><b>A mover.</b> Jonah can run ahead to grab markers, and Dana can give friends free moves.</li>
        <li><b>A looter.</b> Hannah finds more and better items.</li>
      </ul>
      <h3>Difficulty</h3>
      <p>There is no difficulty setting: the spawn waves scale with the number of survivors in play, and with how strong your best survivor gets. A small group is more fragile (one lost survivor is a big loss) but meets smaller waves.</p>
      <Tip>If you are new, play 4 survivors, keep a crowbar handy, and open one building at a time.</Tip>
      <h3>Tips</h3>
      <ul>
        <li>Check what is behind a door before opening it. A building wakes <b>all</b> its rooms.</li>
        <li>Keep survivors together; zombies attack whoever is closest, and friends can cover each other.</li>
        <li>Think about noise before you shoot. A quiet crowbar is often the right choice.</li>
        <li>Use the hover tooltips on any zombie to see what weapon it takes to kill it.</li>
      </ul>
    </>
  );
}

const TABS: { id: string; label: string; body: () => JSX.Element }[] = [
  { id: 'overview', label: 'Overview', body: Overview },
  { id: 'setup', label: 'Setup', body: Setup },
  { id: 'turns', label: 'Turns & actions', body: Turns },
  { id: 'move', label: 'Movement & doors', body: Movement },
  { id: 'search', label: 'Searching & items', body: Searching },
  { id: 'combat', label: 'Combat', body: Combat },
  { id: 'zombies', label: 'Zombies & noise', body: Zombies },
  { id: 'spawn', label: 'Spawning', body: Spawning },
  { id: 'levels', label: 'XP & levels', body: Levels },
  { id: 'survivors', label: 'Survivors', body: Survivors },
  { id: 'scenario', label: 'The Long Block', body: Scenario },
];

export function Rulebook({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState(TABS[0]!.id);
  const Body = TABS.find((t) => t.id === tab)!.body;
  return (
    <div className="rb-bg" onClick={onClose}>
      <div className="rb" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rulebook">
        <div className="rb-head">
          <b>Rulebook</b>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="rb-main">
          <nav className="rb-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
          <div className="rb-body" key={tab}><Body /></div>
        </div>
      </div>
    </div>
  );
}
