<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Star from '@lucide/svelte/icons/star';
  import Trash from '@lucide/svelte/icons/trash-2';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import type { AppState } from '../lib/app.svelte';
  import { stationMeta } from '../lib/library';
  import type { Station } from '../lib/types';
  import StationLogo from './StationLogo.svelte';

  let {
    app,
    stations,
    mode,
    label,
  }: {
    app: AppState;
    stations: Station[];
    mode: 'favorites' | 'browse';
    label: string;
  } = $props();

  const t = $derived(app.t);
  const currentId = $derived(app.player.active ? app.player.station?.id : undefined);
</script>

<ul class="list" aria-label={label}>
  {#each stations as station, i (station.id)}
    {@const current = station.id === currentId}
    {@const favorite = app.isFavorite(station.id)}
    <li class="row" class:current>
      <button
        class="main"
        aria-label={t('list.play', station.name)}
        aria-current={current ? 'true' : undefined}
        onclick={() => app.player.play(station)}
      >
        <StationLogo {station} logoUrl={app.platform.logoUrl} size={40} />
        <span class="text">
          <span class="name">{station.name}</span>
          <span class="meta">
            {#if current}
              <span class="playing"
                ><AudioLines size={14} aria-hidden="true" />{t('list.playing')}</span
              >
            {/if}
            {stationMeta(station)}
          </span>
        </span>
      </button>
      <span class="actions">
        {#if mode === 'favorites'}
          <button
            class="icon-btn"
            aria-label={t('list.moveUp', station.name)}
            disabled={i === 0}
            onclick={() => app.moveFavorite(station.id, -1)}
            ><ChevronUp size={18} aria-hidden="true" /></button
          >
          <button
            class="icon-btn"
            aria-label={t('list.moveDown', station.name)}
            disabled={i === stations.length - 1}
            onclick={() => app.moveFavorite(station.id, 1)}
            ><ChevronDown size={18} aria-hidden="true" /></button
          >
          <button
            class="icon-btn"
            aria-label={t('list.remove', station.name)}
            onclick={() => app.removeFavorite(station)}
            ><Trash size={18} aria-hidden="true" /></button
          >
        {:else}
          <button
            class="icon-btn"
            aria-label={t('list.addFavorite', station.name)}
            aria-pressed={favorite}
            onclick={() => app.toggleFavorite(station)}
          >
            <Star size={20} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .list {
    margin: 0;
    padding: var(--space-2);
    list-style: none;
    display: grid;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: var(--radius-lg);
  }

  .row:hover {
    background: var(--surface-2);
  }

  .row.current {
    background: var(--brand-soft);
  }

  .main {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    min-height: 56px;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-lg);
    background: none;
    text-align: start;
  }

  .text {
    display: grid;
    min-width: 0;
  }

  .name,
  .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .name {
    font-weight: 600;
  }

  .meta {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .playing {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-inline-end: var(--space-1);
    color: var(--brand);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex: none;
    padding-inline-end: var(--space-1);
  }
</style>
