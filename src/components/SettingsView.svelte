<script lang="ts">
  import type { AppState } from '../lib/app.svelte';
  import { languageNames, type Locale } from '../lib/i18n';
  import type { Language } from '../lib/types';
  import ShortcutEditor from './ShortcutEditor.svelte';

  const SOURCE_URL = 'https://github.com/SysSteve/sysradio';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);

  let autostart = $state(false);
  let version = $state('');
  $effect(() => {
    app.platform.getAutostart().then(
      (v) => (autostart = v),
      () => {},
    );
    app.platform.version().then(
      (v) => (version = v),
      () => {},
    );
  });

  let licenseDialog: HTMLDialogElement | undefined = $state();
  let licenseText = $state('');
  async function showLicenses() {
    licenseDialog?.showModal();
    if (licenseText) return;
    try {
      licenseText = await (await fetch('/third-party-licenses.txt')).text();
    } catch {
      licenseText = '—';
    }
  }

  async function setAutostart(enabled: boolean) {
    try {
      await app.platform.setAutostart(enabled);
      autostart = enabled;
    } catch {
      autostart = !enabled;
    }
  }

  const toggles = $derived([
    {
      id: 'autostart',
      label: t('settings.autostart'),
      checked: autostart,
      set: (v: boolean) => setAutostart(v),
    },
    {
      id: 'close-to-tray',
      label: t('settings.closeToTray'),
      checked: app.settings.closeToTray,
      set: (v: boolean) => app.setCloseToTray(v),
    },
    {
      id: 'resume',
      label: t('settings.resume'),
      checked: app.settings.resumeOnStart,
      set: (v: boolean) => (app.settings.resumeOnStart = v),
    },
    {
      id: 'on-top',
      label: t('settings.alwaysOnTop'),
      checked: app.settings.alwaysOnTop,
      set: (v: boolean) => app.setAlwaysOnTop(v),
    },
    {
      id: 'visualizer',
      label: t('settings.visualizer'),
      checked: app.settings.visualizer,
      set: (v: boolean) => (app.settings.visualizer = v),
    },
    {
      id: 'auto-update',
      label: t('settings.autoUpdate'),
      checked: app.settings.autoUpdate,
      set: (v: boolean) => (app.settings.autoUpdate = v),
    },
    {
      id: 'announce',
      label: t('settings.announce'),
      checked: app.settings.announceTitles,
      set: (v: boolean) => (app.settings.announceTitles = v),
    },
  ]);
</script>

<div class="settings">
  <section aria-labelledby="settings-general">
    <h2 id="settings-general">{t('settings.general')}</h2>
    <div class="field">
      <label class="label" for="settings-language">{t('settings.language')}</label>
      <select
        id="settings-language"
        class="select"
        value={app.settings.language}
        onchange={(e) => (app.settings.language = e.currentTarget.value as Language)}
      >
        <option value="auto">{t('settings.languageAuto')}</option>
        {#each Object.entries(languageNames) as [code, name] (code)}
          <option value={code} lang={code as Locale}>{name}</option>
        {/each}
      </select>
    </div>
    <ul class="toggles">
      {#each toggles as toggle (toggle.id)}
        <li>
          <label class="toggle" for="setting-{toggle.id}">
            <input
              id="setting-{toggle.id}"
              type="checkbox"
              checked={toggle.checked}
              onchange={(e) => toggle.set(e.currentTarget.checked)}
            />
            <span>{toggle.label}</span>
          </label>
        </li>
      {/each}
    </ul>
  </section>

  <ShortcutEditor {app} />

  <section aria-labelledby="settings-about">
    <h2 id="settings-about">{t('settings.about')}</h2>
    <p>
      <strong>{t('app.name')}</strong>
      {t('app.by')}{version ? ` · ${t('settings.version', version)}` : ''}
    </p>
    <p class="hint">{t('settings.directory')}</p>
    <p class="hint">{t('settings.privacy')}</p>
    <div class="update-row">
      <button
        class="btn"
        disabled={app.updateStatus === 'checking'}
        onclick={() => app.checkForUpdate(true)}
      >
        {t('update.check')}
      </button>
      <p class="hint" role="status">
        {#if app.updateStatus === 'checking'}{t('update.checking')}
        {:else if app.updateStatus === 'current'}{t('update.upToDate')}
        {:else if app.updateStatus === 'checkFailed'}{t('update.checkFailed')}
        {:else if app.update && ['available', 'downloading', 'installing', 'failed'].includes(app.updateStatus)}{t(
            'update.available',
            app.update.version,
          )}{/if}
      </p>
    </div>
    <p class="hint">{t('settings.openSource')}</p>
    <div class="links">
      <button class="btn" onclick={() => app.platform.openUrl(SOURCE_URL)}
        >{t('settings.sourceCode')}</button
      >
      <button class="btn" onclick={showLicenses}>{t('settings.licenses')}</button>
    </div>
  </section>

  <dialog bind:this={licenseDialog} class="licenses" aria-labelledby="licenses-title">
    <div class="licenses-head">
      <h2 id="licenses-title">{t('settings.licenses')}</h2>
      <button class="btn" onclick={() => licenseDialog?.close()}>{t('settings.close')}</button>
    </div>
    <!-- Focusable so keyboard users can scroll the long text. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="license-text" tabindex="0" aria-label={t('settings.licenses')}>{licenseText ||
        t('settings.loading')}</pre>
  </dialog>
</div>

<style>
  .settings {
    display: grid;
    gap: var(--space-5);
    padding: var(--space-4);
  }

  section {
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

  .toggles {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    cursor: pointer;
  }

  .toggle input {
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    accent-color: var(--brand);
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .update-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .licenses {
    width: min(720px, calc(100vw - 24px));
    height: calc(100vh - 48px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-float);
  }

  .licenses[open] {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .licenses::backdrop {
    background: rgb(10 6 40 / 0.45);
  }

  .licenses-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .license-text {
    margin: 0;
    padding: var(--space-4);
    overflow: auto;
    font-size: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
