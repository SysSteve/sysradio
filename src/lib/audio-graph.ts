import { EQ_BANDS, bandType, headroom } from './eq';

const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * Web Audio chain behind the <audio> element: pre-gain (headroom) → 10 filters → analyser →
 * speakers. Built on first playback. If the audio context cannot start (no Web Audio, or
 * playback without a user gesture), the element keeps playing directly, without EQ.
 * The element must have `crossOrigin = 'anonymous'`; the stream proxy answers with CORS.
 */
export class AudioGraph {
  #audio: HTMLMediaElement;
  #ctx: AudioContext | null = null;
  #pre: GainNode | null = null;
  #filters: BiquadFilterNode[] = [];
  #analyser: AnalyserNode | null = null;
  #enabled = false;
  #gains: number[] = EQ_BANDS.map(() => 0);
  #failed = false;

  constructor(audio: HTMLMediaElement) {
    this.#audio = audio;
  }

  get ready(): boolean {
    return this.#analyser !== null && this.#ctx?.state === 'running';
  }

  /** Builds the chain if possible; safe to call on every playback start. */
  async ensure(): Promise<boolean> {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') await this.#ctx.resume().catch(() => {});
      return this.ready;
    }
    if (this.#failed || typeof AudioContext === 'undefined') return false;
    const ctx = new AudioContext();
    await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
    if (ctx.state !== 'running') {
      // Connecting the element now would route it into a silent context: keep it direct.
      void ctx.close();
      this.#failed = true;
      return false;
    }
    try {
      const source = ctx.createMediaElementSource(this.#audio);
      this.#pre = ctx.createGain();
      this.#filters = EQ_BANDS.map((hz, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = bandType(i);
        filter.frequency.value = hz;
        filter.Q.value = 1.1;
        return filter;
      });
      this.#analyser = ctx.createAnalyser();
      this.#analyser.fftSize = 256;
      this.#analyser.smoothingTimeConstant = 0.72;
      let node: AudioNode = source.connect(this.#pre);
      for (const filter of this.#filters) node = node.connect(filter);
      node.connect(this.#analyser).connect(ctx.destination);
      this.#ctx = ctx;
      this.#apply();
      return true;
    } catch {
      void ctx.close();
      this.#failed = true;
      return false;
    }
  }

  setEq(enabled: boolean, gains: number[]) {
    this.#enabled = enabled;
    this.#gains = [...gains];
    this.#apply();
  }

  /** Fills `out` with the current spectrum (0–255 per bin); false when nothing is available. */
  spectrum(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.ready || !this.#analyser) return false;
    this.#analyser.getByteFrequencyData(out);
    return true;
  }

  get bins(): number {
    return this.#analyser?.frequencyBinCount ?? 128;
  }

  get sampleRate(): number {
    return this.#ctx?.sampleRate ?? 48000;
  }

  #apply() {
    if (!this.#ctx || !this.#pre) return;
    const now = this.#ctx.currentTime;
    const gains = this.#enabled ? this.#gains : this.#gains.map(() => 0);
    // Short ramps avoid clicks while dragging a slider.
    this.#pre.gain.setTargetAtTime(dbToGain(this.#enabled ? headroom(gains) : 0), now, 0.02);
    this.#filters.forEach((f, i) => f.gain.setTargetAtTime(gains[i] ?? 0, now, 0.02));
  }
}
