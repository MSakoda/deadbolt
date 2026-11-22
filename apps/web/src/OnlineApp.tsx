import { useCallback, useEffect, useState } from 'react';
import { CHARACTER_BY_ID, CHARACTERS, defaultSurvivorsPerPlayer } from '@deadbolt/engine';
import { api, ApiError, type GameSummary, type Me } from './api';
import { OnlineGame } from './OnlineGame';
import { logoUrl } from './art';
import { Portrait } from './Portrait';
import { Rulebook } from './Rulebook';
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
      <h1 className="brand"><img src={logoUrl} alt="" width="48" height="48" />Deadbolt</h1>
      <p className="sub">A cooperative zombie survival game you play at your own pace. When it is your turn, you get an email.</p>
      <section>
        <h2>Sign in</h2>
        {sent ? (
          <p>If <b>{email}</b> has been invited to a game or approved as a host, a sign-in link is on its way. It works once and expires in 30 minutes. Nothing arrives? Ask whoever invited you to check the address.</p>
        ) : (
          <form className="start" onSubmit={submit}>
            <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primary" type="submit">Email me a link</button>
            {err && <span className="err">{err}</span>}
          </form>
        )}
        <p className="dim">No password. Sign-in links go to people who were invited to a game and to approved hosts.</p>
      </section>
      <section><button onClick={onHotseat}>Play hot-seat on this device instead</button></section>
    </div>
  );
}

function Dashboard({ me, reload, open, openReplay, onHotseat }: { me: Me; reload(): Promise<void>; open(id: string): void; openReplay(token: string): void; onHotseat(): void }) {
  const [creating, setCreating] = useState(false);
  const [rules, setRules] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [name, setName] = useState(me.user.name);
  const canHost = me.canHost !== false;

  // First visit: remember the browser's timezone so the daily digest goes out at 8 AM local time.
  useEffect(() => {
    if (me.user.tz) return;
    api('PATCH', '/me', { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => undefined);
  }, [me.user.tz]);

  const needs = me.games.filter((g) => g.yourTurn);
  return (
    <div className="lobby">
      <h1 className="brand"><img src={logoUrl} alt="" width="48" height="48" />Deadbolt</h1>
      <p className="sub">Signed in as {me.user.email}.</p>

      <section>
        <h2>My games {needs.length > 0 && <span className="tag bad">{needs.length} waiting for you</span>}</h2>
        {me.games.length === 0 && <p className="dim">{canHost ? 'No games yet. Create one and invite your friends by email.' : 'No games yet. When someone invites you to a game it shows up here.'}</p>}
        {me.games.map((g) => <GameRow key={g.id} g={g} open={() => open(g.id)} replay={g.replay ? () => openReplay(g.replay!) : undefined} />)}
        {canHost ? (
          <p><button className="primary" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'New game'}</button></p>
        ) : (
          <p className="dim">Games are started by approved hosts. Ask the site owner if you would like to host your own.</p>
        )}
        {canHost && creating && <CreateGame myEmail={me.user.email} onCreated={open} />}
      </section>

      <section className="start">
        <label>Your name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button onClick={() => api('PATCH', '/me', { name }).then(reload)}>Save</button>
        <span className="grow" />
        {me.isAdmin && <button onClick={() => setAdmin(true)}>Manage hosts</button>}
        <button onClick={() => setRules(true)}>Rulebook</button>
        <button onClick={onHotseat}>Hot-seat mode</button>
        <button onClick={() => api('POST', '/auth/logout').then(reload)}>Sign out</button>
      </section>
      {rules && <Rulebook onClose={() => setRules(false)} />}
      {admin && <HostsModal onClose={() => setAdmin(false)} />}
    </div>
  );
}

