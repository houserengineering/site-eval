import { expect, test } from '@playwright/test';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.6792, longitude: -111.2355, accuracy: 2 } });

test('a new wall starts its GPS fix without a tap and says where its location comes from (ticket 05)', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await expect(page.getByRole('heading', { name: 'Test pit 1A' })).toBeVisible();

  const gps = page.getByRole('region', { name: 'GPS location' });
  await expect(gps.getByRole('button', { name: 'Retake GPS' })).toBeVisible({ timeout: 15_000 });
  await expect(gps.getByText(/^Location on the log: 45\.679200° N, 111\.235500° W ±7 ft \(GPS, /)).toBeVisible();

  // Wall B of the same hole: until its own fix, the log uses wall A's.
  await context.setGeolocation({ latitude: 45.6793, longitude: -111.2355, accuracy: 2 });
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await context.clearPermissions();
  await page.getByRole('link', { name: /^Wall 1B / }).click();
  await expect(gps.getByText(/^Location on the log: 45\.679200° N, 111\.235500° W ±7 ft \(GPS at other wall of this pit, /)).toBeVisible();

  // Back on wall A, which has a fix: no second fix.
  await context.grantPermissions(['geolocation']);
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /^Wall 1A / }).click();
  await expect(gps.getByRole('button', { name: 'Retake GPS' })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(gps.getByText(/^Location on the log: 45\.679200° N, 111\.235500° W ±7 ft \(GPS, /)).toBeVisible();
  await expect(gps.getByText('Getting a GPS fix…')).toHaveCount(0);
});
