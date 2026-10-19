<script lang="ts">
  import type { AppState } from '../lib/app.svelte';
  import type { Language } from '../lib/types';

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
        <option value="de" lang="de">Deutsch</option>
        <option value="en" lang="en">English</option>
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

  <section aria-labelledby="settings-keys">
    <h2 id="settings-keys">{t('settings.shortcuts')}</h2>
    <dl class="keys">
      <dt><kbd>{t('settings.keySpace')}</kbd> / <kbd>K</kbd></dt>
      <dd>{t('settings.keyPlay')}</dd>
      <dt><kbd>M</kbd></dt>
      <dd>{t('settings.keyMute')}</dd>
      <dt><kbd>+</kbd> / <kbd>−</kbd></dt>
      <dd>{t('settings.keyVolume')}</dd>
    </dl>
    <p class="hint">{t('settings.keyMedia')}</p>
  </section>

  <section aria-labelledby="settings-about">
    <h2 id="settings-about">{t('settings.about')}</h2>
    <p>
      <strong>{t('app.name')}</strong>
      {t('app.by')}{version ? ` · ${t('settings.version', version)}` : ''}
    </p>
    <p class="hint">{t('settings.directory')}</p>
    <p class="hint">{t('settings.privacy')}</p>
  </section>
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

  .keys {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }

  dd {
    margin: 0;
  }

  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 0 6px;
    border: 1px solid var(--control);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }
</style>
