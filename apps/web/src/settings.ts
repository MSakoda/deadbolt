export interface Settings {
  /** Play the dice-roll animation for attacks. */
  dice: boolean;
}

const KEY = 'deadbolt-settings-v1';

const defaults = (): Settings => ({
  // People who ask their system for less motion start with animations off.
  dice: !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches),
});

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
