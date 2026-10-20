<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Download from '@lucide/svelte/icons/download';
  import Maximize from '@lucide/svelte/icons/maximize-2';
  import Play from '@lucide/svelte/icons/play';
  import SkipBack from '@lucide/svelte/icons/skip-back';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import Square from '@lucide/svelte/icons/square';
  import Star from '@lucide/svelte/icons/star';
  import Volume from '@lucide/svelte/icons/volume-2';
  import VolumeOff from '@lucide/svelte/icons/volume-x';
  import X from '@lucide/svelte/icons/x';
  import StationLogo from './components/StationLogo.svelte';
  import Visualizer from './components/Visualizer.svelte';
  import { translator } from './lib/i18n';
  import { actionFor, ariaKeys, bindingParts } from './lib/keybindings';
  import type { Platform } from './lib/platform';
  import { tooltip } from './lib/tooltip';
  import type { PlayerCommand, PlayerSnapshot, ShortcutAction } from './lib/types';

  /** Floating player: mirrors the main window's player and sends it commands. */
  let { platform }: { platform: Platform } = $props();

  let snap = $state<PlayerSnapshot | null>(null);
  let spectrum: number[] | null = null;
  let spectrumAt = 0;

  const t = $derived(translator(snap?.locale ?? 'en'));
  const active = $derived(!!snap && snap.status !== 'idle' && snap.status !== 'error');
  const busy = $derived(snap?.status === 'connecting' || snap?.status === 'reconnecting');
  const volumePercent = $derived(Math.round((snap?.volume ?? 0) * 100));

  $effect(() => {
    const offs = [
      platform.onSnapshot((s) => (snap = s)),
      platform.onSpectrum((levels) => {
        spectrum = levels;
        spectrumAt = performance.now();
      }),
    ];
    platform.sendCommand({ type: 'hello' });
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  });

  $effect(() => {
    if (snap) document.documentElement.lang = snap.locale;
  });

  const send = (command: PlayerCommand) => platform.sendCommand(command);

  /** Real spectrum while it keeps coming; otherwise the visualizer's calm motion. */
  function levels(count: number): number[] | null {
    if (!spectrum || performance.now() - spectrumAt > 300) return null;
    return Array.from(
      { length: count },
      (_, i) => spectrum![Math.floor((i / count) * spectrum!.length)] ?? 0,
    );
  }

  function keysOf(action: ShortcutAction) {
    const b = snap?.shortcuts[action].local ?? null;
    if (!b) return '';
    return bindingParts(
      b,
      {
        ctrl: t('keys.ctrl'),
        alt: t('keys.alt'),
        shift: t('keys.shift'),
        meta: t('keys.meta'),
        space: t('keys.space'),
      },
      platform.isMac,
    ).join('+');
  }
  const tip = (action: ShortcutAction, text: string) => ({ text, keys: keysOf(action) });
  const aria = (action: ShortcutAction) => ariaKeys(snap?.shortcuts[action].local ?? null);

  function onKeydown(e: KeyboardEvent) {
    if (!snap) return;
    const action = actionFor(e, snap.shortcuts);
    if (!action) return;
    e.preventDefault();
    send({ type: action });
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main class="mini" aria-label={t('mini.label')}>
  <div class="bg" data-tauri-drag-region></div>
  {#if snap?.visualizer}
    <div class="viz-layer" aria-hidden="true">
      <Visualizer {levels} active={snap.status === 'playing'} bars={24} />
    </div>
  {/if}

  <div class="logo" data-tauri-drag-region>
    <StationLogo favicon={snap?.station?.logo ?? ''} logoUrl={(u) => u} size={56} tone="hero" />
  </div>

  <div class="info" data-tauri-drag-region>
    <p class="name" data-tauri-drag-region>
      {snap?.station?.name ?? (snap ? t('player.nothing') : t('mini.waiting'))}
    </p>
    <p class="line" data-tauri-drag-region>
      {#if snap?.status === 'playing'}<span class="live">{t('player.live')}</span>{/if}
      <span class="line-text" data-tauri-drag-region>
        {#if snap?.status === 'connecting'}{t('player.connecting')}
        {:else if snap?.status === 'reconnecting'}{t('player.reconnecting')}
        {:else if snap?.status === 'error'}{t('player.error')}
        {:else}{snap?.title ?? ''}{/if}
      </span>
    </p>
  </div>

  <div class="controls">
    <button
      class="btn prev"
      aria-label={t('player.previous')}
      aria-keyshortcuts={aria('previous')}
      disabled={!snap?.hasFavorites}
      use:tooltip={tip('previous', t('player.previous'))}
      onclick={() => send({ type: 'previous' })}><SkipBack size={18} aria-hidden="true" /></button
    >
    <button
      class="play"
      aria-label={active ? t('player.stop') : t('player.play')}
      aria-keyshortcuts={aria('toggle')}
      disabled={!snap?.station}
      use:tooltip={tip('toggle', active ? t('player.stop') : t('player.play'))}
      onclick={() => send({ type: 'toggle' })}
    >
      {#if busy}<LoaderCircle size={22} class="spin" aria-hidden="true" />
      {:else if active}<Square size={16} fill="currentColor" aria-hidden="true" />
      {:else}<Play size={22} fill="currentColor" aria-hidden="true" />{/if}
    </button>
    <button
      class="btn next"
      aria-label={t('player.next')}
      aria-keyshortcuts={aria('next')}
      disabled={!snap?.hasFavorites}
      use:tooltip={tip('next', t('player.next'))}
      onclick={() => send({ type: 'next' })}><SkipForward size={18} aria-hidden="true" /></button
    >
    <div class="volume-group">
      <button
        class="btn"
        aria-label={snap?.muted ? t('player.unmute') : t('player.mute')}
        aria-keyshortcuts={aria('mute')}
        use:tooltip={tip('mute', snap?.muted ? t('player.unmute') : t('player.mute'))}
        onclick={() => send({ type: 'mute' })}
      >
        {#if snap?.muted || volumePercent === 0}<VolumeOff size={18} aria-hidden="true" />
        {:else}<Volume size={18} aria-hidden="true" />{/if}
      </button>
      <input
        class="volume"
        type="range"
        min="0"
        max="100"
        value={volumePercent}
        aria-label={t('player.volume')}
        aria-valuetext="{volumePercent} %"
        style:--fill="{snap?.muted ? 0 : volumePercent}%"
        oninput={(e) => send({ type: 'setVolume', volume: Number(e.currentTarget.value) / 100 })}
      />
    </div>
    <button
      class="btn fav"
      aria-label={t('player.favoriteAdd')}
      aria-pressed={snap?.favorite ?? false}
      disabled={!snap?.station}
      use:tooltip={{ text: t('player.favoriteAdd') }}
      onclick={() => send({ type: 'favorite' })}
    >
      <Star size={18} fill={snap?.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  </div>

  <div class="window">
    {#if snap?.updateVersion}
      <button
        class="btn update"
        aria-label={t('update.miniHint', snap.updateVersion)}
        use:tooltip={{ text: t('update.miniHint', snap.updateVersion) }}
        onclick={() => send({ type: 'mini' })}><Download size={16} aria-hidden="true" /></button
      >
    {/if}
    <button
      class="btn"
      aria-label={t('mini.expand')}
      aria-keyshortcuts={aria('mini')}
      use:tooltip={tip('mini', t('mini.expand'))}
      onclick={() => send({ type: 'mini' })}><Maximize size={16} aria-hidden="true" /></button
    >
    <button
      class="btn"
      aria-label={t('mini.hide')}
      use:tooltip={{ text: t('mini.hide') }}
      onclick={() => platform.hideWindow()}
    >
      <X size={16} aria-hidden="true" />
    </button>
  </div>
</main>

<style>
  :global(html),
  :global(body) {
    background: transparent;
  }

  /* The window is the container: the layout follows its size. */
  :global(#app) {
    container-type: size;
    height: 100vh;
  }

  .mini {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'logo info controls window';
    align-items: center;
    gap: var(--space-2);
    height: 100%;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    overflow: hidden;
    color: var(--on-hero);
    background-color: var(--hero-2);
    background-image: linear-gradient(135deg, var(--hero-1), var(--hero-2));
    user-select: none;
  }

  .bg {
    position: absolute;
    inset: 0;
    z-index: -2;
  }

  .viz-layer {
    position: absolute;
    inset: auto 0 0 0;
    height: 60%;
    z-index: -1;
    opacity: 0.4;
    pointer-events: none;
    mask-image: linear-gradient(to top, #000 20%, transparent);
  }

  .logo {
    grid-area: logo;
  }

  .info {
    grid-area: info;
    min-width: 0;
  }

  .name {
    font-weight: 750;
    font-size: var(--font-size-md);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 1.3em;
    font-size: var(--font-size-sm);
    color: var(--on-hero-muted);
  }

  .line-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .live {
    flex: none;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 0.16);
    color: var(--on-hero);
    font-size: 0.625rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .controls {
    grid-area: controls;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .window {
    grid-area: window;
    display: flex;
    flex-direction: column;
    align-self: start;
  }

  .btn {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--on-hero);
    opacity: 0.88;
  }

  .window .btn {
    width: 28px;
    height: 28px;
  }

  .window .update {
    color: var(--viz-1);
    opacity: 1;
  }

  .btn:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.14);
    opacity: 1;
  }

  .btn:disabled {
    opacity: 0.4;
  }

  .btn[aria-pressed='true'] {
    opacity: 1;
  }

  .btn:focus-visible,
  .play:focus-visible,
  .volume:focus-visible {
    outline-color: var(--on-hero);
  }

  .play {
    display: grid;
    place-items: center;
    flex: none;
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 50%;
    background: var(--on-hero);
    color: var(--hero-2);
  }

  .play:disabled {
    background: rgb(255 255 255 / 0.3);
  }

  .play :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .volume-group {
    display: none;
    align-items: center;
  }

  .volume {
    width: 80px;
    height: 24px;
    background: transparent;
    appearance: none;
  }

  .volume::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: linear-gradient(
      to right,
      var(--on-hero) var(--fill),
      var(--hero-control) var(--fill)
    );
  }

  .volume::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--on-hero);
  }

  .fav {
    display: none;
  }

  /* Small: only the essentials. */
  @container (max-width: 300px) {
    .info,
    .prev,
    .next {
      display: none;
    }
    .mini {
      grid-template-columns: auto 1fr auto auto;
    }
  }

  /* Wide: volume and favourite join the row. */
  @container (min-width: 480px) {
    .volume-group {
      display: flex;
    }
    .fav {
      display: inline-grid;
    }
  }

  /* Tall: big logo, title on top, controls in a second row. */
  @container (min-height: 150px) {
    .mini {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'logo info window'
        'controls controls controls';
      align-content: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    }
    .controls {
      justify-content: center;
    }
    .volume-group {
      display: flex;
      flex: 1;
    }
    .volume {
      flex: 1;
      width: auto;
    }
    .fav {
      display: inline-grid;
    }
    .name {
      font-size: var(--font-size-lg);
    }
  }
</style>
