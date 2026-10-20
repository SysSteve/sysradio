<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import PictureInPicture from '@lucide/svelte/icons/picture-in-picture-2';
  import Pin from '@lucide/svelte/icons/pin';
  import Play from '@lucide/svelte/icons/play';
  import SkipBack from '@lucide/svelte/icons/skip-back';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import Square from '@lucide/svelte/icons/square';
  import Star from '@lucide/svelte/icons/star';
  import Volume from '@lucide/svelte/icons/volume-2';
  import VolumeOff from '@lucide/svelte/icons/volume-x';
  import type { AppState } from '../lib/app.svelte';
  import { ariaKeys } from '../lib/keybindings';
  import { stationMeta } from '../lib/library';
  import { toLevels } from '../lib/spectrum';
  import { tooltip } from '../lib/tooltip';
  import type { ShortcutAction } from '../lib/types';
  import StationLogo from './StationLogo.svelte';
  import Visualizer from './Visualizer.svelte';

  let { app }: { app: AppState } = $props();

  const t = $derived(app.t);
  const player = $derived(app.player);
  const station = $derived(player.station);
  const favorite = $derived(station ? app.isFavorite(station.id) : false);
  const busy = $derived(player.status === 'connecting' || player.status === 'reconnecting');
  const hasFavorites = $derived(app.library.favorites.length > 0);

  const line = $derived.by(() => {
    switch (player.status) {
      case 'connecting':
        return t('player.connecting');
      case 'reconnecting':
        return t('player.reconnecting');
      case 'error':
        return t('player.error');
      case 'playing':
        return player.title;
      default:
        return station ? stationMeta(station) : t('player.pick');
    }
  });

  /** Spoken by screen readers: problems always, song titles only when wanted. */
  const announcement = $derived.by(() => {
    if (player.status === 'error' || player.status === 'reconnecting') return line;
    if (player.status === 'playing' && player.title && app.settings.announceTitles)
      return t('player.nowPlaying', player.title);
    return '';
  });

  const volumePercent = $derived(Math.round(player.volume * 100));

  /** Tooltip with the shortcut currently assigned (it may have been changed). */
  function tip(action: ShortcutAction, text: string) {
    return { text, keys: app.keysLabel(app.settings.shortcuts[action].local) };
  }
  function keys(action: ShortcutAction) {
    return ariaKeys(app.settings.shortcuts[action].local);
  }
  const volumeKeys = $derived(
    [app.settings.shortcuts.volumeUp.local, app.settings.shortcuts.volumeDown.local]
      .map((b) => app.keysLabel(b))
      .filter(Boolean)
      .join(' / '),
  );

  const buffer = new Uint8Array(128);
  function levels(count: number) {
    return app.graph.spectrum(buffer) ? toLevels(buffer, count, app.graph.sampleRate) : null;
  }
</script>

