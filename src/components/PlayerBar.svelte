<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Maximize from '@lucide/svelte/icons/maximize-2';
  import Minimize from '@lucide/svelte/icons/minimize-2';
  import Pin from '@lucide/svelte/icons/pin';
  import Play from '@lucide/svelte/icons/play';
  import Square from '@lucide/svelte/icons/square';
  import Star from '@lucide/svelte/icons/star';
  import Volume from '@lucide/svelte/icons/volume-2';
  import VolumeOff from '@lucide/svelte/icons/volume-x';
  import type { AppState } from '../lib/app.svelte';
  import { stationMeta } from '../lib/library';
  import StationLogo from './StationLogo.svelte';

  let { app }: { app: AppState } = $props();

  const t = $derived(app.t);
  const player = $derived(app.player);
  const station = $derived(player.station);
  const favorite = $derived(station ? app.isFavorite(station.id) : false);
  const busy = $derived(player.status === 'connecting' || player.status === 'reconnecting');

  const line = $derived.by(() => {
    switch (player.status) {
      case 'connecting':
        return t('player.connecting');
      case 'reconnecting':
        return t('player.reconnecting');
      case 'error':
        return t('player.error');
      case 'playing':
        return player.title || t('player.live');
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
</script>

<section class="player" aria-label={t('player.label')}>
  <StationLogo {station} logoUrl={app.platform.logoUrl} size={56} />

  <div class="info">
    <h1 class="name">{station?.name ?? t('player.nothing')}</h1>
    <p class="line" class:error={player.status === 'error'}>
      {#if player.status === 'playing'}<span class="live">{t('player.live')}</span>{/if}
      <span class="line-text">{player.status === 'playing' && !player.title ? '' : line}</span>
    </p>
  </div>

  <button
    class="icon-btn fav"
    aria-label={t('player.favoriteAdd')}
    aria-pressed={favorite}
    disabled={!station}
    onclick={() => station && app.toggleFavorite(station)}
  >
    <Star size={22} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
  </button>

  <div class="controls">
    <button
      class="play"
      aria-label={player.active ? t('player.stop') : t('player.play')}
      disabled={!station}
      onclick={() => player.toggle()}
    >
      {#if busy}
        <LoaderCircle size={24} class="spin" aria-hidden="true" />
      {:else if player.active}
        <Square size={20} fill="currentColor" aria-hidden="true" />
      {:else}
        <Play size={24} fill="currentColor" aria-hidden="true" />
      {/if}
    </button>

    <button
      class="icon-btn mute"
      aria-label={player.muted ? t('player.unmute') : t('player.mute')}
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
      oninput={(e) => app.setVolume(Number(e.currentTarget.value) / 100)}
      style:--fill="{player.muted ? 0 : volumePercent}%"
    />

    <button
      class="icon-btn pin"
      aria-label={t('player.pinOn')}
      aria-pressed={app.settings.alwaysOnTop}
      onclick={() => app.setAlwaysOnTop(!app.settings.alwaysOnTop)}
    >
      <Pin size={18} aria-hidden="true" />
    </button>
    <button
      class="icon-btn"
      aria-label={app.settings.compact ? t('player.compactOff') : t('player.compactOn')}
      onclick={() => app.setCompact(!app.settings.compact)}
    >
      {#if app.settings.compact}
        <Maximize size={18} aria-hidden="true" />
      {:else}
        <Minimize size={18} aria-hidden="true" />
      {/if}
    </button>
  </div>

  {#if player.status === 'error'}
    <button class="btn retry" onclick={() => station && player.play(station)}>
      {t('player.retry')}
    </button>
  {/if}

  <p class="visually-hidden" role="status">{announcement}</p>
</section>

<style>
  .player {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'logo info fav'
      'controls controls controls'
      'retry retry retry';
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-2);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .player > :global(.logo) {
    grid-area: logo;
  }

  .info {
    grid-area: info;
    min-width: 0;
  }

  .fav {
    grid-area: fav;
  }

  .name {
    font-size: var(--font-size-lg);
    font-weight: 700;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .line-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .line.error {
    color: var(--danger);
    font-weight: 600;
  }

  .live {
    flex: none;
    padding: 0 6px;
    border: 1px solid var(--live);
    border-radius: var(--radius-sm);
    color: var(--live);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .controls {
    grid-area: controls;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .play {
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    margin-inline-end: var(--space-2);
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--brand);
    color: var(--on-brand);
  }

  .play:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .play:disabled {
    background: var(--surface-2);
    color: var(--text-muted);
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

  .volume {
    flex: 1;
    min-width: 48px;
    height: 24px;
    margin: 0 var(--space-1);
    background: transparent;
    appearance: none;
    cursor: pointer;
  }

  .volume::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: var(--radius-pill);
    background: linear-gradient(to right, var(--brand) var(--fill), var(--control) var(--fill));
  }

  .volume::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    margin-top: -6px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--brand);
  }

  .volume::-moz-range-track {
    height: 6px;
    border-radius: var(--radius-pill);
    background: linear-gradient(to right, var(--brand) var(--fill), var(--control) var(--fill));
  }

  .volume::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--brand);
  }

  .retry {
    grid-area: retry;
    justify-self: start;
  }

  /* Mini view: the window is only as high as one row. */
  @media (max-height: 170px) {
    .player {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: 'logo info controls';
      height: 100vh;
      padding: var(--space-2) var(--space-3);
      border: 0;
    }

    .fav,
    .mute,
    .volume,
    .pin,
    .retry {
      display: none;
    }

    .play {
      width: 40px;
      height: 40px;
      margin: 0;
    }
  }
</style>
