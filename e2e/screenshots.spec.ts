import { test } from '@playwright/test';
import { open } from './helpers';

/**
 * Screenshots of every view at the narrowest, the default and a wide window size, light and
 * dark, plus the floating player in three sizes, for a look before finishing a change:
 * `pnpm screens` → test-results/screens/.
 */
const SIZES = [
  { width: 320, height: 600 },
  { width: 400, height: 680 },
  { width: 720, height: 680 },
];

test.use({ locale: 'de-DE' });

for (const scheme of ['light', 'dark'] as const) {
  for (const size of SIZES)
    test(`screens ${scheme} ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      const shot = (name: string) =>
        page.screenshot({ path: `test-results/screens/${name}-${scheme}-${size.width}.png` });
      await open(page);
      await page.getByRole('heading', { name: 'Beliebt in Deutschland' }).waitFor();
      await page.getByText('Filter', { exact: true }).click();
      await shot('search');
      for (const name of [
        'Beispielwelle Pop',
        'Testfunk Rock',
        'Electro Sample FM mit einem sehr langen Sendernamen',
      ])
        await page.getByRole('button', { name: `${name} zu Favoriten hinzufügen` }).click();
      await page.getByRole('tab', { name: 'Favoriten' }).click();
      await page.getByRole('button', { name: 'Testfunk Rock abspielen' }).click();
      await page.getByText('Beispiel-Interpret – Beispieltitel').waitFor();
      await page.waitForTimeout(600);
      await shot('favorites-playing');
      await page.getByRole('tab', { name: 'Equalizer' }).click();
      await page.getByLabel('Voreinstellung', { exact: true }).selectOption({ label: 'Rock' });
      await shot('equalizer');
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await page.getByRole('heading', { name: 'Tastenkürzel' }).scrollIntoViewIfNeeded();
      await shot('settings');
    });

  test(`screens ${scheme} floating player`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, ['s1', 's2']);
    const mini = await context.newPage();
    await mini.emulateMedia({ colorScheme: scheme });
    await mini.goto('/mini.html');
    await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
    await mini.getByText('Beispiel-Interpret – Beispieltitel').waitFor();
    for (const size of [
      { width: 240, height: 72 },
      { width: 380, height: 104 },
      { width: 520, height: 104 },
      { width: 420, height: 200 },
    ]) {
      await mini.setViewportSize(size);
      await mini.waitForTimeout(500);
      await mini.screenshot({
        path: `test-results/screens/mini-${scheme}-${size.width}x${size.height}.png`,
      });
    }
  });
}
