<script lang="ts">
  import type { AppState } from '../lib/app.svelte';

  let { app }: { app: AppState } = $props();

  // Notices disappear after a while; undo stays possible until then.
  $effect(() => {
    if (!app.notice) return;
    const timer = setTimeout(() => (app.notice = null), 8000);
    return () => clearTimeout(timer);
  });
</script>

<div role="status">
  {#if app.notice}
    <p class="notice">
      <span>{app.notice.text}</span>
      {#if app.notice.undo}
        <button
          class="btn-link"
          onclick={() => {
            app.notice?.undo?.();
            app.notice = null;
          }}>{app.t('favorites.undo')}</button
        >
      {/if}
    </p>
  {/if}
</div>
