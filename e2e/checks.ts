import { expect, type Page } from '@playwright/test';

/**
 * From the site evaluation screen: accept every open pit check, wall by wall, then come back.
 * For specs about something else that log partial walls (pit checks hold the soil log; ticket 09).
 */
export async function acceptOpenChecks(page: Page) {
  const hold = page.getByRole('region', { name: 'Soil log held' });
  for (;;) {
    await expect(page.getByRole('heading', { name: 'Deliverables' })).toBeVisible();
    if (!(await hold.isVisible())) return;
    await hold.getByRole('link').first().click();
    const accept = page.getByRole('button', { name: /^Accept: / });
    await expect(accept.first()).toBeVisible();
    while ((await accept.count()) > 0) await accept.first().click();
    await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  }
}
