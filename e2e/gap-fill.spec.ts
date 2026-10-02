import { expect, test, type Locator, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, el?: Locator) => {
  if (!shots) return;
  if (el) await el.screenshot({ path: `${shots}/${name}.png` });
  else await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pick = (scope: Locator, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

test('blank horizon fields suggest what the soil log will print, with the source; one tap accepts', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.008');
  await page.getByRole('button', { name: 'Add test pit' }).click();

  // Wall 1A logged.
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const a = page.getByRole('region', { name: 'Horizon 1' });
  await pick(a, 'Horizon', 'B');
  await pick(a, 'Quick bottom', '18"');
  await pick(a, 'USDA class', 'CLAY LOAM');
  await pick(a, 'Roots', 'Yes');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  // Wall 1B: the same horizon left blank, offline.
  await context.setOffline(true);
  await page.getByRole('link', { name: /^Wall 1B/ }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const b = page.getByRole('region', { name: 'Horizon 1' });
  await pick(b, 'Horizon', 'B');
  await pick(b, 'Quick bottom', '18"');

  const texture = b.getByRole('group', { name: 'Suggested texture' });
  await expect(texture).toContainText('CLAY LOAM');
  await expect(texture).toContainText('other wall (1A)');
  await expect(b.getByRole('group', { name: 'Suggested roots' })).toContainText('other wall (1A)');
  await expect(b.getByRole('group', { name: 'Suggested mottling' })).toContainText('default');
  await shot(page, '50-suggestions', b);

  await texture.getByRole('button', { name: 'Use' }).click();
  await expect(b.getByRole('radiogroup', { name: 'USDA class', exact: true }).getByRole('radio', { name: 'CLAY LOAM', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(texture).toHaveCount(0);

  // Editing a field replaces its suggestion.
  await pick(b, 'Roots', 'No');
  await expect(b.getByRole('group', { name: 'Suggested roots' })).toHaveCount(0);
  await expect(b.getByRole('group', { name: 'Suggested mottling' })).toBeVisible();
});
