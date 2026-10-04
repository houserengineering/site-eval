import { expect, type Page } from '@playwright/test';
import { FEATURES } from '../src/app/features';

/** From the home screen: turn on the perc test module (off by default), then back home. */
export async function turnOnPercTests(page: Page) {
  if (!FEATURES.PERC) return; // off on live main (src/app/features.ts): there is no toggle
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Perc tests' }).check();
  await expect(page.getByRole('checkbox', { name: 'Perc tests' })).toBeChecked();
  await page.getByRole('link', { name: 'All site evaluations' }).click();
}
