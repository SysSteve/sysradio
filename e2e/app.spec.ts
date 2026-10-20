import { expect, test } from '@playwright/test';
import { open } from './helpers';

test.use({ locale: 'de-DE' });

const names = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Favoriten' }).locator('.name').allTextContents();

test('first start: search, add a favourite, play it', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('tab', { name: 'Suchen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Beliebt in Deutschland' })).toBeVisible();
  await page.getByRole('button', { name: 'Beispielwelle Pop zu Favoriten hinzufügen' }).click();
  await page.getByRole('tab', { name: 'Favoriten' }).click();
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player.getByRole('heading', { name: 'Beispielwelle Pop' })).toBeVisible();
  await expect(player.getByText('Beispiel-Interpret – Beispieltitel')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Stopp' })).toBeVisible();
  await player.getByRole('button', { name: 'Stopp' }).click();
  await expect(player.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await page.getByRole('tab', { name: 'Verlauf' }).click();
  await expect(page.getByRole('button', { name: 'Beispielwelle Pop abspielen' })).toBeVisible();
});

test('search: region Latin America, genre, language and sort order', async ({ page }) => {
  await open(page);
  await page.getByText('Filter', { exact: true }).click();
  await page.getByLabel('Land oder Region').selectOption({ label: 'Lateinamerika' });
  await expect(page.getByRole('heading', { name: 'Beliebt in Lateinamerika' })).toBeVisible();
  await expect(page.getByRole('button', { name: /abspielen$/ })).toHaveCount(2);
  await expect(
    page.getByLabel('Land oder Region').locator('option', { hasText: 'Ecuador (320)' }),
  ).toHaveCount(1);
  await page.getByLabel('Sortierung').selectOption({ label: 'Name (A–Z)' });
  await expect(page.locator('.list .name').first()).toHaveText('Estéreo Muestra Bogotá');
  await page.getByLabel('Sprache').selectOption({ label: 'Spanisch (5.350)' });
  await expect(page.getByText('Filter (3 aktiv)')).toBeVisible();
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Klassik', exact: true }).click();
  await expect(page.getByRole('button', { name: /abspielen$/ })).toHaveCount(0);
  await expect(page.getByText('Keine Sender gefunden', { exact: false })).toBeVisible();
});

