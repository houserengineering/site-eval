// Full site evaluation rehearsal (ticket 11): a 20-pit day on a phone, end to end.
// REHEARSAL_JOB points at a real job file kept outside this public repo (e.g. 0271.001); the default is the synthetic fixture.
import { expect, test, type Locator, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
};
const pick = (scope: Locator | Page, group: string, name: string) =>
  scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();
const tape = async (scope: Locator, label: string, inches: string) => {
  await scope.getByLabel(`${label}, inches`).fill(inches);
  await scope.getByLabel(`${label}, sixteenths`).selectOption('0');
};
const fakePaths = (page: Page) => page.evaluate(() => [...(window as any).__fakeDropbox.files.values()].map((f: any) => f.path as string).sort());

const jobPath = process.env.REHEARSAL_JOB ?? 'test/fixtures/example-job.json';
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const project: string = job.header.projectNumber;
if (!job.deliverableFolder) throw new Error(`${jobPath} has no deliverableFolder`);
const folder = '/Server/' + String(job.deliverableFolder).replace(/\\/g, '/').replace(/\/+$/, '');
const planned: { label: string; planned?: { lat: number; lon: number } }[] = job.testPits ?? [];
const PITS = Math.max(20, planned.length);
const labels = [...planned.map((p) => p.label)];
for (let n = 1; labels.length < PITS; n++) if (!labels.includes(String(n))) labels.push(String(n));
const where = (i: number) => {
  const first = planned.find((x) => x.planned)?.planned ?? { lat: 45.68, lon: -111.04 };
  const p = planned[i]?.planned ?? { lat: first.lat - 0.0001 * i, lon: first.lon };
  return { latitude: p.lat, longitude: p.lon, accuracy: 2.5 };
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wallLink = (page: Page, label: string) => page.getByRole('link', { name: new RegExp(`^Wall ${esc(label)},`) });
const back = (page: Page) => page.getByRole('link', { name: 'Back to site evaluation' }).click();

/** The pit summary: the new-wall defaults are right for a normal pit; only the slope varies. */
async function summary(page: Page, i: number) {
  const sum = page.getByRole('region', { name: 'Test pit summary' });
  if (!(await sum.locator('details').evaluate((d) => (d as HTMLDetailsElement).open))) await sum.locator('summary').click();
  await sum.getByLabel('Slope', { exact: true }).fill(String(2 + (i % 5)));
  await expect(sum.getByText('Still needed')).toHaveCount(0);
}

test.use({ permissions: ['geolocation'] });

test(`rehearsal: ${project}, ${PITS} test pits, perc tests, offline, filing, print`, async ({ page, context }) => {
  test.setTimeout(15 * 60_000);
  await context.setGeolocation(where(0));
  await page.clock.install({ time: new Date('2026-10-02T09:00:00') });
  await page.goto('./?fake-dropbox');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate((f) => (window as any).__fakeDropbox.mkdir(f), folder); // the office made the job folder

  // Start of day: load the job, confirm the flagged header values.
  await page.getByLabel('Load job file or backup').setInputFiles(jobPath);
  await expect(page.getByRole('heading', { name: project })).toBeVisible();
  await page.getByRole('region', { name: 'Dropbox and office printing' }).getByLabel('Your name').fill('Nathan Hart');
  const confirmBox = page.getByRole('region', { name: 'Confirm on site' });
  await shot(page, 'r01-job-loaded');
  for (let k = 0; k < 20 && (await confirmBox.count()); k++) await confirmBox.getByRole('button', { name: /^Confirm / }).first().click();
  await expect(confirmBox).toHaveCount(0);
  await expect(page.getByText(`0 complete · 0 in progress · ${planned.length} not started`)).toBeVisible();

  // Pit 1, wall A in full.
  await wallLink(page, `${labels[0]}A`).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h1 = page.getByRole('region', { name: 'Horizon 1' });
  await pick(h1, 'Horizon', 'A');
  await pick(h1, 'Quick bottom', '18"');
  await pick(h1, 'Hue', '10YR');
  await pick(h1, 'Value', '3');
  await pick(h1, 'Chroma', '2');
  await pick(h1, 'USDA class', 'SILT LOAM');
  await h1.getByLabel('Rock fragments (by volume)').fill('0');
  await pick(h1, 'Shape', 'GRANULAR');
  await pick(h1, 'Grade', 'WEAK');
  await pick(h1, 'Size', 'FINE');
  await pick(h1, 'Consistence', 'FRIABLE');
  await pick(h1, 'Plasticity', 'SLIGHTLY PLASTIC');
  await pick(h1, 'Roots', 'Yes');
  await pick(h1, 'Mottling', 'No');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h2 = page.getByRole('region', { name: 'Horizon 2' });
  await pick(h2, 'Horizon', 'C');
  await pick(h2, 'Quick bottom', '102"');
  await pick(h2, 'Hue', '10YR');
  await pick(h2, 'Value', '5');
  await pick(h2, 'Chroma', '3');
  await pick(h2, 'USDA class', 'LOAMY SAND');
  await h2.getByLabel('Rock fragments (by volume)').fill('20');
  await pick(h2, 'Rock size', 'GRAVEL 2–75 mm');
  await pick(h2, 'Shape', 'SINGLE GRAIN');
  await pick(h2, 'Consistence', 'LOOSE');
  await pick(h2, 'Plasticity', 'NON-PLASTIC');
  await pick(h2, 'Roots', 'No');
  await pick(h2, 'Mottling', 'No');
  await summary(page, 0);
  await page.getByLabel('Take photo').setInputFiles({ name: 'pit.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-photo.jpg') });
  await page.getByRole('button', { name: 'Capture GPS' }).click();
  await expect(page.getByRole('button', { name: 'Retake GPS' })).toBeVisible();
  await shot(page, 'r02-pit-1');
  await back(page);

  // Every pit: wall A starts from the previous pit (pit 1 was logged above), wall B from wall A of
  // the same hole; each wall gets its summary and GPS fix.
  for (let i = 0; i < PITS; i++) {
    const label = labels[i];
    if (i > 0) {
      if (i < planned.length) await wallLink(page, `${label}A`).click();
      else {
        await page.getByLabel('New test pit #').fill(label);
        await page.getByRole('button', { name: 'Add test pit' }).click();
      }
      await expect(page.getByRole('heading', { name: `Test pit ${label}A` })).toBeVisible();
      await page.getByRole('button', { name: /^Copy horizons from test pit / }).click();
      await expect(page.getByRole('region', { name: 'Horizon 2' })).toBeVisible();
      await summary(page, i);
      await context.setGeolocation(where(i));
      await page.getByRole('button', { name: 'Capture GPS' }).click();
      await expect(page.getByRole('button', { name: 'Retake GPS' })).toBeVisible();
      await back(page);
    }
    await wallLink(page, `${label}B`).click();
    await page.getByRole('button', { name: `Start from wall ${label}A (same hole: change the depths)` }).click();
    await expect(page.getByRole('region', { name: 'Horizon 2' })).toBeVisible();
    await summary(page, i);
    await page.getByRole('button', { name: 'Capture GPS' }).click();
    await expect(page.getByRole('button', { name: 'Retake GPS' })).toBeVisible();
    await back(page);
  }
  await expect(page.getByText(`${PITS} complete · 0 in progress · 0 not started`)).toBeVisible();
  await shot(page, 'r03-all-pits-complete');

  // Perc tests: a sandy-soil test at pit 1 and a standard test at pit 2 running side by side.
  await page.getByLabel('New perc test #').fill('1');
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await pick(page, 'At test pit', `${labels[0]}A`);
  await page.getByLabel('Hole depth').fill('24');
  await page.getByLabel('Reference point above hole bottom').fill('22');
  let soak = page.getByRole('region', { name: 'Soak' });
  await soak.getByRole('button', { name: 'Start first 12" filling' }).click();
  await page.clock.fastForward('40:00');
  await soak.getByRole('button', { name: 'Drained (hole empty)' }).click();
  await soak.getByRole('button', { name: 'Start second 12" filling' }).click();
  await back(page);

  await page.getByLabel('New perc test #').fill('2');
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await pick(page, 'At test pit', `${labels[1]}A`);
  await page.getByLabel('Hole depth').fill('24');
  await page.getByLabel('Reference point above hole bottom').fill('22');
  await pick(page, 'Soil at test depth is sandy clay loam or finer', 'Yes');
  await page.getByRole('region', { name: 'Soak' }).getByRole('button', { name: 'Start 4-h presoak' }).click();
  await expect(page.getByRole('navigation', { name: 'Perc timers' }).getByRole('link')).toHaveCount(2);
  await back(page);

  // Back to perc 1: second filling drains → sandy test, four 15-min readings of 2".
  await page.clock.fastForward('40:00');
  await page.getByRole('link', { name: /^Perc test 1/ }).click();
  soak = page.getByRole('region', { name: 'Soak' });
  await soak.getByRole('button', { name: 'Drained (hole empty)' }).click();
  await soak.getByRole('button', { name: 'Use the sandy-soil test' }).click();
  const readings = page.getByRole('region', { name: 'Readings' });
  await readings.getByRole('button', { name: 'Start reading 1 now' }).click();
  for (let n = 1; n <= 4; n++) {
    const card = page.getByRole('region', { name: `Reading ${n}`, exact: true });
    await tape(card, 'Initial distance below reference point', '16');
    await tape(card, 'Final distance below reference point', '18');
    await page.clock.fastForward('15:00');
    await expect(readings.getByLabel('Reading due')).toBeVisible();
    await readings.getByRole('button', { name: n < 4 ? 'Record & start next' : 'Record & finish' }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Stop rule met' })).toContainText('Final rate 7.5 mpi');
  await shot(page, 'r04-perc-1-sandy');
  await back(page);

  // Perc 2: presoak ends, then standard readings with the tape carried forward until the stop rule is met.
  await page.clock.fastForward('03:00:00');
  await page.getByRole('link', { name: /^Perc test 2/ }).click();
  await page.getByRole('region', { name: 'Soak' }).getByRole('button', { name: 'End presoak' }).click();
  const r2 = page.getByRole('region', { name: 'Readings' });
  const interval = Number(await page.getByLabel('Reading interval').inputValue());
  expect(interval).toBeGreaterThan(0);
  await r2.getByRole('button', { name: 'Start reading 1 now' }).click();
  await tape(page.getByRole('region', { name: 'Reading 1', exact: true }), 'Initial distance below reference point', '10');
  for (let n = 1; n <= 4; n++) {
    const card = page.getByRole('region', { name: `Reading ${n}`, exact: true });
    await tape(card, 'Final distance below reference point', String(10 + n));
    await page.clock.fastForward(`${interval}:00`);
    await r2.getByRole('button', { name: n < 4 ? 'Record & start next' : 'Record & finish' }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: 'Stop rule met' })).toContainText(`Final rate ${interval.toFixed(1)} mpi (reading 4)`);
  await shot(page, 'r05-perc-2-standard');
  await back(page);

  // Offline at the pit, back online at the truck.
  await context.setOffline(true);
  await page.getByLabel('Owner name').fill(`${job.header.ownerName ?? 'Owner'} `);
  await page.getByLabel('Owner name').fill(job.header.ownerName ?? 'Owner');
  await expect(page.getByText('Saved on this device. Will sync when there is signal.').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 'r06-offline', false);
  await context.setOffline(false);
  await page.clock.fastForward('00:10');
  await expect(page.getByRole('status').filter({ hasText: /^Synced to Dropbox/ }).first()).toBeVisible({ timeout: 30_000 });

  // File every deliverable to the convention folder.
  const dropbox = page.getByRole('region', { name: 'Dropbox and office printing' });
  await expect(dropbox.getByText(folder, { exact: true })).toBeVisible();
  await dropbox.getByRole('button', { name: 'Sync now' }).click();
  await expect(dropbox.getByText('Percolation Tests.pdf filed', { exact: false })).toBeVisible({ timeout: 60_000 });
  const paths = await fakePaths(page);
  expect(paths).toEqual(
    expect.arrayContaining([
      `${folder}/Soil Logs.xlsx`,
      `${folder}/Soil Logs.pdf`,
      `${folder}/Percolation Tests.xlsx`,
      `${folder}/Percolation Tests.pdf`,
      expect.stringMatching(new RegExp(`^${esc(folder)}/Site Eval App/Field Record [0-9a-f]{8}\\.json$`)),
    ]),
  );
  const read = (p: string) => page.evaluate((x) => [...(window as any).__fakeDropbox.files.get(x.toLowerCase()).bytes], p).then((b) => Uint8Array.from(b));
  const soil = new ExcelJS.Workbook();
  await soil.xlsx.load((await read(`${folder}/Soil Logs.xlsx`)) as any);
  expect(soil.worksheets).toHaveLength(PITS);
  expect(soil.worksheets[0].getCell('B4').value).toBe(project);
  expect(soil.worksheets[0].getCell('F9').value ?? null).toBe(job.header.confirmationNumber || null); // confirmed: no (UNCONFIRMED)
  const perc = new ExcelJS.Workbook();
  await perc.xlsx.load((await read(`${folder}/Percolation Tests.xlsx`)) as any);
  expect(perc.worksheets.map((w) => w.name)).toEqual(['Perc Test 1', 'Perc Test 2']);
  const soilPdf = await PDFDocument.load(await read(`${folder}/Soil Logs.pdf`));
  expect(soilPdf.getPageCount()).toBe(PITS); // one page per pit, walls A and B
  expect(paths).not.toContain(`${folder}/Site Evaluation.pdf`);
  const record = JSON.parse(new TextDecoder().decode(await read(paths.find((p) => /Field Record/.test(p))!)));
  expect(record.testPits).toHaveLength(2 * PITS);
  expect(record.unconfirmed ?? {}).toEqual({});
  await shot(page, 'r07-filed');

  // Print preview of the soil logs, then the copier queue.
  await page.getByRole('link', { name: /^Soil logs/ }).click();
  await expect(page.getByRole('img', { name: `Soil logs page 1 of ${soilPdf.getPageCount()}` })).toBeVisible();
  await shot(page, 'r08-print-preview', false);
  await page.emulateMedia({ media: 'print' });
  const printed = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(printed.getPageCount()).toBe(soilPdf.getPageCount());
  await page.emulateMedia({ media: 'screen' });
  await back(page);
  await dropbox.getByRole('button', { name: 'Print at office' }).click();
  await expect(dropbox.getByText(new RegExp(`Sent to the office print queue: ${esc(project)} Soil Logs`))).toBeVisible({ timeout: 60_000 });
  await shot(page, 'r09-print-at-office');
});
