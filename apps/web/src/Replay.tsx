import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_BY_ID, danger, DANGER_NAMES } from '@deadbolt/engine';
import { api } from './api';
import { BoardView } from './Board';
import { buildFrames, type ReplayData } from './replayFrames';

const SPEEDS = [1, 2, 4, 8] as const;
/** Milliseconds per frame at 1x. Fast enough to watch a whole game in a minute or two. */
const BASE_MS = 520;
const NO_HINTS = { zones: {}, doors: {} };

/** A finished game played back on the board, sped up. No dice, just movement. */
export function Replay({ data, shareUrl, onClose }: { data: ReplayData; shareUrl?: string; onClose(): void }) {
  const frames = useMemo(() => buildFrames(data), [data]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [copied, setCopied] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<BoardView | null>(null);
  const jumped = useRef(true);
  const last = frames.length - 1;

  useEffect(() => {
    let cancelled = false;
    BoardView.create(host.current!, { onHover: () => undefined, onZone: () => undefined, onDoor: () => undefined }, data.initial).then((v) => {
      if (cancelled) { v.destroy(); return; }
      board.current = v;
      v.update(frames[0]!.state, NO_HINTS, [], true);
    });
    return () => { cancelled = true; board.current?.destroy(); board.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the current frame. Floating text only at slower speeds, and never when jumping around.
  useEffect(() => {
    const f = frames[i];
    if (!f) return;
    const fx = !jumped.current && speed <= 2 ? f.events : [];
    board.current?.update(f.state, NO_HINTS, fx, jumped.current);
    jumped.current = false;
  }, [i, frames, speed]);

  useEffect(() => {
    if (!playing) return;
    if (i >= last) { setPlaying(false); return; }
    const t = setTimeout(() => setI((n) => Math.min(last, n + 1)), BASE_MS / speed);
    return () => clearTimeout(t);
  }, [playing, i, speed, last]);

  const f = frames[i]!;
  const who = f.survivor ? CHARACTER_BY_ID[f.survivor]?.name.split(' ')[0] : null;
  const done = i >= last;
  const finalState = frames[last]!.state;

  const seek = (n: number) => { jumped.current = true; setI(n); };
  const copy = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt('Copy this replay link', shareUrl); }
  };

  return (
    <div className="replay">
      <div className="replay-top">
        <b>{data.title ? `${data.title}: replay` : 'Replay'}</b>
        <span className="dim">Round {f.round} · {DANGER_NAMES[danger(f.state)]} · {f.state.zombies.length} zombies</span>
        <span className="grow" />
        {shareUrl && <button onClick={copy}>{copied ? 'Link copied' : 'Copy replay link'}</button>}
        <button onClick={onClose}>Close</button>
      </div>
      <div className="replay-board" ref={host} />
      {done && (
        <div className={'replay-result ' + (data.outcome === 'won' ? 'win' : 'lose')}>
          <b>{data.outcome === 'won' ? 'The survivors escaped!' : 'The block was lost.'}</b>
          <span className="dim">{finalState.round} rounds · {Object.values(finalState.survivors).filter((s) => s.alive).length} of {finalState.turnOrder.length} survivors made it</span>
        </div>
      )}
      <div className="replay-bar">
        <button onClick={() => { seek(0); setPlaying(true); }} title="Restart" aria-label="Restart">&#8634;</button>
        <button className="primary" onClick={() => { if (done) { seek(0); setPlaying(true); } else setPlaying(!playing); }}>
          {done ? 'Replay again' : playing ? 'Pause' : 'Play'}
        </button>
        <input type="range" min={0} max={last} value={i} onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} aria-label="Position" />
        <span className="dim replay-now">{who ? `${who}'s turn` : f.note ?? ''}{f.note && who ? ` · ${f.note}` : ''}</span>
        <span className="speeds">
          {SPEEDS.map((s) => <button key={s} className={s === speed ? 'primary' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
        </span>
      </div>
    </div>
  );
}

/** Loads a shared replay by its link token, no sign-in needed. */
export function ReplayFromToken({ token, onClose }: { token: string; onClose(): void }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<ReplayData>('GET', `/replay/${token}`).then(setData).catch((e: Error) => setErr(e.message));
  }, [token]);
  if (err) return <div className="lobby"><p className="err">{err === 'no such replay' ? 'This replay link is not valid.' : err}</p><button onClick={onClose}>Back</button></div>;
  if (!data) return <div className="lobby"><p className="dim">Loading replay…</p></div>;
  return <Replay data={data} shareUrl={`${location.origin}/replay/${token}`} onClose={onClose} />;
}
