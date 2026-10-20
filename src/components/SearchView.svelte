<script lang="ts">
  import SearchIcon from '@lucide/svelte/icons/search';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import { untrack } from 'svelte';
  import type { AppState } from '../lib/app.svelte';
  import { GENRES, QUICK_GENRES, REGIONS, localisedFacets, type RegionId } from '../lib/catalog';
  import type { MessageKey } from '../lib/i18n';
  import type { Facet, SearchOrder, Station } from '../lib/types';
  import StationList from './StationList.svelte';

  let { app }: { app: AppState } = $props();
  const t = $derived(app.t);

  const PAGE = 40;
  const ORDERS: SearchOrder[] = ['clickcount', 'votes', 'clicktrend', 'bitrate', 'name'];

  let countries = $state<Facet[]>([]);
  let languages = $state<Facet[]>([]);
  // Starts with the system's country; changing it later is up to the user.
  const initialWhere = untrack(() => app.country);
  let name = $state('');
  /** '' = everywhere, 'region:<id>', or a country code. */
  let where = $state(initialWhere);
  let language = $state('');
  let tag = $state('');
  let order = $state<SearchOrder>('clickcount');
  let results = $state<Station[]>([]);
  let status = $state<'loading' | 'done' | 'error'>('loading');
  let hasMore = $state(false);
  let request = 0;

  $effect(() => {
    app.platform.countries().then(
      (list) => (countries = list),
      () => {},
    );
    app.platform.languages().then(
      (list) => (languages = list),
      () => {},
    );
  });

  const number = $derived(new Intl.NumberFormat(app.locale));
  const countryOptions = $derived(localisedFacets(countries, app.locale, 'region'));
  const languageOptions = $derived(localisedFacets(languages, app.locale, 'language'));
  const activeFilters = $derived(
    [where !== initialWhere, language !== '', tag !== '', order !== 'clickcount'].filter(Boolean)
      .length,
  );

  function whereLabel(value: string): string {
    if (value.startsWith('region:')) return t(`region.${value.slice(7)}` as MessageKey);
    return countryOptions.find((c) => c.value === value)?.label ?? value;
  }

  async function search(append = false) {
    const id = ++request;
    status = 'loading';
    const offset = append ? results.length : 0;
    const region = where.startsWith('region:') ? REGIONS[where.slice(7) as RegionId] : null;
    try {
      const found = await app.platform.search({
        name,
        tag,
        countryCode: region ? '' : where,
        countryCodes: region ?? [],
        language,
        order,
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

  // Typing searches after a short pause; filters search right away.
  let typed = $state(false);
  $effect(() => {
    void name;
    if (!typed) return;
    const timer = setTimeout(() => untrack(() => search()), 400);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    void [where, language, tag, order];
    untrack(() => void search());
  });

  function resetFilters() {
    where = initialWhere;
    language = '';
    tag = '';
    order = 'clickcount';
  }

  const heading = $derived(
    name.trim() || tag || language || order !== 'clickcount'
      ? ''
      : where
        ? t('search.popular', whereLabel(where))
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

  <div class="chips" role="group" aria-label={t('search.quickGenres')}>
    {#each GENRES.slice(0, QUICK_GENRES) as [key, value] (key)}
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

  <details class="filters">
    <summary>
      <SlidersHorizontal size={16} aria-hidden="true" />
      {activeFilters > 0 ? t('search.filtersActive', activeFilters) : t('search.filters')}
    </summary>
    <div class="filter-grid">
      <div class="field">
        <label class="label" for="search-where">{t('search.where')}</label>
        <select id="search-where" class="select" bind:value={where}>
          <option value="">{t('search.everywhere')}</option>
          <optgroup label={t('search.regions')}>
            {#each Object.keys(REGIONS) as region (region)}
              <option value="region:{region}">{t(`region.${region}` as MessageKey)}</option>
            {/each}
          </optgroup>
          <optgroup label={t('search.countries')}>
            {#if countryOptions.length === 0 && initialWhere}
              <option value={initialWhere}>{initialWhere}</option>
            {/if}
            {#each countryOptions as country (country.value)}
              <option value={country.value}>{country.label} ({number.format(country.count)})</option
              >
            {/each}
          </optgroup>
        </select>
      </div>
      <div class="field">
        <label class="label" for="search-language">{t('search.language')}</label>
        <select id="search-language" class="select" bind:value={language}>
          <option value="">{t('search.languageAll')}</option>
          {#each languageOptions as lang (lang.value)}
            <option value={lang.value}>{lang.label} ({number.format(lang.count)})</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label class="label" for="search-genre">{t('search.genre')}</label>
        <select id="search-genre" class="select" bind:value={tag}>
          <option value="">{t('search.genreAll')}</option>
          {#each GENRES as [key, value] (key)}
            <option {value}>{t(`genre.${key}` as MessageKey)}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label class="label" for="search-order">{t('search.order')}</label>
        <select id="search-order" class="select" bind:value={order}>
          {#each ORDERS as value (value)}
            <option {value}>{t(`order.${value}`)}</option>
          {/each}
        </select>
      </div>
    </div>
    {#if activeFilters > 0}
      <button type="button" class="btn-link" onclick={resetFilters}>{t('search.reset')}</button>
    {/if}
  </details>
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
    min-height: 30px;
    padding: 0 var(--space-3);
    border: 1px solid var(--control);
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: var(--font-size-sm);
  }

  .chip:hover {
    background: var(--surface-2);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--brand);
    background: var(--brand);
    color: var(--on-brand);
    font-weight: 600;
  }

  .filters {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .filters summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 var(--space-3);
    font-weight: 600;
    cursor: pointer;
    border-radius: var(--radius-md);
  }

  .filters[open] summary {
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
    gap: var(--space-3);
    padding: var(--space-3);
  }

  .filters .btn-link {
    margin: 0 var(--space-2) var(--space-2);
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
