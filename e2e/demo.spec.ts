// The demo (spec 2026-10-03): coach marks on the real screens, at phone width. Every step is checked
// for a visible highlight around its field and a tip that does not cover it, and moves on when the
// user does the step (or taps Show me). Every step with a text, number or date field is checked again
// with the field focused and a simulated on-screen keyboard: the visual viewport shrinks to 55% of the
// window, as on Android, where the keyboard covers the page without resizing it. SHOTS_DIR saves a
// screenshot of every step (and of every keyboard check, with the keyboard drawn in).
import { expect, test, type Page } from '@playwright/test';
import { SIGNED_IN } from '../playwright.config';

test.use({ storageState: { cookies: [], origins: [{ origin: new URL(process.env.E2E_URL ?? 'http://localhost:4173').origin, localStorage: [SIGNED_IN] }] }, viewport: { width: 412, height: 915 } });

/** Stands in for window.visualViewport; __keyboard(true) opens the simulated keyboard. */
function fakeKeyboard() {
  const real = window.visualViewport!;
  let up = false;
  const fake = new EventTarget();
  for (const k of ['offsetLeft', 'pageLeft', 'pageTop', 'width', 'scale'] as const) Object.defineProperty(fake, k, { get: () => real[k] });
  Object.defineProperty(fake, 'height', { get: () => (up ? Math.round(innerHeight * 0.55) : real.height) });
  Object.defineProperty(fake, 'offsetTop', { get: () => (up ? 0 : real.offsetTop) });
  for (const type of ['resize', 'scroll']) real.addEventListener(type, () => fake.dispatchEvent(new Event(type)));
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
  (window as any).__keyboard = (on: boolean) => {
    up = on;
    fake.dispatchEvent(new Event('resize'));
  };
}

const TYPED = ['input:not([type])', 'text', 'number', 'tel', 'search', 'date']
  .map((t) => (t.startsWith('input') ? t : `input[type="${t}"]`))
  .concat('textarea')
  .join(',');

const shots = process.env.SHOTS_DIR;
let n = 0;
const tip = (page: Page) => page.locator('[data-coach-tip]');

