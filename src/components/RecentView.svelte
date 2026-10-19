<script lang="ts">
  import History from '@lucide/svelte/icons/history';
  import type { AppState } from '../lib/app.svelte';
  import StationList from './StationList.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
</script>

{#if app.library.recent.length === 0}
  <div class="empty">
    <History size={32} aria-hidden="true" />
    <p>{t('recent.empty')}</p>
  </div>
{:else}
  <StationList {app} stations={app.library.recent} mode="browse" label={t('tabs.recent')} />
  <div class="footer">
    <button class="btn" onclick={() => app.clearRecent()}>{t('recent.clear')}</button>
  </div>
{/if}

<style>
  .footer {
    padding: 0 var(--space-4) var(--space-4);
  }
</style>
