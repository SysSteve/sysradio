<script lang="ts">
  import Star from '@lucide/svelte/icons/star';
  import type { AppState } from '../lib/app.svelte';
  import StationList from './StationList.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
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
  />
{/if}