/** Owner only: who may start games. Players they invite can play but not host. */
function HostsModal({ onClose }: { onClose(): void }) {
  const [list, setList] = useState<{ admins: string[]; hosts: { email: string; addedAt: number }[] } | null>(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api<{ admins: string[]; hosts: { email: string; addedAt: number }[] }>('GET', '/admin/hosts').then(setList).catch((e: Error) => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (path: string, address: string) => {
    setErr('');
    try { await api('POST', path, { email: address }); setEmail(''); await load(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Approved hosts</h2>
        <p className="dim">Only the owner and the people below can start games. Anyone they invite can play, but cannot start games or invite others.</p>
        {list?.admins.map((a) => <div key={a} className="srow"><b>{a}</b><span className="tag">owner</span></div>)}
        {list?.hosts.map((h) => (
          <div key={h.email} className="srow">
            <b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{h.email}</b>
            <span className="grow" />
            <button onClick={() => { if (confirm(`Stop ${h.email} from starting new games? Their current games keep running.`)) void run('/admin/hosts/remove', h.email); }}>Remove</button>
          </div>
        ))}
        {list && list.hosts.length === 0 && <p className="dim">No other hosts yet.</p>}
        <form className="start" onSubmit={(e) => { e.preventDefault(); void run('/admin/hosts', email); }}>
          <input type="email" required placeholder="Friend's email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="primary" type="submit">Add host</button>
        </form>
        {err && <p className="err">{err}</p>}
        <p><button onClick={onClose}>Close</button></p>
      </div>
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
      {!!g.chatUnread && <span className="tag chatdot" title="Unread chat messages">{g.chatUnread} new chat</span>}
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
  /** What is typed in the survivors-per-player box (may be empty while editing). */
  const [perText, setPerText] = useState('1');
  /** Chosen survivors per player: index 0 is you, index i + 1 is invite row i. An empty string means automatic. */
  const [picks, setPicks] = useState<string[][]>([[], []]);
  const [err, setErr] = useState('');
  const [guide, setGuide] = useState(false);
  const list = emails.map((e) => e.trim()).filter(Boolean);
  // At most 6 survivors in all, so the most each player can have depends on how many players there are.
  const maxPer = Math.max(1, Math.floor(6 / (list.length + 1)));
  const per = Math.min(maxPer, Math.max(1, Number(perText) || 1));
  const inviteSelf = list.some((e) => e.toLowerCase() === myEmail.toLowerCase());
  const setEmail = (i: number, v: string) => setEmails((a) => a.map((x, j) => (j === i ? v : x)));
  const players = [{ pi: 0, label: 'You' }, ...emails.map((e, i) => ({ pi: i + 1, label: e.trim() })).filter((p) => p.label)];
  const chosen = (pi: number) => Array.from({ length: per }, (_, s) => picks[pi]?.[s] ?? '');
  const taken = new Set(players.flatMap((p) => chosen(p.pi)).filter(Boolean));
  const setPick = (pi: number, s: number, v: string) =>
    setPicks((all) => all.map((row, j) => (j === pi ? Array.from({ length: Math.max(per, row.length) }, (_, k) => (k === s ? v : row[k] ?? '')) : row)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const v = await api<{ game: { id: string } }>('POST', '/games', {
        name, survivorsPerPlayer: per,
        hostCharIds: chosen(0).filter(Boolean),
        players: emails.map((e, i) => ({ email: e.trim(), charIds: chosen(i + 1).filter(Boolean) })).filter((p) => p.email),
      });
      onCreated(v.game.id);
    } catch (x) { setErr((x as Error).message); }
  };
  const total = (list.length + 1) * per;
  const solo = list.length === 0;
  const soloPer = defaultSurvivorsPerPlayer(1);
  return (
    <form onSubmit={submit}>
      <p><input required placeholder="Game name (for example, Friday group)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></p>
      {emails.map((v, i) => (
        <p key={i} className="start">
          <input type="email" placeholder={i === 0 ? "Friend's email (optional: leave empty to play alone)" : "Another friend's email"}
            value={v} onChange={(e) => setEmail(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          {emails.length > 1 && <button type="button" onClick={() => { setEmails((a) => a.filter((_, j) => j !== i)); setPicks((p) => p.filter((_, j) => j !== i + 1)); }} aria-label="Remove this invite" title="Remove">&times;</button>}
        </p>
      ))}
      <p><button type="button" disabled={emails.length >= MAX_INVITES} onClick={() => { setEmails((a) => [...a, '']); setPicks((p) => [...p, []]); }}>Add invite</button>
        <span className="dim"> {emails.length} of {MAX_INVITES} invites</span></p>
      <p className="start">
        <label>Survivors per player <input type="text" inputMode="numeric" pattern="[0-9]*" value={perText} aria-label={`Survivors per player, 1 to ${maxPer}`}
          onChange={(e) => setPerText(e.target.value.replace(/\D/g, '').slice(0, 1))}
          onBlur={() => setPerText(String(per))} style={{ width: 70 }} /> <span className="dim">(1 to {maxPer})</span></label>
        <span className={total > 6 ? 'err' : 'dim'}>{list.length + 1} player{solo ? '' : 's'} · {total} survivor{total === 1 ? '' : 's'} (1 to 6 players, at most 6 survivors)</span>
      </p>
      {solo && (
        <p className="dim">
          Playing alone? You control every survivor and take each turn in order. The board game suggests {soloPer}.{' '}
          {per !== soloPer && <button type="button" className="link" onClick={() => setPerText(String(soloPer))}>Use {soloPer} survivors</button>}
        </p>
      )}
      <h3>Survivors</h3>
      <p className="dim">Pick who each player controls, or leave Auto to have the rest handed out in order. <button type="button" className="link" onClick={() => setGuide(true)}>Read about the survivors</button></p>
      {players.map((p) => (
        <div key={p.pi} className="srow" style={{ display: 'block' }}>
          <b style={{ display: 'block', minWidth: 0, overflowWrap: 'anywhere', marginBottom: 6 }}>{p.label}</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
            {chosen(p.pi).map((v, s) => (
              <span key={s} className="start" style={{ gap: 6 }}>
                {v && <Portrait id={v} size={28} />}
                <select value={v} onChange={(e) => setPick(p.pi, s, e.target.value)} aria-label={`Survivor ${s + 1} for ${p.label}`}>
                  <option value="">Auto</option>
                  {CHARACTERS.map((c) => <option key={c.id} value={c.id} disabled={taken.has(c.id) && c.id !== v}>{c.name} ({c.role})</option>)}
                </select>
              </span>
            ))}
          </div>
        </div>
      ))}
      <button className="primary" type="submit" style={{ marginTop: 12 }} disabled={total > 6 || inviteSelf}>{solo ? 'Create solo game' : 'Create and send invites'}</button>
      {inviteSelf && <span className="err"> That is your own email. You are added automatically, so remove it from the invites.</span>}
      {err && <span className="err"> {err}</span>}
      <p className="dim">You can see who has whom in the lobby.</p>
      {guide && <Rulebook start="survivors" onClose={() => setGuide(false)} />}
    </form>
  );
}

export function survivorNames(ids: string[]): string {
  return ids.map((id) => CHARACTER_BY_ID[id]?.name.split(' ')[0] ?? id).join(', ');
}
