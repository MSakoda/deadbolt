import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_BY_ID } from '@deadbolt/engine';
import type { Action, GameEvent, GameState } from '@deadbolt/engine';
import { api, ApiError, type GameView, type Me } from './api';
import { Game } from './Game';
import { describeAll, type LogLine } from './log';
import type { Online } from './online';
import { survivorNames } from './OnlineApp';
import { Portrait } from './Portrait';

const POLL_MS = 10_000;

export function OnlineGame({ id, me, onExit }: { id: string; me: Me['user']; onExit(): void }) {
  const [view, setView] = useState<GameView | null>(null);
  const [err, setErr] = useState('');
  const [remote, setRemote] = useState<Online['remote']>();
  const seq = useRef(0);
  const [initial, setInitial] = useState<{ state: GameState; log: LogLine[] } | null>(null);

  const apply = (v: GameView, first: boolean) => {
    setView(v);
    const events = v.recap.flatMap((r) => r.events);
    if (first && v.state) {
      // Opening a game: the recap becomes the log; the board snaps to the current state.
      setInitial({ state: v.state, log: describeAll(v.state, events) });
      seq.current = v.game.seq;
      void api('POST', `/games/${id}/seen`, { seq: v.game.seq }).catch(() => undefined);
    } else if (v.state && v.game.seq > seq.current) {
      seq.current = v.game.seq;
      setRemote({ state: v.state, events, lines: describeAll(v.state, events) });
      void api('POST', `/games/${id}/seen`, { seq: v.game.seq }).catch(() => undefined);
    }
  };

  useEffect(() => {
    let stop = false;
    let first = true;
    const tick = async () => {
      try {
        const v = await api<GameView>('GET', `/games/${id}` + (first ? '' : `?since=${seq.current}`));
        if (stop) return;
        // The lobby has no board, so it always refreshes fully.
        apply(v, first && v.state !== null);
        if (v.state) first = false;
        setErr('');
      } catch (e) {
        if (!stop) setErr(e instanceof ApiError ? e.message : 'Connection problem');
      }
    };
    void tick();
    const t = setInterval(() => { if (!document.hidden) void tick(); }, POLL_MS);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const names = useMemo(
    () => Object.fromEntries((view?.game.members ?? []).map((m) => [m.userId, m.name ?? m.userId])),
    [view],
  );

  if (err && !view) {
    return <div className="lobby"><p className="err">{err}</p><button onClick={onExit}>Back</button></div>;
  }
  if (!view) return <div className="lobby"><p className="dim">Loading…</p></div>;

  if (view.game.status === 'lobby' || !initial) {
    return <LobbyScreen view={view} me={me} onExit={onExit} refresh={async () => apply(await api<GameView>('GET', `/games/${id}`), view.game.status === 'lobby')} />;
  }

  const online: Online = {
    myId: me.id,
    names,
    remote,
    async send(actions: Action[]) {
      try {
        const r = await api<{ state: GameState; events: GameEvent[]; seq: number }>('POST', `/games/${id}/actions`, { actions });
        seq.current = r.seq;
        void api('POST', `/games/${id}/seen`, { seq: r.seq }).catch(() => undefined);
        return { state: r.state, events: r.events };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    topExtra: view.you.role === 'host' ? <HostButton id={id} view={view} onDone={async () => apply(await api<GameView>('GET', `/games/${id}?since=${seq.current}`), false)} /> : undefined,
  };

  return (
    <>
      {err && <div className="toast">{err} (retrying)</div>}
      <Game initial={{ state: initial.state, log: initial.log, players: [] }} onExit={onExit} online={online} />
    </>
  );
}

function LobbyScreen({ view, me, onExit, refresh }: { view: GameView; me: Me['user']; onExit(): void; refresh(): Promise<void> }) {
  const [err, setErr] = useState('');
  const g = view.game;
  const mine = g.members.find((m) => m.userId === me.id);
  const allJoined = g.members.every((m) => m.status === 'joined');
  const act = async (path: string) => {
    setErr('');
    try { await api('POST', `/games/${g.id}/${path}`); await refresh(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="lobby">
      <h1>{g.name}</h1>
      <p className="sub">Waiting room. The game starts when everyone has joined and the host presses Start.</p>
      <section>
        <h2>Players</h2>
        {g.members.map((m) => (
          <div key={m.userId} className="srow">
            <b>{m.name}</b>
            {m.role === 'host' && <span className="tag">host</span>}
            {m.email && <span className="dim">{m.email}</span>}
            <span className="grow" />
            {m.charIds.map((c) => <Portrait key={c} id={c} size={30} />)}<span className="dim">{survivorNames(m.charIds)}</span>
            <span className={m.status === 'joined' ? 'ok' : 'dim'}>{m.status === 'joined' ? 'joined' : 'invited'}</span>
          </div>
        ))}
      </section>
      <section className="start">
        {mine?.status === 'invited' && <button className="primary" onClick={() => act('join')}>Join this game</button>}
        {view.you.role === 'host' && (
          <button className="primary" disabled={!allJoined} onClick={() => act('start')}>
            {allJoined ? 'Start game' : 'Waiting for players to join'}
          </button>
        )}
        <button onClick={() => refresh()}>Refresh</button>
        <button onClick={onExit}>My games</button>
        {err && <span className="err">{err}</span>}
      </section>
    </div>
  );
}

function HostButton({ id, view, onDone }: { id: string; view: GameView; onDone(): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [char, setChar] = useState('');
  const [to, setTo] = useState('');
  const [hours, setHours] = useState(view.game.settings.nudgeHours.join(', '));
  const members = view.game.members;
  const run = async (method: 'POST' | 'PUT', path: string, body?: unknown, ok = 'Done') => {
    setMsg('');
    try { await api(method, `/games/${id}/host/${path}`, body); setMsg(ok); await onDone(); } catch (e) { setMsg((e as Error).message); }
  };
  const upName = members.find((m) => m.userId === view.game.activeOwner)?.name;
  return (
    <>
      <button onClick={() => setOpen(true)}>Host</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Host controls</h2>
            <p className="dim">{upName ? `${upName} is up` : 'Nobody is up'}{view.game.activeSince ? ` since ${new Date(view.game.activeSince).toLocaleString()}` : ''}.</p>
            <p>
              <button onClick={() => run('POST', 'nudge', undefined, 'Reminder sent')}>Send a reminder now</button>{' '}
              <button onClick={() => { if (confirm(`Skip ${upName}'s turn? Their survivor holds position.`)) void run('POST', 'skip', undefined, 'Turn skipped'); }}>Skip this turn</button>
            </p>
            <p className="start">
              <select value={char} onChange={(e) => setChar(e.target.value)}>
                <option value="">Hand over a survivor…</option>
                {members.flatMap((m) => m.charIds.map((c) => <option key={c} value={c}>{CHARACTER_BY_ID[c]?.name.split(' ')[0] ?? c} ({m.name})</option>))}
              </select>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">to…</option>
                {members.filter((m) => m.status === 'joined').map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
              <button disabled={!char || !to} onClick={() => run('POST', 'handover', { charId: char, to }, 'Survivor handed over')}>Hand over</button>
            </p>
            <p className="start">
              <button disabled={!to} onClick={() => { if (confirm('Give up the host role?')) void run('POST', 'transfer', { to }, 'Host role transferred'); }}>Make the player selected above the host</button>
            </p>
            <p className="start">
              <label>Reminder hours <input value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 130 }} /></label>
              <button onClick={() => run('PUT', 'nudges', { hours: hours.split(/[\s,]+/).filter(Boolean).map(Number) }, 'Reminder timing saved')}>Save</button>
            </p>
            {msg && <p className="dim">{msg}</p>}
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
