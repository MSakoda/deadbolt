import { useCallback, useEffect, useState } from 'react';
import { CHARACTER_BY_ID } from '@deadbolt/engine';
import { api, ApiError, type GameSummary, type Me } from './api';
import { OnlineGame } from './OnlineGame';
import { ReplayFromToken } from './Replay';

const gameIdFromPath = (): string | null => /^\/games\/([\w-]+)/.exec(location.pathname)?.[1] ?? null;
const replayFromPath = (): string | null => /^\/replay\/([\w-]+)/.exec(location.pathname)?.[1] ?? null;

/** Signed-in experience: sign in, my games, create a game, and the games themselves. */
export function OnlineApp({ onHotseat }: { onHotseat(): void }) {
  const [me, setMe] = useState<Me | null | 'loading'>('loading');
  const [gameId, setGameId] = useState<string | null>(gameIdFromPath);
  const [replay, setReplay] = useState<string | null>(replayFromPath);

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>('GET', '/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else throw e;
    }
  }, []);

  useEffect(() => { reload().catch(() => setMe(null)); }, [reload]);
  useEffect(() => {
    const f = () => { setGameId(gameIdFromPath()); setReplay(replayFromPath()); };
    window.addEventListener('popstate', f);
    return () => window.removeEventListener('popstate', f);
  }, []);

  const go = (id: string | null) => {
    history.pushState(null, '', id ? `/games/${id}` : '/');
    setGameId(id);
    setReplay(null);
    if (!id) void reload();
  };

  // A replay link works for anyone, signed in or not.
  if (replay) return <ReplayFromToken token={replay} onClose={() => go(null)} />;
  if (me === 'loading') return <div className="lobby"><p className="dim">Loading…</p></div>;
  if (!me) return <SignIn onHotseat={onHotseat} />;
  if (gameId) return <OnlineGame key={gameId} id={gameId} me={me.user} onExit={() => go(null)} />;
  return <Dashboard me={me} reload={reload} open={go} openReplay={(t) => { history.pushState(null, '', `/replay/${t}`); setReplay(t); }} onHotseat={onHotseat} />;
}

function SignIn({ onHotseat }: { onHotseat(): void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api('POST', '/auth/request', { email, next: location.pathname });
      setSent(true);
    } catch (x) { setErr((x as Error).message); }
  };
  return (
    <div className="lobby">
      <h1>Deadbolt</h1>
      <p className="sub">A cooperative zombie survival game you play at your own pace. When it is your turn, you get an email.</p>
      <section>
        <h2>Sign in</h2>
        {sent ? (
          <p>Check <b>{email}</b> for a sign-in link. It works once and expires in 30 minutes.</p>
        ) : (
          <form className="start" onSubmit={submit}>
            <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primary" type="submit">Email me a link</button>
            {err && <span className="err">{err}</span>}
          </form>
        )}
        <p className="dim">No password. New email addresses get an account automatically.</p>
      </section>
      <section><button onClick={onHotseat}>Play hot-seat on this device instead</button></section>
    </div>
  );
}

