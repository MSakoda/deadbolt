const base = import.meta.env.BASE_URL;

export const portraitUrl = (charId: string): string => `${base}portraits/${charId}.png`;
export const zombieUrl = (type: string): string => `${base}zombies/${type}.png`;

/** Zombie types that have artwork. Others fall back to a coloured shape. Add brute and mutant once their art is in public/zombies. */
export const ZOMBIE_ART: readonly string[] = ['shambler', 'sprinter'];
