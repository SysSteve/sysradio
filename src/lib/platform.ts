import type { NowPlayingEvent, SearchQuery, Station, TrayAction, TrayState } from './types';
import { sampleStations } from './samples';

/**
 * Everything the UI needs from the desktop shell. `tauriPlatform` is the real app;
 * `browserPlatform` runs the same UI in a plain browser (development, Playwright tests,
 * screenshots) with sample stations and silent audio.
 */
export interface Platform {
  kind: 'tauri' | 'browser';
  /** Playable URL for a station stream; `session` tags the "now playing" events. */
  streamUrl(url: string, session: string): string;
  /** Proxied logo URL, or '' when the station has no usable logo. */
  logoUrl(favicon: string): string;
  search(query: SearchQuery): Promise<Station[]>;
  byIds(ids: string[]): Promise<Station[]>;
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
  /** Shrinks the window to the player bar, or restores the previous size. */
  setCompact(enabled: boolean): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;
  version(): Promise<string>;
}

const COMPACT_HEIGHT = 112;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 420;

function proxied(base: string, token: string, path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ t: token, ...params });
  return `${base}${path}?${query}`;
}

function isWebUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export async function tauriPlatform(): Promise<Platform> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  const { getVersion } = await import('@tauri-apps/api/app');
  const { load } = await import('@tauri-apps/plugin-store');
  const autostart = await import('@tauri-apps/plugin-autostart');

  const { base, token } = await invoke<{ base: string; token: string }>('proxy_info');
  const store = await load('sysradio.json', { defaults: {}, autoSave: 300 });
  const win = getCurrentWindow();
  let normalSize: { width: number; height: number } | null = null;

  return {
    kind: 'tauri',
    streamUrl: (url, session) => proxied(base, token, '/stream', { u: url, s: session }),
    logoUrl: (favicon) => (isWebUrl(favicon) ? proxied(base, token, '/logo', { u: favicon }) : ''),
    search: (search) => invoke<Station[]>('search_stations', { search }),
    byIds: (ids) => invoke<Station[]>('stations_by_id', { ids }),
    countClick: (id) => void invoke('count_click', { id }).catch(() => {}),
    audioStarted: () => void invoke('audio_started').catch(() => {}),
    load: (key) => store.get(key),
    save: (key, value) => store.set(key, value),
    onNowPlaying: (handler) => listen<NowPlayingEvent>('now-playing', (e) => handler(e.payload)),
    onTrayAction: (handler) => listen<TrayAction>('tray-action', (e) => handler(e.payload)),
    updateTray: (tray) => invoke('update_tray', { tray }),
    setCloseToTray: (enabled) => invoke('set_close_to_tray', { enabled }),
    setAlwaysOnTop: (enabled) => win.setAlwaysOnTop(enabled),
    async setCompact(enabled) {
      const factor = await win.scaleFactor();
      const size = (await win.innerSize()).toLogical(factor);
      if (enabled) {
        if (size.height > COMPACT_HEIGHT + 40)
          normalSize = { width: size.width, height: size.height };
        await win.setMinSize(new LogicalSize(MIN_WIDTH, COMPACT_HEIGHT));
        await win.setSize(new LogicalSize(size.width, COMPACT_HEIGHT));
      } else {
        await win.setMinSize(new LogicalSize(MIN_WIDTH, MIN_HEIGHT));
        const target = normalSize ?? { width: size.width, height: 600 };
        await win.setSize(new LogicalSize(target.width, Math.max(target.height, MIN_HEIGHT)));
      }
    },
    getAutostart: () => autostart.isEnabled(),
    setAutostart: (enabled) => (enabled ? autostart.enable() : autostart.disable()),
    version: () => getVersion(),
  };
}

/** One minute of silence as a WAV blob: lets the browser variant really "play". */
function silentWav(seconds = 60, rate = 8000): string {
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
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function browserPlatform(): Platform {
  const nowPlaying = new Set<(e: NowPlayingEvent) => void>();
  let silence = '';
  const read = <T>(key: string): T | undefined => {
    try {
      const raw = localStorage.getItem(`sysradio:${key}`);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    kind: 'browser',
    streamUrl(_url, session) {
      silence ||= silentWav();
      // Simulate a station sending its first title shortly after connecting.
      setTimeout(() => {
        for (const h of nowPlaying) h({ session, title: 'Beispiel-Interpret – Beispieltitel' });
      }, 300);
      return silence;
    },
    logoUrl: () => '',
    async search(query) {
      const name = query.name.trim().toLowerCase();
      const tag = query.tag.trim().toLowerCase();
      return sampleStations
        .filter((s) => !name || s.name.toLowerCase().includes(name))
        .filter((s) => !tag || s.tags.some((t) => t.includes(tag)))
        .filter((s) => !query.countryCode || s.countryCode === query.countryCode)
        .slice(query.offset, query.offset + query.limit);
    },
    byIds: async (ids) => sampleStations.filter((s) => ids.includes(s.id)),
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
    setCompact: async () => {},
    getAutostart: async () => false,
    setAutostart: async () => {},
    version: async () => '0.0.0-browser',
  };
}

export function createPlatform(): Promise<Platform> {
  return '__TAURI_INTERNALS__' in window ? tauriPlatform() : Promise.resolve(browserPlatform());
}
