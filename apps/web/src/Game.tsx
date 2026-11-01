import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ABILITY_TEXT, CHARACTER_BY_ID, DANGER_NAMES, ITEMS, LEVEL_XP, abilities, applyAction, danger, edgeBetween,
  legalActions, woundCount, getScenario,
} from '@deadbolt/engine';
import type { Action, GameEvent, GameState, ZombieType, ZoneId } from '@deadbolt/engine';
import { BoardView, SURVIVOR_COLORS, type Hints, type HoverTarget } from './Board';
import { TipBody } from './Tooltip';
import { weaponLine } from './info';
import { InventoryModal, SearchModal, CardChip } from './Modals';
import { describeAll, type LogLine } from './log';
import { save, type Saved } from './persist';
import { Goal, Legend } from './Legend';

const LOCK = new Set([
  'attack', 'molotov', 'cards_drawn', 'alarm', 'reroll', 'building_opened', 'objective_taken', 'spawn_card', 'zombie_phase_start',
]);
const PRIORITY: ZombieType[] = ['sprinter', 'brute', 'mutant', 'shambler'];

type Mode = { slot: 0 | 1 | 'both' } | null;

export function Game({ initial, onExit }: { initial: Saved; onExit(): void }) {
  const [g, setG] = useState<Saved>(initial);
  const [undo, setUndo] = useState<{ state: GameState; logLen: number }[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [toast, setToast] = useState('');
  const [inv, setInv] = useState(false);
  const [bigLog, setBigLog] = useState(false);
  const [hover, setHover] = useState<{ t: HoverTarget; x: number; y: number; sticky?: boolean } | null>(null);
  const [prefer, setPrefer] = useState<ZombieType | ''>('');
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<BoardView | null>(null);
  const events = useRef<GameEvent[]>([]);
  const logEnd = useRef<HTMLDivElement>(null);

  const { state } = g;
  const actor = state.turn ? state.survivors[state.turn.survivorId]! : null;
  const legal = useMemo<Action[]>(() => (actor && state.status === 'active' ? legalActions(state, actor.owner) : []), [state, actor]);

  const attacksFor = (slot: 0 | 1 | 'both') =>
    legal.filter((a): a is Extract<Action, { type: 'attack' }> => a.type === 'attack' && a.slot === slot);

  const hints = useMemo<Hints>(() => {
    const zones: Hints['zones'] = {};
    const doors: Hints['doors'] = {};
    if (!actor || state.pending) return { zones, doors };
    if (mode) for (const a of attacksFor(mode.slot)) zones[a.target] = 'attack';
    else {
      for (const a of legal) if (a.type === 'move') zones[a.to] = 'move';
      for (const a of legal) if (a.type === 'open_door') {
        const e = edgeBetween(state, actor.zone, a.to);
        if (e) doors[e.id] = true;
      }
    }
    return { zones, doors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal, mode, state, actor]);

  const dispatch = (a: Action): boolean => {
    const r = applyAction(state, a);
    if (!r.ok) { setToast(r.error); return false; }
    const lines: LogLine[] = describeAll(r.state, r.events);
    const lock = a.type === 'end_turn' || r.events.some((e) => LOCK.has(e.type));
    setUndo((u) => (lock ? [] : [...u, { state, logLen: g.log.length }]));
    events.current = r.events;
    const ng: Saved = { ...g, state: r.state, log: [...g.log, ...lines] };
    setG(ng);
    save(ng);
    setMode(null);
    setToast('');
    return true;
  };

  const doUndo = () => {
    const u = undo[undo.length - 1];
    if (!u) return;
    events.current = [];
    const ng: Saved = { ...g, state: u.state, log: g.log.slice(0, u.logLen) };
    setUndo(undo.slice(0, -1));
    setG(ng);
    save(ng);
    setMode(null);
  };

  // Keep the latest handlers reachable from the Pixi callbacks.
  const latest = useRef({ legal, mode, actor, state, dispatch, prefer });
  latest.current = { legal, mode, actor, state, dispatch, prefer };

  useEffect(() => {
    let cancelled = false;
    let view: BoardView | null = null;
    BoardView.create(host.current!, {
      onHover: (target, x, y, sticky) => setHover(target ? { t: target, x, y, sticky } : null),
      onZone: (zone: ZoneId) => {
        const { legal, mode, dispatch, prefer } = latest.current;
        if (mode) {
          const a = legal.find((x) => x.type === 'attack' && x.slot === mode.slot && x.target === zone);
          if (a && a.type === 'attack') dispatch(withPrefer(a, prefer));
          return;
        }
        const m = legal.find((x) => x.type === 'move' && x.to === zone);
        if (m) dispatch(m);
      },
      onDoor: (_edge, a, b) => {
        const { legal, actor, dispatch } = latest.current;
        if (!actor) return;
        const to = actor.zone === a ? b : actor.zone === b ? a : null;
        const open = legal.find((x) => x.type === 'open_door' && x.to === to);
        if (open) dispatch(open);
      },
    }, g.state).then((v) => {
      if (cancelled) { v.destroy(); return; }
      view = v;
      board.current = v;
      v.update(latest.current.state, hints, [], true);
    });
    return () => { cancelled = true; view?.destroy(); board.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    board.current?.update(state, hints, events.current);
    events.current = [];
  }, [state, hints]);

  // A tooltip pinned by a tap goes away on the next touch.
  useEffect(() => {
    if (!hover?.sticky) return;
    const off = () => setHover(null);
    document.addEventListener('pointerdown', off, { capture: true, once: true });
    return () => document.removeEventListener('pointerdown', off, { capture: true });
  }, [hover]);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [g.log.length]);

  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  const turn = state.turn;
  const ownerName = actor ? g.players[Number(actor.owner)] ?? `Player ${Number(actor.owner) + 1}` : '';
  const char = actor ? CHARACTER_BY_ID[actor.charId]! : null;
  const abilityIds = actor ? [...abilities(actor)] : [];
  const nextXp = actor && actor.level < 3 ? (LEVEL_XP as readonly number[])[actor.level] : null;
  const reorgCost = turn?.freeReorg ? 'free this time' : '1 action';

  const slotButtons = (['0', '1', 'both'] as const).map((k) => {
    const slot = (k === 'both' ? 'both' : Number(k)) as 0 | 1 | 'both';
    const targets = attacksFor(slot);
    if (targets.length === 0 || !actor) return null;
    const name = slot === 'both'
      ? `Both hands (${ITEMS[actor.slots[0]!.item].name})`
      : ITEMS[actor.slots[slot]!.item].name;
    const sel = mode?.slot === slot;
    return (
      <button key={k} className={sel ? 'primary' : ''} onClick={() => {
        if (sel) { setMode(null); return; }
        const only = targets.length === 1 ? targets[0]! : null;
        if (only && only.target === actor.zone) { dispatch(withPrefer(only, prefer)); return; }
        setMode({ slot });
      }} title={weaponLine(actor, actor.slots[slot === 'both' ? 0 : slot])}>Attack: {name}<small className="btnsub">{weaponLine(actor, actor.slots[slot === 'both' ? 0 : slot]).replace(/^1 die, /, '').replace(/^(\d+) dice, /, '$1 dice, ')}{slot === 'both' ? ' ×2' : ''}</small></button>
    );
  });

  const grants = legal.filter((a): a is Extract<Action, { type: 'grant' }> => a.type === 'grant');
  const zname = (id: string) => getScenario(state.scenarioId).zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="game">
      <div className="boardwrap">
        <div ref={host} className="board" />
        <div className="topbar">
          <b>Round {state.round}</b>
          <span>Danger: <b className={'danger d' + danger(state)}>{DANGER_NAMES[danger(state)]}</b></span>
          <span>Zombies: {state.zombies.length}</span>
          <span className={state.team.keys ? 'ok' : 'dim'}>Keys {state.team.keys ? '✓' : '—'}</span>
          <span className={state.team.fuel ? 'ok' : 'dim'}>Fuel {state.team.fuel ? '✓' : '—'}</span>
          <span className="grow" />
          <button onClick={() => { if (confirm('Leave this game? It will be lost.')) onExit(); }}>Quit</button>
        </div>
        <div className="zoombtns">
          <button onClick={() => board.current?.zoomBy(1.3)} aria-label="zoom in">+</button>
          <button onClick={() => board.current?.zoomBy(1 / 1.3)} aria-label="zoom out">&minus;</button>
          <button onClick={() => board.current?.resetView()} aria-label="reset view">&#8634;</button>
        </div>
        {mode && <div className="banner">Pick a red zone to attack. <button onClick={() => setMode(null)}>Cancel</button></div>}
        {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
        {state.status !== 'active' && (
          <div className="modal-bg">
            <div className="modal">
              <h2>{state.status === 'won' ? 'You made it out!' : 'The block is lost.'}</h2>
              <p>{state.status === 'won' ? `Survivors escaped in round ${state.round}.` : `Fallen in round ${state.round}.`}</p>
              <button className="primary" onClick={onExit}>Back to lobby</button>
            </div>
          </div>
        )}
        {hover && !bigLog && (
          <div className="tip" style={{ left: Math.max(8, Math.min(hover.x + 16, window.innerWidth - 336)), top: Math.max(8, Math.min(hover.y + 16, window.innerHeight - 340)) }}>
            <TipBody state={state} t={hover.t} players={g.players} />
          </div>
        )}
        {bigLog && (
          <div className="modal-bg" onClick={() => setBigLog(false)}>
            <div className="modal huge" onClick={(e) => e.stopPropagation()}>
              <div className="loghead"><h3>Game log</h3><button onClick={() => setBigLog(false)}>Close</button></div>
              <div className="log full">
                {g.log.map((l, i) => <div key={i} className={'ln ' + l.kind}>{l.text}</div>)}
              </div>
            </div>
          </div>
        )}
        {state.pending && actor && <SearchModal state={state} actor={actor} dispatch={dispatch} />}
        {inv && actor && <InventoryModal state={state} actor={actor} cost={reorgCost} dispatch={(a) => { if (dispatch(a)) setInv(false); }} onClose={() => setInv(false)} />}
      </div>

      <aside className="side">
        <Goal state={state} />
        {actor && char && turn && (
          <div className="card">
            <div className="who">
              <span className="dot lg" style={{ background: '#' + (SURVIVOR_COLORS[actor.charId] ?? 0xcccccc).toString(16).padStart(6, '0') }} />
              <div>
                <b>{char.name}</b> <span className="dim">{char.role}</span>
                <div className="dim">{ownerName}&rsquo;s turn &middot; level {actor.level} &middot; {actor.xp}{nextXp ? `/${nextXp}` : ''} XP &middot; in {zname(actor.zone)}</div>
              </div>
            </div>
            <div className="pips">
              {Array.from({ length: Math.max(turn.actionsLeft, 0) }, (_, i) => <span key={i} className="pip" />)}
              <span className="dim"> {turn.actionsLeft} action{turn.actionsLeft === 1 ? '' : 's'}</span>
              {turn.free.move > 0 && <span className="tag">+{turn.free.move} free move</span>}
              {turn.free.melee > 0 && <span className="tag">+{turn.free.melee} free melee</span>}
              {woundCount(actor) > 0 && <span className="tag bad">{woundCount(actor)} wound{woundCount(actor) > 1 ? 's' : ''}</span>}
            </div>
            <div className="inv">
              {actor.slots.map((c, i) => (
                <div key={i} className="slot">
                  <small>{i === 0 ? 'L hand' : i === 1 ? 'R hand' : `pack ${i - 1}`}</small>
                  <CardChip card={c} small />
                </div>
              ))}
            </div>
            <details>
              <summary>Abilities</summary>
              {abilityIds.map((a) => <div key={a} className="ab"><b>{ABILITY_TEXT[a]?.name}</b> {ABILITY_TEXT[a]?.text}</div>)}
            </details>
          </div>
        )}

        {actor && state.status === 'active' && !state.pending && (
          <div className="card actions">
            <div className="hint">Click a blue zone to move, an orange door to open it.</div>
            <div className="btns">
              {slotButtons}
              {has('search') && <button onClick={() => dispatch({ type: 'search' })}>Search</button>}
              {has('take_objective') && <button className="primary" onClick={() => dispatch({ type: 'take_objective' })}>Take objective</button>}
              {has('start_truck') && <button className="primary" onClick={() => dispatch({ type: 'start_truck' })}>Start the truck</button>}
              {legal.filter((a) => a.type === 'reload').map((a, i) => a.type === 'reload' && (
                <button key={i} onClick={() => dispatch(a)}>Reload {ITEMS[actor.slots[a.slot]!.item].name}</button>
              ))}
              {legal.filter((a) => a.type === 'combine').map((a, i) => a.type === 'combine' && (
                <button key={i} onClick={() => dispatch(a)}>
                  Combine {ITEMS[actor.slots[a.a]!.item].name} + {ITEMS[actor.slots[a.b]!.item].name}
                </button>
              ))}
              {legal.filter((a) => a.type === 'first_aid').map((a, i) => a.type === 'first_aid' && (
                <button key={i} onClick={() => dispatch(a)}>First aid: {CHARACTER_BY_ID[a.target]?.name.split(' ')[0]}</button>
              ))}
              <button onClick={() => setInv(true)}>Reorganize / trade</button>
              {has('noise') && <button onClick={() => dispatch({ type: 'noise' })} title="Draw zombies to this zone">Make noise</button>}
            </div>
            {grants.length > 0 && (
              <details>
                <summary>Free actions for allies ({grants.length})</summary>
                {grants.map((a, i) => (
                  <button key={i} className="mini" onClick={() => dispatch(a)}>
                    {CHARACTER_BY_ID[a.target]?.name.split(' ')[0]}: {a.then.type.replace('_', ' ')}
                    {a.then.type === 'move' || a.then.type === 'open_door' ? ` ${zname(a.then.to)}` : a.then.type === 'attack' ? ` ${zname(a.then.target)} (${a.then.slot === 0 ? 'L' : 'R'})` : ''}
                  </button>
                ))}
              </details>
            )}
            <label className="prefer">Melee / scope priority:{' '}
              <select value={prefer} onChange={(e) => setPrefer(e.target.value as ZombieType | '')}>
                <option value="">automatic</option>
                {PRIORITY.map((p) => <option key={p} value={p}>{p}s first</option>)}
              </select>
            </label>
            <div className="btns end">
              <button onClick={doUndo} disabled={undo.length === 0} title="Dice rolls and card draws lock in">Undo</button>
              <button className="primary" onClick={() => dispatch({ type: 'end_turn' })}>End turn</button>
            </div>
          </div>
        )}

        <div className="card roster">
          {state.turnOrder.map((id) => {
            const v = state.survivors[id]!;
            return (
              <div key={id} className={'rrow' + (v.alive ? '' : ' dead') + (turn?.survivorId === id ? ' cur' : '')}>
                <span className="dot" style={{ background: '#' + (SURVIVOR_COLORS[id] ?? 0xcccccc).toString(16).padStart(6, '0') }} />
                <span>{CHARACTER_BY_ID[id]?.name.split(' ')[0]}</span>
                <span className="dim">L{v.level} · {g.players[Number(v.owner)]}</span>
                <span className="grow" />
                {v.alive ? <span className={woundCount(v) ? 'bad' : 'dim'}>{woundCount(v)}/2 wounds</span> : <span className="bad">down</span>}
              </div>
            );
          })}
        </div>

        <div className="card logcard">
          <div className="loghead"><b>What happened</b><button className="mini" onClick={() => setBigLog(true)}>Expand</button></div>
          <div className="log">
            {g.log.slice(-200).map((l, i) => <div key={i} className={'ln ' + l.kind}>{l.text}</div>)}
            <div ref={logEnd} />
          </div>
        </div>
        <details className="card">
          <summary><b>Legend: what the icons mean</b></summary>
          <Legend />
        </details>
      </aside>
    </div>
  );
}

function withPrefer(a: Extract<Action, { type: 'attack' }>, prefer: ZombieType | ''): Action {
  if (!prefer) return a;
  return { ...a, prefer: [prefer, ...PRIORITY.filter((p) => p !== prefer)] };
}