function Dashboard({ me, reload, open, openReplay, onHotseat }: { me: Me; reload(): Promise<void>; open(id: string): void; openReplay(token: string): void; onHotseat(): void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(me.user.name);

  // First visit: remember the browser's timezone so the daily digest goes out at 8 AM local time.
  useEffect(() => {
    if (me.user.tz) return;
    api('PATCH', '/me', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => undefined);
  }, [me.user.tz]);

  const needs = me.games.filter((g) => g.yourTurn);
  return (
    <div className="lobby">
      <h1>Deadbolt</h1>
      <p className="sub">Signed in as {me.user.email}.</p>

      <section>
        <h2>My games {needs.length > 0 && <span className="tag bad">{needs.length} waiting for you</span>}</h2>
        {me.games.length === 0 && <p className="dim">No games yet. Create one and invite your friends by email.</p>}
        {me.games.map((g) => <GameRow key={g.id} g={g} open={() => open(g.id)} replay={g.replay ? () => openReplay(g.replay!) : undefined} />)}
        <p><button className="primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'New game'}</button></p>
        {creating && <CreateGame myEmail={me.user.email} onCreated={open} />}
      </section>

      <section className="start">
        <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button onClick={() => api('PATCH', '/me', { name }).then(reload)}>Save</button>
        <span className="grow" />
        <button onClick={onHotseat}>Hot-seat mode</button>
        <button onClick={() => api('POST', '/auth/logout').then(reload)}>Sign out</button>
      </section>
    </div>
  );
}

const STATUS: Record<GameSummary['status'], string> = {
  lobby: 'waiting to start', active: 'in progress', won: 'won', lost: 'lost', abandoned: 'cancelled',
};

function GameRow({ g, open, replay }: { g: GameSummary; open(): void; replay?: () => void }) {
  return (
    <div className={'srow' + (g.status === 'active' || g.status === 'lobby' ? '' : ' off')}>
      <button className="link" onClick={open}><b>{g.name}</b></button>
      <span className="dim">{STATUS[g.status]}{g.round ? ` · round ${g.round}` : ''}</span>
      {g.yourTurn && <span className="tag bad">your turn</span>}
      <span className="grow" />
      {replay && <button onClick={replay}>Replay</button>}
      <button onClick={open}>Open</button>
    </div>
  );
}

const MAX_INVITES = 5;

function CreateGame({ myEmail, onCreated }: { myEmail: string; onCreated(id: string): void }) {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState(['']);
  const [per, setPer] = useState(1);
  const [err, setErr] = useState('');
  const list = emails.map((e) => e.trim()).filter(Boolean);
  const inviteSelf = list.some((e) => e.toLowerCase() === myEmail.toLowerCase());
  const setEmail = (i: number, v: string) => setEmails((a) => a.map((x, j) => (j === i ? v : x)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const v = await api<{ game: { id: string } }>('POST', '/games', {
        name, survivorsPerPlayer: per, players: list.map((email) => ({ email })),
      });
      onCreated(v.game.id);
    } catch (x) { setErr((x as Error).message); }
  };
  const total = (list.length + 1) * per;
  return (
    <form onSubmit={submit}>
      <p><input required placeholder="Game name (for example, Friday group)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></p>
      {emails.map((v, i) => (
        <p key={i} className="start">
          <input type="email" placeholder={i === 0 ? "Friend's email (you are added automatically)" : "Another friend's email"}
            value={v} onChange={(e) => setEmail(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          {emails.length > 1 && <button type="button" onClick={() => setEmails((a) => a.filter((_, j) => j !== i))} aria-label="Remove this invite" title="Remove">&times;</button>}
        </p>
      ))}
      <p><button type="button" disabled={emails.length >= MAX_INVITES} onClick={() => setEmails((a) => [...a, ''])}>Add invite</button>
        <span className="dim"> {emails.length} of {MAX_INVITES} invites</span></p>
      <p className="start">
        <label>Survivors per player <input type="number" min={1} max={6} value={per} onChange={(e) => setPer(Number(e.target.value) || 1)} style={{ width: 70 }} /></label>
        <span className={total > 6 || list.length < 1 ? 'err' : 'dim'}>{list.length + 1} players · {total} survivors (2 to 6 players, at most 6 survivors)</span>
      </p>
      <button className="primary" type="submit" disabled={list.length < 1 || total > 6 || inviteSelf}>Create and send invites</button>
      {inviteSelf && <span className="err"> That is your own email. You are added automatically, so remove it from the invites.</span>}
      {err && <span className="err"> {err}</span>}
      <p className="dim">Survivors are assigned in roster order; you can see who has whom in the lobby.</p>
    </form>
  );
}

export function survivorNames(ids: string[]): string {
  return ids.map((id) => CHARACTER_BY_ID[id]?.name.split(' ')[0] ?? id).join(', ');
}
