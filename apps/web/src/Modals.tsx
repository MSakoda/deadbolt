import { useState } from 'react';
import { CHARACTER_BY_ID, ITEMS } from '@deadbolt/engine';
import type { Action, Card, GameState, ItemId, Survivor } from '@deadbolt/engine';

export function itemStat(id: ItemId): string {
  const d = ITEMS[id];
  const parts: string[] = [];
  if (d.kind === 'melee' || d.kind === 'ranged') {
    parts.push(`${d.dice} die${d.dice === 1 ? '' : 's'}, ${d.accuracy}+, dmg ${d.damage}`);
    parts.push(d.kind === 'melee' ? 'melee' : `range ${d.range![0]}-${d.range![1]}`);
    if (d.noisy) parts.push('noisy');
    if (d.dual) parts.push('dual');
    if (d.reload) parts.push('reload');
    if (d.chooseTargets) parts.push('choose targets');
  }
  if (d.door !== 'none') parts.push(d.door === 'noisy' ? 'opens doors (noisy)' : 'opens doors (silent)');
  const notes: Partial<Record<ItemId, string>> = {
    molotov: 'kills every zombie in a zone at range 0-1, one use', goalie_mask: 'discard to cancel a wound',
    flashlight: 'search draws 2, keep 1', plenty_of_ammo: 'once per turn, reroll missed ranged dice',
    scope: 'combine with a rifle', glass_bottle: 'combine with gasoline', gasoline: 'combine with a glass bottle',
    wound: 'takes a slot, cannot be discarded or traded',
  };
  if (notes[id]) parts.push(notes[id]!);
  return parts.join(' · ');
}

export function CardChip({ card, selected, onClick, small }: { card: Card | null; selected?: boolean; onClick?: () => void; small?: boolean }) {
  const cls = ['chip', !card && 'empty', card?.item === 'wound' && 'wound', card?.spent && 'spent', selected && 'sel', small && 'small']
    .filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} title={card ? itemStat(card.item) : 'empty'} disabled={!onClick}>
      {card ? ITEMS[card.item].name : '—'}{card?.spent ? ' (spent)' : ''}
    </button>
  );
}

export function SearchModal({ state, actor, dispatch }: { state: GameState; actor: Survivor; dispatch(a: Action): void }) {
  const p = state.pending!;
  const full = actor.slots.every((s) => s !== null);
  const [replace, setReplace] = useState<number>(() => Math.max(2, actor.slots.findIndex((s) => s?.item !== 'wound' && s !== null)));
  return (
    <div className="modal-bg">
      <div className="modal">
        <h3>{CHARACTER_BY_ID[actor.charId]?.name} {p.source === 'supplies' ? 'opens the supplies' : 'searches'}</h3>
        <p className="dim">Keep one card or leave them all.{full ? ' Your pack is full: pick what to drop.' : ''}</p>
        <div className="row">
          {p.cards.map((c, i) => (
            <div key={c.id} className="found">
              <b>{ITEMS[c.item].name}</b>
              <small>{itemStat(c.item)}</small>
              <button className="primary" onClick={() => dispatch({ type: 'resolve_search', keep: i, ...(full ? { replaceSlot: replace } : {}) })}>Keep</button>
            </div>
          ))}
        </div>
        {full && (
          <label>Drop:{' '}
            <select value={replace} onChange={(e) => setReplace(Number(e.target.value))}>
              {actor.slots.map((c, i) => c && c.item !== 'wound' ? <option key={i} value={i}>{ITEMS[c.item].name} ({i < 2 ? 'hand' : 'pack'})</option> : null)}
            </select>
          </label>
        )}
        <div className="row"><button onClick={() => dispatch({ type: 'resolve_search', keep: null })}>Leave them</button></div>
      </div>
    </div>
  );
}

export function InventoryModal({ state, actor, dispatch, onClose, cost }: {
  state: GameState; actor: Survivor; dispatch(a: Action): void; onClose(): void; cost: string;
}) {
  const allies = Object.values(state.survivors).filter((v) => v.alive && v.id !== actor.id && v.zone === actor.zone);
  const [partner, setPartner] = useState<string>('');
  const ids = partner ? [actor.id, partner] : [actor.id];
  const [arr, setArr] = useState<Record<string, (Card | null)[]>>(() => {
    const o: Record<string, (Card | null)[]> = {};
    for (const v of [actor, ...allies]) o[v.id] = [...v.slots];
    return o;
  });
  const [sel, setSel] = useState<{ id: string; i: number } | null>(null);
  const [err, setErr] = useState('');

  const click = (id: string, i: number) => {
    if (!sel) { setSel({ id, i }); return; }
    const next: Record<string, (Card | null)[]> = {};
    for (const k of Object.keys(arr)) next[k] = [...arr[k]!];
    const a = next[sel.id]![sel.i] ?? null;
    const b = next[id]![i] ?? null;
    next[sel.id]![sel.i] = b;
    next[id]![i] = a;
    setArr(next);
    setSel(null);
  };
  const discard = () => {
    if (!sel) return;
    const next = { ...arr, [sel.id]: [...arr[sel.id]!] };
    next[sel.id]![sel.i] = null;
    setArr(next);
    setSel(null);
  };
  const apply = () => {
    const arrangements: Record<string, (string | null)[]> = {};
    for (const id of ids) arrangements[id] = arr[id]!.map((c) => c?.id ?? null);
    dispatch({ type: 'reorganize', arrangements });
    // dispatch reports errors through the toast; keep the modal open if it failed
    setErr('');
  };

  return (
    <div className="modal-bg">
      <div className="modal wide">
        <h3>Reorganize / trade <span className="dim">({cost})</span></h3>
        <p className="dim">Click one slot, then another to swap. Slots 1 and 2 are hands; weapons only work in hand. Items you remove with Discard go to the discard pile.</p>
        {allies.length > 0 && (
          <label>Trade with:{' '}
            <select value={partner} onChange={(e) => { setPartner(e.target.value); setSel(null); }}>
              <option value="">nobody</option>
              {allies.map((a) => <option key={a.id} value={a.id}>{CHARACTER_BY_ID[a.charId]?.name}</option>)}
            </select>
          </label>
        )}
        <div className="invgrid">
          {ids.map((id) => (
            <div key={id} className="invcol">
              <b>{CHARACTER_BY_ID[state.survivors[id]!.charId]?.name}</b>
              {arr[id]!.map((c, i) => (
                <div key={i} className="slotrow">
                  <span className="slotlabel">{i < 2 ? (i === 0 ? 'L hand' : 'R hand') : `pack ${i - 1}`}</span>
                  <CardChip card={c} selected={sel?.id === id && sel.i === i} onClick={() => click(id, i)} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button onClick={discard} disabled={!sel}>Discard selected</button>
          <button className="primary" onClick={apply}>Apply</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
