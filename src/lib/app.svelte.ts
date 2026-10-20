import { AudioGraph } from './audio-graph';
import * as eq from './eq';
import { resolveLocale, systemCountry, translator } from './i18n';
import {
  SHORTCUT_ACTIONS,
  accelerator,
  assign,
  bindingParts,
  conflictOf,
  defaultShortcuts,
} from './keybindings';
import * as lib from './library';
import { Player, type AudioLike } from './player.svelte';
import type { Platform } from './platform';
import type {
  KeyBinding,
  LibraryData,
  ResolveErrorCode,
  Settings,
  ShortcutAction,
  Station,
  UpdateInfo,
} from './types';

export type Tab = 'favorites' | 'search' | 'recent' | 'eq' | 'settings';

/** A short notice, optionally with an "Undo" button. */
export interface Notice {
  text: string;
  undo?: () => void;
}

/** Input of the "add station by address" form. */
export interface CustomStationInput {
  url: string;
  name: string;
  favicon: string;
}

const VOLUME_STEP = 0.05;
/** First automatic update check after start, then every few hours. */
const UPDATE_FIRST_CHECK_MS = 8_000;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'checkFailed'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'failed';

/** Application state of the main window, shared by all components. */
export class AppState {
  settings = $state<Settings>(structuredClone(lib.defaultSettings));
  library = $state<LibraryData>({ ...lib.emptyLibrary });
  tab = $state<Tab>('favorites');
  notice = $state<Notice | null>(null);
  ready = $state(false);
  /** System-wide shortcuts another program already holds. */
  globalFailures = $state<ShortcutAction[]>([]);
  update = $state<UpdateInfo | null>(null);
  updateStatus = $state<UpdateStatus>('idle');
  /** 0–1 while downloading; null when the size is unknown. */
  updateProgress = $state<number | null>(null);
  /** "Later" hides the notice until the next start. */
  updateDismissed = $state(false);
  /** Sleep timer: playback stops at this time (ms since epoch); null when off. */
  sleepUntil = $state<number | null>(null);
  /** Updated every few seconds while the sleep timer runs (for the remaining minutes). */
  now = $state(Date.now());
  #sleepTimer: ReturnType<typeof setInterval> | undefined;
  /** Text for screen readers after drag and drop or similar silent changes. */
  announcement = $state('');
  readonly systemLanguage: string;
  readonly player: Player;
  readonly platform: Platform;
  readonly graph: AudioGraph;

