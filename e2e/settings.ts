import { expect, type Page } from '@playwright/test';

/** From the home screen: turn on the perc test module (off by default), then back home. */
export async function turnOnPercTests(page: Page) {
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Perc tests' }).check();
  await expect(page.getByRole('checkbox', { name: 'Perc tests' })).toBeChecked();
  await page.getByRole('link', { name: 'All site evaluations' }).click();
}
