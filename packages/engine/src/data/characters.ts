import type { CharacterDef } from '../types';

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'dana', name: 'Dana Whitfield', role: 'Organizer',
    blurb: 'Runs the neighbourhood association and keeps everyone moving.',
    ladder: ['roll_call', 'second_wind', 'rally_point', 'plan_b'],
  },
  {
    id: 'ray', name: 'Ray Kowalski', role: 'Brawler',
    blurb: 'Warehouse foreman. Hits first, apologises later.',
    ladder: ['heavy_swing', 'thick_skin', 'crowd_breaker', 'frenzy'],
  },
  {
    id: 'lena', name: 'Lena Fischer', role: 'Marksman',
    blurb: 'Competitive shooter with a very steady hand.',
    ladder: ['steady_aim', 'practiced_hands', 'quiet_shot', 'clean_kill'],
  },
  {
    id: 'amara', name: 'Amara Boateng', role: 'Medic',
    blurb: 'Night-shift nurse. Calm when it counts.',
    ladder: ['first_aid', 'triage', 'steady_presence', 'field_hospital'],
  },
  {
    id: 'jonah', name: 'Jonah Park', role: 'Scout',
    blurb: 'Bike courier who knows every shortcut in town.',
    ladder: ['quick_feet', 'light_step', 'slip_past', 'sprint'],
  },
  {
    id: 'hannah', name: 'Hannah Brooks', role: 'Scavenger',
    blurb: 'Flea-market regular. Finds things other people walk past.',
    ladder: ['sharp_eye', 'deep_pockets', 'quiet_hands', 'second_look'],
  },
];

export const CHARACTER_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
);

export const ABILITY_TEXT: Record<string, { name: string; text: string }> = {
  roll_call: { name: 'Roll Call', text: 'Once per turn, one other survivor in your zone gets 1 free move.' },
  second_wind: { name: 'Second Wind', text: 'Once per round, a survivor in your zone rerolls one missed die.' },
  rally_point: { name: 'Rally Point', text: 'Once per turn, a survivor in your zone gets 1 free action.' },
  plan_b: { name: 'Plan B', text: '+1 action each turn.' },
  heavy_swing: { name: 'Heavy Swing', text: '+1 die on melee attacks.' },
  thick_skin: { name: 'Thick Skin', text: 'Ignore the first wound each round.' },
  crowd_breaker: { name: 'Crowd Breaker', text: '1 free melee action each turn.' },
  frenzy: { name: 'Frenzy', text: 'Once per turn, a melee kill gives a free melee attack.' },
  steady_aim: { name: 'Steady Aim', text: 'Reroll one missed die on each ranged attack.' },
  practiced_hands: { name: 'Practiced Hands', text: '+1 die on ranged attacks.' },
  quiet_shot: { name: 'Quiet Shot', text: 'Your first ranged attack each turn makes no noise.' },
  clean_kill: { name: 'Clean Kill', text: 'Ranged attacks deal +1 damage.' },
  first_aid: { name: 'First Aid', text: 'Once per turn, free action: remove 1 Wounded card from a survivor in your zone.' },
  triage: { name: 'Triage', text: 'First Aid twice per turn.' },
  steady_presence: { name: 'Steady Presence', text: 'Once per round, cancel one wound dealt to a survivor in your zone.' },
  field_hospital: { name: 'Field Hospital', text: 'First Aid removes 2 Wounded cards.' },
  quick_feet: { name: 'Quick Feet', text: '1 free move each turn.' },
  light_step: { name: 'Light Step', text: 'You do not count as a noise token.' },
  slip_past: { name: 'Slip Past', text: 'Leaving a zone with zombies costs no extra actions.' },
  sprint: { name: 'Sprint', text: 'A second free move each turn.' },
  sharp_eye: { name: 'Sharp Eye', text: 'Searching draws 2 cards, keep 1.' },
  deep_pockets: { name: 'Deep Pockets', text: '+1 backpack slot.' },
  quiet_hands: { name: 'Quiet Hands', text: 'Opening doors makes no noise.' },
  second_look: { name: 'Second Look', text: 'You may search a second time each turn.' },
};
