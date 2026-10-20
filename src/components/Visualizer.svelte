<script lang="ts">
  import { idleLevels } from '../lib/spectrum';

  /**
   * Animated spectrum bars (decorative). `levels()` returns the current bar heights (0–1),
   * or null when no real data exists; then a calm synthetic motion is shown while `active`.
   */
  let {
    levels,
    active,
    bars = 28,
  }: { levels: (count: number) => number[] | null; active: boolean; bars?: number } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const shown = new Array(bars).fill(0);
    let frame = 0;
    let last = 0;

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      // Reduced motion: a few updates per second instead of 60.
      if (reduced && time - last < 400) return;
      last = time;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      if (
        canvas!.width !== Math.round(width * dpr) ||
        canvas!.height !== Math.round(height * dpr)
      ) {
        canvas!.width = Math.round(width * dpr);
        canvas!.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const target = active ? (levels(bars) ?? idleLevels(bars, time)) : null;
      const styles = getComputedStyle(canvas!);
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, styles.getPropertyValue('--viz-1').trim() || '#67e8f9');
      gradient.addColorStop(1, styles.getPropertyValue('--viz-2').trim() || '#c4b5fd');
      ctx.fillStyle = gradient;
      const gap = Math.max(2, width / bars / 4);
      const barWidth = (width - gap * (bars - 1)) / bars;
      for (let i = 0; i < bars; i++) {
        const goal = target ? (target[i] ?? 0) : 0;
        // Fast attack, slow release: bars jump up and float down.
        shown[i] = goal > shown[i] ? goal : shown[i] * (reduced ? 0.5 : 0.9) + goal * 0.1;
        // Silence draws nothing (no dashed baseline).
        if (shown[i] < 0.015) continue;
        const h = shown[i] * height;
        const x = i * (barWidth + gap);
        const r = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.roundRect(x, height - h, barWidth, h, [r, r, 0, 0]);
        ctx.fill();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas bind:this={canvas} class="viz" aria-hidden="true"></canvas>

<style>
  .viz {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0.9;
  }
</style>
