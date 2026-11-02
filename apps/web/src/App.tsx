import { useState } from 'react';
import { createGame } from '@deadbolt/engine';
import { Lobby, type LobbyResult } from './Lobby';
import { Game } from './Game';
import { OnlineApp } from './OnlineApp';
import { clear, load, save, type Saved } from './persist';
import { describeAll } from './log';

export function App() {
  const [game, setGame] = useState<Saved | null>(null);
  // Hot-seat is opt-in; the default is the online app.
  const [hotseat, setHotseat] = useState(false);
  const saved = load();

  const start = (r: LobbyResult) => {
    const { state, events } = createGame({
      seed: r.seed,
      survivors: r.survivors.map((s) => ({ charId: s.charId, owner: s.owner })),
    });
    const g: Saved = { state, log: describeAll(state, events), players: r.players };
    save(g);
    setGame(g);
  };

  if (!hotseat) return <OnlineApp onHotseat={() => setHotseat(true)} />;
  if (game) return <Game initial={game} onExit={() => { clear(); setGame(null); }} />;
  return <Lobby onStart={start} onResume={saved ? () => setGame(saved) : undefined} onBack={() => setHotseat(false)} />;
}
