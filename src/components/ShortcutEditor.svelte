<script lang="ts">
  import type { AppState } from '../lib/app.svelte';
  import {
    SHORTCUT_ACTIONS,
    bindingFromEvent,
    mayCollideWithAltGr,
    validGlobal,
  } from '../lib/keybindings';
  import type { ShortcutAction } from '../lib/types';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);

  type Scope = 'local' | 'global';
  let recording = $state<{ action: ShortcutAction; scope: Scope } | null>(null);
  let message = $state('');

  const scopeName = (scope: Scope) =>
    scope === 'local' ? t('shortcuts.inApp') : t('shortcuts.global');

  function start(action: ShortcutAction, scope: Scope) {
    recording = { action, scope };
    message = t('shortcuts.recordHint');
  }

  async function onKey(e: KeyboardEvent, action: ShortcutAction, scope: Scope) {
    if (!recording || recording.action !== action || recording.scope !== scope) return;
    e.preventDefault();
    e.stopPropagation();
    const bare = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    if (e.key === 'Escape' && bare) {
      recording = null;
      message = '';
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && bare) {
      recording = null;
      message = '';
      await app.setShortcut(action, scope, null);
      return;
    }
    const binding = bindingFromEvent(e);
    if (!binding) return; // only modifiers so far
    if (scope === 'global' && !validGlobal(binding)) {
      message = t('shortcuts.needsModifier');
      return;
    }
    recording = null;
    const other = await app.setShortcut(action, scope, binding);
    const notes: string[] = [];
    if (other) notes.push(t('shortcuts.moved', app.keysLabel(binding), t(`action.${other}`)));
    if (scope === 'global' && mayCollideWithAltGr(binding)) notes.push(t('shortcuts.altGr'));
    if (scope === 'global' && app.globalFailures.includes(action)) notes.push(t('shortcuts.taken'));
    message = notes.join(' ');
  }
</script>

<section aria-labelledby="shortcuts-title" class="shortcuts">
  <h2 id="shortcuts-title">{t('shortcuts.title')}</h2>
  <p class="hint">{t('shortcuts.globalHint')} {t('shortcuts.mediaKeys')}</p>

  <table>
    <thead>
      <tr>
        <th scope="col">{t('shortcuts.action')}</th>
        <th scope="col">{t('shortcuts.inApp')}</th>
        <th scope="col">{t('shortcuts.global')}</th>
      </tr>
    </thead>
    <tbody>
      {#each SHORTCUT_ACTIONS as action (action)}
        <tr>
          <th scope="row">{t(`action.${action}`)}</th>
          {#each ['local', 'global'] as const as scope (scope)}
            {@const binding = app.settings.shortcuts[action][scope]}
            {@const keys = app.keysLabel(binding)}
            {@const active = recording?.action === action && recording.scope === scope}
            {@const failed = scope === 'global' && app.globalFailures.includes(action)}
            <td>
              {#if action === 'show' && scope === 'local'}
                <span class="na" aria-hidden="true">—</span>
              {:else}
                <button
                  class="key"
                  class:recording={active}
                  class:empty={!binding}
                  data-recording={active ? '' : undefined}
                  aria-label="{t(
                    'shortcuts.change',
                    t(`action.${action}`),
                    scopeName(scope),
                  )} ({active ? t('shortcuts.record') : keys || t('shortcuts.none')})"
                  aria-describedby={failed ? `taken-${action}` : undefined}
                  onclick={() => start(action, scope)}
                  onkeydown={(e) => onKey(e, action, scope)}
                  onblur={() => {
                    if (active) recording = null;
                  }}
                >
                  {#if active}
                    {t('shortcuts.record')}
                  {:else if binding}
                    <kbd>{keys}</kbd>
                  {:else}
                    {t('shortcuts.none')}
                  {/if}
                </button>
                {#if failed}<span class="taken" id="taken-{action}">{t('shortcuts.taken')}</span
                  >{/if}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <p class="message" role="status">{message}</p>

  <div>
    <button class="btn" onclick={() => app.resetShortcuts()}>{t('shortcuts.reset')}</button>
  </div>
</section>

<style>
  .shortcuts {
    display: grid;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  thead th {
    padding: 0 var(--space-1) var(--space-1);
    text-align: start;
    font-weight: 600;
    color: var(--text-muted);
  }

  tbody th {
    padding: var(--space-1);
    text-align: start;
    font-weight: 500;
  }

  td {
    padding: 3px var(--space-1);
    vertical-align: middle;
  }

  tbody tr + tr {
    border-top: 1px solid var(--border);
  }

  .key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 72px;
    min-height: 34px;
    padding: 0 var(--space-2);
    border: 1px solid var(--control);
    border-radius: var(--radius-md);
    background: var(--surface);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .key:hover {
    background: var(--surface-2);
  }

  .key.empty {
    color: var(--text-muted);
  }

  .key.recording {
    border: 2px solid var(--brand);
    background: var(--brand-soft);
    font-weight: 600;
  }

  .key[aria-describedby] {
    border: 2px solid var(--danger);
  }

  kbd {
    font: inherit;
    font-weight: 600;
  }

  .na {
    display: block;
    text-align: center;
    color: var(--text-muted);
  }

  .taken {
    display: block;
    margin-top: 2px;
    font-size: 0.75rem;
    color: var(--danger);
    font-weight: 600;
  }

  .message:empty {
    display: none;
  }

  .message {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--brand-soft);
    font-size: var(--font-size-sm);
  }
</style>
