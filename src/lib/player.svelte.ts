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
  #streamUrl: (url: string, session: string) => string;
  #session = 0;
  #attempt = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Called whenever a station starts (for history and click counting). */
  onStart: (station: Station) => void = () => {};

  constructor(streamUrl: (url: string, session: string) => string, audio: AudioLike) {
    this.#streamUrl = streamUrl;
    this.#audio = audio;
    audio.addEventListener('playing', () => {
      if (this.status === 'idle') return;
      this.status = 'playing';
      this.#attempt = 0;
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
    this.volume = Math.min(1, Math.max(0, volume));
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
    if (!this.station) return;
    this.#session++;
    this.status = status;
    this.#audio.src = this.#streamUrl(this.station.url, this.session);
    this.#audio.volume = this.volume;
    this.#audio.muted = this.muted;
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

  #detach() {
    this.#audio.pause();
    this.#audio.removeAttribute('src');
    this.#audio.load();
  }
}
