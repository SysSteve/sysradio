<script lang="ts">
  import SearchIcon from '@lucide/svelte/icons/search';
  import { untrack } from 'svelte';
  import type { AppState } from '../lib/app.svelte';
  import type { MessageKey } from '../lib/i18n';
  import type { Station } from '../lib/types';
  import StationList from './StationList.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);

  const PAGE = 40;
  const COUNTRIES = ['DE', 'AT', 'CH', 'GB', 'US', 'FR', 'IT', 'ES', 'NL'] as const;
  /** Genre buttons and the directory tag each one searches for. */
  const GENRES = [
    ['pop', 'pop'],
    ['rock', 'rock'],
    ['news', 'news'],
    ['jazz', 'jazz'],
    ['classical', 'classical'],
    ['electronic', 'electronic'],
    ['schlager', 'schlager'],
    ['hiphop', 'hip hop'],
    ['chillout', 'chillout'],
  ] as const;

  let name = $state('');
  // Starts with the system's country; changing it later is up to the user.
  const initialCountry = untrack(() => app.country);
  let country = $state<string>(
    (COUNTRIES as readonly string[]).includes(initialCountry) ? initialCountry : '',
  );
  let tag = $state('');
  let results = $state<Station[]>([]);
  let status = $state<'loading' | 'done' | 'error'>('loading');
  let hasMore = $state(false);
  let request = 0;

  async function search(append = false) {
    const id = ++request;
    status = 'loading';
    const offset = append ? results.length : 0;
    try {
      const found = await app.platform.search({
        name,
        tag,
        countryCode: country,
        limit: PAGE,
        offset,
      });
      if (id !== request) return;
      results = append
        ? [...results, ...found.filter((s) => !results.some((r) => r.id === s.id))]
        : found;
      hasMore = found.length === PAGE;
      status = 'done';
    } catch {
      if (id === request) status = 'error';
    }
  }

  // Typing searches after a short pause; country and genre search right away.
  let typed = $state(false);
  $effect(() => {
    void name;
    if (!typed) return;
    const timer = setTimeout(() => untrack(() => search()), 400);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    void country;
    void tag;
    untrack(() => void search());
  });

  const heading = $derived(
    name.trim() || tag
      ? ''
      : country
        ? t('search.popular', t(`country.${country}` as MessageKey))
        : t('search.popularAll'),
  );
</script>

<form
  class="form"
  role="search"
  onsubmit={(e) => {
    e.preventDefault();
    void search();
  }}
>
  <div class="row">
    <label class="visually-hidden" for="search-name">{t('search.label')}</label>
    <input
      id="search-name"
      class="input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder={t('search.placeholder')}
      bind:value={name}
      oninput={() => (typed = true)}
    />
    <button class="btn btn-primary" type="submit" aria-label={t('search.submit')}>
      <SearchIcon size={18} aria-hidden="true" />
    </button>
  </div>
  <div class="field">
    <label class="label" for="search-country">{t('search.country')}</label>
    <select id="search-country" class="select" bind:value={country}>
      <option value="">{t('search.countryAll')}</option>
      {#each COUNTRIES as code (code)}
        <option value={code}>{t(`country.${code}` as MessageKey)}</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <span class="label" id="genre-label">{t('search.genre')}</span>
    <div class="chips" role="group" aria-labelledby="genre-label">
      <button type="button" class="chip" aria-pressed={tag === ''} onclick={() => (tag = '')}>
        {t('search.genreAll')}
      </button>
      {#each GENRES as [key, value] (key)}
        <button
          type="button"
          class="chip"
          aria-pressed={tag === value}
          onclick={() => (tag = tag === value ? '' : value)}
        >
          {t(`genre.${key}` as MessageKey)}
        </button>
      {/each}
    </div>
  </div>
</form>

<div class="summary" role="status">
  {#if status === 'loading' && results.length === 0}
    {t('search.loading')}
  {:else if status === 'error'}
    <span class="error">{t('search.error')}</span>
    <button class="btn-link" onclick={() => search()}>{t('search.retry')}</button>
  {:else if status === 'done' && results.length === 0}
    {t('search.none')}
  {:else if heading}
    <h2 class="heading">{heading}</h2>
  {:else if status === 'done'}
    {t('search.count', results.length)}
  {/if}
</div>

{#if results.length > 0}
  <StationList {app} stations={results} mode="browse" label={t('tabs.search')} />
  {#if hasMore}
    <div class="more">
      <button class="btn" disabled={status === 'loading'} onclick={() => search(true)}
        >{t('search.more')}</button
      >
    </div>
  {/if}
{/if}

<style>
  .form {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) 0;
  }

  .row {
    display: flex;
    gap: var(--space-2);
  }

  .row .btn {
    flex: none;
    width: 44px;
    padding: 0;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .chip {
    min-height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid var(--control);
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: var(--font-size-sm);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--brand);
    background: var(--brand);
    color: var(--on-brand);
    font-weight: 600;
  }

  .summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-height: 40px;
    padding: var(--space-3) var(--space-4) 0;
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .heading {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .error {
    color: var(--danger);
    font-weight: 600;
  }

  .more {
    display: flex;
    justify-content: center;
    padding: 0 var(--space-4) var(--space-4);
  }
</style>
