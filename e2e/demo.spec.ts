import { expect, test, type Locator, type Page } from '@playwright/test';
import { acceptOpenChecks } from './checks';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};
const pick = (scope: Locator, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

const horizon = async (page: Page, n: number, designation: string, bottom: string) => {
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h = page.getByRole('region', { name: `Horizon ${n}` });
  await pick(h, 'Horizon', designation);
  await pick(h, 'Quick bottom', bottom);
  await pick(h, 'Hue', '10YR');
  await pick(h, 'Value', '3');
  await pick(h, 'Chroma', '2');
  await pick(h, 'USDA class', 'LOAM');
};

test('demo: guided walkthrough on a sample job that never reaches Dropbox', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Office'));
  await page.getByRole('button', { name: 'Try the demo' }).click();
  const guide = page.getByRole('complementary', { name: 'Demo guide' });
  await expect(guide).toContainText('Welcome');
  await shot(page, 'demo-01-welcome');
  await guide.getByRole('button', { name: 'Next' }).click();

  await expect(guide).toContainText('Add a test pit');
  await page.getByLabel('New test pit #').fill('1');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await expect(guide.getByText('Done')).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();

  await expect(guide).toContainText('Log the horizons');
  await horizon(page, 1, 'A', '12"');
  await horizon(page, 2, 'B', '96"');
  await expect(guide.getByText('Done')).toBeVisible();
  await shot(page, 'demo-02-horizons');
  await guide.getByRole('button', { name: 'Next' }).click();

  await expect(guide).toContainText('Add a photo');
  await page.getByRole('button', { name: 'Use a sample photo' }).click();
  await expect(guide.getByText('Done')).toBeVisible({ timeout: 15_000 });
  await guide.getByRole('button', { name: 'Next' }).click();

  await expect(guide).toContainText('Wall B');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /Wall 1B, south/ }).click();
  await page.getByRole('button', { name: /Start from wall 1A/ }).click();
  await expect(guide.getByText('Done')).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();

  await expect(guide).toContainText('Pit checks');
  await shot(page, 'demo-03-checks');
  await guide.getByRole('button', { name: /^(Next|Skip)$/ }).click();

  await expect(guide).toContainText('Generate the soil log');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /Soil logs/ }).click();
  await expect(guide).toContainText('That is the whole loop');
  await shot(page, 'demo-04-done');

  // Nothing reached Dropbox, and the demo deletes itself.
  expect(await page.evaluate(() => [...(window as any).__fakeDropbox.files.keys()])).toEqual([]);
  expect(await page.evaluate(() => (window as any).__fakeDropbox.folderExists('/Server/Office/Site Evaluations'))).toBe(false);
  page.once('dialog', (d) => d.accept());
  await guide.getByRole('button', { name: 'Delete the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await expect(page.getByText('Demo:')).toHaveCount(0);
});
