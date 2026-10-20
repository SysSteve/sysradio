import type { Page } from '@playwright/test';

/** Opens the app with a clean store; `favorites` are sample station ids (s1 … s8). */
export async function open(
  page: Page,
  favorites: string[] = [],
  settings: Record<string, unknown> = {},
) {
  await page.addInitScript(
    ({ ids, settings }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      if (Object.keys(settings).length)
        localStorage.setItem('sysradio:settings', JSON.stringify(settings));
      if (ids.length === 0) return;
      const all = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'];
      // Minimal records; the app refreshes favourites from the (sample) directory on start.
      const favorites = ids
        .filter((id) => all.includes(id))
        .map((id) => ({
          id,
          name: id,
          url: `https://example.org/${id}.mp3`,
          homepage: '',
          favicon: '',
          tags: [],
          country: '',
          countryCode: '',
          language: '',
          codec: '',
          bitrate: 0,
        }));
      localStorage.setItem('sysradio:library', JSON.stringify({ favorites, recent: [] }));
    },
    { ids: favorites, settings },
  );
  await page.goto('/');
}
