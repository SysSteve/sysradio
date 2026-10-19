import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

/** Every view of the app in light and dark mode (WCAG 2.2 AA). New views are added here. */
const VIEWS: { name: string; favorites?: string[]; prepare: (page: Page) => Promise<void> }[] = [
  { name: 'search (first start)', prepare: async () => {} },
  {
    name: 'favourites, playing',
    favorites: ['s1', 's2', 's7'],
    prepare: async (page) => {
      await page
        .getByRole('button', { name: /abspielen$/ })
        .first()
        .click();
      await expect(page.getByText('Beispiel-Interpret – Beispieltitel')).toBeVisible();
    },
  },
  {
    name: 'favourites, empty',
    favorites: ['s1'],
    prepare: async (page) => {
      await page.getByRole('button', { name: /entfernen$/ }).click();
    },
  },
  {
    name: 'history',
    favorites: ['s1'],
    prepare: async (page) => {
      await page.getByRole('button', { name: /abspielen$/ }).click();
      await page.getByRole('tab', { name: 'Verlauf' }).click();
    },
  },
  {
    name: 'settings',
    prepare: async (page) => page.getByRole('tab', { name: 'Einstellungen' }).click(),
  },
];

test.use({ locale: 'de-DE' });

for (const scheme of ['light', 'dark'] as const)
  for (const view of VIEWS)
    test(`accessible: ${view.name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, view.favorites);
      await view.prepare(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
      // No sideways scrolling at the narrowest window width.
      await page.setViewportSize({ width: 320, height: 600 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
    });
