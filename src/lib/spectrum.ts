/**
 * Turns FFT bins (0–255, linear frequency) into `count` bar levels (0–1) on a logarithmic
 * frequency scale, which matches how we hear: bass gets as many bars as the treble.
 */
export function toLevels(bins: ArrayLike<number>, count: number, sampleRate = 48000): number[] {
  const nyquist = sampleRate / 2;
  const minHz = 40;
  const maxHz = Math.min(16000, nyquist);
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    const lo = minHz * (maxHz / minHz) ** (i / count);
    const hi = minHz * (maxHz / minHz) ** ((i + 1) / count);
    const from = Math.floor((lo / nyquist) * bins.length);
    const to = Math.max(from + 1, Math.ceil((hi / nyquist) * bins.length));
    let peak = 0;
    for (let b = from; b < to && b < bins.length; b++) peak = Math.max(peak, bins[b] ?? 0);
    // Slight lift for the treble, which is naturally quieter.
    const tilt = 0.85 + 0.3 * (i / count);
    levels.push(Math.min(1, (peak / 255) * tilt));
  }
  return levels;
}

/** Gentle synthetic motion for when real data is not available (no Web Audio). */
export function idleLevels(count: number, time: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(time / 420 + i * 0.55) * 0.5 + Math.sin(time / 230 + i * 1.3) * 0.25;
    return 0.18 + 0.22 * (wave + 0.75);
  });
}
