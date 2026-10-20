import type { AudioLike } from './player.svelte';
import { sampleFacets, sampleStations } from './samples';
import type {
  Facet,
  NowPlayingEvent,
  PlayerCommand,
  PlayerSnapshot,
  ResolvedStream,
  SearchQuery,
  Station,
  TrayAction,
  TrayState,
} from './types';

/** A system-wide shortcut to register. */
export interface GlobalShortcut {
  id: string;
  accelerator: string;
}

/**
 * Everything the UI needs from the desktop shell. `tauriPlatform` is the real app;
 * `browserPlatform` runs the same UI in a plain browser (development, Playwright tests,
 * screenshots) with sample stations and a quiet generated sample tune.
 */
export interface Platform {
  kind: 'tauri' | 'browser';
  isMac: boolean;
  /** Playable URL for a plain stream; `session` tags the "now playing" events. */
  streamUrl(url: string, session: string): string;
  /** Proxied URL of an HLS playlist. */
  hlsUrl(url: string): string;
  attachHls(audio: AudioLike, playlistUrl: string, onFatal: () => void): Promise<() => void>;
  /** Proxied logo URL, or '' when the station has no usable logo. */
  logoUrl(favicon: string): string;
  search(query: SearchQuery): Promise<Station[]>;
  byIds(ids: string[]): Promise<Station[]>;
  countries(): Promise<Facet[]>;
  languages(): Promise<Facet[]>;
  /** Checks a stream address; rejects with an error code (`invalid_url`, …). */
  resolveStream(url: string): Promise<ResolvedStream>;
  countClick(id: string): void;
  /** Audio is coming out (Windows: name the mixer entry after the app). */
  audioStarted(): void;
  load<T>(key: string): Promise<T | undefined>;
  save(key: string, value: unknown): Promise<void>;
  onNowPlaying(handler: (event: NowPlayingEvent) => void): Promise<() => void>;
  onTrayAction(handler: (action: TrayAction) => void): Promise<() => void>;
  updateTray(state: TrayState): Promise<void>;
  setCloseToTray(enabled: boolean): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  /** The UI is ready: show the window of the stored mode. */
  showUi(mini: boolean): Promise<void>;
  /** Floating player on (main window hidden) or off. */
  setMiniMode(enabled: boolean): Promise<void>;
  /** Hides the current window to the tray. */
  hideWindow(): Promise<void>;
  showWindow(): Promise<void>;
  /** Registers system-wide shortcuts (replacing earlier ones); returns the ids that failed. */
  setGlobalShortcuts(list: GlobalShortcut[], handler: (id: string) => void): Promise<string[]>;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;
  version(): Promise<string>;
  /** Opens a web page in the default browser (only allowed addresses). */
  openUrl(url: string): Promise<void>;
  /** Main window → floating player. */
  sendSnapshot(snapshot: PlayerSnapshot): void;
  sendSpectrum(levels: number[]): void;
  onCommand(handler: (command: PlayerCommand) => void): Promise<() => void>;
  /** Floating player ← main window. */
  onSnapshot(handler: (snapshot: PlayerSnapshot) => void): Promise<() => void>;
  onSpectrum(handler: (levels: number[]) => void): Promise<() => void>;
  sendCommand(command: PlayerCommand): void;
}

function proxied(base: string, token: string, path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ t: token, ...params });
  return `${base}${path}?${query}`;
}

function isWebUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** hls.js for web views with Media Source Extensions; native HLS (Safari) as fallback. */
async function attachHls(audio: AudioLike, url: string, onFatal: () => void): Promise<() => void> {
  const { default: Hls } = await import('hls.js');
  const media = audio as unknown as HTMLMediaElement;
  if (!Hls.isSupported()) {
    media.src = url;
    return () => {};
  }
  const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (data.fatal) onFatal();
  });
  hls.loadSource(url);
  hls.attachMedia(media);
  return () => hls.destroy();
}

