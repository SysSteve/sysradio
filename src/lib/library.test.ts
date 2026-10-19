import { describe, expect, it } from 'vitest';
import {
  RECENT_MAX,
  addFavorite,
  defaultSettings,
  emptyLibrary,
  moveFavorite,
  neighbourFavorite,
  pushRecent,
  refreshStations,
  removeFavorite,
  restoreLibrary,
  restoreSettings,
  stationMeta,
  toggleFavorite,
} from './library';
import { sampleStations } from './samples';

const [a, b, c] = sampleStations as [
  (typeof sampleStations)[0],
  (typeof sampleStations)[0],
  (typeof sampleStations)[0],
];
const lib = (...favorites: typeof sampleStations) => ({ ...emptyLibrary, favorites });

describe('favourites', () => {
  it('adds once, removes and toggles', () => {
    const one = addFavorite(emptyLibrary, a);
    expect(addFavorite(one, a)).toBe(one);
    expect(removeFavorite(one, a.id).favorites).toEqual([]);
    expect(toggleFavorite(toggleFavorite(emptyLibrary, b), b).favorites).toEqual([]);
  });

  it('re-inserts at the old place (undo)', () => {
    expect(addFavorite(lib(a, c), b, 1).favorites.map((s) => s.id)).toEqual([a.id, b.id, c.id]);
  });

  it('moves up and down and stays put at the ends', () => {
    const list = lib(a, b, c);
    expect(moveFavorite(list, c.id, -1).favorites.map((s) => s.id)).toEqual([a.id, c.id, b.id]);
    expect(moveFavorite(list, a.id, -1)).toBe(list);
    expect(moveFavorite(list, c.id, 1)).toBe(list);
  });

  it('cycles through favourites for the media keys', () => {
    const list = lib(a, b, c);
    expect(neighbourFavorite(list, c.id, 1)?.id).toBe(a.id);
    expect(neighbourFavorite(list, a.id, -1)?.id).toBe(c.id);
    expect(neighbourFavorite(list, 'unknown', 1)?.id).toBe(a.id);
    expect(neighbourFavorite(emptyLibrary, null, 1)).toBeNull();
  });

  it('never drops a favourite the directory no longer knows', () => {
    const fresh = { ...b, url: 'https://new.example/stream' };
    expect(refreshStations([a, b], [fresh])).toEqual([a, fresh]);
  });
});

describe('history', () => {
  it('puts the latest first without duplicates and keeps a limit', () => {
    let list = emptyLibrary;
    for (const s of [a, b, a]) list = pushRecent(list, s);
    expect(list.recent.map((s) => s.id)).toEqual([a.id, b.id]);
    for (let i = 0; i < RECENT_MAX + 5; i++) list = pushRecent(list, { ...a, id: `x${i}` });
    expect(list.recent).toHaveLength(RECENT_MAX);
  });
});

describe('restoring stored data', () => {
  it('falls back to defaults for damaged settings', () => {
    expect(restoreSettings(null)).toEqual(defaultSettings);
    expect(restoreSettings({ volume: 7, language: 'xx', muted: 'yes', compact: true })).toEqual({
      ...defaultSettings,
      volume: 1,
      compact: true,
    });
  });

  it('keeps only valid, unique stations', () => {
    const restored = restoreLibrary({ favorites: [a, a, { id: 1 }, 'x'], recent: 'nope' });
    expect(restored).toEqual({ favorites: [a], recent: [] });
  });
});

it('describes a station in one line', () => {
  expect(stationMeta(a)).toBe('DE · MP3 128 kbit/s · pop, hits');
  expect(stationMeta({ ...a, codec: '', bitrate: 0, tags: [], countryCode: '' })).toBe('');
});
