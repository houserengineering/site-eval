import { expect, test, type Locator, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, el?: Locator) => {
  if (!shots) return;
  if (el) await el.screenshot({ path: `${shots}/${name}.png` });
  else await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pick = (scope: Locator | Page, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

test('rule checks warn in pit and perc views, cite the rule, and are summarized before export', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.008');
  // No proposed-system inputs (removed 2026-10-02): the checks use a 24" gravity trench, both reviews.
  await expect(page.getByRole('heading', { name: 'Proposed system' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h1 = page.getByRole('region', { name: 'Horizon 1' });
  await pick(h1, 'Quick bottom', '18"');
  await pick(h1, 'USDA class', 'LOAM');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h2 = page.getByRole('region', { name: 'Horizon 2' });
  await h2.getByLabel('Bottom', { exact: true }).fill('84');
  await pick(h2, 'USDA class', 'SANDY LOAM');
  const summary = page.getByRole('region', { name: 'Test pit summary' });
  await expect(summary.locator('details')).toHaveAttribute('open', ''); // an 84" pit with no limiting layer still needs a reason
  await pick(summary, 'Groundwater observed in pit', 'Seepage');
  await summary.getByLabel('Water depth', { exact: true }).fill('60');
  await summary.getByLabel('Slope', { exact: true }).fill('18');

  const checks = page.getByRole('region', { name: 'Rule checks' });
  await expect(checks.getByText('Pit is 84" deep with no limiting layer recorded')).toBeVisible();
  await expect(checks.getByText('Water observed at 60"')).toBeVisible();
  await expect(checks.getByText('Separation 36" from the 24" infiltrative surface')).toBeVisible();
  await expect(checks.getByText(/a 2-ft contour map may be required/)).toBeVisible();
  await expect(checks.getByText(/the system must be pressure distributed/)).toBeVisible();

  const sep = checks.locator('details', { hasText: 'Separation 36"' });
  await sep.locator('summary').click();
  await expect(sep.getByText('ARM 17.36.320(4); ARM 17.36.914(3)')).toBeVisible();
  await expect(sep.getByText(/effective 4\/15\/2023/)).toBeVisible();
  await shot(page, '80-pit-rule-checks', checks);

  // Recording the limiting layer clears the depth warning (warn, never block).
  await pick(summary, 'Limiting layer', 'Seasonal high groundwater');
  await summary.getByLabel('Depth to limiting layer').fill('60');
  await expect(checks.getByText('Pit is 84" deep')).toHaveCount(0);

  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await page.getByLabel('Hole diameter', { exact: true }).fill('4');
  const perc = page.getByRole('region', { name: 'Rule checks' });
  await expect(perc.getByText('Hole diameter 4" is outside 6–10".')).toBeVisible();
  await expect(perc.getByText('Hole depth is not recorded')).toBeVisible();
  await shot(page, '81-perc-rule-checks', perc);

  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  const before = page.getByRole('region', { name: 'Rule checks before export' });
  await expect(before.getByText('Test pit 1:', { exact: false }).first()).toBeVisible();
  await expect(before.getByText('Perc test 1:', { exact: false }).first()).toBeVisible();
  await expect(before.getByText(/No Site Evaluation #/)).toBeVisible();
  // Export stays available with warnings outstanding.
  await expect(page.getByRole('button', { name: 'Export soil logs (Excel)' })).toBeEnabled();
  await shot(page, '82-export-summary', before);
  await shot(page, '83-site-evaluation');
});
