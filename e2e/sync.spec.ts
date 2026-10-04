import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
};
const DBX = '/Server/0999/Site Evaluation';
const fakePaths = (page: Page) => page.evaluate(() => [...(window as any).__fakeDropbox.files.values()].map((f: any) => f.path as string).sort());

test('Dropbox: an automatic folder follows a corrected project number', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => {
    (window as any).__fakeDropbox.mkdir('/Server/0999/001');
    (window as any).__fakeDropbox.mkdir('/Server/0999/002');
  });
  const job = JSON.parse(readFileSync('test/fixtures/example-job.json', 'utf8'));
  job.header.projectNumber = '0999.001';
  job.deliverableFolder = '';
  await page.getByLabel('Load job file or backup').setInputFiles({ name: 'example-job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job)) });
  const section = page.getByRole('region', { name: 'Dropbox', exact: true });
  await expect(section.getByText('/Server/0999/001', { exact: true })).toBeVisible();
  await page.getByLabel('Project #', { exact: true }).fill('0999.002');
  await section.getByRole('button', { name: 'Sync now' }).click();
  await expect(section.getByText('/Server/0999/002', { exact: true })).toBeVisible();
  // An unresolved new project must not continue filing into the old default.
  await page.getByLabel('Project #', { exact: true }).fill('0999.003');
  await section.getByRole('button', { name: 'Sync now' }).click();
  await expect(section.getByText('Not chosen', { exact: true })).toBeVisible();
  // A deliberate folder selection is preserved across later project edits.
  await section.getByRole('button', { name: 'Choose folder', exact: true }).click();
  await section.getByLabel('Go to folder').fill('/Server/0999/001');
  await section.getByLabel('Go to folder').press('Enter');
  await section.getByRole('button', { name: 'Use this folder' }).click();
  await page.getByLabel('Project #', { exact: true }).fill('0999.002');
  await section.getByRole('button', { name: 'Sync now' }).click();
  await expect(section.getByText('/Server/0999/001', { exact: true })).toBeVisible();
});

test('Dropbox: defaults to the exact subproject, repairs the doubled root and preserves the whole confirmation', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/0999/001'));
  const job = JSON.parse(readFileSync('test/fixtures/example-job.json', 'utf8'));
  job.header.projectNumber = '0999.001';
  job.header.confirmationNumber = 'SE CONFIRM 00001';
  job.deliverableFolder = '/Server/Server/Site Eval App';
  await page.getByLabel('Load job file or backup').setInputFiles({ name: 'example-job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job)) });
  const section = page.getByRole('region', { name: 'Dropbox', exact: true });
  await expect(section.getByText('/Server/0999/001', { exact: true })).toBeVisible();
  await expect(section.getByRole('status').filter({ hasText: /^Synced to Dropbox/ })).toBeVisible();
  await section.getByRole('button', { name: 'Change folder' }).click();
  await expect(section.getByRole('group', { name: 'Dropbox folders' }).getByText('/Server/0999/001', { exact: true })).toBeVisible();
  for (const invalid of ['C:\\Backup\\Server\\0999\\001', '\\\\Backup\\Server\\0999\\001']) {
    await section.getByLabel('Go to folder').fill(invalid);
    await section.getByLabel('Go to folder').press('Enter');
    await expect(section.getByRole('alert')).toContainText('Enter a project number or a path inside the Dropbox Server folder.');
    await expect(section.getByRole('group', { name: 'Dropbox folders' }).getByText('/Server/0999/001', { exact: true })).toBeVisible();
  }
  const paths = await fakePaths(page);
  expect(paths.some((p) => /^\/Server\/0999\/001\/Site Eval App\/Field Record/.test(p))).toBe(true);
  const record = await page.evaluate(() => {
    const file = [...(window as any).__fakeDropbox.files.values()].find((f: any) => /Field Record/.test(f.path)) as any;
    return JSON.parse(new TextDecoder().decode(file.bytes));
  });
  expect(record.header.confirmationNumber).toBe('SE CONFIRM 00001');
});

test('Dropbox: sync, filing to convention beside office files, offline queue, backup, open from Dropbox', async ({ page, context }) => {
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

  const dropbox = page.getByRole('region', { name: 'Dropbox', exact: true });
  await expect(dropbox.getByText(DBX, { exact: true })).toBeVisible();
  await expect(dropbox.getByText('Test Dropbox, through the office PC.')).toBeVisible();
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
  await page.getByLabel('Evaluated by').fill('Example Evaluator');
  await expect(page.getByText('Saved on this device. Will sync when there is signal.').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, '71-offline-queued', false);
  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: /^Synced to Dropbox/ }).first()).toBeVisible({ timeout: 20_000 });
  const synced = await page.evaluate(() => {
    const f = [...(window as any).__fakeDropbox.files.values()].find((x: any) => /Field Record/.test(x.path));
    return JSON.parse(new TextDecoder().decode(f.bytes));
  });
  expect(synced.header.evalBy).toBe('Example Evaluator');
  expect(Object.values(synced.edits).map((e: any) => e.by)).toContain('Nathan Hart');

  // Soil logs are only ever PDFs (Nathan, 2026-10-04): no Print at office button.
  await expect(dropbox.getByRole('button', { name: 'Print at office' })).toHaveCount(0);

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
  await expect(page.getByLabel('Evaluated by')).toHaveValue('Example Evaluator');
});

