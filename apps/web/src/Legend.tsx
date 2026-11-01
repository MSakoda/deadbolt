import type { GameState } from '@deadbolt/engine';

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="30" height="30" viewBox="-15 -15 30 30" className="lg-ico">{children}</svg>
);

const ROWS: { icon: React.ReactNode; name: string; text: string }[] = [
  { icon: <Svg><circle r="11" fill="#7cb342" stroke="#0d1008" strokeWidth="2" /></Svg>, name: 'Shambler', text: 'Green dot. Slow zombie: 1 action a round, dies to any hit.' },
  { icon: <Svg><polygon points="0,-13 12,10 -12,10" fill="#d4e157" stroke="#0d1008" strokeWidth="2" /><text y="8" textAnchor="middle" fontSize="11" fontWeight="700">R</text></Svg>, name: 'Sprinter (R for runner)', text: 'Yellow triangle. Fast: moves or attacks twice a round. Dies to any hit.' },
  { icon: <Svg><rect x="-13" y="-13" width="26" height="26" rx="4" fill="#33691e" stroke="#0d1008" strokeWidth="2" /><text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#e6e9ef">B</text></Svg>, name: 'Brute (B)', text: 'Dark green square. Tough: needs a weapon that deals 2+ damage (axe, chainsaw, shotgun). It arrives with 2 Shamblers.' },
  { icon: <Svg><polygon points="0,-14 12,-7 12,7 0,14 -12,7 -12,-7" fill="#8e24aa" stroke="#0d1008" strokeWidth="2" /><text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">M</text></Svg>, name: 'Mutant (M)', text: 'Purple hexagon. Needs 3 damage in one hit. A Molotov kills it. Worth 5 XP.' },
  { icon: <Svg><circle r="12" fill="#4f9dff" stroke="#10131a" strokeWidth="2" /><text y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#10131a">D</text></Svg>, name: 'Survivor', text: 'Coloured circle with their initial. A white ring marks whose turn it is. A red W under it is a wound; two wounds and they are down.' },
  { icon: <Svg><rect x="-12" y="-12" width="24" height="24" rx="5" fill="#ffd54f" /><text y="6" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1b1b1b">?</text></Svg>, name: '? marker', text: 'Hidden objective. Stand in the zone and Take objective. One has the keys; the others hold a free item.' },
  { icon: <Svg><rect x="-12" y="-12" width="24" height="24" rx="5" fill="#ff7043" /><text y="6" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1b1b1b">F</text></Svg>, name: 'F: fuel can', text: 'In the Workshop. Take it to the truck.' },
  { icon: <Svg><rect x="-14" y="-4" width="28" height="8" rx="3" fill="#9a6a33" /></Svg>, name: 'Locked door', text: 'Brown bar. Needs a crowbar, axe or chainsaw in hand. The first opening of a building wakes every room inside.' },
  { icon: <Svg><rect x="-14" y="-4" width="28" height="8" rx="3" fill="none" stroke="#66bb6a" strokeWidth="2" /></Svg>, name: 'Open door', text: 'Green outline. Anyone can walk through; so can zombies.' },
  { icon: <Svg><circle r="11" fill="none" stroke="#ffb74d" strokeWidth="3" /></Svg>, name: 'Orange ring', text: 'A door you can open right now.' },
  { icon: <Svg><rect x="-13" y="-13" width="26" height="26" rx="5" fill="rgba(79,195,247,.2)" stroke="#4fc3f7" strokeWidth="3" /></Svg>, name: 'Blue zone', text: 'Click to move there (each zombie in your zone costs 1 extra action to leave).' },
  { icon: <Svg><rect x="-13" y="-13" width="26" height="26" rx="5" fill="rgba(255,82,82,.2)" stroke="#ff5252" strokeWidth="3" /></Svg>, name: 'Red zone', text: 'Click to attack it with the chosen weapon.' },
  { icon: <Svg><rect x="-13" y="-13" width="26" height="26" rx="5" fill="none" stroke="#c0392b" strokeWidth="2" /></Svg>, name: 'Red border', text: 'Zombie spawn point (Yard, and the Kitchen once the dining room is open). Fresh zombies appear here every round.' },
  { icon: <Svg><circle cx="-6" r="4" fill="#ffb300" /><circle cx="6" r="4" fill="#ffb300" /></Svg>, name: 'Yellow dots', text: 'Noise. Zombies with nothing in sight walk toward the noisiest zone. Survivors also count as noise.' },
];

export function Legend() {
  return (
    <div className="legend">
      <div className="lg-row"><div><b>How attacks work</b>
        <div className="dim">Each die hits when it rolls the weapon&rsquo;s number <i>or higher</i>. Hit chance per die: 3+ is 67%, 4+ is 50%, 5+ is 33%, 6+ is 17%. A single-die 4+ weapon (crowbar, axe, pistol, machete) misses half the time; the frying pan only hits on a 6.
        More dice means more chances: Sawed-off 2 dice at 3+, SMG 3 dice at 5+, Chainsaw 5 dice at 5+. A hit only kills if the weapon&rsquo;s damage meets the zombie&rsquo;s toughness. Hover any weapon or zombie to see the numbers.</div></div></div>
      {ROWS.map((r) => (
        <div key={r.name} className="lg-row">
          {r.icon}
          <div><b>{r.name}</b><div className="dim">{r.text}</div></div>
        </div>
      ))}
    </div>
  );
}

export function Goal({ state }: { state: GameState }) {
  const keys = state.team.keys, fuel = state.team.fuel;
  const markers = Object.entries(state.objectives).filter(([, t]) => t.hidden).length;
  const next = !keys || !fuel
    ? [!keys ? `find the keys (${markers} ? marker${markers === 1 ? '' : 's'} left)` : '', !fuel ? 'take the fuel (F) in the Workshop' : ''].filter(Boolean).join(', then ')
    : 'get EVERY living survivor to the East end, then use Start the truck';
  return (
    <div className="card goal">
      <b>Goal: escape in the truck</b>
      <ol>
        <li className={keys ? 'done' : ''}>Find the <b>keys</b>: they are under one of the three ? markers (Stock room, Bedroom, Flat).</li>
        <li className={fuel ? 'done' : ''}>Take the <b>fuel can</b> (F) from the Workshop.</li>
        <li>Move <b>all living survivors</b> to the <b>East end</b>, where the truck is parked, then spend an action to <b>Start the truck</b>.</li>
      </ol>
      <div className="next">Next: {next}.</div>
    </div>
  );
}
