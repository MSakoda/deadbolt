import { ABILITY_TEXT, CHARACTER_BY_ID, DANGER_NAMES, ITEMS, LEVEL_XP, woundCount } from '@deadbolt/engine';
import type { Card, Survivor, TurnState } from '@deadbolt/engine';
import { SURVIVOR_COLORS } from './Board';
import { itemStat } from './Modals';
import { ItemIcon, portraitUrl } from './Portrait';
import { weaponInfo } from './info';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** XP track: one segment per level, each filling up to the next threshold. */
function XpTicker({ xp, level }: { xp: number; level: number }) {
  const marks = [0, ...LEVEL_XP];
  return (
    <div className="xp" title={`${xp} XP`}>
      <div className="xp-track">
        {LEVEL_XP.map((hi, i) => {
          const lo = marks[i]!;
          const pct = level > i ? 100 : Math.max(0, Math.min(100, ((xp - lo) / (hi - lo)) * 100));
          return (
            <div key={i} className="xp-seg" style={{ flexGrow: i === 2 ? 2 : 1 }}>
              <div className="xp-fill" style={{ width: pct + '%' }} />
            </div>
          );
        })}
      </div>
      <div className="xp-marks">
        {[0, ...LEVEL_XP].map((n, i) => (
          <span key={n} style={{ flexGrow: i === 3 ? 0 : i === 2 ? 2 : 1 }} className={level >= i ? 'on' : ''}>
            {n}<small> {DANGER_NAMES[i]}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function Hearts({ wounds }: { wounds: number }) {
  return (
    <div className="hearts" title={`${wounds} of 2 wounds`}>
      {[0, 1].map((i) => <span key={i} className={'heart' + (i < 2 - wounds ? '' : ' lost')}>&#9829;</span>)}
    </div>
  );
}

function Hand({ label, card, actor }: { label: string; card: Card | null; actor: Survivor }) {
  const w = weaponInfo(actor, card);
  return (
    <div className={'hand' + (card ? '' : ' empty') + (card?.item === 'wound' ? ' wound' : '') + (card?.spent ? ' spent' : '')} title={card ? itemStat(card.item) : 'empty'}>
      <small>{label}</small>
      {card && <ItemIcon id={card.item} size={64} />}
      <b>{card ? ITEMS[card.item].name : '—'}</b>
      {card?.spent && <em>spent, reload</em>}
      {w && <span>{w.dice} {w.dice === 1 ? 'die' : 'dice'} · {w.need}+ · dmg {w.dmg}<br />{w.melee ? 'melee' : w.range}</span>}
    </div>
  );
}

export function SurvivorCard({ actor, turn, owner, zone }: { actor: Survivor; turn?: TurnState | null; owner: string; zone: string }) {
  const ch = CHARACTER_BY_ID[actor.charId]!;
  const color = hex(SURVIVOR_COLORS[actor.charId] ?? 0xcccccc);
  const wounds = woundCount(actor);
  return (
    <div className="scard" style={{ ['--sc' as string]: color }}>
      <div className="sc-head">
        <div><b>{ch.name}</b> <span className="dim">{ch.role}</span></div>
        <div className="dim">{owner} &middot; in {zone}</div>
      </div>

      {turn && (
        <div className="pips">
          {Array.from({ length: Math.max(turn.actionsLeft, 0) }, (_, i) => <span key={i} className="pip" />)}
          <span className="dim"> {turn.actionsLeft} action{turn.actionsLeft === 1 ? '' : 's'}</span>
          {turn.free.move > 0 && <span className="tag">+{turn.free.move} free move</span>}
          {turn.free.melee > 0 && <span className="tag">+{turn.free.melee} free melee</span>}
        </div>
      )}

      <div className="sc-main">
        <Hand label="Left hand" card={actor.slots[0] ?? null} actor={actor} />
        <div className="sc-center">
          <div className="portrait">
            <img src={portraitUrl(actor.charId)} alt={ch.name} />
            <span className="lvl">L{actor.level}</span>
          </div>
          <div className="skills">
            {ch.ladder.map((a, i) => {
              const on = actor.level >= i;
              return (
                <div key={a} className={'skill' + (on ? '' : ' locked')} title={ABILITY_TEXT[a]?.text}>
                  <b>{ABILITY_TEXT[a]?.name}</b>
                  <small>{on ? ABILITY_TEXT[a]?.text : `Unlocks at ${DANGER_NAMES[i]}`}</small>
                </div>
              );
            })}
          </div>
        </div>
        <Hand label="Right hand" card={actor.slots[1] ?? null} actor={actor} />
      </div>

      <div className="sc-foot">
        <div className="sc-xp"><small>Experience</small><XpTicker xp={actor.xp} level={actor.level} /></div>
        <div className="sc-hp"><small>Health</small><Hearts wounds={wounds} /></div>
      </div>

      <div className="sc-pack">
        <small>Pack</small>
        <div>
          {actor.slots.slice(2).map((c, i) => (
            <div key={i} className={'pk' + (c ? '' : ' empty') + (c?.item === 'wound' ? ' wound' : '')} title={c ? itemStat(c.item) : 'empty'}>
              {c && <ItemIcon id={c.item} size={40} />}
              {c ? ITEMS[c.item].name : '—'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
