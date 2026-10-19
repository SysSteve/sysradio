import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, RETRY_DELAYS_MS, type AudioLike } from './player.svelte';
import { sampleStations } from './samples';

class FakeAudio extends EventTarget implements AudioLike {
  src = '';
  volume = 1;
  muted = false;
  plays = 0;
  async play() {
    this.plays++;
  }
  pause() {}
  load() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

const station = sampleStations[0]!;
const other = sampleStations[1]!;

describe('Player', () => {
  let audio: FakeAudio;
  let player: Player;
  beforeEach(() => {
    vi.useFakeTimers();
    audio = new FakeAudio();
    player = new Player((url, session) => `proxy?u=${url}&s=${session}`, audio);
  });
  afterEach(() => vi.useRealTimers());

  it('connects, then reports playing', () => {
    const started = vi.fn();
    const playing = vi.fn();
    player.onStart = started;
    player.onPlaying = playing;
    player.play(station);
    expect(player.status).toBe('connecting');
    expect(audio.src).toBe(`proxy?u=${station.url}&s=${player.session}`);
    audio.fire('playing');
    expect(player.status).toBe('playing');
    expect(started).toHaveBeenCalledWith(station);
    expect(playing).toHaveBeenCalledOnce();
  });

  it('stop disconnects and toggle resumes live', () => {
    player.play(station);
    audio.fire('playing');
    player.toggle();
    expect(player.status).toBe('idle');
    expect(audio.src).toBe('');
    player.toggle();
    expect(player.status).toBe('connecting');
    expect(audio.plays).toBe(2);
  });

  it('ignores titles of older connections and clears them on a new station', () => {
    player.play(station);
    const first = player.session;
    player.nowPlaying(first, 'Song A');
    expect(player.title).toBe('Song A');
    player.play(other);
    player.nowPlaying(first, 'Late title');
    expect(player.title).toBe('');
  });

  it('reconnects with backoff and gives up after the last attempt', () => {
    player.play(station);
    for (const delay of RETRY_DELAYS_MS) {
      audio.fire('error');
      expect(player.status).toBe('reconnecting');
      // A second event for the same drop does not schedule another attempt.
      audio.fire('ended');
      vi.advanceTimersByTime(delay);
    }
    audio.fire('error');
    expect(player.status).toBe('error');
    expect(audio.plays).toBe(1 + RETRY_DELAYS_MS.length);
  });

  it('starts counting again after a successful reconnect', () => {
    player.play(station);
    audio.fire('error');
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]!);
    audio.fire('playing');
    audio.fire('error');
    expect(player.status).toBe('reconnecting');
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]!);
    expect(audio.plays).toBe(3);
  });

  it('does not reconnect after stop', () => {
    player.play(station);
    audio.fire('error');
    player.stop();
    vi.advanceTimersByTime(60_000);
    expect(audio.plays).toBe(1);
    expect(player.status).toBe('idle');
  });

  it('clamps volume and unmutes when turned up', () => {
    player.setMuted(true);
    player.setVolume(1.5);
    expect(player.volume).toBe(1);
    expect(audio.muted).toBe(false);
  });
});
