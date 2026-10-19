<script lang="ts">
  import RadioIcon from '@lucide/svelte/icons/radio';
  import type { Station } from '../lib/types';

  let {
    station,
    logoUrl,
    size = 40,
  }: { station: Station | null; logoUrl: (favicon: string) => string; size?: number } = $props();

  let failed = $state(false);
  const src = $derived(station ? logoUrl(station.favicon) : '');
  $effect(() => {
    // A new station gets a fresh chance to show its logo.
    void src;
    failed = false;
  });
</script>

<!-- Decorative: the station name is always written next to the logo. -->
<span class="logo" style:--size="{size}px" aria-hidden="true">
  {#if src && !failed}
    <img {src} alt="" width={size} height={size} loading="lazy" onerror={() => (failed = true)} />
  {:else}
    <RadioIcon size={Math.round(size * 0.5)} />
  {/if}
</span>

<style>
  .logo {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--brand-soft);
    color: var(--brand);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
  }
</style>
