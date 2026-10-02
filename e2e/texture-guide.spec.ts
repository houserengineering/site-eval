import { expect, test, type Locator } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (el: Locator, name: string) => {
  if (shots) await el.screenshot({ path: `${shots}/${name}.png` });
};

test('texture by feel guide: too-dry loop, back, result fills texture, user can override', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('New test pit #').fill('1');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h1 = page.getByRole('region', { name: 'Horizon 1' });
  const texture = h1.getByRole('group', { name: 'Texture', exact: true });
  const cls = h1.getByRole('radiogroup', { name: 'USDA class', exact: true });

  await h1.getByRole('button', { name: 'Not sure? Texture by feel guide' }).click();
  const guide = h1.getByRole('group', { name: 'Texture by feel guide' });
  await expect(guide.getByText('Does the soil remain in a ball when squeezed?')).toBeVisible();
  await shot(texture, '30-guide-start');
  await guide.getByRole('button', { name: 'No' }).click();
  await guide.getByRole('button', { name: 'Yes, add water' }).click(); // too dry → back to moistening
  await expect(guide.getByText('Does the soil remain in a ball when squeezed?')).toBeVisible();
  await guide.getByRole('button', { name: 'Yes' }).click();
  await guide.getByRole('button', { name: 'Yes' }).click();
  await guide.getByRole('button', { name: /^Medium/ }).click();
  await guide.getByRole('button', { name: 'Very gritty' }).click();
  await guide.getByRole('button', { name: 'Back a step' }).click();
  await guide.getByRole('button', { name: 'Very smooth' }).click();
  await expect(guide.getByText('Texture by feel: SILTY CLAY LOAM')).toBeVisible();
  await shot(texture, '31-guide-result');
  await guide.getByRole('button', { name: 'Use SILTY CLAY LOAM' }).click();
  await expect(guide).toBeHidden();
  await expect(cls.getByRole('radio', { name: 'SILTY CLAY LOAM', exact: true })).toBeChecked();

  await cls.getByRole('radio', { name: 'CLAY LOAM', exact: true }).click(); // override
  await expect(cls.getByRole('radio', { name: 'CLAY LOAM', exact: true })).toBeChecked();
  await shot(texture, '32-guide-overridden');
});
