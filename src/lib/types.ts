/** A station as delivered by the Rust side (radio-browser.info, camelCase) or added by hand. */
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
  /** HTTP Live Streaming (`.m3u8`) instead of one continuous stream. */
  hls?: boolean;
}

/** Stations added by the user carry ids with this prefix. */
export const CUSTOM_PREFIX = 'custom:';

export interface SearchQuery {
  name: string;
  tag: string;
  countryCode: string;
  /** A region: several countries at once (overrides countryCode). */
  countryCodes: string[];
  /** Directory language name, e.g. `german`. */
  language: string;
  order: SearchOrder;
  limit: number;
  offset: number;
}

export type SearchOrder = 'clickcount' | 'votes' | 'clicktrend' | 'bitrate' | 'name';

/** A filter value with its station count (countries, languages). */
export interface Facet {
  value: string;
  code: string;
  name: string;
  count: number;
}

/** Result of checking a stream address the user typed in. */
export interface ResolvedStream {
  url: string;
  hls: boolean;
  name: string;
  codec: string;
  bitrate: number;
}

export type ResolveErrorCode = 'invalid_url' | 'unreachable' | 'not_audio' | 'empty_playlist';

export interface NowPlayingEvent {
  session: string;
  title: string;
}

export type TrayAction = { action: 'toggle' } | { action: 'mini' } | { action: 'play'; id: string };

export interface TrayState {
  tooltip: string;
  playing: boolean;
  mini: boolean;
  favorites: { id: string; name: string }[];
  labels: {
    play: string;
    stop: string;
    favorites: string;
    miniOn: string;
    miniOff: string;
    show: string;
    quit: string;
  };
}

export type Language = 'auto' | 'de' | 'en' | 'es' | 'fr';

/** A key combination, recorded from a real key press. */
export interface KeyBinding {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** `KeyboardEvent.code` (physical key), used for system-wide shortcuts. */
  code: string;
  /** `KeyboardEvent.key` (character on this layout), used inside the app and for display. */
  key: string;
}

export type ShortcutAction =
  'toggle' | 'mute' | 'volumeUp' | 'volumeDown' | 'next' | 'previous' | 'mini' | 'show';

export interface Shortcut {
  /** Inside the app windows. */
  local: KeyBinding | null;
  /** System-wide, also while SysRadio is in the background. */
  global: KeyBinding | null;
}

export type Shortcuts = Record<ShortcutAction, Shortcut>;

export interface EqPreset {
  id: string;
  name: string;
  /** Gain in dB per band (see EQ_BANDS). */
  gains: number[];
}

export interface EqSettings {
  enabled: boolean;
  /** Built-in or custom preset id; `manual` after moving a slider. */
  presetId: string;
  gains: number[];
  custom: EqPreset[];
}

export interface Settings {
  volume: number;
  muted: boolean;
  lastStationId: string | null;
  resumeOnStart: boolean;
  closeToTray: boolean;
  alwaysOnTop: boolean;
  /** Floating player instead of the main window. */
  mini: boolean;
  language: Language;
  announceTitles: boolean;
  visualizer: boolean;
  eq: EqSettings;
  shortcuts: Shortcuts;
}

export interface LibraryData {
  favorites: Station[];
  recent: Station[];
}

/** What the main window tells the floating player. */
export interface PlayerSnapshot {
  station: { name: string; logo: string } | null;
  status: 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'error';
  title: string;
  volume: number;
  muted: boolean;
  favorite: boolean;
  hasFavorites: boolean;
  locale: Exclude<Language, 'auto'>;
  visualizer: boolean;
  shortcuts: Shortcuts;
}

/** What the floating player asks the main window to do. */
export type PlayerCommand =
  | { type: ShortcutAction }
  | { type: 'setVolume'; volume: number }
  | { type: 'favorite' }
  | { type: 'hello' };
