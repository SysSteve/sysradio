<script lang="ts">
  import History from '@lucide/svelte/icons/history';
  import Search from '@lucide/svelte/icons/search';
  import Settings from '@lucide/svelte/icons/settings';
  import SlidersVertical from '@lucide/svelte/icons/sliders-vertical';
  import Star from '@lucide/svelte/icons/star';
  import type { Component } from 'svelte';
  import type { AppState, Tab } from './lib/app.svelte';
  import { actionFor } from './lib/keybindings';
  import { toLevels } from './lib/spectrum';
  import type { PlayerSnapshot, ShortcutAction } from './lib/types';
  import EqualizerView from './components/EqualizerView.svelte';
  import FavoritesView from './components/FavoritesView.svelte';
  import Notice from './components/Notice.svelte';
  import PlayerBar from './components/PlayerBar.svelte';
  import RecentView from './components/RecentView.svelte';
  import SearchView from './components/SearchView.svelte';
  import SettingsView from './components/SettingsView.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
  const player = $derived(app.player);

  /** Equalizer and settings are icons only: their names would not fit next to the others. */
  const tabs: {
    id: Tab;
    icon: Component<{ size?: number; 'aria-hidden'?: 'true' }>;
    iconOnly?: boolean;
  }[] = [
    { id: 'favorites', icon: Star },
    { id: 'search', icon: Search },
    { id: 'recent', icon: History },
    { id: 'eq', icon: SlidersVertical, iconOnly: true },
    { id: 'settings', icon: Settings, iconOnly: true },
  ];
  const tabButtons: Record<string, HTMLButtonElement> = {};

  // Language of the document follows the UI language (screen readers, hyphenation).
  $effect(() => {
    document.documentElement.lang = app.locale;
  });

  // Persist settings and library after every change (the store batches writes).
  $effect(() => {
    if (!app.ready) return;
    JSON.stringify(app.settings);
    JSON.stringify(app.library);
    app.save();
  });

  // Tray: tooltip, play/stop entry, floating player and the favourites menu.
  $effect(() => {
    const station = player.station;
    const tooltip = !station
      ? t('tray.idle')
      : player.active && player.title
        ? `${station.name} – ${player.title}`
        : station.name;
    void app.platform
      .updateTray({
        tooltip,
        playing: player.active,
        mini: app.settings.mini,
        favorites: app.library.favorites.map((s) => ({ id: s.id, name: s.name })),
        labels: {
          play: t('player.play'),
          stop: t('player.stop'),
          favorites: t('tabs.favorites'),
          miniOn: t('player.miniOn'),
          miniOff: t('tray.miniOff'),
          show: t('tray.show'),
          quit: t('tray.quit'),
        },
      })
      .catch(() => {});
  });

  // Events from the tray, the floating player and "now playing" from the stream proxy.
  $effect(() => {
    const offs = [
      app.platform.onTrayAction((action) => {
        if (action.action === 'play') app.playFavorite(action.id);
        else app.run(action.action);
      }),
      app.platform.onNowPlaying((e) => player.nowPlaying(e.session, e.title)),
      app.platform.onCommand((command) => {
        if (command.type === 'hello') sendSnapshot();
        else if (command.type === 'setVolume') app.setVolume(command.volume);
        else if (command.type === 'favorite') {
          if (player.station) app.toggleFavorite(player.station);
        } else app.run(command.type as ShortcutAction);
      }),
    ];
    return () => offs.forEach((off) => void off.then((fn) => fn()));
  });

  // The floating player mirrors this window's player.
  function snapshot(): PlayerSnapshot {
    const station = player.station;
    return {
      station: station ? { name: station.name, logo: app.platform.logoUrl(station.favicon) } : null,
      status: player.status,
      title: player.title,
      volume: player.volume,
      muted: player.muted,
      favorite: station ? app.isFavorite(station.id) : false,
      hasFavorites: app.library.favorites.length > 0,
      locale: app.locale,
      visualizer: app.settings.visualizer,
      shortcuts: $state.snapshot(app.settings.shortcuts),
    };
  }
  function sendSnapshot() {
    app.platform.sendSnapshot(snapshot());
  }
  $effect(() => {
    snapshot();
    sendSnapshot();
  });

  // Spectrum for the floating player, only while it is shown and something plays.
  $effect(() => {
    if (!app.settings.mini || !app.settings.visualizer || player.status !== 'playing') return;
    const buffer = new Uint8Array(128);
    const timer = setInterval(() => {
      if (app.graph.spectrum(buffer))
        app.platform.sendSpectrum(toLevels(buffer, 24, app.graph.sampleRate));
    }, 50);
    return () => clearInterval(timer);
  });

  // Media keys and the system's media overlay (Windows, macOS) via the Media Session API.
  $effect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => !player.active && player.toggle()],
      ['pause', () => player.stop()],
      ['stop', () => player.stop()],
      ['nexttrack', () => app.playNeighbour(1)],
      ['previoustrack', () => app.playNeighbour(-1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action not supported by this web view.
      }
    }
  });
  $effect(() => {
    const session = navigator.mediaSession;
    if (!session || typeof MediaMetadata === 'undefined') return;
    const station = player.station;
    session.playbackState = player.active ? 'playing' : 'paused';
    if (!station) return;
    const logo = app.platform.logoUrl(station.favicon);
    session.metadata = new MediaMetadata({
      title: player.title || station.name,
      artist: player.title ? station.name : t('app.name'),
      album: t('app.name'),
      artwork: logo ? [{ src: logo }] : [],
    });
  });

  function onKeydown(e: KeyboardEvent) {
    const action = actionFor(e, app.settings.shortcuts);
    if (!action) return;
    e.preventDefault();
    app.run(action);
  }

  /** Tabs pattern: arrow keys, Home and End move between tabs. */
  function onTabKeydown(e: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === app.tab);
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    app.tab = tabs[next]!.id;
    tabButtons[app.tab]?.focus();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <PlayerBar {app} />

  <div
    class="tabs"
    role="tablist"
    aria-label={t('tabs.label')}
    tabindex="-1"
    onkeydown={onTabKeydown}
  >
    {#each tabs as tab (tab.id)}
      {@const Icon = tab.icon}
      <button
        bind:this={tabButtons[tab.id]}
        id="tab-{tab.id}"
        class="tab"
        class:icon-only={tab.iconOnly}
        title={tab.iconOnly ? t(`tabs.${tab.id}`) : undefined}
        role="tab"
        aria-selected={app.tab === tab.id}
        aria-controls="panel"
        tabindex={app.tab === tab.id ? 0 : -1}
        onclick={() => (app.tab = tab.id)}
      >
        <Icon size={18} aria-hidden="true" />
        <span class="tab-label" class:visually-hidden={tab.iconOnly}>{t(`tabs.${tab.id}`)}</span>
      </button>
    {/each}
  </div>

  <main id="inhalt" tabindex="-1">
    <Notice {app} />
    <div id="panel" role="tabpanel" aria-labelledby="tab-{app.tab}">
      {#if app.tab === 'favorites'}
        <FavoritesView {app} />
      {:else if app.tab === 'search'}
        <SearchView {app} />
      {:else if app.tab === 'recent'}
        <RecentView {app} />
      {:else if app.tab === 'eq'}
        <EqualizerView {app} />
      {:else}
        <SettingsView {app} />
      {/if}
    </div>
  </main>

  <p class="visually-hidden" role="status">{app.announcement}</p>
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100%;
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: var(--space-2) var(--space-2) 0;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 0 var(--space-1);
    border: 0;
    border-bottom: 3px solid transparent;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: none;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .tab.icon-only {
    flex: none;
    width: 44px;
  }

  .tab:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .tab[aria-selected='true'] {
    border-bottom-color: var(--brand);
    color: var(--brand);
  }

  .tab-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  main {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  main:focus {
    outline: none;
  }

  /* Narrow window: icons only, the name stays available to screen readers. */
  @media (max-width: 379px) {
    .tab-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  }
</style>