test('Dropbox: the wrong account (0271) files nothing and asks for a folder that exists', async ({ page }) => {
  await page.goto('./?fake-dropbox=Someone Else');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Server/Site Eval App')); // what that account had

  await page.getByLabel('Load job file or backup').setInputFiles('test/fixtures/example-job.json');
  const dropbox = page.getByRole('region', { name: 'Dropbox', exact: true });
  await expect(dropbox.getByText('Someone Else, through the office PC.')).toBeVisible();
  await expect(dropbox.getByRole('status').filter({ hasText: `${DBX} is not in the Dropbox account Someone Else. Nothing was filed.` })).toBeVisible({ timeout: 15_000 });
  await shot(page, '74-wrong-account');

  // The picker refuses the doubled root and folders missing from the account.
  await dropbox.getByRole('button', { name: 'Choose another folder' }).click();
  await dropbox.getByLabel('Go to folder').fill('/Server/Server/Site Eval App');
  await dropbox.getByLabel('Go to folder').press('Enter');
  await dropbox.getByRole('button', { name: 'Use this folder' }).click();
  await expect(dropbox.getByRole('alert')).toContainText('has the server folder twice (/Server/Server)');
  await dropbox.getByLabel('Go to folder').fill('0999');
  await dropbox.getByLabel('Go to folder').press('Enter');
  await dropbox.getByRole('button', { name: 'Use this folder' }).click();
  await expect(dropbox.getByRole('alert')).toContainText('/Server/0999 is not in the Dropbox account Someone Else');
  expect(await fakePaths(page)).toEqual([]);
});

const loadJob = async (page: Page, edit: (job: any) => void) => {
  const job = JSON.parse(readFileSync('test/fixtures/example-job.json', 'utf8'));
  edit(job);
  await page.getByLabel('Load job file or backup').setInputFiles({ name: 'example-job.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(job)) });
  return page.getByRole('region', { name: 'Dropbox', exact: true });
};

test('Dropbox: a missing project folder is created only when asked, at the exact path shown', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Office'));
  const section = await loadJob(page, (job) => {
    job.header.projectNumber = '999-12';
    job.deliverableFolder = '';
  });
  await expect(section.getByRole('status').filter({ hasText: 'Waiting for your OK to create the project folder /Server/0999/012.' })).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText('/Server/0999/012', { exact: true })).toBeVisible();
  expect(await fakePaths(page)).toEqual([]);
  await shot(page, '75-create-project-folder');
  await section.getByRole('button', { name: 'Create folder' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Synced to Dropbox' })).toBeVisible({ timeout: 15_000 });
  await expect(section.getByRole('button', { name: 'Create folder' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__fakeDropbox.folderExists('/Server/0999/012'))).toBe(true);
  expect((await fakePaths(page)).every((p) => p.startsWith('/Server/0999/012/'))).toBe(true);
});

test('Dropbox: without the office folders the account is the wrong one and nothing is created', async ({ page }) => {
  await page.goto('./?fake-dropbox=Someone Else');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Server/Site Eval App'));
  const section = await loadJob(page, (job) => {
    job.header.projectNumber = '999-12';
    job.deliverableFolder = '';
  });
  await expect(section.getByRole('status').filter({ hasText: 'Wrong Dropbox account: Someone Else has no /Server/Office folder.' })).toBeVisible({ timeout: 15_000 });
  await expect(section.getByRole('button', { name: 'Create folder' })).toHaveCount(0);
  expect(await fakePaths(page)).toEqual([]);
});

test('Dropbox: no project number files to its own folder under Office/Site Evaluations', async ({ page }) => {
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Office'));
  const section = await loadJob(page, (job) => {
    job.header.projectNumber = '';
    job.deliverableFolder = '';
  });
  const folder = '/Server/Office/Site Evaluations/Example Subdivision 2026-10-02';
  await expect(section.getByText(folder, { exact: true })).toBeVisible({ timeout: 15_000 });
  await section.getByRole('button', { name: 'Sync now' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Synced to Dropbox' })).toBeVisible({ timeout: 15_000 });
  expect((await fakePaths(page)).some((p) => p.startsWith(`${folder}/`))).toBe(true);
});
