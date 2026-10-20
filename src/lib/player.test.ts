import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, RETRY_DELAYS_MS, type AudioLike, type StreamSource } from './player.svelte';
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
  let hlsFatal: (() => void) | null;
  let hlsDetached: number;
  beforeEach(() => {
    vi.useFakeTimers();
    audio = new FakeAudio();
    hlsFatal = null;
    hlsDetached = 0;
    const source: StreamSource = {
      streamUrl: (url, session) => `proxy?u=${url}&s=${session}`,
      hlsUrl: (url) => `hls?u=${url}`,
      attachHls: async (el, url, onFatal) => {
        el.src = `mse:${url}`;
        hlsFatal = onFatal;
        return () => hlsDetached++;
      },
    };
    player = new Player(source, audio);
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

  it('plays HLS through the loader and reconnects when it fails', async () => {
    player.play({ ...station, hls: true });
    await vi.waitFor(() => expect(audio.src).toBe(`mse:hls?u=${station.url}`));
    expect(audio.plays).toBe(1);
    hlsFatal!();
    expect(player.status).toBe('reconnecting');
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]!);
    expect(hlsDetached).toBe(1);
    player.stop();
    // The loader of the replaced connection is released as soon as it finishes attaching.
    await vi.waitFor(() => expect(hlsDetached).toBe(2));
  });

  it('clamps volume and unmutes when turned up', () => {
    player.setMuted(true);
    player.setVolume(1.5);
    expect(player.volume).toBe(1);
    expect(audio.muted).toBe(false);
  });
});
