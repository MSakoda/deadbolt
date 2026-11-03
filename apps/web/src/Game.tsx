import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_BY_ID, DANGER_NAMES, ITEMS, applyAction, danger, edgeBetween,
  legalActions, woundCount, getScenario,
} from '@deadbolt/engine';
import type { Action, GameEvent, GameState, ZombieType, ZoneId } from '@deadbolt/engine';
import { BoardView, type Hints, type HoverTarget } from './Board';
import { TipBody } from './Tooltip';
import { weaponLine } from './info';
import { InventoryModal, SearchModal } from './Modals';
import { describeAll, type LogLine } from './log';
import { save, type Saved } from './persist';
import { Goal, Legend } from './Legend';
import { Rulebook } from './Rulebook';
import { SurvivorCard } from './SurvivorCard';
import { Portrait } from './Portrait';
import { DiceOverlay, zoneNameFor } from './DiceOverlay';
import { extractRolls, type Roll } from './dice';
import { loadSettings, saveSettings, type Settings } from './settings';
import { SettingsModal } from './SettingsModal';
import { Replay, ReplayFromToken } from './Replay';
import { applyToDisplay, namesFor, planPlayback, type Banner, type PhasePlan } from './phase';
import type { Online } from './online';

const LOCK = new Set([
  'attack', 'molotov', 'cards_drawn', 'alarm', 'reroll', 'building_opened', 'objective_taken', 'spawn_card', 'zombie_phase_start',
]);
const PRIORITY: ZombieType[] = ['sprinter', 'brute', 'mutant', 'shambler'];

type Mode = { slot: 0 | 1 | 'both' } | null;

