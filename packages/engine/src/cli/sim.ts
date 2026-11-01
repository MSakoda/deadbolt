import { createGame, defaultSurvivorsPerPlayer } from '../setup';
import { applyAction } from '../apply';
import { chooseAction } from '../bot';
import { renderBoard } from '../render';
import { CHARACTERS } from '../data/characters';
import type { GameState } from '../types';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const games = Number(arg('games', '100'));
const players = Number(arg('players', '4'));
const seed0 = Number(arg('seed', '1'));
const maxRounds = Number(arg('max-rounds', '40'));
const watch = flag('watch');
const survivorCount = Number(arg('survivors', String(Math.min(6, players * defaultSurvivorsPerPlayer(players)))));

function play(seed: number): { state: GameState; actions: number } {
  const survivors = CHARACTERS.slice(0, survivorCount).map((c, i) => ({ charId: c.id, owner: `p${i % players}` }));
  let { state } = createGame({ seed, survivors });
  let actions = 0;
  while (state.status === 'active' && state.round <= maxRounds && actions < 20000) {
    const a = chooseAction(state);
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`bot chose an illegal action ${JSON.stringify(a)}: ${r.error}`);
    state = r.state;
    actions++;
    if (watch && (a.type === 'end_turn' || state.status !== 'active')) {
      console.log(renderBoard(state) + '\n');
    }
  }
  return { state, actions };
}

let won = 0, lost = 0, stalled = 0, rounds = 0, deaths = 0;
for (let g = 0; g < games; g++) {
  const { state } = play(seed0 + g);
  if (state.status === 'won') won++;
  else if (state.status === 'lost') lost++;
  else stalled++;
  rounds += state.round;
  deaths += Object.values(state.survivors).filter((v) => !v.alive).length;
}
console.log(`${games} games, ${survivorCount} survivors, seed ${seed0}+`);
console.log(`won ${won} (${((won / games) * 100).toFixed(0)}%), lost ${lost}, stalled ${stalled}`);
console.log(`avg rounds ${(rounds / games).toFixed(1)}, avg deaths ${(deaths / games).toFixed(2)}`);
