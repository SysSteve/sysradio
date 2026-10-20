<script lang="ts">
  import Link from '@lucide/svelte/icons/link';
  import Star from '@lucide/svelte/icons/star';
  import type { AppState } from '../lib/app.svelte';
  import type { Station } from '../lib/types';
  import CustomStationDialog from './CustomStationDialog.svelte';
  import StationList from './StationList.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);

  /** null: closed; 'new': add; a station: edit. */
  let editing = $state<Station | 'new' | null>(null);
</script>

{#if app.library.favorites.length === 0}
  <div class="empty">
    <Star size={32} aria-hidden="true" />
    <p><strong>{t('favorites.empty')}</strong><br />{t('favorites.emptyHint')}</p>
    <button class="btn btn-primary" onclick={() => (app.tab = 'search')}
      >{t('favorites.toSearch')}</button
    >
  </div>
{:else}
  <StationList
    {app}
    stations={app.library.favorites}
    mode="favorites"
    label={t('tabs.favorites')}
    onedit={(station) => (editing = station)}
  />
{/if}

<div class="footer">
  <button class="btn" onclick={() => (editing = 'new')}>
    <Link size={16} aria-hidden="true" />
    {t('favorites.add')}
  </button>
</div>

{#if editing}
  <CustomStationDialog
    {app}
    station={editing === 'new' ? null : editing}
    onclose={() => (editing = null)}
  />
{/if}

<style>
  .footer {
    display: flex;
    justify-content: center;
    padding: var(--space-2) var(--space-4) var(--space-5);
  }
</style>
