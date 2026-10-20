<script lang="ts">
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Star from '@lucide/svelte/icons/star';
  import Trash from '@lucide/svelte/icons/trash-2';
  import type { AppState } from '../lib/app.svelte';
  import { isCustom, stationMeta } from '../lib/library';
  import { tooltip } from '../lib/tooltip';
  import type { Station } from '../lib/types';
  import StationLogo from './StationLogo.svelte';

  let {
    app,
    stations,
    mode,
    label,
    onedit,
  }: {
    app: AppState;
    stations: Station[];
    mode: 'favorites' | 'browse';
    label: string;
    onedit?: (station: Station) => void;
  } = $props();

  const t = $derived(app.t);
  const currentId = $derived(app.player.active ? app.player.station?.id : undefined);

  // --- Drag and drop (favourites only), with pointer events ------------------------------
  let list: HTMLUListElement | undefined = $state();
  let dragId = $state<string | null>(null);
  let overIndex = $state(-1);

  function indexAt(y: number): number {
    const rows = [...(list?.querySelectorAll<HTMLElement>(':scope > li') ?? [])];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return Math.max(0, rows.length - 1);
  }

  function autoScroll(y: number) {
    const scroller = list?.closest('main');
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (y < rect.top + 40) scroller.scrollTop -= 10;
    else if (y > rect.bottom - 40) scroller.scrollTop += 10;
  }

  function startDrag(e: PointerEvent, station: Station) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    dragId = station.id;
    overIndex = stations.findIndex((s) => s.id === station.id);
    const move = (ev: PointerEvent) => {
      overIndex = indexAt(ev.clientY);
      autoScroll(ev.clientY);
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape, true);
      if (commit && dragId) app.moveFavoriteTo(dragId, overIndex);
      dragId = null;
      overIndex = -1;
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const escape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape, true);
  }

  /** Keyboard alternative on the handle: arrow keys move the station. */
  function handleKey(e: KeyboardEvent, station: Station) {
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    app.moveFavorite(station.id, delta);
  }
</script>

<ul class="list" class:dragging={dragId !== null} aria-label={label} bind:this={list}>
  {#each stations as station, i (station.id)}
    {@const current = station.id === currentId}
    {@const favorite = app.isFavorite(station.id)}
    {@const own = isCustom(station)}
    <li
      class="row"
      class:current
      class:lifted={dragId === station.id}
      class:drop-before={dragId !== null &&
        dragId !== station.id &&
        overIndex === i &&
        i < stations.findIndex((s) => s.id === dragId)}
      class:drop-after={dragId !== null &&
        dragId !== station.id &&
        overIndex === i &&
        i > stations.findIndex((s) => s.id === dragId)}
    >
      {#if mode === 'favorites'}
        <button
          class="grip"
          aria-label={t('list.drag', station.name)}
          use:tooltip={{ text: t('list.drag', station.name) }}
          onpointerdown={(e) => startDrag(e, station)}
          onkeydown={(e) => handleKey(e, station)}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      {/if}
      <button
        class="main"
        aria-label={t('list.play', station.name)}
        aria-current={current ? 'true' : undefined}
        onclick={() => app.player.play(station)}
      >
        <StationLogo favicon={station.favicon} logoUrl={app.platform.logoUrl} size={40} />
        <span class="text">
          <span class="name">{station.name}</span>
          <span class="meta">
            {#if current}
              <span class="playing"
                ><AudioLines size={14} aria-hidden="true" />{t('list.playing')}</span
              >
            {/if}
            {#if own}<span class="own">{t('list.custom')}</span>{/if}
            {stationMeta(station)}
          </span>
        </span>
      </button>
      <span class="actions">
        {#if mode === 'favorites'}
          {#if own && onedit}
            <button
              class="icon-btn"
              aria-label={t('list.edit', station.name)}
              onclick={() => onedit(station)}
            >
              <Pencil size={17} aria-hidden="true" />
            </button>
          {/if}
          <button
            class="icon-btn arrow"
            aria-label={t('list.moveUp', station.name)}
            disabled={i === 0}
            onclick={() => app.moveFavorite(station.id, -1)}
          >
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <button
            class="icon-btn arrow"
            aria-label={t('list.moveDown', station.name)}
            disabled={i === stations.length - 1}
            onclick={() => app.moveFavorite(station.id, 1)}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button
            class="icon-btn"
            aria-label={t('list.remove', station.name)}
            onclick={() => app.removeFavorite(station)}
          >
            <Trash size={17} aria-hidden="true" />
          </button>
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

  .list.dragging {
    user-select: none;
    cursor: grabbing;
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: var(--radius-lg);
    transition: background-color 0.15s ease;
  }

  .row:hover {
    background: var(--surface-2);
  }

  .row.current {
    background: var(--brand-soft);
  }

  .row.lifted {
    background: var(--surface);
    outline: 2px solid var(--brand);
    box-shadow: var(--shadow-float);
    z-index: 1;
  }

  .row.drop-before::before,
  .row.drop-after::after {
    content: '';
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--brand);
  }

  .row.drop-before::before {
    top: -2px;
  }

  .row.drop-after::after {
    bottom: -2px;
  }

  .grip {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    cursor: grab;
    touch-action: none;
  }

  .grip:hover {
    color: var(--text);
    background: var(--surface-2);
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
    font-weight: 650;
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
    font-weight: 650;
  }

  .own {
    margin-inline-end: var(--space-1);
    padding: 0 5px;
    border: 1px solid var(--control);
    border-radius: var(--radius-sm);
    font-size: 0.6875rem;
  }

  .actions {
    display: flex;
    flex: none;
    padding-inline-end: var(--space-1);
  }

  @media (max-width: 379px) {
    .actions .icon-btn {
      width: 30px;
    }
  }
</style>
