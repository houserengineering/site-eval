import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test('groundwater wells: register, readings with A − B and dry, results form', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-04-16T09:05:00') });
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.009');
  await page.getByLabel('Project name').fill('Example Subdivision');

  await page.getByRole('link', { name: /Observation wells/ }).click();
  await expect(page.getByRole('heading', { name: 'Groundwater wells' })).toBeVisible();
  await page.getByRole('button', { name: 'Add observation well' }).click();
  await expect(page.getByRole('heading', { name: 'Well # 1' })).toBeVisible();

  await page.getByLabel('Monitored by').fill('Nathan Hart');
  await page.getByLabel('Location', { exact: true }).fill('Lot 3 drainfield');
  await page.getByLabel('Section, township, range').fill('S12 T2S R5E');
  await page.getByLabel('Lot #').fill('3');
  await page.getByLabel('Stick-up as installed (B)').fill('24');

  // Reading 1: dry pipe → total depth with "dry"; A − B only "deeper than".
  await page.getByRole('button', { name: 'Add reading now' }).click();
  const r1 = page.getByRole('region', { name: 'Reading 1', exact: true });
  await expect(r1.getByLabel('Date')).toHaveValue('2027-04-16');
  await expect(r1.getByLabel('Time')).toHaveValue('09:05');
  await expect(r1.getByLabel('B: top of pipe to ground')).toHaveValue('24');
  await r1.getByRole('radio', { name: 'Dry' }).click();
  await r1.getByLabel('A: total depth measured').fill('137');
  await expect(r1.getByRole('definition').first()).toHaveText('>113"');
  await expect(r1).toContainText('not reached (dry)');

  // Reading 2 a week later: water.
  await page.clock.setSystemTime(new Date('2027-04-23T13:10:00'));
  await page.getByRole('button', { name: 'Add reading now' }).click();
  const r2 = page.getByRole('region', { name: 'Reading 2', exact: true });
  await expect(r2.getByLabel('Date')).toHaveValue('2027-04-23');
  await r2.getByLabel('A: top of pipe to water').fill('127');
  await expect(r2).toContainText('103" below ground');
  await expect(page.getByRole('region', { name: 'Monitoring checks' })).toContainText('at least 14 each side');
  await shot(page, '70-well-readings');

  await page.getByRole('link', { name: 'Back to groundwater wells' }).click();
  await expect(page.getByRole('link', { name: /Well # 1/ })).toContainText('2 readings · last 4/23/2027 · water 103" below ground');
  await shot(page, '71-wells');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export results (Excel)' }).click()]);
  expect(download.suggestedFilename()).toBe('0999.009 Groundwater Observation Results.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()) as any);
  const ws = wb.getWorksheet('Well # 1')!;
  expect(ws.getCell('A1').value).toBe('Well # 1 Results');
  expect(ws.getCell('C11').value).toBe(137);
  expect(ws.getCell('C11').numFmt).toBe('0" dry"');
  expect((ws.getCell('E11').value as any).result).toBe('>113');
  expect((ws.getCell('E12').value as any).result).toBe(103);
  expect(ws.getCell('F11').value).toBe('No groundwater (pipe dry)');

  await page.getByRole('link', { name: 'Print or save PDF' }).click();
  await expect(page.locator('svg').first()).toBeVisible();
  await shot(page, '72-well-print');
  // The browser's own print output (system print dialog) is a landscape letter page.
  await page.emulateMedia({ media: 'print' });
  const printed = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(printed.getPageCount()).toBe(1);
  expect(printed.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('heading', { name: 'Groundwater wells' })).toBeVisible();

  // Survives a reload (saved on device).
  await page.reload();
  await expect(page.getByRole('link', { name: /Well # 1/ })).toContainText('2 readings');
});