/** Waits for the highlight to stop moving (scroll and glide), then checks it and saves a screenshot. */
async function arrive(page: Page, title: string | RegExp, name: string, opts: { hole?: boolean; timeout?: number } = {}) {
  await expect(tip(page).getByRole('heading')).toContainText(title, { timeout: opts.timeout });
  const shot = String(++n).padStart(2, '0');
  await settleAndCheck(page, `${shot}-${name}`, opts.hole !== false);
  if (opts.hole === false) return;
  // A field that brings up the keyboard: focus it, open the keyboard, check, close it, check again.
  const typed = await page.evaluate((sel) => {
    for (const t of document.querySelectorAll<HTMLElement>('[data-coach-target]')) {
      const el = t.matches(sel) ? t : t.querySelector<HTMLElement>(sel);
      if (el) return el.focus(), true;
    }
    return false;
  }, TYPED);
  if (!typed) return;
  await page.evaluate(() => (window as any).__keyboard(true));
  await settleAndCheck(page, `${shot}-${name}-keyboard`, true, true);
  await page.evaluate(() => (window as any).__keyboard(false));
  await settleAndCheck(page, '', true);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function settleAndCheck(page: Page, name: string, hole: boolean, keyboard = false) {
  // Still for 500 ms: the coach re-anchors up to 300 ms after its last scroll (the keyboard settling).
  let last = '';
  let stillFor = 0;
  await expect
    .poll(async () => {
      const now = JSON.stringify(await geometry(page));
      stillFor = now === last ? stillFor + 1 : 0;
      last = now;
      return stillFor >= 2;
    }, { intervals: [250] })
    .toBe(true);
  const g = await geometry(page, keyboard);
  if (shots && name) {
    // The keyboard drawn over the bottom 45%, where a phone's would be.
    if (keyboard)
      await page.evaluate((top) => {
        const k = Object.assign(document.createElement('div'), { id: 'fake-kb', textContent: 'keyboard' });
        k.style.cssText = `position:fixed;left:0;right:0;bottom:0;top:${top}px;z-index:9999;background:#d9dde3;color:#555;font:20px sans-serif;display:grid;place-items:center;pointer-events:none`;
        document.body.append(k);
      }, g.vb);
    await page.screenshot({ path: `${shots}/${name}.png` });
    await page.evaluate(() => document.getElementById('fake-kb')?.remove());
  }
  if (keyboard) expect(g.vb, `${name}: keyboard open`).toBeLessThan(g.vh * 0.6);
  if (hole) {
    expect(g.hole, `${name}: highlight`).not.toBeNull();
    expect(g.targets.length, `${name}: highlighted field`).toBeGreaterThan(0);
    for (const t of g.targets) {
      expect(t.top, `${name}: field inside highlight`).toBeGreaterThanOrEqual(g.hole!.top - 1);
      expect(t.bottom).toBeLessThanOrEqual(g.hole!.bottom + 1);
    }
    for (const t of [g.hole!, ...g.targets]) {
      const overlap = g.tip.top < t.bottom && t.top < g.tip.bottom && g.tip.left < t.right && t.left < g.tip.right;
      expect(overlap, `${name}: tip covers the field`).toBe(false);
      expect(t.top, `${name}: field on the visible screen`).toBeGreaterThanOrEqual(g.vt - 1);
      expect(t.bottom, `${name}: field above the keyboard`).toBeLessThanOrEqual(g.vb + 1);
    }
  }
  expect(g.tip.top, `${name}: tip on the visible screen`).toBeGreaterThanOrEqual(g.vt);
  expect(g.tip.bottom, `${name}: tip above the keyboard`).toBeLessThanOrEqual(g.vb);
  expect(g.tip.left).toBeGreaterThanOrEqual(7);
  expect(g.tip.right).toBeLessThanOrEqual(g.vw - 7);
  // A wide highlight and its tip share their left and right edges.
  if (hole && g.hole!.right - g.hole!.left >= 280 && g.hole!.left >= 7 && g.hole!.right <= g.vw - 7) {
    expect(Math.abs(g.tip.left - g.hole!.left), `${name}: tip lined up with the highlight`).toBeLessThan(1.5);
    expect(Math.abs(g.tip.right - g.hole!.right), `${name}: tip lined up with the highlight`).toBeLessThan(1.5);
  }
}

/** With the keyboard up, the field is the one being typed in, with its label. */
function geometry(page: Page, keyboard = false) {
  return page.evaluate((keyboard) => {
    const active = document.activeElement as HTMLInputElement;
    const fields = keyboard ? [active, ...(active.labels ?? [])] : [...document.querySelectorAll('[data-coach-target]')];
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    };
    return {
      hole: box(document.querySelector('[data-coach-hole]')),
      tip: box(document.querySelector('[data-coach-tip]'))!,
      targets: fields.map((e) => box(e)!),
      vw: innerWidth,
      vh: innerHeight,
      vt: visualViewport!.offsetTop,
      vb: visualViewport!.offsetTop + visualViewport!.height,
    };
  }, keyboard);
}

const showMe = (page: Page) => tip(page).getByRole('button', { name: 'Show me' }).click();
const next = (page: Page, name = 'Next') => tip(page).getByRole('button', { name, exact: true }).click();
const pick = (page: Page, group: string, name: string) =>
  page.locator('[data-coach-target]').getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true }).click();

/** The Census geocoder, answered here (JSONP): the demo's address is in Gallatin County, MT. */
async function stubGeocoder(page: Page) {
  await page.route('https://geocoding.geo.census.gov/**', (route) => {
    const cb = new URL(route.request().url()).searchParams.get('callback');
    const match = { geographies: { Counties: [{ NAME: 'Gallatin County', STATE: '30', COUNTY: '031' }] }, addressComponents: { state: 'MT' } };
    return route.fulfill({ contentType: 'application/javascript', body: `${cb}(${JSON.stringify({ result: { addressMatches: [match] } })})` });
  });
}

