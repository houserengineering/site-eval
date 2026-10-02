import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string, fullPage = true) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage });
};

test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.678901, longitude: -111.234567, accuracy: 2.5 } });

test('photo, GPS, certify on the certifier device, print preview and PDFs', async ({ page, context }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.005');
  await page.getByLabel('Project name').fill('Example Subdivision');
  await page.getByLabel('Eval. by').fill('Nathan Hart');
  await page.getByLabel('Date').fill('2026-10-02');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await page.getByRole('radiogroup', { name: 'Horizon', exact: true }).getByRole('radio', { name: 'A', exact: true }).click();
  await page.getByRole('textbox', { name: 'Bottom' }).fill('96');

  // Photo from the camera input, saved on device and listed as the soil log photo.
  await page.getByLabel('Take photo').setInputFiles({ name: 'pit.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-photo.jpg') });
  await expect(page.getByRole('img', { name: 'Test pit 1A photo 1' })).toBeVisible();
  await expect(page.getByText(/On the soil log/)).toBeVisible();

  // GPS: the new wall started its fix on opening; ±8 ft is inside the county's 10 ft, so it is kept.
  await expect(page.getByText('45.678901° N, 111.234567° W ±8 ft').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retake GPS' })).toBeVisible();
  await page.getByRole('region', { name: 'Photos' }).scrollIntoViewIfNeeded();
  await shot(page, '40-pit-photo-gps');

  // A poor fix waits for the evaluator and warns.
  await context.setGeolocation({ latitude: 45.6789, longitude: -111.2345, accuracy: 9 });
  await page.getByRole('button', { name: 'Retake GPS' }).click();
  await expect(page.getByText(/Best so far ±30 ft/)).toBeVisible();
  await shot(page, '41-gps-waiting', false);
  await page.getByRole('button', { name: /Use this fix \(±30 ft\)/ }).click();
  await expect(page.getByText(/over the county's 10 ft/)).toBeVisible();
  await context.setGeolocation({ latitude: 45.678901, longitude: -111.234567, accuracy: 2.5 });
  await page.getByRole('button', { name: 'Retake GPS' }).click();
  await expect(page.getByText('±8 ft', { exact: false }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('button', { name: 'Add perc test' }).click();
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  // No signature on this device: Certify is not offered.
  await expect(page.getByText('Perc test 1: not certified')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Certify/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Set up this device as the certifier' }).click();
  await page.getByLabel('Printed name').fill('Justin Houser, PE');
  const pad = page.getByRole('img', { name: 'Signature' });
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height * 0.7);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 20 + i * 14, box.y + box.height * (0.5 + 0.25 * Math.sin(i / 2)));
  await page.mouse.up();
  await shot(page, '42-certifier-setup');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Certify as Justin Houser, PE' }).click();
  await expect(page.getByText(/Perc test 1: certified by Justin Houser, PE/)).toBeVisible();
  await shot(page, '43-certified');

  // Print preview of the soil logs: letter sheets drawn from the PDF's pages.
  await page.getByRole('link', { name: /^Soil logs/ }).click();
  const sheet = page.getByRole('img', { name: 'Soil logs page 1 of 1' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('text', { hasText: 'SOIL PROFILE LOG' })).toHaveCount(1);
  await expect(sheet.locator('image')).toHaveCount(2); // logo + pit photo
  await shot(page, '44-print-soil-logs');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print…' })).toBeHidden();
  await shot(page, '45-print-media');
  // Chromium's own print-to-PDF of this page: one letter sheet, nothing clipped onto a second page.
  if (test.info().project.use.browserName !== 'firefox') {
    const printed = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
    expect(printed.getPageCount()).toBe(1);
    expect(printed.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  }
  await page.emulateMedia({ media: 'screen' });

  // The perc test PDF carries the applied signature.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /^Perc tests/ }).click();
  await expect(page.getByRole('img', { name: 'Perc tests page 1 of 1' }).locator('image')).toHaveCount(1);
  await shot(page, '46-print-perc');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('0999.005 Percolation Tests.pdf');
  expect((await PDFDocument.load(readFileSync((await file.path())!))).getPageCount()).toBe(1);

  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /^Soil logs/ }).click();
  await expect(page.getByRole('img', { name: /^Soil logs page 1 of / }).locator('text', { hasText: 'LOCATION OF TEST PIT WITHIN PROPERTY' })).not.toHaveCount(0);
  await shot(page, '47-print-soil-logs');

  // Editing a certified perc test removes the signature until certified again.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await page.getByRole('link', { name: /^Perc test 1/ }).click();
  await page.getByLabel('Hole depth').fill('30');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByText(/changed after Justin Houser, PE certified it/)).toBeVisible();
  await page.getByRole('link', { name: /^Perc tests/ }).click();
  await expect(page.getByRole('img', { name: 'Perc tests page 1 of 1' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Perc tests page 1 of 1' }).locator('image')).toHaveCount(0);
});
