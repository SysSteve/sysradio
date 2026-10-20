import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { open } from './helpers';

/**
 * Screenshots and the banner for the README (English UI):
 * `SCREENS=1 sh scripts/e2e-docker.sh e2e/readme-shots.spec.ts` → docs/screenshots/.
 */
test.use({ locale: 'en-US' });

const dir = 'docs/screenshots';
const ROCK = {
  enabled: true,
  presetId: 'rock',
  gains: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  custom: [],
};

test('readme screenshots and banner', async ({ page, context, browser }) => {
  await page.setViewportSize({ width: 400, height: 640 });
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, ['s1', 's2', 's4', 's9', 's6'], { language: 'en', eq: ROCK });
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
      await page.getByRole('tab', { name: 'Settings' }).click();
      await page
        .getByRole('heading', { name: 'Keyboard shortcuts' })
        .evaluate((h) => h.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/shortcuts-dark.png` });
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

  // Banner: brand gradient, icon, name, tagline and floating screenshots (1280 × 640).
  const img = (file: string) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  const icon = `data:image/svg+xml;base64,${readFileSync('brand/icon.svg').toString('base64')}`;
  const banner = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await banner.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 640px; overflow: hidden; font-family: system-ui, "Segoe UI", sans-serif; color: #fff;
      background: radial-gradient(circle at 78% 20%, #6d5cf0 0%, transparent 45%), linear-gradient(135deg, #120b3d 0%, #2a1d8f 55%, #4a36cc 100%); }
    .bars { position: absolute; inset: auto 0 0 0; height: 150px; display: flex; align-items: flex-end; gap: 10px; padding: 0 24px; opacity: .28; }
    .bars span { flex: 1; border-radius: 6px 6px 0 0; background: linear-gradient(to top, #67e8f9, #c4b5fd); }
    .text { position: absolute; left: 72px; top: 140px; width: 600px; }
    .brand { display: flex; align-items: center; gap: 22px; }
    .brand img { width: 96px; height: 96px; border-radius: 22px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    h1 { font-size: 76px; font-weight: 800; letter-spacing: -0.03em; }
    p.tag { margin-top: 26px; font-size: 32px; font-weight: 600; line-height: 1.25; }
    p.sub { margin-top: 18px; font-size: 19px; color: #d6d0ff; line-height: 1.45; }
    .shot { position: absolute; border-radius: 18px; box-shadow: 0 30px 70px rgba(5,2,30,.55); border: 1px solid rgba(255,255,255,.15); }
    .main { right: 230px; top: 60px; width: 330px; transform: rotate(-4deg); }
    .eq { right: 40px; top: 120px; width: 300px; transform: rotate(5deg); }
    .mini { right: 120px; bottom: 46px; width: 420px; border-radius: 14px; transform: rotate(-1deg); }
  </style></head><body>
    <div class="bars">${Array.from({ length: 48 }, (_, i) => `<span style="height:${30 + Math.round(70 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)))}%"></span>`).join('')}</div>
    <div class="text">
      <div class="brand"><img src="${icon}" alt=""><h1>SysRadio</h1></div>
      <p class="tag">Internet radio for your desktop.<br>Beautiful, fast, private.</p>
      <p class="sub">Tens of thousands of stations · equalizer · live titles<br>Floating player · Windows and macOS · free and open source</p>
    </div>
    <img class="shot eq" src="${img(`${dir}/equalizer-dark.png`)}" alt="">
    <img class="shot main" src="${img(`${dir}/favorites-dark.png`)}" alt="">
    <img class="shot mini" src="${img(`${dir}/floating-player.png`)}" alt="">
  </body></html>`);
  await banner.waitForTimeout(300);
  await banner.screenshot({ path: `${dir}/banner.png` });
});
