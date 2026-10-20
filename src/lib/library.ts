import { defaultEq, restoreEq } from './eq';
import { defaultShortcuts, restoreShortcuts } from './keybindings';
import {
  CUSTOM_PREFIX,
  type LibraryData,
  type ResolvedStream,
  type Settings,
  type Station,
} from './types';

export const RECENT_MAX = 25;

export const defaultSettings: Settings = {
  volume: 0.8,
  muted: false,
  lastStationId: null,
  resumeOnStart: false,
  closeToTray: true,
  alwaysOnTop: false,
  mini: false,
  language: 'auto',
  announceTitles: false,
  visualizer: true,
  eq: defaultEq,
  shortcuts: defaultShortcuts(),
};

export const emptyLibrary: LibraryData = { favorites: [], recent: [] };

/** Stored data may come from an older version or be damaged; keep what is usable. */
export function restoreSettings(raw: unknown): Settings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof Settings, unknown>
  >;
  const bool = (key: keyof Settings) =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : (defaultSettings[key] as boolean);
  const volume =
    typeof value.volume === 'number' && Number.isFinite(value.volume)
      ? value.volume
      : defaultSettings.volume;
  return {
    volume: Math.min(1, Math.max(0, volume)),
    muted: bool('muted'),
    lastStationId: typeof value.lastStationId === 'string' ? value.lastStationId : null,
    resumeOnStart: bool('resumeOnStart'),
    closeToTray: bool('closeToTray'),
    alwaysOnTop: bool('alwaysOnTop'),
    mini: bool('mini'),
    language: ['de', 'en', 'es', 'fr'].includes(value.language as string)
      ? (value.language as Settings['language'])
      : 'auto',
    announceTitles: bool('announceTitles'),
    visualizer: bool('visualizer'),
    eq: restoreEq(value.eq),
    shortcuts: restoreShortcuts(value.shortcuts),
  };
}

function isStation(value: unknown): value is Station {
  const s = value as Station;
  return !!s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.url === 'string';
}

export function restoreLibrary(raw: unknown): LibraryData {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof LibraryData, unknown>
  >;
  const list = (v: unknown) => (Array.isArray(v) ? uniqueById(v.filter(isStation)) : []);
  return { favorites: list(value.favorites), recent: list(value.recent).slice(0, RECENT_MAX) };
}

function uniqueById(list: Station[]): Station[] {
  const seen = new Set<string>();
  return list.filter((s) => !seen.has(s.id) && seen.add(s.id));
}

export function isFavorite(lib: LibraryData, id: string): boolean {
  return lib.favorites.some((s) => s.id === id);
}

export function addFavorite(
  lib: LibraryData,
  station: Station,
  index = lib.favorites.length,
): LibraryData {
  if (isFavorite(lib, station.id)) return lib;
  const favorites = [...lib.favorites];
  favorites.splice(Math.min(Math.max(index, 0), favorites.length), 0, station);
  return { ...lib, favorites };
}

export function removeFavorite(lib: LibraryData, id: string): LibraryData {
  return { ...lib, favorites: lib.favorites.filter((s) => s.id !== id) };
}

export function toggleFavorite(lib: LibraryData, station: Station): LibraryData {
  return isFavorite(lib, station.id) ? removeFavorite(lib, station.id) : addFavorite(lib, station);
}

/** Moves a favourite to position `to` (drag and drop). */
export function moveFavoriteTo(lib: LibraryData, id: string, to: number): LibraryData {
  const from = lib.favorites.findIndex((s) => s.id === id);
  const target = Math.min(Math.max(to, 0), lib.favorites.length - 1);
  if (from < 0 || from === target) return lib;
  const favorites = [...lib.favorites];
  const [item] = favorites.splice(from, 1);
  favorites.splice(target, 0, item!);
  return { ...lib, favorites };
}

/** Moves a favourite by `delta` places (−1 up, +1 down); stays put at the ends. */
export function moveFavorite(lib: LibraryData, id: string, delta: number): LibraryData {
  const from = lib.favorites.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= lib.favorites.length) return lib;
  const favorites = [...lib.favorites];
  const [item] = favorites.splice(from, 1);
  favorites.splice(to, 0, item!);
  return { ...lib, favorites };
}

export function pushRecent(lib: LibraryData, station: Station): LibraryData {
  const recent = [station, ...lib.recent.filter((s) => s.id !== station.id)].slice(0, RECENT_MAX);
  return { ...lib, recent };
}

export function clearRecent(lib: LibraryData): LibraryData {
  return { ...lib, recent: [] };
}

/**
 * Applies fresh directory data (new stream URL, logo) to stored stations. Stations the
 * directory no longer knows are kept as they are: a favourite never disappears by itself.
 */
export function refreshStations(list: Station[], fresh: Station[]): Station[] {
  // Own stations are not in the directory; fresh data never matches them.
  const byId = new Map(fresh.map((s) => [s.id, s]));
  return list.map((s) => byId.get(s.id) ?? s);
}

export function isCustom(station: Station): boolean {
  return station.id.startsWith(CUSTOM_PREFIX);
}

/** A station the user added by address (checked by the Rust side first). */
export function customStation(
  input: { name: string; favicon: string },
  stream: ResolvedStream,
  id = `${CUSTOM_PREFIX}${crypto.randomUUID()}`,
): Station {
  return {
    id,
    name: input.name.trim() || stream.name.trim() || new URL(stream.url).hostname,
    url: stream.url,
    homepage: '',
    favicon: input.favicon.trim(),
    tags: [],
    country: '',
    countryCode: '',
    language: '',
    codec: stream.hls ? 'HLS' : stream.codec,
    bitrate: stream.bitrate,
    hls: stream.hls,
  };
}

/** Replaces a station everywhere (after editing an own station). */
export function replaceStation(lib: LibraryData, station: Station): LibraryData {
  const swap = (list: Station[]) => list.map((s) => (s.id === station.id ? station : s));
  return { favorites: swap(lib.favorites), recent: swap(lib.recent) };
}

/** Neighbour in the favourites, for the media keys "next" and "previous". */
export function neighbourFavorite(
  lib: LibraryData,
  currentId: string | null,
  delta: 1 | -1,
): Station | null {
  const list = lib.favorites;
  if (list.length === 0) return null;
  const index = list.findIndex((s) => s.id === currentId);
  if (index < 0) return list[delta === 1 ? 0 : list.length - 1]!;
  return list[(index + delta + list.length) % list.length]!;
}

/** "DE · MP3 128 kbit/s · pop, rock" */
export function stationMeta(station: Station): string {
  const audio = [station.codec, station.bitrate > 0 ? `${station.bitrate} kbit/s` : '']
    .filter(Boolean)
    .join(' ');
  return [station.countryCode, audio, station.tags.slice(0, 3).join(', ')]
    .filter(Boolean)
    .join(' · ');
}
