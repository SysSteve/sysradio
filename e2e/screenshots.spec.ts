import { test } from '@playwright/test';
import { open } from './helpers';

/**
 * Screenshots of every view at the narrowest, the default and a wide window size, light and
 * dark, for a look before finishing a change: `pnpm screens` → test-results/screens/.
 */
const SIZES = [
  { width: 320, height: 560 },
  { width: 380, height: 640 },
  { width: 720, height: 640 },
];

test.use({ locale: 'de-DE' });

for (const scheme of ['light', 'dark'] as const)
  for (const size of SIZES)
    test(`screens ${scheme} ${size.width}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      const shot = (name: string) =>
        page.screenshot({ path: `test-results/screens/${name}-${scheme}-${size.width}.png` });
      await open(page);
      await page.getByRole('heading', { name: 'Beliebt in Deutschland' }).waitFor();
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
      await shot('favorites-playing');
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await shot('settings');
      await page.setViewportSize({ width: size.width, height: 112 });
      await shot('mini');
    });
