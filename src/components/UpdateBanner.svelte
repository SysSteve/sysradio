<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import type { AppState } from '../lib/app.svelte';

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
</script>

{#if shown && app.update}
  <section class="update" aria-label={t('update.label')}>
    <Download size={20} aria-hidden="true" />
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
      {#if status === 'available' || status === 'failed'}
        <div class="actions">
          <button class="btn btn-primary" onclick={() => app.installUpdate()}
            >{t('update.install')}</button
          >
          <button
            class="btn-link"
            onclick={() =>
              app.update && app.platform.openUrl(app.releaseNotesUrl(app.update.version))}
            >{t('update.notes')}</button
          >
          <button class="btn-link" onclick={() => (app.updateDismissed = true)}
            >{t('update.later')}</button
          >
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .update {
    display: flex;
    gap: var(--space-3);
    margin: var(--space-2) var(--space-3) 0;
    padding: var(--space-3);
    border: 1px solid var(--brand);
    border-radius: var(--radius-lg);
    background: var(--brand-soft);
    color: var(--text);
  }

  .update > :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--brand);
  }

  .body {
    display: grid;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
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

  .bar {
    height: 6px;
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
