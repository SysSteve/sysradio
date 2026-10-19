/** A station as delivered by the Rust side (radio-browser.info, camelCase). */
export interface Station {
  id: string;
  name: string;
  url: string;
  homepage: string;
  favicon: string;
  tags: string[];
  country: string;
  countryCode: string;
  language: string;
  codec: string;
  bitrate: number;
}

export interface SearchQuery {
  name: string;
  tag: string;
  countryCode: string;
  limit: number;
  offset: number;
}

export interface NowPlayingEvent {
  session: string;
  title: string;
}

export type TrayAction = { action: 'toggle' } | { action: 'play'; id: string };

export interface TrayState {
  tooltip: string;
  playing: boolean;
  favorites: { id: string; name: string }[];
  labels: { play: string; stop: string; favorites: string; show: string; quit: string };
}

export type Language = 'auto' | 'de' | 'en';

export interface Settings {
  volume: number;
  muted: boolean;
  lastStationId: string | null;
  resumeOnStart: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  compact: boolean;
  language: Language;
  announceTitles: boolean;
}

export interface LibraryData {
  favorites: Station[];
  recent: Station[];
}