  constructor(platform: Platform, audio: HTMLAudioElement, systemLanguage = navigator.language) {
    this.platform = platform;
    this.systemLanguage = systemLanguage;
    this.graph = new AudioGraph(audio);
    this.player = new Player(
      {
        streamUrl: (url, session) => platform.streamUrl(url, session),
        hlsUrl: (url) => platform.hlsUrl(url),
        attachHls: (el, url, onFatal) => platform.attachHls(el, url, onFatal),
      },
      audio as AudioLike,
    );
    this.player.onStart = (station) => {
      this.library = lib.pushRecent(this.library, station);
      this.settings.lastStationId = station.id;
      if (!lib.isCustom(station)) platform.countClick(station.id);
    };
    this.player.onPlaying = () => {
      platform.audioStarted();
      void this.graph.ensure().then(() => this.#applyEq());
    };
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
    this.#applyEq();
    await Promise.allSettled([
      this.platform.setCloseToTray(this.settings.closeToTray),
      this.platform.setAlwaysOnTop(this.settings.alwaysOnTop),
      this.registerGlobalShortcuts(),
    ]);
    const last = this.findStation(this.settings.lastStationId);
    if (last) {
      if (this.settings.resumeOnStart) this.player.play(last);
      else this.player.select(last);
    }
    this.ready = true;
    await this.platform.showUi(this.settings.mini);
    void this.refreshFavorites();
    this.#scheduleUpdateChecks();
  }

  /** Stream URLs change over time; favourites pick up the directory's current data. */
  async refreshFavorites() {
    const ids = this.library.favorites.filter((s) => !lib.isCustom(s)).map((s) => s.id);
    if (ids.length === 0) return;
    try {
      const fresh = await this.platform.byIds(ids);
      this.library = {
        favorites: lib.refreshStations(this.library.favorites, fresh),
        recent: lib.refreshStations(this.library.recent, fresh),
      };
      // The selected (not playing) station shows its fresh name and logo too.
      const current = this.player.station && fresh.find((f) => f.id === this.player.station?.id);
      if (current && !this.player.active) this.player.select(current);
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
    this.#announcePosition(id);
  }

  moveFavoriteTo(id: string, index: number) {
    this.library = lib.moveFavoriteTo(this.library, id, index);
    this.#announcePosition(id);
  }

  #announcePosition(id: string) {
    const index = this.library.favorites.findIndex((s) => s.id === id);
    const station = this.library.favorites[index];
    if (station) this.announcement = this.t('list.moved', station.name, index + 1);
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

  /** Checks the address and adds (or, with `existing`, updates) an own station. */
  async saveCustomStation(
    input: CustomStationInput,
    existing?: Station,
  ): Promise<{ ok: true } | { ok: false; error: ResolveErrorCode | 'logo' }> {
    if (input.favicon.trim() && !/^https?:\/\/\S+$/i.test(input.favicon.trim())) {
      return { ok: false, error: 'logo' };
    }
    let stream;
    try {
      stream = await this.platform.resolveStream(input.url);
    } catch (e) {
      const code = String(e) as ResolveErrorCode;
      const known: ResolveErrorCode[] = [
        'invalid_url',
        'unreachable',
        'not_audio',
        'empty_playlist',
      ];
      return { ok: false, error: known.includes(code) ? code : 'unreachable' };
    }
    const station = lib.customStation(input, stream, existing?.id);
    if (existing) {
      this.library = lib.replaceStation(this.library, station);
      if (this.player.station?.id === station.id) this.player.select(station);
      this.notice = { text: this.t('custom.updated', station.name) };
    } else {
      this.library = lib.addFavorite(this.library, station);
      this.notice = { text: this.t('custom.added', station.name) };
    }
    return { ok: true };
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

  async setMini(enabled: boolean) {
    this.settings.mini = enabled;
    await this.platform.setMiniMode(enabled);
  }

  /** One entry point for shortcuts, tray, media keys and the floating player. */
  run(action: ShortcutAction) {
    switch (action) {
      case 'toggle':
        return this.player.toggle();
      case 'mute':
        return this.setMuted(!this.player.muted);
      case 'volumeUp':
        return this.setVolume(this.player.volume + VOLUME_STEP);
      case 'volumeDown':
        return this.setVolume(this.player.volume - VOLUME_STEP);
      case 'next':
        return this.playNeighbour(1);
      case 'previous':
        return this.playNeighbour(-1);
      case 'mini':
        return void this.setMini(!this.settings.mini);
      case 'show':
        return void this.platform.showWindow();
    }
  }

  // --- Sleep timer ---------------------------------------------------------------------------

  get sleepMinutesLeft(): number | null {
    return this.sleepUntil === null
      ? null
      : Math.max(1, Math.ceil((this.sleepUntil - this.now) / 60_000));
  }

  setSleepTimer(minutes: number | null) {
    clearInterval(this.#sleepTimer);
    this.now = Date.now();
    this.sleepUntil = minutes ? this.now + minutes * 60_000 : null;
    if (!minutes) return;
    this.#sleepTimer = setInterval(() => {
      this.now = Date.now();
      if (this.sleepUntil !== null && this.now >= this.sleepUntil) {
        this.setSleepTimer(null);
        if (this.player.active) this.player.stop();
        this.notice = { text: this.t('sleep.stopped') };
      }
    }, 5_000);
  }

  // --- Updates -----------------------------------------------------------------------------

  #scheduleUpdateChecks() {
    const auto = () => {
      if (this.settings.autoUpdate) void this.checkForUpdate(false);
    };
    setTimeout(auto, UPDATE_FIRST_CHECK_MS);
    setInterval(auto, UPDATE_INTERVAL_MS);
  }

  /** `manual`: the user asked, so "up to date" and errors are shown too. */
  async checkForUpdate(manual: boolean) {
    if (['checking', 'downloading', 'installing'].includes(this.updateStatus)) return;
    if (manual) this.updateStatus = 'checking';
    try {
      const found = await this.platform.checkUpdate();
      this.update = found;
      if (found) {
        this.updateStatus = 'available';
        if (manual) this.updateDismissed = false;
      } else if (manual) this.updateStatus = 'current';
    } catch {
      if (manual) this.updateStatus = 'checkFailed';
    }
  }

  async installUpdate() {
    if (!this.update) return;
    this.updateStatus = 'downloading';
    this.updateProgress = 0;
    try {
      await this.platform.installUpdate((fraction) => {
        this.updateProgress = fraction;
        if (fraction === 1) this.updateStatus = 'installing';
      });
      this.updateStatus = 'installing';
    } catch {
      this.updateStatus = 'failed';
    }
  }

  releaseNotesUrl(version: string) {
    return `https://github.com/SysSteve/sysradio/releases/tag/v${version}`;
  }

  // --- Equalizer ---------------------------------------------------------------------------

  #applyEq() {
    this.graph.setEq(this.settings.eq.enabled, this.settings.eq.gains);
  }