test('favourites: drag and drop, arrow buttons, undo, kept after restart', async ({ page }) => {
  await open(page, ['s1', 's2', 's3']);
  await expect
    .poll(() => names(page))
    .toEqual(['Beispielwelle Pop', 'Testfunk Rock', 'Alpenradio Musterberg']);
  // Drag the first station below the last one.
  const grip = page.getByRole('button', { name: /^Beispielwelle Pop verschieben/ });
  const target = page.locator('.list > li').nth(2);
  const from = (await grip.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => names(page))
    .toEqual(['Testfunk Rock', 'Alpenradio Musterberg', 'Beispielwelle Pop']);
  await expect(page.getByText('Beispielwelle Pop ist jetzt auf Platz 3.')).toBeAttached();
  // Keyboard on the handle.
  await page.getByRole('button', { name: /^Beispielwelle Pop verschieben/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(() => names(page))
    .toEqual(['Testfunk Rock', 'Beispielwelle Pop', 'Alpenradio Musterberg']);
  await page.getByRole('button', { name: 'Testfunk Rock aus Favoriten entfernen' }).click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await page.reload();
  await expect
    .poll(() => names(page))
    .toEqual(['Testfunk Rock', 'Beispielwelle Pop', 'Alpenradio Musterberg']);
});

test('own station by address: errors at the field, then saved and editable', async ({ page }) => {
  await open(page, ['s1']);
  await page.getByRole('button', { name: 'Sender per Adresse hinzufügen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sender per Adresse hinzufügen' });
  const url = dialog.getByLabel('Stream-Adresse');
  await url.fill('kein link');
  await dialog.getByRole('button', { name: 'Prüfen und speichern' }).click();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(
    dialog.getByText('Bitte gib eine vollständige Adresse ein', { exact: false }),
  ).toBeVisible();
  await expect(url).toHaveValue('kein link');
  await url.fill('https://radio.example/live.mp3');
  await dialog.getByRole('button', { name: 'Prüfen und speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText('Stream radio.example wurde zu deinen Favoriten hinzugefügt.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stream radio.example bearbeiten' }).click();
  const edit = page.getByRole('dialog', { name: 'Sender bearbeiten' });
  await edit.getByLabel('Name').fill('Mein Lieblingssender');
  await edit.getByRole('button', { name: 'Prüfen und speichern' }).click();
  await expect.poll(() => names(page)).toEqual(['Beispielwelle Pop', 'Mein Lieblingssender']);
});

test('equalizer: presets, own preset, saved', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Equalizer' }).click();
  await page.getByLabel('Voreinstellung', { exact: true }).selectOption({ label: 'Rock' });
  await expect(page.getByRole('switch', { name: /Equalizer einschalten/ })).toBeChecked();
  await expect(page.getByRole('slider', { name: '32 Hz' })).toHaveAttribute(
    'aria-valuetext',
    '+5 dB',
  );
  await page.getByRole('slider', { name: '1 kHz' }).fill('4');
  await expect(page.getByLabel('Voreinstellung', { exact: true })).toHaveValue('manual');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Bitte gib einen Namen ein.')).toBeVisible();
  await page.getByLabel('Als eigene Voreinstellung speichern').fill('Kopfhörer');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(
    page.getByLabel('Voreinstellung', { exact: true }).locator('option:checked'),
  ).toHaveText('Kopfhörer');
  await page.reload();
  await page.getByRole('tab', { name: 'Equalizer' }).click();
  await expect(page.getByRole('slider', { name: '1 kHz' })).toHaveAttribute(
    'aria-valuetext',
    '+4 dB',
  );
  await page.getByRole('button', { name: '„Kopfhörer“ löschen' }).click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(
    page.getByLabel('Voreinstellung', { exact: true }).locator('option', { hasText: 'Kopfhörer' }),
  ).toHaveCount(1);
});

test('shortcuts work after clicking a button and can be reassigned', async ({ page }) => {
  await open(page, ['s1', 's2']);
  const player = page.getByRole('region', { name: 'Player' });
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  await expect(player.getByRole('button', { name: 'Stopp' })).toBeVisible();
  // Focus is on a button now: volume, mute and next must still work.
  const volume = player.getByRole('slider', { name: 'Lautstärke' });
  await page.keyboard.press('-');
  await expect(volume).toHaveAttribute('aria-valuetext', '75 %');
  await page.keyboard.press('m');
  await expect(player.getByRole('button', { name: 'Ton einschalten' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(player.getByRole('heading', { name: 'Testfunk Rock' })).toBeVisible();
  await page.locator('main').focus();
  await page.keyboard.press(' ');
  await expect(player.getByRole('button', { name: 'Abspielen' })).toBeVisible();

  await page.getByRole('tab', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: /^Stumm schalten, In der App: Kürzel ändern/ }).click();
  await page.keyboard.press('Control+Shift+KeyU');
  await expect(
    page.getByRole('button', {
      name: /^Stumm schalten, In der App: Kürzel ändern \(Strg\+Umschalt\+U\)/,
    }),
  ).toBeVisible();
  // A system-wide shortcut needs a modifier.
  await page.getByRole('button', { name: /^Lauter, Systemweit: Kürzel ändern/ }).click();
  await page.keyboard.press('KeyL');
  await expect(
    page.getByText('Systemweite Kürzel brauchen Strg, Alt oder die Windows-Taste.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('main').focus();
  await page.keyboard.press('Control+Shift+KeyU');
  await expect(player.getByRole('button', { name: 'Stumm schalten' })).toBeVisible();
  // Tooltip shows the new shortcut.
  await player.getByRole('button', { name: 'Stumm schalten' }).hover();
  await expect(page.locator('.tooltip')).toContainText('Strg+Umschalt+U');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tooltip')).toHaveCount(0);
});

test('languages: Spanish and French, saved', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Einstellungen' }).click();
  await page.getByLabel('Sprache').selectOption('es');
  await expect(page.getByRole('tab', { name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByLabel('Idioma').selectOption('fr');
  await expect(page.getByRole('tab', { name: 'Paramètres' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Favoris' })).toBeVisible();
});

test('floating player mirrors and controls the main window', async ({ page, context }) => {
  await open(page, ['s1', 's2']);
  const mini = await context.newPage();
  await mini.goto('/mini.html');
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  await expect(mini.getByText('Beispielwelle Pop')).toBeVisible();
  await expect(mini.getByText('Beispiel-Interpret – Beispieltitel')).toBeVisible();
  await mini.getByRole('button', { name: 'Stopp' }).click();
  await expect(
    page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Abspielen' }),
  ).toBeVisible();
  await mini.getByRole('button', { name: 'Nächster Favorit' }).click();
  await expect(
    page.getByRole('region', { name: 'Player' }).getByRole('heading', { name: 'Testfunk Rock' }),
  ).toBeVisible();
  // Shortcuts work in the floating player too.
  await mini.locator('main').click({ position: { x: 5, y: 5 } });
  await mini.keyboard.press('m');
  await expect(
    page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Ton einschalten' }),
  ).toBeVisible();
  // Any size: small and tall layouts without sideways scrolling.
  for (const size of [
    { width: 220, height: 72 },
    { width: 360, height: 104 },
    { width: 420, height: 200 },
  ]) {
    await mini.setViewportSize(size);
    await expect(mini.getByRole('button', { name: /^(Abspielen|Stopp)$/ })).toBeVisible();
    expect(await mini.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
  }
});

test('updates: manual check, notice, progress, later', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByText('SysRadio ist auf dem neuesten Stand.')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('sysradio:fake-update', '9.9.9'));
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  const notice = page.getByRole('region', { name: 'Update' });
  await expect(notice.getByText('Version 9.9.9 ist verfügbar.')).toBeVisible();
  await notice.getByRole('button', { name: 'Später' }).click();
  await expect(notice).toBeHidden();

  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await notice.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
  await expect(notice.getByText(/Update wird geladen/)).toBeVisible();
  await expect(
    notice.getByText('Update wird installiert, SysRadio startet gleich neu …'),
  ).toBeVisible();
});

test('sleep timer stops playback after the chosen time', async ({ page }) => {
  await page.clock.install();
  await open(page, ['s1']);
  await page.getByRole('button', { name: 'Beispielwelle Pop abspielen' }).click();
  const player = page.getByRole('region', { name: 'Player' });
  await expect(player.getByRole('button', { name: 'Stopp' })).toBeVisible();
  await player.getByRole('button', { name: 'Schlaf-Timer' }).click();
  await page.getByRole('radio', { name: '15 Minuten' }).click();
  await expect(
    player.getByRole('button', { name: 'Schlaf-Timer: stoppt in 15 Min.' }),
  ).toBeVisible();
  await page.clock.fastForward('10:00');
  await expect(
    player.getByRole('button', { name: 'Schlaf-Timer: stoppt in 5 Min.' }),
  ).toBeVisible();
  await page.clock.fastForward('05:10');
  await expect(player.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  await expect(page.getByText('Schlaf-Timer abgelaufen: Wiedergabe gestoppt.')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Schlaf-Timer' })).toBeVisible();
});
