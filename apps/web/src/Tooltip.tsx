import { CHARACTER_BY_ID, ABILITY_TEXT, ITEMS, LEVEL_XP, ZOMBIE_DEFS, abilities, getScenario, woundCount } from '@deadbolt/engine';
import type { GameState } from '@deadbolt/engine';
import type { HoverTarget } from './Board';
import { killers, weaponInfo, weaponLine } from './info';
import { itemStat } from './Modals';

const DOOR_TOOLS = 'Crowbar (silent), Fire axe or Chainsaw (noisy)';

export function TipBody({ state, t, players }: { state: GameState; t: HoverTarget; players: string[] }) {
  const sc = getScenario(state.scenarioId);
  const zn = (id: string) => sc.zones.find((z) => z.id === id)?.name ?? id;
  const actor = state.turn ? state.survivors[state.turn.survivorId]! : null;

  if (t.kind === 'survivor') {
    const sv = state.survivors[t.id];
    if (!sv) return null;
    const ch = CHARACTER_BY_ID[sv.charId]!;
    const idx = state.turnOrder.indexOf(sv.id);
    const next = sv.level < 3 ? (LEVEL_XP as readonly number[])[sv.level] : null;
    const w = woundCount(sv);
    const active = state.turn?.survivorId === sv.id;
    let turnLine: string;
    if (!sv.alive) turnLine = 'Down. Out of the game.';
    else if (active) turnLine = `Their turn now: ${state.turn!.actionsLeft} action${state.turn!.actionsLeft === 1 ? '' : 's'} left${state.turn!.free.move || state.turn!.free.melee ? ` (+${state.turn!.free.move} free move, +${state.turn!.free.melee} free melee)` : ''}`;
    else if (idx < state.turnIndex) turnLine = 'Has already acted this round.';
    else turnLine = `Still to act this round (turn ${idx + 1} of ${state.turnOrder.length}).`;
    return (
      <>
        <div className="tip-h"><b>{ch.name}</b> <span className="dim">{ch.role} · {players[Number(sv.owner)] ?? sv.owner}</span></div>
        <div className={w ? 'bad' : ''}>Health: {sv.alive ? `${2 - w} of 2 (${w} wound${w === 1 ? '' : 's'})` : 'down'}</div>
        <div>{turnLine}</div>
        <div>Level {sv.level} · {sv.xp}{next ? `/${next}` : ''} XP · in {zn(sv.zone)}</div>
        <div className="tip-s">Carrying</div>
        {sv.slots.map((c, i) => (
          <div key={i} className="tip-i">
            <span className="dim">{i === 0 ? 'L hand' : i === 1 ? 'R hand' : `pack ${i - 1}`}:</span>{' '}
            {c ? <>{ITEMS[c.item].name}{c.spent ? ' (spent)' : ''}<div className="dim sm">{weaponLine(sv, c) || itemStat(c.item)}</div></> : <span className="dim">empty</span>}
          </div>
        ))}
        <div className="tip-s">Abilities</div>
        {[...abilities(sv)].map((a) => <div key={a} className="sm"><b>{ABILITY_TEXT[a]?.name}</b>: {ABILITY_TEXT[a]?.text}</div>)}
      </>
    );
  }

  if (t.kind === 'zombie') {
    const z = state.zombies.find((q) => q.id === t.id);
    if (!z) return null;
    const d = ZOMBIE_DEFS[z.type];
    const names: Record<string, string> = { shambler: 'a slow walker', sprinter: 'a runner', brute: 'a heavy', mutant: 'the mutant' };
    const kill = killers(z.type);
    const hands = actor ? [actor.slots[0], actor.slots[1]].filter(Boolean) : [];
    return (
      <>
        <div className="tip-h"><b>{d.name}</b> <span className="dim">{names[z.type]} in {zn(z.zone)}</span></div>
        <div>Health: {d.toughness === 1 ? 'dies to any single hit' : `toughness ${d.toughness}: one hit must deal ${d.toughness}+ damage (damage does not add up between hits)`}</div>
        <div>Acts {d.actions}× per round, always hits when it bites. Worth {d.xp} XP.</div>
        <div className="tip-s">What kills it</div>
        <div className="sm">{d.toughness === 1 ? 'Any weapon that hits.' : `Weapons with ${d.toughness}+ damage: ${kill.length ? kill.join(', ') : 'none by themselves'}.`}{' '}A Molotov kills every zombie in a zone.{z.type === 'mutant' ? ' Lena at level 3 with a shotgun also does 3 damage.' : ''}</div>
        {actor && hands.length > 0 && (
          <>
            <div className="tip-s">{CHARACTER_BY_ID[actor.charId]!.name.split(' ')[0]}&rsquo;s hands</div>
            {hands.map((c) => {
              const w = weaponInfo(actor, c!);
              if (!w) return <div key={c!.id} className="sm dim">{ITEMS[c!.item].name}: not a weapon</div>;
              const ok = w.dmg >= d.toughness;
              return <div key={c!.id} className={'sm ' + (ok ? 'ok' : 'bad')}>{ITEMS[c!.item].name}: damage {w.dmg} {ok ? '✓ can kill it' : '✗ too weak'}</div>;
            })}
          </>
        )}
      </>
    );
  }

  if (t.kind === 'door') {
    const e = sc.edges.find((x) => x.id === t.id);
    if (!e) return null;
    const open = !!state.doors[e.id];
    const title = `${zn(e.a)} ↔ ${zn(e.b)}`;
    if (open) return <><div className="tip-h"><b>Open door</b> <span className="dim">{title}</span></div><div>Anyone can walk through, zombies too.</div></>;
    let line: JSX.Element | null = null;
    if (actor && (actor.zone === e.a || actor.zone === e.b)) {
      const hand = [actor.slots[0], actor.slots[1]].filter(Boolean).map((c) => ITEMS[c!.item]);
      const tool = hand.find((d) => d.door !== 'none');
      const packTool = actor.slots.slice(2).find((c) => c && ITEMS[c.item].door !== 'none');
      const who = CHARACTER_BY_ID[actor.charId]!.name.split(' ')[0];
      line = tool
        ? <div className="ok">{who} can open it with the {tool.name} ({tool.door === 'noisy' ? 'noisy' : 'silent'}).</div>
        : <div className="bad">{who} cannot open it: no door-opening weapon in hand{hand.length ? ` (holding ${hand.map((h) => h.name).join(', ')})` : ''}.{packTool ? ` The ${ITEMS[packTool.item].name} in the pack would work: use Reorganize to put it in a hand.` : ''}</div>;
    } else if (actor) {
      line = <div className="dim">The active survivor needs to stand next to it first.</div>;
    }
    return (
      <>
        <div className="tip-h"><b>Locked door</b> <span className="dim">{title}</span></div>
        <div>Needs a door-opening weapon <b>in hand</b>: {DOOR_TOOLS}. Machete, pistols, shotguns and the frying pan cannot.</div>
        {line}
        <div className="sm dim">The first time any door of a building opens, every room inside fills with zombies.</div>
      </>
    );
  }

  if (t.kind === 'marker') {
    const o = state.objectives[t.id];
    if (!o) return null;
    const text = o.hidden
      ? 'A face-down marker. It hides either the keys or a free item. Stand here and use Take objective to flip it.'
      : o.kind === 'fuel' ? 'The fuel can. Take it, then bring it to the truck.'
      : o.kind === 'keys' ? 'The truck keys. Take them.' : 'Supplies: a free item draw.';
    return <><div className="tip-h"><b>{o.hidden ? '? marker' : o.kind === 'fuel' ? 'Fuel can' : o.kind === 'keys' ? 'Keys' : 'Supplies'}</b> <span className="dim">{zn(t.id)}</span></div><div>{text}</div></>;
  }

  const living = Object.values(state.survivors).filter((v) => v.alive).length;
  return (
    <>
      <div className="tip-h"><b>The truck</b> <span className="dim">{zn(sc.exitZone)}</span></div>
      <div>To escape you need:</div>
      <div className={state.team.keys ? 'ok' : 'bad'}>{state.team.keys ? '✓' : '✗'} the keys</div>
      <div className={state.team.fuel ? 'ok' : 'bad'}>{state.team.fuel ? '✓' : '✗'} the fuel</div>
      <div>all {living} living survivor{living === 1 ? '' : 's'} standing here, then <b>Start the truck</b> (1 action).</div>
    </>
  );
}