<section class="player" aria-label={t('player.label')}>
  {#if app.settings.visualizer}
    <div class="viz-layer">
      <Visualizer {levels} active={player.status === 'playing'} />
    </div>
  {/if}

  <div class="top">
    <StationLogo favicon={station?.favicon} logoUrl={app.platform.logoUrl} size={64} tone="hero" />
    <div class="info">
      <h1 class="name">{station?.name ?? t('player.nothing')}</h1>
      <p class="line" class:error={player.status === 'error'}>
        {#if player.status === 'playing'}<span class="live"
            ><span class="dot"></span>{t('player.live')}</span
          >{/if}
        <span class="line-text">{line}</span>
      </p>
    </div>
    <button
      class="hero-btn"
      aria-label={t('player.favoriteAdd')}
      aria-pressed={favorite}
      disabled={!station}
      use:tooltip={{ text: t('player.favoriteAdd') }}
      onclick={() => station && app.toggleFavorite(station)}
    >
      <Star size={22} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  </div>

  <div class="controls">
    <button
      class="hero-btn"
      aria-label={t('player.previous')}
      aria-keyshortcuts={keys('previous')}
      disabled={!hasFavorites}
      use:tooltip={tip('previous', t('player.previous'))}
      onclick={() => app.run('previous')}
    >
      <SkipBack size={20} aria-hidden="true" />
    </button>
    <button
      class="play"
      aria-label={player.active ? t('player.stop') : t('player.play')}
      aria-keyshortcuts={keys('toggle')}
      disabled={!station}
      use:tooltip={tip('toggle', player.active ? t('player.stop') : t('player.play'))}
      onclick={() => player.toggle()}
    >
      {#if busy}
        <LoaderCircle size={26} class="spin" aria-hidden="true" />
      {:else if player.active}
        <Square size={20} fill="currentColor" aria-hidden="true" />
      {:else}
        <Play size={26} fill="currentColor" aria-hidden="true" />
      {/if}
    </button>
    <button
      class="hero-btn"
      aria-label={t('player.next')}
      aria-keyshortcuts={keys('next')}
      disabled={!hasFavorites}
      use:tooltip={tip('next', t('player.next'))}
      onclick={() => app.run('next')}
    >
      <SkipForward size={20} aria-hidden="true" />
    </button>

    <div class="volume-group">
      <button
        class="hero-btn"
        aria-label={player.muted ? t('player.unmute') : t('player.mute')}
        aria-keyshortcuts={keys('mute')}
        use:tooltip={tip('mute', player.muted ? t('player.unmute') : t('player.mute'))}
        onclick={() => app.setMuted(!player.muted)}
      >
        {#if player.muted || player.volume === 0}
          <VolumeOff size={20} aria-hidden="true" />
        {:else}
          <Volume size={20} aria-hidden="true" />
        {/if}
      </button>
      <input
        class="volume"
        type="range"
        min="0"
        max="100"
        step="1"
        value={volumePercent}
        aria-label={t('player.volume')}
        aria-valuetext="{volumePercent} %"
        aria-keyshortcuts={[keys('volumeUp'), keys('volumeDown')].filter(Boolean).join(' ') ||
          undefined}
        use:tooltip={{ text: `${t('player.volume')} ${volumePercent} %`, keys: volumeKeys }}
        oninput={(e) => app.setVolume(Number(e.currentTarget.value) / 100)}
        style:--fill="{player.muted ? 0 : volumePercent}%"
      />
    </div>

    <div class="window-group">
      <button
        class="hero-btn"
        aria-label={t('player.pinOn')}
        aria-pressed={app.settings.alwaysOnTop}
        use:tooltip={{ text: t('player.pinOn') }}
        onclick={() => app.setAlwaysOnTop(!app.settings.alwaysOnTop)}
      >
        <Pin size={18} aria-hidden="true" />
      </button>
      <button
        class="hero-btn"
        aria-label={t('player.miniOn')}
        aria-keyshortcuts={keys('mini')}
        use:tooltip={tip('mini', t('player.miniOn'))}
        onclick={() => app.setMini(true)}
      >
        <PictureInPicture size={18} aria-hidden="true" />
      </button>
    </div>
  </div>

  {#if player.status === 'error'}
    <button class="retry" onclick={() => station && player.play(station)}
      >{t('player.retry')}</button
    >
  {/if}

  <p class="visually-hidden" role="status">{announcement}</p>
</section>

<style>
  .player {
    position: relative;
    isolation: isolate;
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4) var(--space-3);
    overflow: hidden;
    /* Solid colour first: axe and forced-colours modes read it; the gradient sits on top. */
    background-color: var(--hero-2);
    background-image: linear-gradient(135deg, var(--hero-1) 0%, var(--hero-2) 100%);
    color: var(--on-hero);
  }

  .viz-layer {
    position: absolute;
    inset: auto 0 0 0;
    height: 56px;
    z-index: -1;
    opacity: 0.45;
    pointer-events: none;
    mask-image: linear-gradient(to top, #000 30%, transparent);
  }

  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
  }

  .info {
    min-width: 0;
  }

  .name {
    font-size: var(--font-size-xl);
    font-weight: 750;
    letter-spacing: -0.01em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    min-height: 1.4em;
    font-size: var(--font-size-sm);
    color: var(--on-hero-muted);
  }

  .line-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line.error {
    color: var(--on-hero);
    font-weight: 700;
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 0.16);
    color: var(--on-hero);
    font-size: 0.6875rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--viz-1);
    animation: pulse 1.6s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .hero-btn {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--on-hero);
    opacity: 0.88;
  }

  .hero-btn:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.14);
    opacity: 1;
  }

  .hero-btn[aria-pressed='true'] {
    background: rgb(255 255 255 / 0.18);
    opacity: 1;
  }

  .hero-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .hero-btn:focus-visible,
  .play:focus-visible,
  .volume:focus-visible,
  .retry:focus-visible {
    outline-color: var(--on-hero);
  }

  .play {
    display: grid;
    place-items: center;
    flex: none;
    width: 52px;
    height: 52px;
    border: 0;
    border-radius: 50%;
    background: var(--on-hero);
    color: var(--hero-2);
    transition: transform 0.12s ease;
  }

  .play:hover:not(:disabled) {
    transform: scale(1.05);
  }

  .play:active:not(:disabled) {
    transform: scale(0.97);
  }

  .play:disabled {
    background: rgb(255 255 255 / 0.3);
    color: var(--hero-1);
    cursor: default;
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
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    margin-inline-start: var(--space-2);
  }

  .window-group {
    display: flex;
    flex: none;
  }

  .volume {
    flex: 1;
    min-width: 40px;
    height: 24px;
    margin: 0 var(--space-1);
    background: transparent;
    appearance: none;
    cursor: pointer;
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
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--on-hero);
  }

  .volume::-moz-range-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: linear-gradient(
      to right,
      var(--on-hero) var(--fill),
      var(--hero-control) var(--fill)
    );
  }

  .volume::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: var(--on-hero);
  }

  .retry {
    justify-self: start;
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--on-hero);
    border-radius: var(--radius-pill);
    background: none;
    color: var(--on-hero);
    font-weight: 700;
  }

  /* Narrow window: window buttons move out, the slider keeps its room. */
  @media (max-width: 359px) {
    .window-group {
      display: none;
    }
  }
</style>