test('first launch: the demo coaches the whole field path and ends in Settings', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(fakeKeyboard);
  await stubGeocoder(page);
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Office'));

  // Required on first launch, starting straight on the first field; no exit on the first run.
  // Header: placeholders from the field guide; a wrong entry gets a correction on the field.
  await arrive(page, 'Project #', 'project-number');
  await expect(tip(page)).toContainText('This practice job takes about five minutes. Enter the project number, e.g. 0271.001.');
  await expect(tip(page).getByRole('button', { name: 'Exit demo' })).toHaveCount(0);
  const projectNo = page.getByLabel('Project #');
  // The examples are the real 0271 job's, as in the demo (Nathan, 2026-10-04).
  await expect(projectNo).toHaveAttribute('placeholder', '0271.001');
  await expect(page.getByLabel('Project name')).toHaveAttribute('placeholder', 'Stillwater Subdivision');
  // Owner name prints only on perc test forms: hidden while perc tests are off, so the demo skips nothing.
  await expect(page.getByLabel('Owner name')).toHaveCount(0);
  // Taps outside the highlight are blocked.
  const back = await page.getByRole('link', { name: 'All site evaluations' }).boundingBox();
  await page.mouse.click(back!.x + back!.width / 2, back!.y + back!.height / 2);
  expect(page.url()).toContain('#/se/');
  await projectNo.fill('999');
  await projectNo.press('Enter');
  await expect(tip(page).getByRole('alert')).toHaveText('Use four digits, a dot, then three digits, like 0271.001.');
  await expect(tip(page).getByRole('heading')).toContainText('Project #');
  await projectNo.fill('0271.001');
  await projectNo.press('Enter');

  await arrive(page, 'Project name', 'project-name');
  await expect(tip(page)).toContainText('Enter the project name, e.g. Stillwater Subdivision.');
  await page.getByLabel('Project name').fill('Stillwater Subdivision');
  await next(page);

  // The address finds its county, which sets the Gallatin County answer.
  await arrive(page, 'Location', 'location');
  await showMe(page);
  await expect(page.getByLabel('Location')).toHaveValue('6133 Bigelow Road, Bozeman MT 59718');
  await expect(page.getByText('Gallatin County, MT', { exact: true })).toBeVisible();

  // Today's date is filled in already.
  await arrive(page, 'Evaluated by and date', 'eval-by-date');
  await expect(page.getByLabel('Date')).toHaveValue(new Date().toLocaleDateString('en-CA'));
  await page.getByLabel('Evaluated by').fill('Justin Houser');
  await next(page);

  // Gallatin County: Yes from the address. No greys out the confirmation number.
  await arrive(page, 'Gallatin County and the confirmation number', 'confirmation');
  const gallatin = page.getByRole('radiogroup', { name: 'Gallatin County site evaluation' });
  await expect(gallatin.getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');
  await gallatin.getByRole('radio', { name: 'No' }).click();
  await expect(page.getByLabel('Confirmation number')).toBeDisabled();
  await expect(tip(page)).toContainText('the soil log leaves the field off');
  await gallatin.getByRole('radio', { name: 'Yes' }).click();
  await page.getByLabel('Confirmation number').fill('se confirm 00278');
  await page.getByLabel('Confirmation number').press('Enter');

  // Add the pit; GPS starts at once. None indoors here, so Show me fills a practice fix.
  await arrive(page, 'only when you are standing at it', 'add-pit');
  await page.getByLabel('New test pit #').fill('1');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await arrive(page, 'GPS started when you added the pit', 'gps');
  await expect(tip(page).locator('p').first()).toHaveText(/^(GPS is finding this pit's location and saves it once it is within 10 ft\.|There is no GPS fix yet\. Tap Capture GPS\.)$/);
  await showMe(page);
  await arrive(page, 'Retake GPS if it looks wrong', 'gps-retake');
  await next(page);

  // The photo comes before the horizons. If the user wanders off, the tip offers to take them back.
  await arrive(page, 'Photo of the wall', 'photo');
  await page.evaluate(() => (location.hash = '#/'));
  await arrive(page, 'You left the demo step', 'left-step', { hole: false });
  await tip(page).getByRole('button', { name: 'Take me back' }).click();
  await arrive(page, 'Photo of the wall', 'photo-back');
  // The tip shows what a good photo looks like; Take photo puts in the sample instead of the camera.
  await expect(tip(page).getByRole('img')).toBeVisible();
  let chooser = false;
  page.on('filechooser', () => (chooser = true));
  await page.locator('[data-coach-target] label', { hasText: 'Take photo' }).click();
  await expect(page.locator('ul.photos > li')).toHaveCount(1);
  expect(chooser, 'the camera did not open').toBe(false);

  // Wall A, horizon 1 by the user's own taps.
  await arrive(page, 'Log the first horizon', 'add-horizon');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await arrive(page, 'Horizon and depth', 'h1-depth');
  await pick(page, 'Horizon', 'O');
  await page.getByRole('region', { name: 'Horizon 1' }).getByRole('textbox', { name: 'Bottom', exact: true }).fill('0');
  await page.getByRole('region', { name: 'Horizon 1' }).getByRole('textbox', { name: 'Bottom', exact: true }).blur();
  await expect(tip(page).getByRole('alert')).toHaveText('The bottom must be below the top.');
  await pick(page, 'Quick bottom', '12"');
  await arrive(page, 'Munsell color', 'h1-color');
  await pick(page, 'Hue', '10YR');
  await pick(page, 'Value', '3');
  await pick(page, 'Chroma', '2');
  await expect(page.getByRole('region', { name: 'Horizon 1' }).getByRole('radio', { name: '10YR', exact: true })).toHaveAttribute('aria-checked', 'true');
  await arrive(page, 'Texture', 'h1-texture');
  await pick(page, 'USDA class', 'CLAY LOAM');
  await arrive(page, 'Rock fragments', 'h1-rock');
  // The rock size is asked for even at 10% (Nathan, 2026-10-04).
  await expect(tip(page)).toContainText('Enter the rock fragments as a percent by volume, then pick the rock size, e.g. 10%, gravel.');
  await page.getByRole('region', { name: 'Horizon 1' }).getByLabel('Rock fragments (by volume)').fill('10');
  await page.getByRole('region', { name: 'Horizon 1' }).getByLabel('Rock fragments (by volume)').blur();
  await expect(tip(page).getByRole('heading')).toContainText('Rock fragments');
  await page.getByRole('region', { name: 'Horizon 1' }).getByRole('radiogroup', { name: 'Rock size' }).getByRole('radio', { name: /^GRAVEL/ }).click();
  // Structure: the shape alone does not finish the step; grade and size are asked for next.
  await arrive(page, 'Structure', 'h1-structure');
  await expect(tip(page)).toContainText('Pick the shape, then the grade and size, e.g. blocky, moderate, fine.');
  await pick(page, 'Shape', 'BLOCKY');
  await arrive(page, 'Structure', 'h1-structure-grade');
  await expect(tip(page)).toContainText('Now pick the grade and size, e.g. blocky, moderate, fine.');
  await pick(page, 'Grade', 'MODERATE');
  await expect(tip(page).getByRole('heading')).toContainText('Structure');
  await pick(page, 'Size', 'FINE');
  await arrive(page, 'Consistence and plasticity', 'h1-consistence');
  await pick(page, 'Consistence', 'FRIABLE');
  await pick(page, 'Plasticity', 'SLIGHTLY PLASTIC');
  await arrive(page, 'Roots and mottling', 'h1-roots');
  await pick(page, 'Roots', 'Yes');
  await pick(page, 'Mottling', 'No');

  // Horizon 2: one sentence per group as the highlight moves on; Show me finishes it.
  await arrive(page, 'The next horizon', 'h2-add');
  await expect(tip(page)).toContainText('Add your next horizon.');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await expect(tip(page)).toContainText('The top is already the bottom of the horizon above. Pick the horizon, then its bottom depth, e.g. B, 12–96".');
  await arrive(page, 'The next horizon', 'h2-depth');
  await pick(page, 'Horizon', 'B');
  await pick(page, 'Quick bottom', '96"');
  await expect(tip(page)).toContainText('Pick the Munsell hue, value and chroma, e.g. 10YR 5/3.');
  await arrive(page, 'The next horizon', 'h2-color');
  await showMe(page);

  // Show me goes at a human pace: a whole horizon takes a while.
  await arrive(page, 'Test pit summary', 'summary', { timeout: 90_000 });
  // Show me's hue is the chip shown picked, in the soil hues.
  await expect(page.getByRole('region', { name: 'Horizon 2' }).getByRole('radio', { name: '10YR', exact: true })).toHaveAttribute('aria-checked', 'true');
  await next(page);

  // Wall B: back to the list and into wall 1B, one step.
  await arrive(page, 'On to wall B', 'to-b');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await expect(tip(page)).toContainText('Open wall 1B, the opposite wall of the same pit.');
  await arrive(page, 'On to wall B', 'to-b-site');
  await page.getByRole('link', { name: /^Wall 1B / }).click();
  await arrive(page, 'Start from wall A', 'copy-a');
  await page.getByRole('button', { name: 'Copy horizons from wall 1A' }).click();

  // The planted pit check: a dark, blurred photo to retake.
  await arrive(page, 'Retake a bad photo', 'retake');
  await expect(page.locator('[data-coach-target].alert')).toHaveText('This photo is blurry and too dark. Retake it.');
  await expect(tip(page)).toContainText('This photo is too dark and blurry to read the soil colours. Tap Retake to replace it with one like this.');
  await expect(tip(page).getByRole('img')).toBeVisible();
  await page.locator('[data-coach-target] label', { hasText: 'Retake' }).click();
  expect(chooser, 'the camera did not open').toBe(false);
  await arrive(page, 'Back to the site evaluation', 'to-site-2');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  await arrive(page, 'Dropbox', 'dropbox');
  await expect(page.locator('#dbx')).toHaveText('Dropbox');
  await next(page);
  await arrive(page, 'Open the soil log', 'soil-log');
  await showMe(page);
  await arrive(page, 'The finished soil log', 'finished', { timeout: 15_000 });
  // Soil logs are PDFs, never printed (Nathan, 2026-10-04).
  await expect(tip(page)).toContainText('This is the soil log PDF. Tap Finish to delete this practice job.');
  await expect(page.getByRole('heading', { name: 'Soil logs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Print/ })).toHaveCount(0);
  await expect(page.getByText(/print|copier/i)).toHaveCount(0);

  // Nothing reached Dropbox.
  expect(await page.evaluate(() => [...(window as any).__fakeDropbox.files.keys()])).toEqual([]);
  await next(page, 'Finish');

  await arrive(page, 'Replay the demo from Settings', 'home-settings');
  await expect(tip(page)).toContainText("That's the demo. You can replay it any time from Settings.");
  await expect(page.getByRole('link', { name: /0271\.001/ })).toHaveCount(0);
  await next(page, 'Done');
  await expect(tip(page)).toHaveCount(0);

  // Finished once: the next launch goes straight to work.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await expect(tip(page)).toHaveCount(0);

  // A replay from Settings ends on the phone's back button; the tip has no Exit button.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Replay the demo' }).click();
  await arrive(page, 'Project #', 'replay-start');
  await expect(tip(page)).toContainText('This practice job takes about five minutes, and your back button ends it.');
  await expect(tip(page).getByRole('button', { name: 'Exit demo' })).toHaveCount(0);
  // The app's own moves do not end it (Chromium fires popstate for them too): on past adding the pit.
  for (const label of ['Project #', 'Project name', 'Location', 'Evaluated by and date', 'Gallatin County and the confirmation number']) {
    await expect(tip(page).getByRole('heading')).toContainText(label, { timeout: 15_000 });
    await showMe(page);
  }
  await expect(tip(page).getByRole('heading')).toContainText('only when you are standing at it');
  await showMe(page);
  await expect(tip(page).getByRole('heading')).toContainText('GPS started when you added the pit', { timeout: 15_000 });
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await expect(tip(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /0271|No project #/ })).toHaveCount(0);
});
