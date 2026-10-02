import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
};
const DBX = '/Server/0999/Site Evaluation';
const fakePaths = (page: Page) => page.evaluate(() => [...(window as any).__fakeDropbox.files.values()].map((f: any) => f.path as string).sort());

test('Dropbox: sync, filing to convention beside office files, offline queue, print at office, backup, open from Dropbox', async ({ page, context }) => {
  test.setTimeout(150_000);
  await page.goto('./?fake-dropbox');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // service worker in control, so offline works
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();

  // An office file already holds the usual soil log PDF name.
  await page.evaluate((p) => (window as any).__fakeDropbox.write(`${p}/Soil Logs.pdf`, new TextEncoder().encode('office file')), DBX);

  await page.getByLabel('Load job file or backup').setInputFiles('test/fixtures/example-job.json');
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Synced to Dropbox/ }).first()).toBeVisible({ timeout: 15_000 });

  const dropbox = page.getByRole('region', { name: 'Dropbox and office printing' });
  await expect(dropbox.getByText(DBX, { exact: true })).toBeVisible();
  await dropbox.getByLabel('Your name').fill('Nathan Hart');
  await dropbox.getByRole('button', { name: 'Sync now' }).click();
  await expect(dropbox.getByText('Soil Logs.xlsx filed', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(dropbox.getByText('Soil Logs (Site Eval App).pdf filed under this name')).toBeVisible();
  const paths = await fakePaths(page);
  expect(paths).toEqual(
    expect.arrayContaining([
      `${DBX}/Soil Logs.pdf`,
      `${DBX}/Soil Logs.xlsx`,
      `${DBX}/Soil Logs (Site Eval App).pdf`,
      expect.stringMatching(/^\/Server\/0999\/Site Evaluation\/Site Eval App\/Field Record [0-9a-f]{8}\.json$/),
      expect.stringMatching(/^\/Server\/0999\/Site Evaluation\/Site Eval App\/Photos\/.+\.jpg$/), // the map image
    ]),
  );
  expect(await page.evaluate((p) => new TextDecoder().decode((window as any).__fakeDropbox.files.get(p.toLowerCase()).bytes), `${DBX}/Soil Logs.pdf`)).toBe('office file');
  await shot(page, '70-dropbox-filed');

  // Offline: edits queue on the phone, then sync when signal returns.
  await context.setOffline(true);
  await page.getByLabel('Owner name').fill('Example Owner LLC');
  await expect(page.getByText('Saved on this device. Will sync when there is signal.').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, '71-offline-queued', false);
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: /^Synced to Dropbox/ }).first()).toBeVisible({ timeout: 20_000 });
  const synced = await page.evaluate(() => {
    const f = [...(window as any).__fakeDropbox.files.values()].find((x: any) => /Field Record/.test(x.path));
    return JSON.parse(new TextDecoder().decode(f.bytes));
  });
  expect(synced.header.ownerName).toBe('Example Owner LLC');
  expect(Object.values(synced.edits).map((e: any) => e.by)).toContain('Nathan Hart');

  // Print at office: the combined PDF lands in the print queue.
  await dropbox.getByRole('button', { name: 'Print at office' }).click();
  await expect(dropbox.getByText(/Sent to the office print queue: 0999\.007 Soil Logs \d{4}-\d\d-\d\d \d{6}\.pdf/)).toBeVisible({ timeout: 30_000 });
  expect((await fakePaths(page)).some((p) => p.startsWith('/Server/Office/Site Eval App/Print Queue/0999.007 Soil Logs '))).toBe(true);

  // Backup to a file.
  const dl = page.waitForEvent('download');
  await dropbox.getByRole('button', { name: 'Back up to a file' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^0999\.007 Site Evaluation Backup \d{4}-\d\d-\d\d \d{4}\.json$/);
  await shot(page, '72-print-backup');

  // Open from Dropbox (as a second phone would): browse to the folder and pick the synced record.
  await page.evaluate(() => (location.hash = '#/dropbox')); // same page: the fake Dropbox lives in memory
  await page.getByRole('button', { name: '0999' }).click();
  await page.getByRole('button', { name: 'Site Evaluation', exact: true }).click();
  const open = page.getByRole('list', { name: 'Site evaluations in this folder' });
  await expect(open.getByRole('button', { name: /Site evaluation in progress/ })).toBeVisible();
  await shot(page, '73-open-from-dropbox');
  await open.getByRole('button', { name: /Site evaluation in progress/ }).click();
  await expect(page.getByRole('heading', { name: '0999.007' })).toBeVisible();
  await expect(page.getByLabel('Owner name')).toHaveValue('Example Owner LLC');
});
