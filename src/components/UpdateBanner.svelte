<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import X from '@lucide/svelte/icons/x';
  import type { AppState } from '../lib/app.svelte';

  /** Update bar at the bottom of the window: always visible, can be closed or the version skipped. */
  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
  const status = $derived(app.updateStatus);
  const shown = $derived(
    !!app.update &&
      !app.updateDismissed &&
      ['available', 'downloading', 'installing', 'failed'].includes(status),
  );
  const percent = $derived(
    app.updateProgress === null ? null : Math.round(app.updateProgress * 100),
  );
  const busy = $derived(status === 'downloading' || status === 'installing');
</script>

{#if shown && app.update}
  <section class="update" aria-label={t('update.label')}>
    <Download size={18} aria-hidden="true" />
    <div class="body">
      <p class="title" role="status">
        {#if status === 'downloading'}
          {percent === null ? t('update.downloadingUnknown') : t('update.downloading', percent)}
        {:else if status === 'installing'}
          {t('update.installing')}
        {:else if status === 'failed'}
          {t('update.failed')}
        {:else}
          {t('update.available', app.update.version)}
        {/if}
      </p>
      {#if status === 'downloading'}
        <div class="bar" aria-hidden="true"><span style:width="{percent ?? 30}%"></span></div>
      {/if}
      {#if !busy}
        <div class="actions">
          <button class="btn btn-primary small" onclick={() => app.installUpdate()}
            >{t('update.install')}</button
          >
          <button
            class="btn-link"
            onclick={() =>
              app.update && app.platform.openUrl(app.releaseNotesUrl(app.update.version))}
            >{t('update.notes')}</button
          >
          <button class="btn-link" onclick={() => app.skipUpdate()}>{t('update.skip')}</button>
        </div>
      {/if}
    </div>
    {#if !busy}
      <button
        class="icon-btn close"
        aria-label={t('update.close')}
        onclick={() => (app.updateDismissed = true)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    {/if}
  </section>
{/if}

<style>
  .update {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-top: 2px solid var(--brand);
    background: var(--brand-soft);
    color: var(--text);
  }

  .update > :global(svg) {
    flex: none;
    margin-top: 9px;
    color: var(--brand);
  }

  .body {
    display: grid;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
    padding-top: 6px;
  }

  .title {
    font-weight: 650;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }

  .small {
    min-height: 32px;
    padding: 0 var(--space-3);
  }

  .close {
    color: var(--text);
  }

  .bar {
    height: 6px;
    margin-bottom: var(--space-1);
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--surface);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand);
    transition: width 0.2s ease;
  }
</style>
