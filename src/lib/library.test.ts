import { describe, expect, it } from 'vitest';
import {
  RECENT_MAX,
  addFavorite,
  defaultSettings,
  emptyLibrary,
  customStation,
  moveFavorite,
  moveFavoriteTo,
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

  it('drops a favourite at any position', () => {
    const list = lib(a, b, c);
    expect(moveFavoriteTo(list, a.id, 2).favorites.map((s) => s.id)).toEqual([b.id, c.id, a.id]);
    expect(moveFavoriteTo(list, c.id, -5).favorites.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
    expect(moveFavoriteTo(list, b.id, 1)).toBe(list);
  });

  it('builds own stations from a checked address', () => {
    const own = customStation(
      { name: '  ', favicon: '' },
      {
        url: 'https://stream.example/live',
        hls: false,
        name: 'Test FM',
        codec: 'MP3',
        bitrate: 128,
      },
      'custom:1',
    );
    expect(own).toMatchObject({
      id: 'custom:1',
      name: 'Test FM',
      codec: 'MP3',
      bitrate: 128,
      hls: false,
    });
    const hls = customStation(
      { name: 'Mein Sender', favicon: 'https://x/logo.png' },
      { url: 'https://cdn.example/a.m3u8', hls: true, name: '', codec: '', bitrate: 0 },
      'custom:2',
    );
    expect(hls).toMatchObject({
      name: 'Mein Sender',
      codec: 'HLS',
      hls: true,
      favicon: 'https://x/logo.png',
    });
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
    expect(restoreSettings({ volume: 7, language: 'xx', muted: 'yes', mini: true })).toEqual({
      ...defaultSettings,
      volume: 1,
      mini: true,
    });
    expect(restoreSettings({ language: 'fr' }).language).toBe('fr');
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
