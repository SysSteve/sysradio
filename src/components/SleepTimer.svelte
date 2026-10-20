<script lang="ts">
  import Moon from '@lucide/svelte/icons/moon';
  import type { AppState } from '../lib/app.svelte';
  import { tooltip } from '../lib/tooltip';

  /** Moon button with a small panel of radio buttons: off, 15 … 90 minutes. */
  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
  const OPTIONS = [15, 30, 45, 60, 90];

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let button: HTMLButtonElement | undefined = $state();
  const left = $derived(app.sleepMinutesLeft);
  const label = $derived(left === null ? t('sleep.label') : t('sleep.remaining', left));
  /** Minutes of the running timer, rounded to the option it was started with. */
  let chosen = $state<number | null>(null);

  function choose(minutes: number | null) {
    chosen = minutes;
    app.setSleepTimer(minutes);
    open = false;
    button?.focus();
  }

  $effect(() => {
    if (left === null) chosen = null;
  });

  $effect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        open = false;
        button?.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  });
</script>

<div class="sleep" bind:this={root}>
  <button
    bind:this={button}
    class="hero-btn"
    class:active={left !== null}
    aria-label={label}
    aria-expanded={open}
    aria-controls="sleep-panel"
    use:tooltip={{ text: label }}
    onclick={() => (open = !open)}
  >
    <Moon size={18} aria-hidden="true" />
    {#if left !== null}<span class="badge" aria-hidden="true">{left}</span>{/if}
  </button>
  {#if open}
    <fieldset id="sleep-panel" class="panel">
      <legend>{t('sleep.label')}</legend>
      <label class="option">
        <input type="radio" name="sleep" checked={chosen === null} onchange={() => choose(null)} />
        {t('sleep.off')}
      </label>
      {#each OPTIONS as minutes (minutes)}
        <label class="option">
          <input
            type="radio"
            name="sleep"
            checked={chosen === minutes}
            onchange={() => choose(minutes)}
          />
          {t('sleep.minutes', minutes)}
        </label>
      {/each}
    </fieldset>
  {/if}
</div>

<style>
  .sleep {
    position: relative;
  }

  .hero-btn {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--on-hero);
    opacity: 0.88;
  }

  .hero-btn:hover,
  .hero-btn.active,
  .hero-btn[aria-expanded='true'] {
    background: rgb(255 255 255 / 0.16);
    opacity: 1;
  }

  .hero-btn:focus-visible {
    outline-color: var(--on-hero);
  }

  .badge {
    position: absolute;
    right: -2px;
    bottom: -2px;
    min-width: 18px;
    padding: 0 4px;
    border-radius: var(--radius-pill);
    background: var(--on-hero);
    color: var(--hero-2);
    font-size: 0.625rem;
    font-weight: 800;
    line-height: 16px;
  }

  .panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    display: grid;
    min-width: 170px;
    margin: 0;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-float);
  }

  legend {
    padding: 0 var(--space-1);
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-muted);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .option:hover {
    background: var(--surface-2);
  }

  .option input {
    margin: 0;
    accent-color: var(--brand);
  }
</style>
