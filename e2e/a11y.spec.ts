import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './helpers';

/** Every view of the app in light and dark mode (WCAG 2.2 AA). New views are added here. */
const VIEWS: { name: string; favorites?: string[]; prepare: (page: Page) => Promise<void> }[] = [
  { name: 'search (first start)', prepare: async () => {} },
  {
    name: 'search with filters open',
    prepare: async (page) => {
      await page.getByText('Filter', { exact: true }).click();
      await page.getByLabel('Land oder Region').selectOption({ label: 'Lateinamerika' });
    },
  },
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
    name: 'sleep timer panel',
    favorites: ['s1'],
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Schlaf-Timer' }).click();
      await expect(page.getByRole('radio', { name: '30 Minuten' })).toBeVisible();
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
    name: 'own station dialog with error',
    favorites: ['s1'],
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Sender per Adresse hinzufügen' }).click();
      await page.getByRole('button', { name: 'Prüfen und speichern' }).click();
      await expect(
        page.getByText('Bitte gib eine vollständige Adresse ein', { exact: false }),
      ).toBeVisible();
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
    name: 'equalizer with name error',
    prepare: async (page) => {
      await page.getByRole('tab', { name: 'Equalizer' }).click();
      await page.getByLabel('Voreinstellung', { exact: true }).selectOption({ label: 'Rock' });
      await page.getByRole('button', { name: 'Speichern' }).click();
    },
  },
  {
    name: 'update notice',
    prepare: async (page) => {
      await page.evaluate(() => localStorage.setItem('sysradio:fake-update', '9.9.9'));
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
      await expect(page.getByText('Version 9.9.9 ist verfügbar.').first()).toBeVisible();
    },
  },
  {
    name: 'settings, recording a shortcut',
    prepare: async (page) => {
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await page.getByRole('button', { name: /^Lauter, Systemweit/ }).click();
    },
  },
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.use({ locale: 'de-DE' });

for (const scheme of ['light', 'dark'] as const) {
  for (const view of VIEWS)
    test(`accessible: ${view.name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, view.favorites);
      await view.prepare(page);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`),
      ).toEqual([]);
      // No sideways scrolling at the narrowest window width.
      await page.setViewportSize({ width: 320, height: 600 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
    });

  test(`accessible: floating player (${scheme})`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, ['s1']);
    const mini = await context.newPage();
    await mini.emulateMedia({ colorScheme: scheme });
    await mini.goto('/mini.html');
    await page.getByRole('button', { name: /abspielen$/ }).click();
    await expect(mini.getByText('Beispiel-Interpret – Beispieltitel')).toBeVisible();
    for (const size of [
      { width: 220, height: 72 },
      { width: 380, height: 104 },
      { width: 420, height: 200 },
    ]) {
      await mini.setViewportSize(size);
      const results = await new AxeBuilder({ page: mini }).withTags(AXE_TAGS).analyze();
      expect(
        results.violations.map(
          (v) => `${size.width}: ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`,
        ),
      ).toEqual([]);
    }
  });
}