  #setEq(next: Settings['eq']) {
    this.settings.eq = next;
    this.#applyEq();
  }

  setEqEnabled(enabled: boolean) {
    this.#setEq({ ...this.settings.eq, enabled });
  }

  applyEqPreset(id: string) {
    this.#setEq({ ...eq.applyPreset(this.settings.eq, id), enabled: true });
  }

  setEqBand(index: number, db: number) {
    this.#setEq({ ...eq.setBand(this.settings.eq, index, db), enabled: true });
  }

  resetEq() {
    this.#setEq({ ...eq.applyPreset(this.settings.eq, 'flat') });
  }

  saveEqPreset(name: string) {
    this.#setEq(eq.saveCustom(this.settings.eq, name));
    this.notice = { text: this.t('eq.saved', name.trim()) };
  }

  deleteEqPreset(id: string) {
    const before = this.settings.eq;
    const preset = before.custom.find((p) => p.id === id);
    if (!preset) return;
    this.#setEq(eq.deleteCustom(before, id));
    this.notice = {
      text: this.t('eq.deleted', preset.name),
      undo: () =>
        this.#setEq({ ...this.settings.eq, custom: before.custom, presetId: before.presetId }),
    };
  }

  // --- Shortcuts ---------------------------------------------------------------------------

  keyNames() {
    const t = this.t;
    return {
      ctrl: t('keys.ctrl'),
      alt: t('keys.alt'),
      shift: t('keys.shift'),
      meta: t('keys.meta'),
      space: t('keys.space'),
    };
  }

  /** "Strg+Alt+P" for display. */
  keysLabel(binding: KeyBinding | null): string {
    return binding ? bindingParts(binding, this.keyNames(), this.platform.isMac).join('+') : '';
  }

  /** Assigns a shortcut; returns the action that lost it, if any. */
  async setShortcut(
    action: ShortcutAction,
    scope: 'local' | 'global',
    binding: KeyBinding | null,
  ): Promise<ShortcutAction | null> {
    // Plain copy: the state proxy cannot be cloned.
    const current = $state.snapshot(this.settings.shortcuts);
    const other = binding ? conflictOf(current, action, scope, binding) : null;
    this.settings.shortcuts = assign(current, action, scope, binding);
    if (scope === 'global') await this.registerGlobalShortcuts();
    return other;
  }

  async resetShortcuts() {
    this.settings.shortcuts = defaultShortcuts();
    await this.registerGlobalShortcuts();
    this.notice = { text: this.t('shortcuts.resetDone') };
  }

  async registerGlobalShortcuts() {
    const list = SHORTCUT_ACTIONS.flatMap((action) => {
      const binding = this.settings.shortcuts[action].global;
      return binding ? [{ id: action, accelerator: accelerator(binding) }] : [];
    });
    const failed = await this.platform
      .setGlobalShortcuts(list, (id) => this.run(id as ShortcutAction))
      .catch(() => list.map((s) => s.id));
    this.globalFailures = failed as ShortcutAction[];
  }

  save() {
    void this.platform.save('settings', $state.snapshot(this.settings));
    void this.platform.save('library', $state.snapshot(this.library));
  }
}
