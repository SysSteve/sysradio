<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Trash from '@lucide/svelte/icons/trash-2';
  import type { AppState } from '../lib/app.svelte';
  import { BUILTIN_PRESETS, EQ_BANDS, EQ_MAX_DB, MANUAL, bandLabel } from '../lib/eq';
  import type { MessageKey } from '../lib/i18n';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);
  const eq = $derived(app.settings.eq);
  const customSelected = $derived(eq.custom.find((p) => p.id === eq.presetId));

  let presetName = $state('');
  let nameError = $state('');

  const signed = (db: number) => (db > 0 ? `+${db}` : db < 0 ? `−${Math.abs(db)}` : '0');

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!presetName.trim()) {
      nameError = t('eq.nameRequired');
      return;
    }
    nameError = '';
    app.saveEqPreset(presetName);
    presetName = '';
  }
</script>

<div class="eq">
  <label class="switch-row" for="eq-enabled">
    <input
      id="eq-enabled"
      type="checkbox"
      role="switch"
      checked={eq.enabled}
      onchange={(e) => app.setEqEnabled(e.currentTarget.checked)}
    />
    <span>
      <strong>{t('eq.enabled')}</strong>
      {#if !eq.enabled}<span class="hint">{t('eq.offHint')}</span>{/if}
    </span>
  </label>

  <div class="preset-row">
    <div class="field">
      <label class="label" for="eq-preset">{t('eq.preset')}</label>
      <select
        id="eq-preset"
        class="select"
        value={eq.presetId}
        onchange={(e) => app.applyEqPreset(e.currentTarget.value)}
      >
        {#if eq.presetId === MANUAL}
          <option value={MANUAL} disabled>{t('eq.manual')}</option>
        {/if}
        <optgroup label={t('eq.builtIn')}>
          {#each BUILTIN_PRESETS as preset (preset.id)}
            <option value={preset.id}>{t(`eq.preset.${preset.id}` as MessageKey)}</option>
          {/each}
        </optgroup>
        {#if eq.custom.length > 0}
          <optgroup label={t('eq.custom')}>
            {#each eq.custom as preset (preset.id)}
              <option value={preset.id}>{preset.name}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </div>
    {#if customSelected}
      <button
        class="icon-btn delete"
        aria-label={t('eq.delete', customSelected.name)}
        onclick={() => app.deleteEqPreset(customSelected.id)}
      >
        <Trash size={18} aria-hidden="true" />
      </button>
    {/if}
  </div>

  <fieldset class="bands" class:off={!eq.enabled}>
    <legend class="visually-hidden">{t('eq.bands')}</legend>
    {#each EQ_BANDS as hz, i (hz)}
      {@const db = eq.gains[i] ?? 0}
      <div class="band">
        <span class="value" aria-hidden="true">{signed(db)}</span>
        <input
          type="range"
          min={-EQ_MAX_DB}
          max={EQ_MAX_DB}
          step="0.5"
          value={db}
          aria-label={bandLabel(hz)}
          aria-valuetext="{signed(db)} dB"
          style:--fill="{((db + EQ_MAX_DB) / (2 * EQ_MAX_DB)) * 100}%"
          oninput={(e) => app.setEqBand(i, Number(e.currentTarget.value))}
        />
        <span class="hz" aria-hidden="true">{hz >= 1000 ? `${hz / 1000}k` : hz}</span>
      </div>
    {/each}
  </fieldset>

  <div class="actions">
    <button class="btn" onclick={() => app.resetEq()}>
      <RotateCcw size={16} aria-hidden="true" />
      {t('eq.reset')}
    </button>
  </div>

  {#if !app.player.active}<p class="hint">{t('eq.waiting')}</p>{/if}

  <form class="save" onsubmit={save} novalidate>
    <label class="label" for="eq-name">{t('eq.saveName')}</label>
    <div class="save-row">
      <input
        id="eq-name"
        class="input"
        type="text"
        maxlength="40"
        placeholder={t('eq.savePlaceholder')}
        bind:value={presetName}
        aria-invalid={nameError ? 'true' : undefined}
        aria-errormessage={nameError ? 'eq-name-error' : undefined}
        aria-describedby={nameError ? 'eq-name-error' : undefined}
      />
      <button class="btn btn-primary" type="submit">{t('eq.save')}</button>
    </div>
    {#if nameError}<p id="eq-name-error" class="error">{nameError}</p>{/if}
  </form>
</div>

<style>
  .eq {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-4);
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    cursor: pointer;
  }

  .switch-row > span {
    display: grid;
  }

  input[role='switch'] {
    flex: none;
    appearance: none;
    position: relative;
    width: 44px;
    height: 26px;
    margin: 0;
    border: 2px solid var(--control);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  input[role='switch']::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform 0.15s ease;
  }

  input[role='switch']:checked {
    border-color: var(--brand);
    background: var(--brand);
  }

  input[role='switch']:checked::after {
    transform: translateX(18px);
    background: var(--on-brand);
  }

  .preset-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .preset-row .field {
    flex: 1;
  }

  .delete {
    height: 40px;
    width: 40px;
  }

  .bands {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 2px;
    margin: 0;
    padding: var(--space-3) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .bands.off {
    opacity: 0.6;
  }

  .band {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
  }

  .value,
  .hz {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .band input {
    writing-mode: vertical-lr;
    direction: rtl;
    width: 24px;
    height: 140px;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }

  .band input::-webkit-slider-runnable-track {
    width: 4px;
    border-radius: var(--radius-pill);
    background: linear-gradient(to top, var(--brand) var(--fill), var(--control) var(--fill));
  }

  .band input::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    margin-left: -6px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--brand);
  }

  .band input::-moz-range-track {
    width: 4px;
    border-radius: var(--radius-pill);
    background: var(--control);
  }

  .band input::-moz-range-progress {
    width: 4px;
    border-radius: var(--radius-pill);
    background: var(--brand);
  }

  .band input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 2px solid var(--surface);
    border-radius: 50%;
    background: var(--brand);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .hint {
    font-size: var(--font-size-sm);
    font-weight: normal;
    color: var(--text-muted);
  }

  .save {
    display: grid;
    gap: var(--space-1);
  }

  .save-row {
    display: flex;
    gap: var(--space-2);
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
</style>
