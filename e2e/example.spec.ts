// The shared example of a completed site evaluation (Nathan, 2026-10-04): downloaded from the office Dropbox as a
// local copy marked Example, which never syncs or files, so the real job's folder is never touched.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EXAMPLE = '/Server/Office/Site Eval App/Examples/Completed site evaluation.json';

test('the example opens from Dropbox, shows its soil log PDF, and never writes to Dropbox', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  // The office's example file: a backup of a finished job, made here with the app's own Back up to a file.
  await page.getByLabel('Load job file or backup').setInputFiles('test/fixtures/example-job.json');
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up to a file' }).click();
  const backup = readFileSync(await (await download).path());
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete site evaluation' }).click();
  await page.evaluate(([path, text]) => (window as any).__fakeDropbox.write(path, new TextEncoder().encode(text)), [EXAMPLE, backup.toString('utf8')]);
  const writesBefore = await page.evaluate(() => (window as any).__fakeDropbox.writes.length);

  await page.getByRole('button', { name: 'Example: completed site evaluation' }).click();
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('A completed job to learn from.', { exact: false })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Example: saved on this device only. Nothing goes to Dropbox.' }).first()).toBeVisible();

  // An edit stays on this phone.
  await page.getByLabel('Project name').fill('Changed in the example');
  await page.getByRole('link', { name: 'Open soil log PDF' }).click();
  await expect(page.getByRole('img', { name: /^Soil logs page 1 of/ })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByRole('link', { name: /^Example: Changed in the example/ })).toBeVisible();
  // Opening it again uses this phone's copy.
  await page.getByRole('button', { name: 'Example: completed site evaluation' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Changed in the example');
  await page.waitForTimeout(5000); // longer than the sync delay after an edit
  expect(await page.evaluate(() => (window as any).__fakeDropbox.writes.length)).toBe(writesBefore);
});
