import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.use({ locale: 'de-DE' });

test('first start: search, add a favourite, play it', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('tab', { name: 'Suchen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Beliebt in Deutschland' })).toBeVisible();
  await page.getByRole('button', { name: 'Beispielwelle Pop zu Favoriten hinzufügen' }).click();
  await expect(
    page.getByRole('button', { name: 'Beispielwelle Pop zu Favoriten hinzufügen' }),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('tab', { name: 'Favoriten' }).click();
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player.getByRole('heading', { name: 'Beispielwelle Pop' })).toBeVisible();
  await expect(player.getByText('Beispiel-Interpret – Beispieltitel')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Stopp' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beispielwelle Pop abspielen' })).toHaveAttribute(
    'aria-current',
    'true',
  );

  await player.getByRole('button', { name: 'Stopp' }).click();
  await expect(player.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await page.getByRole('tab', { name: 'Verlauf' }).click();
  await expect(page.getByRole('button', { name: 'Beispielwelle Pop abspielen' })).toBeVisible();
});

test('search filters by name, country and genre', async ({ page }) => {
  await open(page);
  await page.getByLabel('Land').selectOption('AT');
  await expect(page.getByRole('button', { name: /abspielen$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Klassik', exact: true }).click();
  await expect(page.getByRole('button', { name: /abspielen$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Klassik', exact: true }).click();
  await page.getByLabel('Land').selectOption('');
  await page.getByRole('searchbox', { name: 'Sender suchen' }).fill('jazz');
  await expect(page.getByText('1 Sender gefunden')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Sender suchen' }).fill('gibt es nicht');
  await expect(page.getByText('Keine Sender gefunden', { exact: false })).toBeVisible();
  // The typed text survives the empty result.
  await expect(page.getByRole('searchbox', { name: 'Sender suchen' })).toHaveValue('gibt es nicht');
});

test('favourites: reorder, remove with undo, kept after restart', async ({ page }) => {
  await open(page, ['s1', 's2', 's3']);
  const names = () =>
    page.getByRole('list', { name: 'Favoriten' }).locator('.name').allTextContents();
  await expect.poll(names).toEqual(['Beispielwelle Pop', 'Testfunk Rock', 'Alpenradio Musterberg']);
  await page.getByRole('button', { name: 'Alpenradio Musterberg nach oben' }).click();
  await expect.poll(names).toEqual(['Beispielwelle Pop', 'Alpenradio Musterberg', 'Testfunk Rock']);
  await page.getByRole('button', { name: 'Beispielwelle Pop aus Favoriten entfernen' }).click();
  await expect(page.getByRole('status').getByText('Beispielwelle Pop entfernt.')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(names).toEqual(['Beispielwelle Pop', 'Alpenradio Musterberg', 'Testfunk Rock']);
  await page.reload();
  await expect.poll(names).toEqual(['Beispielwelle Pop', 'Alpenradio Musterberg', 'Testfunk Rock']);
});

test('keyboard: tabs with arrow keys, space plays and stops, m mutes', async ({ page }) => {
  await open(page, ['s1']);
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player.getByRole('button', { name: 'Stopp' })).toBeVisible();
  await page.locator('main').focus();
  await page.keyboard.press(' ');
  await expect(player.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await page.keyboard.press('m');
  await expect(player.getByRole('button', { name: 'Ton einschalten' })).toBeVisible();

  await page.getByRole('tab', { name: 'Favoriten' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Suchen' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Suchen' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Einstellungen' })).toBeFocused();
});

test('language switch is saved', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Einstellungen' }).click();
  await page.getByLabel('Sprache').selectOption('en');
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Favourites' })).toBeVisible();
});

test('mini view shows only the player and does not scroll sideways', async ({ page }) => {
  await open(page, ['s7']);
  await page.getByRole('button', { name: /abspielen$/ }).click();
  await page.setViewportSize({ width: 320, height: 112 });
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Stopp' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
