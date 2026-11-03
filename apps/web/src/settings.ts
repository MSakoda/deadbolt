export interface Settings {
  /** Play the dice-roll animation for attacks. */
  dice: boolean;
  /** Play the zombie phase step by step instead of all at once. */
  zombies: boolean;
}

const KEY = 'deadbolt-settings-v1';

const defaults = (): Settings => {
  // People who ask their system for less motion start with animations off.
  const motion = !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return { dice: motion, zombies: motion };
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...defaults(), ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
  } catch {
    return defaults();
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
