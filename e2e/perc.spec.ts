import { expect, test, type Locator, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { turnOnPercTests } from './settings';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pick = (scope: Locator | Page, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();
const tape = async (scope: Locator, label: string, inches: string, sixteenths = '0') => {
  await scope.getByLabel(`${label}, inches`).fill(inches);
  await scope.getByLabel(`${label}, sixteenths`).selectOption(sixteenths);
};

test('perc tests are hidden until turned on in settings; turning them off keeps the records', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.006');
  await expect(page.getByRole('heading', { name: 'Perc tests' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add perc test' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Perc tests/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export perc tests (Excel)' })).toHaveCount(0);
  const site = page.url();

  await page.getByRole('link', { name: 'All site evaluations' }).click();
  await turnOnPercTests(page);
  await page.goto(site);
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await expect(page.getByRole('heading', { name: 'Perc test 1' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('link', { name: /^Perc tests/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export perc tests (Excel)' })).toBeVisible();

  // Off again: everything perc is hidden (home list included), but the perc test is still saved.
  await page.getByRole('link', { name: 'All site evaluations' }).click();
  await expect(page.getByText('1 perc test')).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await shot(page, '19-settings-perc-on');
  await page.getByRole('checkbox', { name: 'Perc tests' }).uncheck();
  await page.getByRole('link', { name: 'All site evaluations' }).click();
  await expect(page.getByRole('link', { name: /^0999\.006/ })).toContainText('0 test pits');
  await expect(page.getByText('1 perc test')).toHaveCount(0);
  await page.goto(site);
  await expect(page.getByRole('heading', { name: 'Perc tests' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Perc test 1/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Perc tests/ })).toHaveCount(0);
  await shot(page, '19-site-perc-off');

  await page.getByRole('link', { name: 'All site evaluations' }).click();
  await shot(page, '19-home');
  await turnOnPercTests(page);
  await page.goto(site);
  await expect(page.getByRole('link', { name: /^Perc test 1/ })).toBeVisible();
});

test('perc test: soak branch, timed readings with alerts, reload, concurrent tests, Excel', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-02T08:00:00') });
  await page.goto('./');
  await turnOnPercTests(page);
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.004');
  await page.getByLabel('Project name').fill('Example Subdivision');
  await page.getByLabel('Owner name').fill('Example Owner');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByLabel('New perc test #').fill('1');
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await expect(page.getByRole('heading', { name: 'Perc test 1' })).toBeVisible();

  await pick(page, 'At test pit', '1A');
  await page.getByLabel('Lot', { exact: true }).fill('19');
  await page.getByLabel('Hole depth').fill('24');
  await page.getByLabel('Reference point above hole bottom').fill('22.625');
  await expect(page.getByText('Prints as 22-5/8"')).toBeVisible();

  // Soak: two 12" fillings each gone within 60 min → sandy-soil test (DEQ-4 App. A).
  const soak = page.getByRole('region', { name: 'Soak' });
  await soak.getByRole('button', { name: 'Start first 12" filling' }).click();
  await expect(page.getByRole('navigation', { name: 'Perc timers' })).toContainText('Filling 1');
  await page.clock.fastForward('50:00');
  await soak.getByRole('button', { name: 'Drained (hole empty)' }).click();
  await expect(soak).toContainText('First filling seeped away in 50 min');
  await soak.getByRole('button', { name: 'Start second 12" filling' }).click();
  await page.clock.fastForward('45:00');
  await soak.getByRole('button', { name: 'Drained (hole empty)' }).click();
  await expect(soak).toContainText('run the sandy-soil test now');
  await soak.getByRole('button', { name: 'Use the sandy-soil test' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Method' }).getByRole('radio', { name: /Sandy-soil test/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Reading interval')).toHaveValue('15');
  await shot(page, '20-perc-soak');

  // Four 15-minute readings, refilled to 6" each time; 2" drop → 7.5 mpi.
  const readings = page.getByRole('region', { name: 'Readings' });
  await readings.getByRole('button', { name: 'Start reading 1 now' }).click();
  for (let n = 1; n <= 4; n++) {
    const card = page.getByRole('region', { name: `Reading ${n}`, exact: true });
    await tape(card, 'Initial distance below reference point', '16', n % 2 ? '0' : '2');
    await tape(card, 'Final distance below reference point', '18', n % 2 ? '0' : '2');
    if (n === 2) {
      // Timers are timestamps: a reload mid-reading keeps the same countdown.
      await page.clock.fastForward('05:00');
      await page.reload();
      await expect(readings.getByLabel('Next reading in')).toContainText(/(10:00|9:5\d)/);
    }
    await page.clock.fastForward(n === 2 ? '10:00' : '15:00');
    await expect(page.getByRole('navigation', { name: 'Perc timers' }).getByRole('link', { name: /Reading/ })).toContainText('DUE');
    await expect(readings.getByLabel('Reading due')).toBeVisible();
    if (n === 1) await shot(page, '21-perc-reading-due');
    await readings.getByRole('button', { name: n < 4 ? 'Record & start next' : 'Record & finish' }).click();
    await expect(page.getByRole('region', { name: `Reading ${n}`, exact: true }).getByLabel(`Reading ${n} results`)).toContainText('7.5 mpi');
  }
  await expect(page.getByRole('status').filter({ hasText: 'Stop rule met' })).toContainText('Final rate 7.5 mpi (reading 4)');
  await shot(page, '22-perc-complete');

  // A second perc test runs its soak while the first is done; both listed on the site evaluation.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('link', { name: /Perc test 1/ })).toContainText('Final 7.5 mpi');
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await pick(page, 'Soil at test depth is sandy clay loam or finer', 'Yes');
  await page.getByRole('region', { name: 'Soak' }).getByRole('button', { name: 'Start 4-h presoak' }).click();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByLabel('New perc test #').fill('3');
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await page.getByRole('region', { name: 'Soak' }).getByRole('button', { name: 'Start first 12" filling' }).click();
  const bar = page.getByRole('navigation', { name: 'Perc timers' });
  await expect(bar.getByRole('link')).toHaveCount(2);
  await expect(bar).toContainText('Perc 2 · Presoak 4 h');
  await expect(bar).toContainText('Perc 3 · Filling 1');
  // A filling that has not drained by 60 min stays on the bar as DUE (the alert cannot be skipped).
  await page.clock.fastForward('01:01:00');
  await expect(bar.getByRole('link', { name: /Perc 3/ })).toContainText('DUE');
  await expect(page.getByRole('region', { name: 'Soak' })).toContainText('did not seep away within 60 minutes');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await shot(page, '23-perc-list-timers');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export perc tests (Excel)' }).click()]);
  expect(download.suggestedFilename()).toBe('0999.004 Percolation Tests.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await download.path()) as any);
  expect(wb.worksheets.map((w) => w.name)).toEqual(['Perc Test 1', 'Perc Test 2', 'Perc Test 3']);
  const ws = wb.worksheets[0];
  expect(ws.getCell('D2').value).toBe('Example Owner');
  expect(ws.getCell('B8').value).toBe('Lot 19 Test #1');
  expect(ws.getCell('J2').value).toBe('10/2/2026 @ 8:00 AM');
  // The clock keeps running (the app's timers and rendering need it), so each reading lasts 15 min
  // plus however long the Record tap took in real time: 7.508 mpi on a loaded parallel run (ticket
  // 14). Check the sheet's own arithmetic and the drop exactly, and the interval within tap delay.
  const interval = (ws.getCell('D15').value as any).result as number;
  const drop = (ws.getCell('I15').value as any).result ?? ws.getCell('I15').value;
  expect(drop).toBeCloseTo(2, 6);
  expect(interval).toBeGreaterThanOrEqual(15);
  expect(interval).toBeLessThan(15.5);
  expect((ws.getCell('K15').value as any).result).toBeCloseTo(interval / drop, 9);
  expect((ws.getCell('K15').value as any).formula).toBe('IF(I15>0,D15/I15,"")');
});
