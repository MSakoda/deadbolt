import { describe, it, expect } from 'vitest';
import { visible, distances, neighbors } from '../src';
import { mk } from './helpers';

describe('map and line of sight', () => {
  it('sees the whole street from the west end', () => {
    const s = mk();
    const v = visible(s, 'west_end');
    expect(v.get('main_street')).toBe(1);
    expect(v.get('crossroads')).toBe(2);
    expect(v.get('east_end')).toBe(3);
  });
  it('sees through the open shop door but not closed doors', () => {
    const s = mk();
    const v = visible(s, 'west_end');
    expect(v.get('shop')).toBe(1);
    expect(v.has('lobby')).toBe(false);
    s.doors['door_lobby'] = true;
    expect(visible(s, 'west_end').get('lobby')).toBe(1);
  });
  it('indoors sees only one zone through an opening', () => {
    const s = mk();
    s.doors['door_stock_shop'] = true;
    const v = visible(s, 'stock_room');
    expect(v.get('shop')).toBe(1);
    expect(v.has('west_end')).toBe(false);
  });
  it('sight out of a building crosses street zones and one zone inside', () => {
    const s = mk();
    s.doors['door_lobby'] = true;
    s.doors['door_lobby_flat'] = true;
    const v = visible(s, 'shop');
    expect(v.get('west_end')).toBe(1);
    expect(v.get('lobby')).toBe(2);
    expect(v.has('flat')).toBe(false);
  });
  it('closed doors block movement and pathing', () => {
    const s = mk();
    expect(neighbors(s, 'west_end').sort()).toEqual(['main_street', 'shop']);
    expect(distances(s, 'west_end').has('lobby')).toBe(false);
    s.doors['door_lobby'] = true;
    expect(distances(s, 'west_end').get('lobby')).toBe(1);
  });
  it('the yard is open to the street and blocked fence/rubble columns do not exist', () => {
    const s = mk();
    expect(neighbors(s, 'main_street')).toContain('yard');
    expect(visible(s, 'main_street').get('yard')).toBe(1);
    expect(visible(s, 'east_end').size).toBe(4);
  });
});
