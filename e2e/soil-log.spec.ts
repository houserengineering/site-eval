import { expect, test, type Locator, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { acceptOpenChecks } from './checks';

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

  // A new wall's summary is collapsed to the line that will print, with the normal-pit defaults.
  const sum = page.getByRole('region', { name: 'Test pit summary' });
  await expect(sum.locator('summary')).toContainText('NO GROUNDWATER OBSERVED. NO REDOXIMORPHIC FEATURES TO PIT DEPTH. LIMITING LAYER: NONE TO PIT DEPTH. SLOPE 2% (ESTIMATED).');
  await expect(sum.getByLabel('Slope', { exact: true })).toBeHidden();
  await shot(page, '09-new-wall-summary', sum);

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
  // 60% or more is bedrock: refused with the reason, nothing saved.
  await h2.getByLabel('Rock fragments (by volume)').fill('65');
  await expect(h2.getByRole('alert')).toHaveText('60% or more is bedrock, not a test pit horizon');
  await h2.getByLabel('Rock fragments (by volume)').fill('40');
  await expect(h2.getByRole('alert')).toHaveCount(0);
  await pick(h2, 'Rock size', 'GRAVEL 2–75 mm');
  await pick(h2, 'Rock size range to (optional)', 'COBBLES 75–250 mm');
  await expect(h2.getByLabel('Horizon 2 soil log preview')).toContainText('40% ROCKS (GRAVEL TO COBBLES)');
  await expect(h2.getByText('COARSE SANDY LOAM', { exact: true })).toBeVisible(); // rock prints in NOTES, not as a texture modifier
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

  // The pit was shallow while horizons went in, so the summary opened to ask for a reason.
  await expect(sum.locator('details')).toHaveAttribute('open', '');
  await expect(sum.getByText(/Seasonal high groundwater \(estimate\)/)).toHaveCount(0);
  await expect(sum.getByRole('radiogroup', { name: /^(Shape|Direction \(downhill\)|Method)$/ })).toHaveCount(0);
  await pick(sum, 'Groundwater observed in pit', 'Seepage');
  await sum.getByLabel('Water depth').fill('90');
  await pick(sum, 'Basis', 'REDOXIMORPHIC FEATURES');
  await pick(sum, 'Limiting layer', 'Seasonal high groundwater');
  await sum.getByLabel('Depth to limiting layer').fill('60');
  await sum.getByLabel('Slope', { exact: true }).fill('4');
  await expect(sum.getByText('Still needed')).toHaveCount(0);
  await shot(page, '12-pit-summary', sum);
  await shot(page, '13-pit-full');

  // The second pit starts from the first pit's horizons.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByLabel('New test pit #').fill('2');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Copy horizons from test pit 1' }).click();
  const p2h2 = page.getByRole('region', { name: 'Horizon 2' });
  await expect(p2h2).toBeVisible();

  // A hue no other B horizon on the site uses (0271's 2.5YR mis-tap) asks for a second look.
  await pick(p2h2.getByRole('group', { name: 'Color (Munsell)' }), 'Hue', '2.5YR');
  await expect(p2h2.getByRole('status').filter({ hasText: '2.5YR is not used on other B horizons on this site (2.5Y). Check the chip.' })).toBeVisible();
  await shot(page, '14-hue-check', p2h2.getByRole('group', { name: 'Color (Munsell)' }).locator('..'));
  await p2h2.getByRole('button', { name: 'Keep 2.5YR' }).click();
  await expect(p2h2.getByText(/is not used on other/)).toHaveCount(0);

  // Typed text is stored and shown in ALL CAPS, as it prints.
  await p2h2.getByLabel('Notes', { exact: true }).fill('driveway nearby');
  await expect(p2h2.getByLabel('Notes', { exact: true })).toHaveValue('DRIVEWAY NEARBY');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await acceptOpenChecks(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export soil logs (Excel)' }).click()]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()) as any);
  const ws = wb.worksheets[0];
  const row = (n: number) => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => ws.getCell(`${c}${n}`).value);
  expect(row(13)).toEqual(['A', '0"-18"', '10YR 2/2, VERY DARK BROWN, MOIST, RUBBED', 'CLAY LOAM', 'WEAK, FINE TO MEDIUM SUBANGULAR BLOCKY', 'Y', 'N', 'NO ROCKS, FIRM, MODERATELY PLASTIC']);
  expect(row(14)).toEqual([
    'B', '18"-102"', '2.5Y 5/3, LIGHT OLIVE BROWN, MOIST, RUBBED', 'COARSE SANDY LOAM', 'SINGLE GRAIN', 'N', 'Y',
    '40% ROCKS (GRAVEL TO COBBLES), LOOSE, NON-PLASTIC, COMMON MEDIUM DISTINCT 7.5YR 5/6 MOTTLES, LIMITING LAYER AT 60" (SEASONAL HIGH GROUNDWATER), GROUNDWATER SEEPS AT 90"',
  ]);
  expect(ws.getCell('A16').value).toBe('TOTAL DEPTH 102". GROUNDWATER SEEPS AT 90". REDOXIMORPHIC FEATURES. LIMITING LAYER AT 60" (SEASONAL HIGH GROUNDWATER). SLOPE 4% (ESTIMATED).');
  expect(wb.worksheets[1].getCell('A14').value).toBe('B');
});
