<script lang="ts">
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { untrack } from 'svelte';
  import type { AppState } from '../lib/app.svelte';
  import type { MessageKey } from '../lib/i18n';
  import type { Station } from '../lib/types';

  /** Add a station by address, or edit an own station (`station` set). */
  let {
    app,
    station = null,
    onclose,
  }: { app: AppState; station?: Station | null; onclose: () => void } = $props();
  const t = $derived(app.t);

  let dialog: HTMLDialogElement | undefined = $state();
  // The form starts from the station once; later edits belong to the form.
  const initial = untrack(() => station);
  let url = $state(initial?.url ?? '');
  let name = $state(initial?.name ?? '');
  let favicon = $state(initial?.favicon ?? '');
  let busy = $state(false);
  let urlError = $state('');
  let logoError = $state('');

  $effect(() => {
    dialog?.showModal();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    urlError = '';
    logoError = '';
    const result = await app.saveCustomStation({ url, name, favicon }, station ?? undefined);
    busy = false;
    if (result.ok) {
      dialog?.close();
      return;
    }
    if (result.error === 'logo') logoError = t('custom.error.logo');
    else urlError = t(`custom.error.${result.error}` as MessageKey);
  }
</script>

<dialog bind:this={dialog} class="dialog" aria-labelledby="custom-title" {onclose}>
  <form class="form" onsubmit={submit} novalidate>
    <h2 id="custom-title">{station ? t('custom.titleEdit') : t('custom.titleAdd')}</h2>

    <div class="field">
      <label class="label" for="custom-url">{t('custom.url')}</label>
      <input
        id="custom-url"
        class="input"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        required
        bind:value={url}
        aria-invalid={urlError ? 'true' : undefined}
        aria-errormessage={urlError ? 'custom-url-error' : undefined}
        aria-describedby={urlError ? 'custom-url-hint custom-url-error' : 'custom-url-hint'}
      />
      <p id="custom-url-hint" class="hint">{t('custom.urlHint')}</p>
      {#if urlError}<p id="custom-url-error" class="error">{urlError}</p>{/if}
    </div>

    <div class="field">
      <label class="label" for="custom-name">{t('custom.name')}</label>
      <input
        id="custom-name"
        class="input"
        type="text"
        bind:value={name}
        aria-describedby="custom-name-hint"
      />
      <p id="custom-name-hint" class="hint">{t('custom.nameHint')}</p>
    </div>

    <div class="field">
      <label class="label" for="custom-logo">{t('custom.logo')}</label>
      <input
        id="custom-logo"
        class="input"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        bind:value={favicon}
        aria-invalid={logoError ? 'true' : undefined}
        aria-errormessage={logoError ? 'custom-logo-error' : undefined}
        aria-describedby={logoError ? 'custom-logo-error' : undefined}
      />
      {#if logoError}<p id="custom-logo-error" class="error">{logoError}</p>{/if}
    </div>

    <p class="status" role="status">{busy ? t('custom.checking') : ''}</p>

    <div class="buttons">
      <button type="button" class="btn" onclick={() => dialog?.close()}>{t('custom.cancel')}</button
      >
      <button type="submit" class="btn btn-primary" disabled={busy}>
        {#if busy}<LoaderCircle size={16} class="spin" aria-hidden="true" />{/if}
        {t('custom.save')}
      </button>
    </div>
  </form>
</dialog>

<style>
  .dialog {
    width: min(440px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-float);
  }

  .dialog::backdrop {
    background: rgb(10 6 40 / 0.45);
  }

  .form {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-4) var(--space-4);
  }

  h2 {
    font-size: var(--font-size-lg);
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .error {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--danger);
  }

  .input[aria-invalid='true'] {
    border-color: var(--danger);
    border-width: 2px;
  }

  .status:empty {
    display: none;
  }

  .status {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .buttons :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
