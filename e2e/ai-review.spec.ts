import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

const shots = process.env.SHOTS_DIR;
const pick = (page: Page, group: string, name: string) =>
  page.getByRole('region', { name: 'Horizon 1' }).getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.678901, longitude: -111.234567, accuracy: 2.5 } });

test('AI photo review: flags join the pit checks, queue without signal, re-review after an edit', async ({ page, context }) => {
  // The fake office review service (ticket 11), found through Review Service.json in Dropbox.
  const requests: any[] = [];
  let offline = false;
  let answer = '{"flags":[{"check":"rock","horizon":1,"say":"The photo shows far more rock than 10%."}]}';
  await page.route('https://review.test/**', async (route: Route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
    if (offline) return route.abort('internetdisconnected');
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    requests.push({ auth: route.request().headers().authorization, body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ text: answer, stopReason: 'end_turn' }) });
  });
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() =>
    (window as any).__fakeDropbox.write('/Server/Office/Site Eval App/Review Service.json', new TextEncoder().encode(JSON.stringify({ url: 'https://review.test', kind: 'quick' }))),
  );

  // The device token goes in Settings.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('AI photo review device token').fill('device-token-1');
  await page.getByLabel('AI photo review device token').blur();
  if (shots) await page.screenshot({ path: `${shots}/94-review-token.png` });
  await page.getByRole('link', { name: 'All site evaluations' }).click();

  await page.getByRole('button', { name: 'New site evaluation' }).click();
  await page.getByLabel('Project #').fill('0999.012');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await page.getByRole('button', { name: 'Add horizon' }).click();
  const h = page.getByRole('region', { name: 'Horizon 1' });
  await pick(page, 'Horizon', 'A');
  await h.getByRole('textbox', { name: 'Bottom' }).fill('96');
  await pick(page, 'Hue', '10YR');
  await pick(page, 'Value', '4');
  await pick(page, 'Chroma', '3');
  await pick(page, 'USDA class', 'LOAM');
  await h.getByLabel('Rock fragments (by volume)').fill('10');
  await page.getByLabel('Take photo').setInputFiles({ name: 'wall.jpg', mimeType: 'image/jpeg', buffer: readFileSync('test/fixtures/pit-wall-synthetic.jpg') });
  await expect(page.getByText('1 photo saved on this device.')).toBeVisible();

  // The review comes back as a pit check within seconds.
  const checks = page.getByRole('region', { name: 'Pit checks' });
  await expect(checks.getByRole('listitem')).toHaveText([/^AI review: Horizon A: the photo shows far more rock than 10%\./], { timeout: 20_000 });
  await expect(page.getByRole('status', { name: 'AI review' })).toContainText('1 check in Pit checks');
  expect(requests).toHaveLength(1);
  expect(requests[0].auth).toBe('Bearer device-token-1');
  expect(requests[0].body.images).toHaveLength(1);
  expect(requests[0].body.images[0].mediaType).toBe('image/jpeg');
  expect(requests[0].body.prompt).toContain('1. A 0-96", LOAM, 10YR 4/3, rock 10%');
  if (shots) await checks.locator('xpath=..').screenshot({ path: `${shots}/95-ai-review.png` });

  // It holds the soil log like any other check.
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('region', { name: 'Soil log held' })).toContainText('1 pit check open');
  await page.getByRole('link', { name: /^Wall 1A/ }).first().click();

  // No signal: fixing the rock retires the flag and the review waits.
  offline = true;
  await context.setOffline(true);
  answer = '{"flags":[]}';
  await h.getByLabel('Rock fragments (by volume)').fill('45');
  await expect(checks).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'AI review' })).toContainText('waits for signal', { timeout: 15_000 });
  expect(requests).toHaveLength(1);

  // Signal returns: the queued review runs on its own.
  offline = false;
  await context.setOffline(false);
  await expect(page.getByRole('status', { name: 'AI review' })).toContainText('nothing to flag', { timeout: 20_000 });
  expect(requests).toHaveLength(2);
  expect(requests[1].body.prompt).toContain('rock 45%');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(page.getByRole('region', { name: 'Soil log held' })).toHaveCount(0);
});