export async function tauriPlatform(): Promise<Platform> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen, emitTo } = await import('@tauri-apps/api/event');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { getVersion } = await import('@tauri-apps/api/app');
  const { load } = await import('@tauri-apps/plugin-store');
  const autostart = await import('@tauri-apps/plugin-autostart');
  const shortcuts = await import('@tauri-apps/plugin-global-shortcut');
  const opener = await import('@tauri-apps/plugin-opener');

  const { base, token } = await invoke<{ base: string; token: string }>('proxy_info');
  const store = await load('sysradio.json', { defaults: {}, autoSave: 300 });
  const win = getCurrentWindow();
  const listenTo = <T>(event: string, handler: (payload: T) => void) =>
    listen<T>(event, (e) => handler(e.payload));

  return {
    kind: 'tauri',
    isMac,
    streamUrl: (url, session) => proxied(base, token, '/stream', { u: url, s: session }),
    hlsUrl: (url) => proxied(base, token, '/hls', { u: url }),
    attachHls,
    logoUrl: (favicon) => (isWebUrl(favicon) ? proxied(base, token, '/logo', { u: favicon }) : ''),
    search: (search) => invoke<Station[]>('search_stations', { search }),
    byIds: (ids) => invoke<Station[]>('stations_by_id', { ids }),
    countries: () => invoke<Facet[]>('directory_countries'),
    languages: () => invoke<Facet[]>('directory_languages'),
    resolveStream: (url) => invoke<ResolvedStream>('resolve_stream', { url }),
    countClick: (id) => void invoke('count_click', { id }).catch(() => {}),
    audioStarted: () => void invoke('audio_started').catch(() => {}),
    load: (key) => store.get(key),
    save: (key, value) => store.set(key, value),
    onNowPlaying: (handler) => listenTo('now-playing', handler),
    onTrayAction: (handler) => listenTo('tray-action', handler),
    updateTray: (tray) => invoke('update_tray', { tray }),
    setCloseToTray: (enabled) => invoke('set_close_to_tray', { enabled }),
    setAlwaysOnTop: (enabled) => win.setAlwaysOnTop(enabled),
    showUi: (mini) => invoke('show_ui', { mini }),
    setMiniMode: (enabled) => invoke('set_mini_mode', { enabled }),
    hideWindow: () => invoke('hide_window'),
    showWindow: () => invoke('show_current_window'),
    async setGlobalShortcuts(list, handler) {
      await shortcuts.unregisterAll().catch(() => {});
      const failed: string[] = [];
      for (const { id, accelerator } of list) {
        try {
          await shortcuts.register(accelerator, (event) => {
            if (event.state === 'Pressed') handler(id);
          });
        } catch {
          failed.push(id);
        }
      }
      return failed;
    },
    getAutostart: () => autostart.isEnabled(),
    setAutostart: (enabled) => (enabled ? autostart.enable() : autostart.disable()),
    version: () => getVersion(),
    openUrl: (url) => opener.openUrl(url),
    sendSnapshot: (snapshot) => void emitTo('mini', 'player-snapshot', snapshot).catch(() => {}),
    sendSpectrum: (levels) => void emitTo('mini', 'player-spectrum', levels).catch(() => {}),
    onCommand: (handler) => listenTo('player-command', handler),
    onSnapshot: (handler) => listenTo('player-snapshot', handler),
    onSpectrum: (handler) => listenTo('player-spectrum', handler),
    sendCommand: (command) => void emitTo('main', 'player-command', command).catch(() => {}),
  };
}

/**
 * A quiet minute of "music" as a WAV blob for the browser variant: a chord with a kick and
 * hi-hat pattern, so playback, equalizer and spectrum have something real to work with.
 */