export function Game({ initial, onExit, online }: { initial: Saved; onExit(): void; online?: Online }) {
  const [g, setG] = useState<Saved>(initial);
  const [undo, setUndo] = useState<{ state: GameState; logLen: number }[]>([]);
  // Online: reversible steps previewed locally, sent to the server together with the next step that needs its dice or decks.
  const queue = useRef<Action[]>([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [showReplay, setShowReplay] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  // True while the zombie phase plays back; the board and the controls wait for it.
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const skipPhase = useRef<() => void>(() => undefined);
  const shown = useRef<GameState>(initial.state);
  const [mode, setMode] = useState<Mode>(null);
  const [toast, setToast] = useState('');
  const [inv, setInv] = useState(false);
  const [rules, setRules] = useState(false);
  const [bigLog, setBigLog] = useState(false);
  const [hover, setHover] = useState<{ t: HoverTarget; x: number; y: number; sticky?: boolean } | null>(null);
  const [prefer, setPrefer] = useState<ZombieType | ''>('');
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<BoardView | null>(null);
  const events = useRef<GameEvent[]>([]);
  const logEnd = useRef<HTMLDivElement>(null);

  const { state } = g;
  const actor = state.turn ? state.survivors[state.turn.survivorId]! : null;
  const canAct = !online || (!!actor && actor.owner === online.myId);
  const ownerName = (o: string) => (online ? online.names[o] : g.players[Number(o)]) ?? o;
  const legal = useMemo<Action[]>(() => (actor && canAct && !busy && !playing && state.status === 'active' ? legalActions(state, actor.owner) : []), [state, actor, canAct, busy, playing]);

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
    // A preview that needs hidden information (or throws on placeholders) just goes to the server.
    let r: ReturnType<typeof applyAction>;
    try { r = applyAction(state, a); } catch { r = { ok: false, error: 'needs the server' }; }
    if (online) {
      const lock = !r.ok || a.type === 'end_turn' || r.events.some((e) => LOCK.has(e.type));
      if (r.ok && !lock) {
        queue.current.push(a);
        setUndo((u) => [...u, { state, logLen: g.log.length }]);
        events.current = r.events;
        setG({ ...g, state: r.state, log: [...g.log, ...describeAll(r.state, r.events)] });
        setMode(null);
        setToast('');
        return true;
      }
      void sendToServer([...queue.current, a]);
      return true;
    }
    if (!r.ok) { setToast(r.error); return false; }
    const lines: LogLine[] = describeAll(r.state, r.events);
    const lock = a.type === 'end_turn' || r.events.some((e) => LOCK.has(e.type));
    setUndo((u) => (lock ? [] : [...u, { state, logLen: g.log.length }]));
    events.current = r.events;
    const ng: Saved = {
      ...g, state: r.state, log: [...g.log, ...lines],
      replay: g.replay && { initial: g.replay.initial, steps: [...g.replay.steps, { events: r.events }] },
    };
    setG(ng);
    save(ng);
    setMode(null);
    setToast('');
    return true;
  };

  const sendToServer = async (actions: Action[]) => {
    if (!online) return;
    setBusy(true);
    const res = await online.send(actions);
    setBusy(false);
    if ('error' in res) { setToast(res.error); return; }
    queue.current = [];
    setUndo([]);
    setMode(null);
    setToast('');
    events.current = res.events;
    // The server's state replaces the preview; the log drops the preview's lines and uses the server's events.
    setG((cur) => ({ ...cur, state: res.state, log: [...cur.log.slice(0, undoBase.current), ...describeAll(res.state, res.events)] }));
  };

  const undoBase = useRef(0);
  undoBase.current = undo[0]?.logLen ?? g.log.length;

  const doUndo = () => {
    const u = undo[undo.length - 1];
    if (!u) return;
    events.current = [];
    const ng: Saved = {
      ...g, state: u.state, log: g.log.slice(0, u.logLen),
      replay: g.replay && { initial: g.replay.initial, steps: g.replay.steps.slice(0, -1) },
    };
    queue.current.pop();
    setUndo(undo.slice(0, -1));
    setG(ng);
    if (!online) save(ng);
    setMode(null);
  };

  // Keep the latest handlers reachable from the Pixi callbacks.
  const latest = useRef({ legal, mode, actor, state, dispatch, prefer });
  latest.current = { legal, mode, actor, state, dispatch, prefer };

  // The lobby page may have been scrolled; open the game at the top, where the board is.
  useEffect(() => { window.scrollTo(0, 0); }, []);

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
      shown.current = latest.current.state;
    });
    return () => { cancelled = true; view?.destroy(); board.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Events the board has not shown yet. While dice are rolling the board is held, so a zombie that
  // was hit stays on the map until the roll has finished, then the kills play out.
  const unshown = useRef<GameEvent[]>([]);
  useEffect(() => {
    // Attack rolls (mine or, online, other players') play as a dice animation unless it is switched off.
    const fresh = settings.dice ? extractRolls(events.current) : [];
    unshown.current.push(...events.current);
    events.current = [];
    if (fresh.length) setRolls((q) => [...q, ...fresh]);
    if (rolls.length + fresh.length > 0 || playingRef.current) return;
    // Surprise spawns (alarm, a building filling up) always get an alert; the zombie phase follows its setting.
    const plan = planPlayback(unshown.current, namesFor(state.scenarioId), settings.zombies);
    unshown.current = plan ? [] : unshown.current;
    if (plan) { void playPhase(plan); return; }
    board.current?.update(state, hints, unshown.current);
    shown.current = state;
    unshown.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hints, rolls.length, playing]);

  /** Plays the zombie phase beat by beat on the board, starting from what the board currently shows. */
  const playPhase = async (plan: PhasePlan) => {
    playingRef.current = true;
    setPlaying(true);
    let skipped = false;
    let release: (() => void) | null = null;
    skipPhase.current = () => { skipped = true; release?.(); };
    const wait = (ms: number) => new Promise<void>((res) => {
      const t = setTimeout(res, ms);
      release = () => { clearTimeout(t); res(); };
    });
    const show = (evs: GameEvent[]) => {
      shown.current = applyToDisplay(shown.current, evs);
      board.current?.update(shown.current, { zones: {}, doors: {} }, evs);
    };
    show(plan.pre);
    for (const beat of plan.beats) {
      if (skipped) break;
      if (beat.banner) setBanner(beat.banner);
      show(beat.events);
      await wait(beat.wait);
    }
    setBanner(null);
    playingRef.current = false;
    setPlaying(false); // the effect now draws the true final state
  };

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    if (!s.dice) setRolls([]);
    if (!s.zombies) skipPhase.current();
  };

  // A tooltip pinned by a tap goes away on the next touch.
  useEffect(() => {
    if (!hover?.sticky) return;
    const off = () => setHover(null);
    document.addEventListener('pointerdown', off, { capture: true, once: true });
    return () => document.removeEventListener('pointerdown', off, { capture: true });
  }, [hover]);

  // Online: a newer server state (someone else moved) replaces ours when we have nothing queued.
  useEffect(() => {
    if (!online?.remote || queue.current.length) return;
    events.current = online.remote.events;
    setG((cur) => ({ ...cur, state: online.remote!.state, log: [...cur.log, ...online.remote!.lines] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online?.remote]);

  // Scroll only the log itself; scrollIntoView would also scroll the page and push the board away.
  useEffect(() => { const el = logEnd.current?.parentElement; if (el) el.scrollTop = el.scrollHeight; }, [g.log.length]);

  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  const turn = state.turn;
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

  // The last living survivor's End turn is what starts the zombie phase.
  const lastTurn = !!turn && state.turnOrder.slice(state.turnIndex + 1).every((id) => !state.survivors[id]?.alive);

  const grants = legal.filter((a): a is Extract<Action, { type: 'grant' }> => a.type === 'grant');
  const zname = (id: string) => getScenario(state.scenarioId).zones.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="game">
      {rules && <Rulebook onClose={() => setRules(false)} />}
      {showReplay && !online && g.replay && (
        <Replay
          data={{ initial: g.replay.initial, steps: g.replay.steps, final: state, outcome: state.status === 'won' ? 'won' : 'lost' }}
          onClose={() => setShowReplay(false)}
        />
      )}
      {showReplay && online?.replayToken && <ReplayFromToken token={online.replayToken} onClose={() => setShowReplay(false)} />}
      {showSettings && <SettingsModal settings={settings} onChange={changeSettings} onClose={() => setShowSettings(false)} />}
      <div className="boardwrap">
        <div ref={host} className="board" />
        <div className="hud">
          <b>Round {state.round}</b>
          <span>Danger: <b className={'danger d' + danger(state)}>{DANGER_NAMES[danger(state)]}</b></span>
          <span>Zombies: {state.zombies.length}</span>
          <span className={state.team.keys ? 'ok' : 'dim'}>Keys {state.team.keys ? '✓' : '—'}</span>
          <span className={state.team.fuel ? 'ok' : 'dim'}>Fuel {state.team.fuel ? '✓' : '—'}</span>
        </div>
        <div className="hudbtns">
          <button onClick={() => setRules(true)}>Rulebook</button>
          {online?.topExtra}
          <button onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings">&#9881;</button>
          <button onClick={() => { if (online || confirm('Leave this game? It will be lost.')) onExit(); }}>{online ? 'Games' : 'Quit'}</button>
        </div>
        <div className="zoombtns">
          <button onClick={() => board.current?.zoomBy(1.3)} aria-label="zoom in">+</button>
          <button onClick={() => board.current?.zoomBy(1 / 1.3)} aria-label="zoom out">&minus;</button>
          <button onClick={() => board.current?.resetView()} aria-label="reset view">&#8634;</button>
        </div>
        {banner && (
          <div className={'phase-banner' + (banner.kind === 'alert' ? ' alert' : '')} key={banner.title + banner.sub} onClick={() => skipPhase.current()} title="Click to skip">
            <b>{banner.title}</b>
            {banner.sub && <span>{banner.sub}</span>}
          </div>
        )}
        <DiceOverlay queue={rolls} zoneName={zoneNameFor(state.scenarioId)} onDone={() => setRolls((q) => q.slice(1))} />
        {mode && <div className="banner">Pick a red zone to attack. <button onClick={() => setMode(null)}>Cancel</button></div>}
        {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
        {state.status !== 'active' && (
          <div className="modal-bg">
            <div className="modal">
              <h2>{state.status === 'won' ? 'You made it out!' : 'The block is lost.'}</h2>
              <p>{state.status === 'won' ? `Survivors escaped in round ${state.round}.` : `Fallen in round ${state.round}.`}</p>
              {(online ? online.replayToken : g.replay) && (
                <p><button className="primary" onClick={() => setShowReplay(true)}>Watch replay</button></p>
              )}
              <button className={online?.replayToken || g.replay ? '' : 'primary'} onClick={onExit}>{online ? 'Back to my games' : 'Back to lobby'}</button>
            </div>
          </div>
        )}
        {hover && !bigLog && (
          <div className="tip" style={{ left: Math.max(8, Math.min(hover.x + 16, window.innerWidth - 336)), top: Math.max(8, Math.min(hover.y + 16, window.innerHeight - 340)) }}>
            <TipBody state={state} t={hover.t} ownerName={ownerName} />
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
        {state.pending && actor && canAct && <SearchModal state={state} actor={actor} dispatch={dispatch} />}
        {inv && actor && canAct && <InventoryModal state={state} actor={actor} cost={reorgCost} dispatch={(a) => { if (dispatch(a)) setInv(false); }} onClose={() => setInv(false)} />}
      </div>

      <aside className="side">
        <Goal state={state} />
        {actor && turn && <SurvivorCard actor={actor} turn={turn} owner={ownerName(actor.owner)} zone={zname(actor.zone)} />}

        {actor && !canAct && state.status === 'active' && (
          <div className="card waiting">Waiting for <b>{ownerName(actor.owner)}</b> ({CHARACTER_BY_ID[actor.charId]?.name.split(" ")[0]}). The board updates by itself.</div>
        )}
        {actor && canAct && state.status === 'active' && !state.pending && (
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
              <button
                className={'primary' + (lastTurn ? ' zphase' : '')}
                onClick={() => dispatch({ type: 'end_turn' })}
                title={lastTurn ? 'You are the last survivor to act. Ending the turn runs the zombie phase.' : undefined}
              >{lastTurn ? 'End turn: zombie phase' : 'End turn'}</button>
            </div>
          </div>
        )}

        <div className="card roster">
          {state.turnOrder.map((id) => {
            const v = state.survivors[id]!;
            return (
              <div key={id} className={'rrow' + (v.alive ? '' : ' dead') + (turn?.survivorId === id ? ' cur' : '')}>
                <Portrait id={id} size={26} />
                <span>{CHARACTER_BY_ID[id]?.name.split(' ')[0]}</span>
                <span className="dim">L{v.level} · {ownerName(v.owner)}</span>
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
