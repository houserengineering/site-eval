// Live scope (Nathan, 2026-10-04): main delivers the test pit soil log PDF only. Perc tests,
// certification, groundwater, the texture guide, rule warnings and "(UNCONFIRMED)" are off, and old
// links to them open the site evaluation. On the beta branch the flags are on and this is skipped.
import { expect, test } from '@playwright/test';
import { FEATURES } from '../src/app/features';

test.skip(Object.values(FEATURES).some(Boolean), 'beta keeps the full app');

test('live scope: no perc, certification, groundwater, texture guide, rule warnings or unconfirmed marks', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  // A device that had perc tests turned on before the trim still shows none.
  await page.evaluate(async () => {
    const req = indexedDB.open('site-eval');
    await new Promise((ok) => (req.onsuccess = ok));
    const db = req.result;
    const tx = db.transaction('device', 'readwrite');
    tx.objectStore('device').put({ percTests: true, reviewToken: '', motion: 'device' }, 'settings');
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  });
  await page.reload();
  await page.getByLabel('Load job file').setInputFiles('test/fixtures/example-job.json');
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible();
  const site = page.url();
  const id = new URL(site).hash.split('/')[2];

  for (const name of ['Perc tests', 'Groundwater monitoring']) await expect(page.getByRole('heading', { name })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Confirm on site' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Rule checks before export' })).toHaveCount(0);
  await expect(page.getByLabel('Owner name')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^(Perc tests|Groundwater|Observation wells)/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Soil logs/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export soil logs (Excel)' })).toBeVisible();

  // A wall: a 24" log would raise DEQ-4 warnings; neither they nor the texture guide show.
  await page.getByRole('link', { name: /^Wall 1A/ }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await page.getByRole('textbox', { name: 'Bottom' }).fill('24');
  await expect(page.getByRole('button', { name: /Texture by feel guide/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Rule checks' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Texture', exact: true })).toBeVisible();

  // The soil log prints the office-prefilled confirmation number plainly.
  await page.goto(`${site}/print/soil-logs`);
  const sheet = page.getByRole('img', { name: /Soil logs page 1 of/ });
  await expect(sheet.locator('text', { hasText: 'SE 00001' }).first()).toBeVisible();
  await expect(sheet.locator('text', { hasText: 'UNCONFIRMED' })).toHaveCount(0);

  // Old links to the switched-off screens open the site evaluation (or Settings for the certifier).
  for (const path of ['gw', 'gw/w1', 'perc/p1', 'print/perc-tests', 'print/groundwater']) {
    await page.goto(`./#/se/${id}/${path}`);
    await expect(page.getByRole('heading', { name: '0999.007', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Test pits' })).toBeVisible();
  }
  await page.goto('./#/certifier');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Perc tests' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Certifier signature/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replay the demo' })).toBeVisible();
});