function sampleWav(seconds = 60, rate = 22050): string {
  const samples = seconds * rate;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  const data = new Uint8Array(buffer, 44);
  const chords = [
    [110, 220, 277, 330, 659, 1319],
    [98, 196, 247, 294, 587, 1175],
  ];
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const chord = chords[Math.floor(t / 2) % chords.length]!;
    let v = 0;
    for (const hz of chord) v += Math.sin(2 * Math.PI * hz * t) / chord.length;
    const beat = t % 0.5;
    const kick =
      Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 9);
    const hat = (t + 0.25) % 0.5 < 0.04 ? noise() * 0.5 : 0;
    const swell = 0.6 + 0.4 * Math.sin(t * 1.3);
    v = 0.35 * v * swell + 0.45 * kick + 0.2 * hat;
    data[i] = 128 + Math.round(Math.max(-1, Math.min(1, v)) * 40);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function browserPlatform(): Platform {
  const nowPlaying = new Set<(e: NowPlayingEvent) => void>();
  // Main window and floating player talk through a BroadcastChannel (two tabs in tests).
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sysradio') : null;
  const on = <T>(type: string, handler: (payload: T) => void) => {
    const listener = (e: MessageEvent<{ type: string; payload: T }>) => {
      if (e.data?.type === type) handler(e.data.payload);
    };
    channel?.addEventListener('message', listener);
    return Promise.resolve(() => channel?.removeEventListener('message', listener));
  };
  const post = (type: string, payload: unknown) => channel?.postMessage({ type, payload });
  let sample = '';
  const read = <T>(key: string): T | undefined => {
    try {
      const raw = localStorage.getItem(`sysradio:${key}`);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const playSample = (session: string) => {
    sample ||= sampleWav();
    // Simulate a station sending its first title shortly after connecting.
    setTimeout(() => {
      for (const h of nowPlaying) h({ session, title: 'Beispiel-Interpret – Beispieltitel' });
    }, 300);
    return sample;
  };
  return {
    kind: 'browser',
    isMac,
    streamUrl: (_url, session) => playSample(session),
    hlsUrl: (url) => url,
    async attachHls(audio) {
      audio.src = playSample('hls');
      return () => {};
    },
    logoUrl: () => '',
    async search(query) {
      const name = query.name.trim().toLowerCase();
      const tag = query.tag.trim().toLowerCase();
      const codes =
        query.countryCodes.length > 0
          ? query.countryCodes
          : query.countryCode
            ? [query.countryCode]
            : [];
      const list = sampleStations
        .filter((s) => !name || s.name.toLowerCase().includes(name))
        .filter((s) => !tag || s.tags.some((t) => t.includes(tag)))
        .filter((s) => codes.length === 0 || codes.includes(s.countryCode))
        .filter((s) => !query.language || s.language === query.language);
      if (query.order === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      return list.slice(query.offset, query.offset + query.limit);
    },
    byIds: async (ids) => sampleStations.filter((s) => ids.includes(s.id)),
    countries: async () => sampleFacets.countries,
    languages: async () => sampleFacets.languages,
    async resolveStream(url) {
      if (!/^https?:\/\/[^/]+/i.test(url.trim())) throw 'invalid_url';
      if (url.includes('offline')) throw 'unreachable';
      const host = new URL(url.trim()).hostname;
      const hls = url.includes('.m3u8');
      return {
        url: url.trim(),
        hls,
        name: `Stream ${host}`,
        codec: hls ? '' : 'MP3',
        bitrate: hls ? 0 : 128,
      };
    },
    countClick: () => {},
    audioStarted: () => {},
    load: async (key) => read(key),
    async save(key, value) {
      try {
        localStorage.setItem(`sysradio:${key}`, JSON.stringify(value));
      } catch {
        // Storage may be unavailable (private mode); the session still works.
      }
    },
    async onNowPlaying(handler) {
      nowPlaying.add(handler);
      return () => nowPlaying.delete(handler);
    },
    onTrayAction: async () => () => {},
    updateTray: async () => {},
    setCloseToTray: async () => {},
    setAlwaysOnTop: async () => {},
    showUi: async () => {},
    setMiniMode: async (enabled) => void post('mini-mode', enabled),
    hideWindow: async () => {},
    showWindow: async () => {},
    setGlobalShortcuts: async () => [],
    getAutostart: async () => false,
    setAutostart: async () => {},
    version: async () => '0.0.0-browser',
    openUrl: async (url) => void window.open(url, '_blank', 'noopener'),
    sendSnapshot: (snapshot) => post('snapshot', snapshot),
    sendSpectrum: (levels) => post('spectrum', levels),
    onCommand: (handler) => on('command', handler),
    onSnapshot: (handler) => on('snapshot', handler),
    onSpectrum: (handler) => on('spectrum', handler),
    sendCommand: (command) => post('command', command),
  };
}

export function createPlatform(): Promise<Platform> {
  return '__TAURI_INTERNALS__' in window ? tauriPlatform() : Promise.resolve(browserPlatform());
}
