import { CHARACTER_BY_ID, type GameSummary, type ObjectiveKind, type ZombieType } from '@deadbolt/engine';
import { boardUrl } from './art';
import { Portrait, ZombieFace } from './Portrait';

const TYPES: ZombieType[] = ['shambler', 'sprinter', 'brute', 'mutant'];
const OBJECTIVE_NAME: Record<ObjectiveKind, string> = { keys: 'Keys', fuel: 'Fuel can', supplies: 'Supplies' };
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** End-of-game screen: the outcome, team totals, and a card for each survivor. */
export function SummaryModal({ summary, names, onClose, onReplay, onExit, exitLabel }: {
  summary: GameSummary;
  /** Player id (or seat) -> display name. */
  names: (owner: string) => string;
  onClose(): void;
  onReplay?: () => void;
  onExit(): void;
  exitLabel: string;
}) {
  const won = summary.outcome === 'won';
  const top = Math.max(0, ...summary.survivors.map((s) => s.killTotal));
  // Only a clear leader gets the tag.
  const leader = top > 0 && summary.survivors.filter((s) => s.killTotal === top).length === 1;
  return (
    <div className="modal-bg">
      <div className="modal summary">
        <h2 className={won ? 'sum-won' : 'sum-lost'}>{won ? 'You made it out!' : 'The block is lost.'}</h2>
        <p className="sub">
          {won ? 'The survivors escaped' : 'The survivors fell'} in round {summary.rounds}.
          {' '}{plural(summary.survivors.length - summary.survivorsLost, 'survivor')} {won ? 'made it' : 'still standing'}
          {summary.survivorsLost > 0 && <>, {summary.survivorsLost} lost</>}.
        </p>

        <div className="sum-team">
          <div className="sum-big"><b>{summary.killTotal}</b><span>zombies put down</span></div>
          {TYPES.filter((t) => summary.kills[t] > 0).map((t) => (
            <div key={t} className="sum-kind"><ZombieFace type={t} size={28} /><b>{summary.kills[t]}</b><span>{t}{summary.kills[t] === 1 ? '' : 's'}</span></div>
          ))}
          <div className="sum-big"><b>{summary.doorsOpened}</b><span>{summary.doorsOpened === 1 ? 'door' : 'doors'} opened</span></div>
        </div>

        <div className="sum-list">
          {summary.survivors.map((s) => (
            <div key={s.id} className={'sum-row' + (s.alive ? '' : ' down')}>
              <Portrait id={s.charId} size={44} />
              <div className="sum-main">
                <div className="sum-name">
                  <b>{CHARACTER_BY_ID[s.charId]?.name ?? s.charId}</b>
                  <span className="dim"> {names(s.owner)}</span>
                  {!s.alive && <span className="tag bad">fell</span>}
                  {leader && s.killTotal === top && <span className="tag">most kills</span>}
                </div>
                <div className="sum-stats">
                  <span>Level <b>{s.level}</b> <span className="dim">({s.xp} XP)</span></span>
                  <span><b>{s.killTotal}</b> {s.killTotal === 1 ? 'kill' : 'kills'}
                    {s.killTotal > 0 && <span className="dim"> ({TYPES.filter((t) => s.kills[t] > 0).map((t) => `${s.kills[t]} ${t}${s.kills[t] === 1 ? '' : 's'}`).join(', ')})</span>}
                  </span>
                  <span><b>{s.wounds}</b> {s.wounds === 1 ? 'wound' : 'wounds'} taken</span>
                  {s.healed > 0 && <span>healed <b>{s.healed}</b></span>}
                  {s.doorsOpened > 0 && <span>opened <b>{s.doorsOpened}</b> {s.doorsOpened === 1 ? 'door' : 'doors'}</span>}
                </div>
                {s.objectives.length > 0 && (
                  <div className="sum-objs">
                    {s.objectives.map((k, i) => <span key={i} className="sum-obj"><img src={boardUrl(k)} alt="" width="18" height="18" />{OBJECTIVE_NAME[k]}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sum-btns">
          {onReplay && <button className="primary" onClick={onReplay}>Watch replay</button>}
          <button onClick={onClose}>View the board</button>
          <button className={onReplay ? '' : 'primary'} onClick={onExit}>{exitLabel}</button>
        </div>
      </div>
    </div>
  );
}
