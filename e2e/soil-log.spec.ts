import { expect, test, type Locator, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, el?: Locator) => {
  if (!shots) return;
  if (el) await el.screenshot({ path: `${shots}/${name}.png` });
  else await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pick = (scope: Locator, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

test('full test pit capture: picks, mottles, rock modifier, pit summary, copy previous pit', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.002');
  await page.getByLabel('New test pit #').fill('1');
  await page.getByRole('button', { name: 'Add test pit' }).click();

  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h1 = page.getByRole('region', { name: 'Horizon 1' });
  await pick(h1, 'Horizon', 'A');
  await pick(h1, 'Quick bottom', '18"');
  await pick(h1, 'Hue', '10YR');
  await pick(h1, 'Value', '2');
  await expect(h1.getByRole('radiogroup', { name: 'Chroma' }).getByRole('radio', { name: '6', exact: true })).toBeDisabled(); // 10YR 2/6 is not on the chart
  await pick(h1, 'Chroma', '2');
  await pick(h1, 'USDA class', 'CLAY LOAM');
  await h1.getByLabel('Rock fragments (by volume)').fill('0');
  await pick(h1, 'Shape', 'SUBANGULAR BLOCKY');
  await pick(h1, 'Grade', 'WEAK');
  await pick(h1, 'Size', 'FINE');
  await pick(h1, 'Size range to (optional)', 'MEDIUM');
  await pick(h1, 'Consistence', 'FIRM');
  await pick(h1, 'Plasticity', 'MODERATELY PLASTIC');
  await pick(h1, 'Roots', 'Yes');
  await pick(h1, 'Mottling', 'No');
  await shot(page, '10-horizon-1');

  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h2 = page.getByRole('region', { name: 'Horizon 2' });
  await expect(h2.getByLabel('Top')).toHaveValue('18');
  await pick(h2, 'Horizon', 'B');
  await pick(h2, 'Quick bottom', '102"');
  await pick(h2, 'Hue', '2.5Y');
  await pick(h2, 'Value', '5');
  await pick(h2, 'Chroma', '3');
  await pick(h2, 'USDA class', 'SANDY LOAM');
  await pick(h2, 'Sand size', 'COARSE');
  await h2.getByLabel('Rock fragments (by volume)').fill('40');
  await pick(h2, 'Rock size', 'GRAVEL 2–75 mm');
  await expect(h2.getByText('VERY GRAVELLY COARSE SANDY LOAM')).toBeVisible();
  await pick(h2, 'Shape', 'SINGLE GRAIN');
  await pick(h2, 'Consistence', 'LOOSE');
  await pick(h2, 'Plasticity', 'NON-PLASTIC');
  await pick(h2, 'Roots', 'No');
  await pick(h2, 'Mottling', 'Yes');
  const mottles = h2.getByRole('group', { name: 'Mottles (redoximorphic features)' });
  await pick(mottles, 'Quantity', 'COMMON 2–20%');
  await pick(mottles, 'Size', 'MEDIUM');
  await pick(mottles, 'Contrast', 'DISTINCT');
  const mc = mottles.getByRole('group', { name: 'Mottle color' });
  await pick(mc, 'Hue', '7.5YR');
  await pick(mc, 'Value', '5');
  await pick(mc, 'Chroma', '6');
  await shot(page, '11-horizon-2', h2);

  const sum = page.getByRole('region', { name: 'Test pit summary' });
  await pick(sum, 'Groundwater observed in pit', 'Seepage');
  await sum.getByLabel('Water depth').fill('90');
  await sum.getByRole('button', { name: /Deeper than pit/ }).click();
  await pick(sum, 'Basis', 'REDOXIMORPHIC FEATURES');
  await sum.getByLabel('Depth', { exact: true }).fill('60');
  await pick(sum, 'Qualifier', 'Deeper than (>)'); // clear it: the estimate is 60", not deeper than 60"
  await pick(sum, 'Type', 'Seasonal high groundwater');
  await sum.getByLabel('Depth to limiting layer').fill('60');
  await sum.getByLabel('Slope', { exact: true }).fill('4');
  await pick(sum, 'Shape', 'PLANE');
  await pick(sum, 'Direction (downhill)', 'NE');
  await pick(sum, 'Method', 'CLINOMETER');
  await expect(sum.getByText('Still needed')).toHaveCount(0);
  await shot(page, '12-pit-summary', sum);
  await shot(page, '13-pit-full');

  // The second pit starts from the first pit's horizons.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByLabel('New test pit #').fill('2');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Copy horizons from test pit 1' }).click();
  await expect(page.getByRole('region', { name: 'Horizon 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export soil logs (Excel)' }).click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()) as any);
  const ws = wb.worksheets[0];
  const row = (n: number) => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => ws.getCell(`${c}${n}`).value);
  expect(row(13)).toEqual(['A', '0"-18"', '10YR 2/2, VERY DARK BROWN, MOIST, RUBBED', 'CLAY LOAM', 'WEAK, FINE TO MEDIUM SUBANGULAR BLOCKY', 'Y', 'N', 'NO ROCKS, FIRM, MODERATELY PLASTIC']);
  expect(row(14)).toEqual([
    'B', '18"-102"', '2.5Y 5/3, LIGHT OLIVE BROWN, MOIST, RUBBED', 'VERY GRAVELLY COARSE SANDY LOAM', 'SINGLE GRAIN', 'N', 'Y',
    '40% GRAVEL, LOOSE, NON-PLASTIC, COMMON MEDIUM DISTINCT 7.5YR 5/6 MOTTLES, LIMITING LAYER AT 60" (SEASONAL HIGH GROUNDWATER), GROUNDWATER SEEPS AT 90"',
  ]);
  expect(ws.getCell('A16').value).toBe('TOTAL DEPTH 102". EST. SEASONAL HIGH GROUNDWATER 60" (REDOXIMORPHIC FEATURES). SLOPE 4%, PLANE, NE (CLINOMETER)');
  expect(wb.worksheets[1].getCell('A14').value).toBe('B');
});
