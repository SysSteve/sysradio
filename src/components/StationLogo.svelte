<script lang="ts">
  import RadioIcon from '@lucide/svelte/icons/radio';

  let {
    favicon,
    logoUrl,
    size = 40,
    tone = 'default',
  }: {
    favicon: string | null | undefined;
    logoUrl: (favicon: string) => string;
    size?: number;
    tone?: 'default' | 'hero';
  } = $props();

  let failed = $state(false);
  const src = $derived(favicon ? logoUrl(favicon) : '');
  $effect(() => {
    // A new station gets a fresh chance to show its logo.
    void src;
    failed = false;
  });
</script>

<!-- Decorative: the station name is always written next to the logo. -->
<span class="logo {tone}" style:--size="{size}px" aria-hidden="true">
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

  .logo.hero {
    border-radius: var(--radius-lg);
    background: rgb(255 255 255 / 0.14);
    color: var(--on-hero);
    outline: 1px solid rgb(255 255 255 / 0.18);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
  }
</style>
