import { expect, test } from '@playwright/test';

test('enrollment link saves the review token, leaves no trace in the URL, and Remove turns review off', async ({ page }) => {
  await page.goto('./#/enroll/sev_e2eTOKEN_0123456789abcdef?u=https%3A%2F%2Freview.test');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'AI photo review is on for this device.' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/settings');
  // The link replaced its own history entry: Back leaves the app instead of returning to it.
  await page.goBack();
  expect(page.url()).not.toContain('enroll');
  await page.goForward();
  await expect(page.getByText('Token saved on this device ••••cdef')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sev_e2eTOKEN');

  // Kept on the device: a reload shows it set, without the one-time notice; the service URL is seeded.
  await page.reload();
  await expect(page.getByText('Token saved on this device ••••cdef')).toBeVisible();
  await expect(page.getByText('AI photo review is on for this device.')).toHaveCount(0);
  const stored = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const req = indexedDB.open('site-eval');
        req.onsuccess = () => {
          const all = req.result.transaction('device', 'readonly').objectStore('device').getAll();
          all.onsuccess = () => resolve(JSON.stringify(all.result));
        };
      }),
  );
  expect(stored).toContain('sev_e2eTOKEN_0123456789abcdef');
  expect(stored).toContain('https://review.test');

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByLabel('AI photo review token')).toBeVisible();
  await expect(page.getByText(/Token saved/)).toHaveCount(0);
});

test('an enrollment link opened while the app is running is saved too', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await page.evaluate(() => (location.hash = '#/enroll/sev_runningTOKEN_wxyz'));
  await expect(page.getByText('Token saved on this device ••••wxyz')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/settings');
});
