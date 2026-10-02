import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
};

// Inside the synthetic example map, about 80 ft south of planned test pit 2.
test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.678901, longitude: -111.234567, accuracy: 2.5 } });

test('job file: pre-filled header, confirm-on-site flag, offline map with live dot and pit status, unplanned pits', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the service worker control the page so offline works

  await page.getByLabel('Load job file').setInputFiles('test/fixtures/example-job.json');
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveValue('Example Subdivision');
  await expect(page.getByLabel('Confirmation number')).toHaveValue('SE 00001');
  const confirmBox = page.getByRole('region', { name: 'Confirm on site' });
  await expect(confirmBox).toContainText('Confirmation number: SE 00001');
  await expect(page.getByText('0 complete · 0 in progress · 3 not started')).toBeVisible();
  await shot(page, '50-job-loaded');

  // The flag blocks nothing and shows on the deliverable preview.
  await page.getByRole('link', { name: /^Soil logs/ }).click();
  await expect(page.getByRole('region', { name: 'Confirm on site' })).toContainText('print marked (UNCONFIRMED)');
  const sheet = page.getByRole('img', { name: /Soil logs page 1 of/ });
  await expect(sheet.locator('text', { hasText: 'SE 00001 (UNCONFIRMED)' }).first()).toBeVisible();
  await shot(page, '51-preview-unconfirmed', false);
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  // Offline: the map image is on the device and GPS needs no signal.
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page.getByRole('application', { name: /Example Test Pit Map/ }).locator('img')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Test pit \d, not started$/ })).toHaveCount(3);
  await expect(page.getByRole('status').filter({ hasText: 'You: ±8 ft' })).toContainText(/Test pit 2: (7[5-9]|8[0-5]) ft N/);
  await expect(page.locator('.map-box .me-dot')).toBeVisible();
  await shot(page, '52-map-offline', false);
  await page.getByRole('button', { name: 'Satellite' }).click();
  await expect(page.getByText('Satellite imagery needs a connection')).toBeVisible();
  await page.getByRole('button', { name: 'Test pit map' }).click();

  // Unplanned pits: at my location, and by tapping the map.
  await page.getByRole('button', { name: 'At my location' }).click();
  await expect(page.getByText('Added test pit 4.')).toBeVisible();
  await page.getByRole('button', { name: 'Tap on the map' }).click();
  const map = page.getByRole('application', { name: /Example Test Pit Map/ });
  const b = (await map.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.2, b.y + b.height * 0.75);
  await expect(page.getByText('Added test pit 5.')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Test pit \d, / })).toHaveCount(5);
  // Pit 4 has its GPS fix already, so it is under way.
  await expect(page.getByRole('link', { name: 'Test pit 4, in progress' })).toBeVisible();
  await shot(page, '53-map-added-pits', false);

  // Tapping a pin opens that test pit.
  await page.getByRole('link', { name: 'Test pit 1, not started' }).click();
  await expect(page.getByRole('heading', { name: /Test pit 1/ })).toBeVisible();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await context.setOffline(false);

  // Confirming clears the flag.
  await page.getByRole('button', { name: 'Confirm SE 00001' }).click();
  await expect(page.getByRole('region', { name: 'Confirm on site' })).toHaveCount(0);
  // Opening pit 1 started its GPS fix (ticket 05), so it is under way too.
  await expect(page.getByText('0 complete · 2 in progress · 3 not started')).toBeVisible();
  await shot(page, '54-confirmed');
});
