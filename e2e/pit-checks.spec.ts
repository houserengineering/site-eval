import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, el?: Locator) => {
  if (!shots) return;
  if (el) await el.screenshot({ path: `${shots}/${name}.png` });
  else await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};
const pick = (scope: Locator, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.678901, longitude: -111.234567, accuracy: 2.5 } });

test('pit checks: flags on the wall and in the pit list, retake prompt, accept with who and when, soil log held', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.009');
  await page.getByRole('button', { name: 'Add test pit' }).click();

  // Wall 1A logged to 84" only.
  for (const [n, designation, bottom, cls] of [
    [1, 'A', '12"', 'LOAM'],
    [2, 'B', '84"', 'SANDY LOAM'],
  ] as const) {
    await page.getByRole('button', { name: 'Add horizon' }).click();
    const h = page.getByRole('region', { name: `Horizon ${n}` });
    await pick(h, 'Horizon', designation);
    await h.getByRole('textbox', { name: 'Bottom' }).fill(bottom.replace('"', ''));
    await pick(h, 'Hue', '10YR');
    await pick(h, 'Value', '4');
    await pick(h, 'Chroma', '3');
    await pick(h, 'USDA class', cls);
  }

  // A flat, small photo: flagged at once with a retake prompt.
  await page.getByLabel('Take photo').setInputFiles({ name: 'pit.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-photo.jpg') });
  await expect(page.getByText('Saved, but it does not meet the photo standard. Retake it.')).toBeVisible();
  const photos = page.getByRole('region', { name: 'Photos' });
  await expect(photos.getByText('This photo is blurry and too small (300 × 400). Retake it.')).toBeVisible();

  const checks = page.getByRole('region', { name: 'Pit checks' });
  await expect(checks.getByRole('listitem')).toHaveText([/^Log ends at 84"; log the wall to 96"\./, /^Photo 1 is blurry and too small \(300 × 400\)\. Retake it\./]);
  await expect(checks.getByText('2 open')).toBeVisible();
  await expect(page.getByRole('button', { name: '2 pit checks open' })).toBeVisible();
  await shot(page, '90-pit-checks', checks);

  // Retake replaces the photo in its place; the photo flag goes.
  await photos.getByLabel('Retake photo 1').setInputFiles({ name: 'wall.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-wall-synthetic.jpg') });
  await expect(page.getByText('1 photo saved on this device.')).toBeVisible();
  await expect(photos.getByRole('img')).toHaveCount(1);
  await expect(photos.getByText(/Retake it/)).toHaveCount(0);
  await expect(checks.getByRole('listitem')).toHaveCount(1);

  // The pit list and the deliverables show it; the soil log is held.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('link', { name: /^Wall 1A / })).toContainText('1 check open');
  const hold = page.getByRole('region', { name: 'Soil log held' });
  await expect(hold).toContainText('Soil log held: 1 pit check open.');
  await expect(page.getByRole('button', { name: 'Export soil logs (Excel)' })).toBeDisabled();
  await shot(page, '91-soil-log-held', hold);
  await page.getByRole('link', { name: /^Soil logs/ }).click();
  await expect(page.getByRole('img', { name: /^Soil logs page 1 of/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save PDF' })).toBeDisabled();
  await page.getByRole('region', { name: 'Soil log held' }).getByRole('link', { name: 'Wall 1A: 1 open' }).click();

  // Accepting records who and when; the soil log is released.
  await checks.getByRole('button', { name: 'Accept: Log ends at 84"; log the wall to 96".' }).click();
  await expect(checks.getByText(/^Accepted by Test User \d+\/\d+\/\d+ \d+:\d\d [AP]M$/)).toBeVisible();
  await expect(checks.getByText('All accepted.')).toBeVisible();
  await expect(page.getByRole('button', { name: /pit checks? open/ })).toHaveCount(0);
  await shot(page, '92-check-accepted', checks);
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('region', { name: 'Soil log held' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export soil logs (Excel)' })).toBeEnabled();

  // Wall 1B starts from 1A: the acceptance stays on 1A, so 1B flags its own short log until it is fixed.
  await page.getByRole('link', { name: /^Wall 1B / }).click();
  await page.getByRole('button', { name: /^Copy horizons from wall 1A/ }).click();
  await expect(page.getByRole('region', { name: 'Pit checks' }).getByRole('listitem')).toHaveText([/^Log ends at 84"/]);
  await page.getByRole('region', { name: 'Horizon 2' }).getByRole('textbox', { name: 'Bottom' }).fill('96');
  await expect(page.getByRole('region', { name: 'Pit checks' })).toHaveCount(0);
});

test('color check: the wall-face photo with a white card flags a logged color 2 values off; never sets it', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.010');
  await page.getByRole('button', { name: 'Add test pit' }).click();

  // The photo shows 10YR 3/2 to 12" over 10YR 5/3; horizon A is logged 10YR 5/3.
  for (const [n, designation, bottom] of [
    [1, 'A', '12'],
    [2, 'B', '96'],
  ] as const) {
    await page.getByRole('button', { name: 'Add horizon' }).click();
    const h = page.getByRole('region', { name: `Horizon ${n}` });
    await pick(h, 'Horizon', designation);
    await h.getByRole('textbox', { name: 'Bottom' }).fill(bottom);
    await pick(h, 'Hue', '10YR');
    await pick(h, 'Value', '5');
    await pick(h, 'Chroma', '3');
    await pick(h, 'USDA class', 'LOAM');
  }
  await page.getByLabel('Take photo').setInputFiles({ name: 'wall.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-wall-face.jpg') });
  await expect(page.getByText('1 photo saved on this device.')).toBeVisible();
  const photos = page.getByRole('region', { name: 'Photos' });
  const checks = page.getByRole('region', { name: 'Pit checks' });
  await expect(page.getByRole('button', { name: /pit checks? open/ })).toHaveCount(0);

  // Marked as the wall face: hue only without the card, and the hue matches.
  await photos.getByLabel('Wall face (color check)').check();
  await expect(page.getByRole('button', { name: /pit checks? open/ })).toHaveCount(0);

  // With the white card, value is judged.
  await photos.getByLabel('White card or tape in frame').check();
  await expect(checks.getByRole('listitem')).toHaveText([/^Horizon A: the wall-face photo reads about (7\.5|10)YR 3\/2; logged 10YR 5\/3\. Check the color\./]);
  await shot(page, '93-color-check', photos);
  await shot(page, '94-color-flag', checks);
  await page.getByRole('region', { name: 'Horizon 1' }).getByText(/^Horizon 1 · A/).click();
  await expect(page.getByRole('region', { name: 'Horizon 1' }).getByRole('radiogroup', { name: 'Value', exact: true }).getByRole('radio', { name: '5', exact: true })).toHaveAttribute('aria-checked', 'true');

  // Fixing the color clears it.
  await pick(page.getByRole('region', { name: 'Horizon 1' }), 'Value', '3');
  await pick(page.getByRole('region', { name: 'Horizon 1' }), 'Chroma', '2');
  await expect(page.getByRole('button', { name: /pit checks? open/ })).toHaveCount(0);
});
