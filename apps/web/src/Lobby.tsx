import { useState } from 'react';
import { ABILITY_TEXT, CHARACTERS, defaultSurvivorsPerPlayer } from '@deadbolt/engine';
import { SURVIVOR_COLORS } from './Board';
import { Rulebook } from './Rulebook';

export interface LobbyResult {
  seed: number;
  players: string[];
  survivors: { charId: string; owner: string }[];
}

interface Row { charId: string; on: boolean; owner: number }

export function Lobby({ onStart, onResume }: { onStart(r: LobbyResult): void; onResume?: () => void }) {
  const [players, setPlayers] = useState<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
  const [rows, setRows] = useState<Row[]>(() =>
    CHARACTERS.map((c, i) => ({ charId: c.id, on: i < 4, owner: i % 4 })),
  );
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [open, setOpen] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

  const chosen = rows.filter((r) => r.on);
  const valid = chosen.length >= 1 && chosen.length <= 6 && players.length >= 1;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
  };
  const auto = () => {
    const per = defaultSurvivorsPerPlayer(players.length);
    const total = Math.min(6, per * players.length);
    setRows(rows.map((r, i) => ({ ...r, on: i < total, owner: Math.floor(i / per) % players.length })));
  };

  return (
    <div className="lobby">
      <h1>Deadbolt</h1>
      <p className="sub">The Long Block &middot; easy &middot; 2 to 6 players, fully cooperative. This is the hot-seat version: everyone shares one screen.</p>

      <section>
        <h2>Players</h2>
        <div className="players">
          {players.map((p, i) => (
            <input key={i} value={p} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <button disabled={players.length >= 6} onClick={() => setPlayers([...players, `Player ${players.length + 1}`])}>+</button>
          <button
            disabled={players.length <= 1}
            onClick={() => {
              setPlayers(players.slice(0, -1));
              setRows(rows.map((r) => ({ ...r, owner: Math.min(r.owner, players.length - 2) })));
            }}
          >&minus;</button>
          <button onClick={auto} title="Use the base-game table for survivors per player">Auto-assign</button>
        </div>
      </section>

      <section>
        <h2>Survivors <span className="dim">(turn order is fixed from the top down, 1 to 6 survivors)</span></h2>
        {rows.map((r, i) => {
          const c = CHARACTERS.find((x) => x.id === r.charId)!;
          return (
            <div key={r.charId} className={'srow' + (r.on ? '' : ' off')}>
              <input type="checkbox" checked={r.on} onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
              <span className="dot" style={{ background: '#' + (SURVIVOR_COLORS[c.id] ?? 0xcccccc).toString(16).padStart(6, '0') }} />
              <button className="link" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.name} &middot; {c.role}</button>
              <select value={r.owner} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, owner: Number(e.target.value) } : x)))}>
                {players.map((p, k) => <option key={k} value={k}>{p}</option>)}
              </select>
              <button onClick={() => move(i, -1)} aria-label="up">&uarr;</button>
              <button onClick={() => move(i, 1)} aria-label="down">&darr;</button>
              {open === c.id && (
                <div className="ladder">
                  <p className="dim">{c.blurb}</p>
                  {c.ladder.map((a, k) => (
                    <div key={a}><b>{['Start', 'Restless', 'Swarming', 'Overrun'][k]}:</b> {ABILITY_TEXT[a]?.name}. {ABILITY_TEXT[a]?.text}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="start">
        <label>Seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} /></label>
        <button className="primary" disabled={!valid} onClick={() => onStart({
          seed, players,
          survivors: chosen.map((r) => ({ charId: r.charId, owner: String(r.owner) })),
        })}>Start game</button>
        <button onClick={() => setRules(true)}>Rulebook</button>
        {onResume && <button onClick={onResume}>Resume saved game</button>}
        {!valid && <span className="err">Choose between 1 and 6 survivors.</span>}
      </section>
      {rules && <Rulebook onClose={() => setRules(false)} />}
    </div>
  );
}
