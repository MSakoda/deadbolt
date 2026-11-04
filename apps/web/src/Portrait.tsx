import { SURVIVOR_COLORS } from './Board';
import { itemUrl, ITEM_ART, portraitUrl, zombieUrl, ZOMBIE_ART } from './art';

export { portraitUrl };

const ZOMBIE_RING: Record<string, string> = { shambler: '#7cb342', sprinter: '#d4e157', brute: '#33691e', mutant: '#8e24aa' };

/** Round headshot with a ring in the survivor's board colour. */
export function Portrait({ id, size = 28, className = '' }: { id: string; size?: number; className?: string }) {
  const color = '#' + (SURVIVOR_COLORS[id] ?? 0xcccccc).toString(16).padStart(6, '0');
  return (
    <img
      className={'pimg ' + className}
      src={portraitUrl(id)}
      alt=""
      width={size}
      height={size}
      style={{ borderColor: color }}
    />
  );
}

/** Round zombie face with a ring in the zombie type's colour; a plain coloured dot until its art exists. */
export function ZombieFace({ type, size = 28 }: { type: string; size?: number }) {
  const color = ZOMBIE_RING[type] ?? '#888';
  if (!ZOMBIE_ART.includes(type)) {
    return <span className="pimg" style={{ width: size, height: size, background: color, borderColor: '#0d1008', display: 'inline-block' }} />;
  }
  return <img className="pimg zface" src={zombieUrl(type)} alt="" width={size} height={size} style={{ borderColor: color }} />;
}

/** Item picture, at most `size` px and shrinking to fit a narrow slot. Renders nothing until the item has art. */
export function ItemIcon({ id, size = 48 }: { id: string; size?: number }) {
  if (!ITEM_ART.includes(id)) return null;
  return <img className="iicon" src={itemUrl(id)} alt="" style={{ ['--isz' as string]: size + 'px' }} />;
}
