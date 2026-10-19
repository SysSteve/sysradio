import { resolveLocale, systemCountry, translator } from './i18n';
import * as lib from './library';
import { Player, type AudioLike } from './player.svelte';
import type { Platform } from './platform';
import type { LibraryData, Settings, Station } from './types';

export type Tab = 'favorites' | 'search' | 'recent' | 'settings';

/** An undoable change, shown as a short notice with an "Undo" button. */
export interface Notice {
  text: string;
  undo?: () => void;
}

/** Application state shared by all components. */
export class AppState {
  settings = $state<Settings>({ ...lib.defaultSettings });
  library = $state<LibraryData>({ ...lib.emptyLibrary });
  tab = $state<Tab>('favorites');
  notice = $state<Notice | null>(null);
  ready = $state(false);
  readonly systemLanguage: string;
  readonly player: Player;
  readonly platform: Platform;

  constructor(platform: Platform, audio: AudioLike, systemLanguage = navigator.language) {
    this.platform = platform;
    this.systemLanguage = systemLanguage;
    this.player = new Player((url, session) => platform.streamUrl(url, session), audio);
    this.player.onStart = (station) => {
      this.library = lib.pushRecent(this.library, station);
      this.settings.lastStationId = station.id;
      platform.countClick(station.id);
    };
    this.player.onPlaying = () => platform.audioStarted();
  }

  get locale() {
    return resolveLocale(this.settings.language, this.systemLanguage);
  }

  get t() {
    return translator(this.locale);
  }

  get country(): string {
    return systemCountry(this.systemLanguage);
  }

  async init() {
    const [settings, library] = await Promise.all([
      this.platform.load('settings'),
      this.platform.load('library'),
    ]);
    this.settings = lib.restoreSettings(settings);
    this.library = lib.restoreLibrary(library);
    this.tab = this.library.favorites.length > 0 ? 'favorites' : 'search';
    this.player.setVolume(this.settings.volume);
    this.player.setMuted(this.settings.muted);
    await Promise.allSettled([
      this.platform.setCloseToTray(this.settings.closeToTray),
      this.platform.setAlwaysOnTop(this.settings.alwaysOnTop),
      this.settings.compact ? this.platform.setCompact(true) : Promise.resolve(),
    ]);
    const last = this.findStation(this.settings.lastStationId);
    if (last) {
      if (this.settings.resumeOnStart) this.player.play(last);
      else this.player.select(last);
    }
    this.ready = true;
    void this.refreshFavorites();
  }

  /** Stream URLs change over time; favourites pick up the directory's current data. */
  async refreshFavorites() {
    const ids = this.library.favorites.map((s) => s.id);
    if (ids.length === 0) return;
    try {
      const fresh = await this.platform.byIds(ids);
      this.library = {
        favorites: lib.refreshStations(this.library.favorites, fresh),
        recent: lib.refreshStations(this.library.recent, fresh),
      };
    } catch {
      // Offline: the stored data still works for most stations.
    }
  }

  findStation(id: string | null): Station | undefined {
    if (!id) return undefined;
    return [...this.library.favorites, ...this.library.recent].find((s) => s.id === id);
  }

  isFavorite(id: string) {
    return lib.isFavorite(this.library, id);
  }

  toggleFavorite(station: Station) {
    if (this.isFavorite(station.id)) this.removeFavorite(station);
    else this.library = lib.addFavorite(this.library, station);
  }

  removeFavorite(station: Station) {
    const index = this.library.favorites.findIndex((s) => s.id === station.id);
    if (index < 0) return;
    this.library = lib.removeFavorite(this.library, station.id);
    this.notice = {
      text: this.t('favorites.removed', station.name),
      undo: () => {
        this.library = lib.addFavorite(this.library, station, index);
      },
    };
  }

  moveFavorite(id: string, delta: number) {
    this.library = lib.moveFavorite(this.library, id, delta);
  }

  clearRecent() {
    const previous = this.library.recent;
    this.library = lib.clearRecent(this.library);
    this.notice = {
      text: this.t('recent.cleared'),
      undo: () => {
        this.library = { ...this.library, recent: previous };
      },
    };
  }

  playNeighbour(delta: 1 | -1) {
    const next = lib.neighbourFavorite(this.library, this.player.station?.id ?? null, delta);
    if (next) this.player.play(next);
  }

  playFavorite(id: string) {
    const station = this.findStation(id);
    if (station) this.player.play(station);
  }

  setVolume(volume: number) {
    this.player.setVolume(volume);
    this.settings.volume = this.player.volume;
    this.settings.muted = this.player.muted;
  }

  setMuted(muted: boolean) {
    this.player.setMuted(muted);
    this.settings.muted = muted;
  }

  async setCloseToTray(enabled: boolean) {
    this.settings.closeToTray = enabled;
    await this.platform.setCloseToTray(enabled);
  }

  async setAlwaysOnTop(enabled: boolean) {
    this.settings.alwaysOnTop = enabled;
    await this.platform.setAlwaysOnTop(enabled);
  }

  async setCompact(enabled: boolean) {
    this.settings.compact = enabled;
    await this.platform.setCompact(enabled);
  }

  save() {
    void this.platform.save('settings', $state.snapshot(this.settings));
    void this.platform.save('library', $state.snapshot(this.library));
  }
}
