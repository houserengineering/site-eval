import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';

const shots = process.env.SHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('create a site evaluation, log a test pit, export the soil log, work offline', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await shot(page, '01-home-empty');

  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.001');
  await page.getByLabel('Project name').fill('Example Subdivision');
  await page.getByLabel('Location').fill('100 Example Road, Bozeman');
  await page.getByLabel('Eval. by').fill('Test Evaluator');
  await page.getByLabel('Date').fill('2026-10-02');
  await page.getByLabel('Confirmation number').fill('SE 00001');
  await shot(page, '02-header');

  await page.getByLabel('New test pit #').fill('3B');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await expect(page.getByRole('heading', { name: 'Test pit 3B' })).toBeVisible();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const hz = page.getByRole('region', { name: 'Horizon 1' });
  const pick = (group: string, name: string) => hz.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();
  await pick('Horizon', 'O');
  await expect(hz.getByLabel('Top')).toHaveValue('0');
  await hz.getByLabel('Bottom', { exact: true }).fill('12');
  await pick('Hue', '10YR');
  await pick('Value', '3');
  await pick('Chroma', '2');
  await pick('USDA class', 'SILT LOAM');
  await hz.getByLabel('Rock fragments (by volume)').fill('0');
  await pick('Shape', 'GRANULAR');
  await pick('Size', 'FINE');
  await pick('Consistence', 'FRIABLE');
  await pick('Plasticity', 'NON-PLASTIC');
  await pick('Roots', 'Yes');
  await pick('Mottling', 'No');
  await expect(hz.getByText('Complete')).toBeVisible();
  await shot(page, '03-test-pit');

  // Persisted on device: survives a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Horizon 1' }).getByRole('radio', { name: 'SILT LOAM' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('link', { name: /Test pit 3B/ })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export soil logs (Excel)' }).click()]);
  expect(download.suggestedFilename()).toBe('0999.001 Soil Logs.xlsx');
  await expect(page.getByRole('status')).toContainText('Saved 0999.001 Soil Logs.xlsx');
  await shot(page, '04-exported');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()) as any);
  const ws = wb.worksheets[0];
  expect(ws.name).toBe('TP 3B');
  expect(ws.getCell('B4').value).toBe('0999.001');
  expect(ws.getCell('H10').value).toBe('SE 00001');
  expect(ws.getCell('B13').value).toBe('0"-12"');
  expect(ws.getCell('C13').value).toBe('10YR 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED');
  expect(ws.getCell('E13').value).toBe('FINE GRANULAR');
  expect(ws.getCell('H13').value).toBe('NO ROCKS, FRIABLE, NON-PLASTIC');

  // Offline after first load: the service worker serves the app shell and generator.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the SW take control of this page
  await context.setOffline(true);
  await page.goto('./');
  await expect(page.getByRole('link', { name: /0999\.001 Example Subdivision/ })).toBeVisible();
  await page.getByRole('link', { name: /0999\.001 Example Subdivision/ }).click();
  const [offlineDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export soil logs (Excel)' }).click()]);
  expect(offlineDownload.suggestedFilename()).toBe('0999.001 Soil Logs.xlsx');
  await shot(page, '05-offline');
  await context.setOffline(false);
});

test('manifest makes the app installable', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await page.request.get(new URL(href!, page.url()).toString());
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i: any) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of m.icons) expect((await page.request.get(new URL(icon.src, res.url()).toString())).ok()).toBe(true);
});
