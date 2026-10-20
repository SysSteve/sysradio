import type { Station } from './types';

export type PlayerStatus = 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'error';

/** The parts of HTMLAudioElement the player uses (tests pass a fake). */
export interface AudioLike extends EventTarget {
  src: string;
  volume: number;
  muted: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

/** Where streams come from: plain streams by URL, HLS through a loader (hls.js). */
export interface StreamSource {
  streamUrl(url: string, session: string): string;
  hlsUrl(url: string): string;
  /** Attaches an HLS playlist to the element; calls `onFatal` when it breaks. Returns detach. */
  attachHls(audio: AudioLike, playlistUrl: string, onFatal: () => void): Promise<() => void>;
}

/** Waits before reconnect attempts; after the last one the player gives up. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Live radio player. Stopping really disconnects (no paused buffer), so "play" always
 * starts at the live position. Dropped streams reconnect on their own with backoff.
 */
export class Player {
  station = $state<Station | null>(null);
  status = $state<PlayerStatus>('idle');
  title = $state('');
  volume = $state(0.8);
  muted = $state(false);

  #audio: AudioLike;
  #source: StreamSource;
  #session = 0;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #detachHls: (() => void) | null = null;
  /** Called whenever a station starts (for history and click counting). */
  onStart: (station: Station) => void = () => {};
  /** Called whenever audio actually starts coming out (also after a reconnect). */
  onPlaying: () => void = () => {};

  constructor(source: StreamSource, audio: AudioLike) {
    this.#source = source;
    this.#audio = audio;
    audio.addEventListener('playing', () => {
      if (this.status === 'idle') return;
      this.status = 'playing';
      this.#attempt = 0;
      this.onPlaying();
    });
    // A live stream that ends or fails has dropped: reconnect.
    audio.addEventListener('error', () => this.#dropped());
    audio.addEventListener('ended', () => this.#dropped());
  }

  get active(): boolean {
    return this.status !== 'idle' && this.status !== 'error';
  }

  get session(): string {
    return String(this.#session);
  }

  play(station: Station) {
    const changed = this.station?.id !== station.id;
    this.station = station;
    if (changed) this.title = '';
    this.#attempt = 0;
    this.#connect('connecting');
    this.onStart(station);
  }

  /** Restores the last station without playing it. */
  select(station: Station) {
    if (this.active) return;
    this.station = station;
  }

  stop() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#session++;
    this.status = 'idle';
    this.title = '';
    this.#detach();
  }

  toggle() {
    if (this.active) this.stop();
    else if (this.station) this.play(this.station);
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
    this.#audio.volume = this.volume;
    if (this.volume > 0 && this.muted) this.setMuted(false);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.#audio.muted = muted;
  }

  /** "Now playing" from the proxy; titles of older connections are ignored. */
  nowPlaying(session: string, title: string) {
    if (session === this.session && this.active) this.title = title;
  }

  #connect(status: PlayerStatus) {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.station) return;
    this.#releaseHls();
    this.#session++;
    const session = this.#session;
    this.status = status;
    this.#audio.volume = this.volume;
    this.#audio.muted = this.muted;
    if (this.station.hls) {
      const fatal = () => {
        if (session === this.#session) this.#dropped();
      };
      void this.#source
        .attachHls(this.#audio, this.#source.hlsUrl(this.station.url), fatal)
        .then((detach) => {
          if (session === this.#session) {
            this.#detachHls = detach;
            this.#audio.play().catch(() => {});
          } else detach();
        }, fatal);
      return;
    }
    this.#audio.src = this.#source.streamUrl(this.station.url, this.session);
    // Autoplay restrictions do not apply in the app; a failed start shows up as an error event.
    this.#audio.play().catch(() => {});
  }

  #dropped() {
    if (!this.active) return;
    // Events of a connection we already replaced are stale.
    if (this.status === 'reconnecting' && this.#timer !== undefined) return;
    if (this.#attempt >= RETRY_DELAYS_MS.length) {
      this.status = 'error';
      this.title = '';
      this.#detach();
      return;
    }
    const delay = RETRY_DELAYS_MS[this.#attempt++]!;
    this.status = 'reconnecting';
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#connect('reconnecting');
    }, delay);
  }

  #releaseHls() {
    this.#detachHls?.();
    this.#detachHls = null;
  }

  #detach() {
    this.#releaseHls();
    this.#audio.pause();
    this.#audio.removeAttribute('src');
    this.#audio.load();
  }
}
