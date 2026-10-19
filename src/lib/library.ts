import type { LibraryData, Settings, Station } from './types';

export const RECENT_MAX = 25;

export const defaultSettings: Settings = {
  volume: 0.8,
  muted: false,
  lastStationId: null,
  resumeOnStart: false,
  closeToTray: true,
  alwaysOnTop: false,
  compact: false,
  language: 'auto',
  announceTitles: false,
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
    compact: bool('compact'),
    language: value.language === 'de' || value.language === 'en' ? value.language : 'auto',
    announceTitles: bool('announceTitles'),
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
  const byId = new Map(fresh.map((s) => [s.id, s]));
  return list.map((s) => byId.get(s.id) ?? s);
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
