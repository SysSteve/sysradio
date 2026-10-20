import { test } from '@playwright/test';
import { open } from './helpers';

/** Screenshots for the README (English UI): `SCREENS=1 sh scripts/e2e-docker.sh e2e/readme-shots.spec.ts`. */
test.use({ locale: 'en-US' });

test('readme screenshots', async ({ page, context }) => {
  const dir = 'docs/screenshots';
  await page.setViewportSize({ width: 400, height: 640 });
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, ['s1', 's2', 's4', 's9', 's6'], {
      language: 'en',
      eq: { enabled: true, presetId: 'rock', gains: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5], custom: [] },
    });
    await page.getByRole('button', { name: 'Play Testfunk Rock' }).click();
    await page.getByText('Beispiel-Interpret – Beispieltitel').waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/favorites-${scheme}.png` });
    if (scheme === 'dark') {
      await page.getByRole('tab', { name: 'Equalizer' }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/equalizer-dark.png` });
      await page.getByRole('tab', { name: 'Search' }).click();
      await page.getByText('Filters', { exact: true }).click();
      await page.getByLabel('Country or region').selectOption({ label: 'Latin America' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/search-dark.png` });
    }
  }
  const mini = await context.newPage();
  await mini.emulateMedia({ colorScheme: 'dark' });
  await mini.setViewportSize({ width: 420, height: 104 });
  await mini.goto('/mini.html');
  await page.getByRole('button', { name: 'Play Beispielwelle Pop' }).click();
  await mini.getByText('Beispiel-Interpret – Beispieltitel').waitFor();
  await mini.waitForTimeout(900);
  await mini.screenshot({ path: `${dir}/floating-player.png` });
});
