// The demo (spec 2026-10-03): coach marks on the real screens, at phone width. Every step is checked
// for a visible highlight around its field and a tip that does not cover it, and moves on when the
// user does the step (or taps Show me). Every step with a text, number or date field is checked again
// with the field focused and a simulated on-screen keyboard: the visual viewport shrinks to 55% of the
// window, as on Android, where the keyboard covers the page without resizing it. SHOTS_DIR saves a
// screenshot of every step (and of every keyboard check, with the keyboard drawn in).
import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 412, height: 915 } });

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
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await geometry(page));
      const still = now === last;
      last = now;
      return still;
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
  expect(g.tip.left).toBeGreaterThanOrEqual(15);
  expect(g.tip.right).toBeLessThanOrEqual(g.vw - 15);
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

test('first launch: the demo coaches the whole field path and ends in Settings', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(fakeKeyboard);
  await page.goto('./?fake-dropbox');
  await page.waitForFunction(() => !!(window as any).__fakeDropbox);
  await page.evaluate(() => (window as any).__fakeDropbox.mkdir('/Server/Office'));

  // Required on first launch; no exit on the first run.
  await arrive(page, 'Practice on a made-up job', 'welcome', { hole: false });
  await expect(tip(page).getByRole('button', { name: 'Exit demo' })).toHaveCount(0);
  await next(page, 'Start');

  // Header: placeholders from the field guide; a wrong entry gets a correction on the field.
  await arrive(page, 'Project #', 'project-number');
  const projectNo = page.getByLabel('Project #');
  await expect(projectNo).toHaveAttribute('placeholder', '0279.001');
  // Taps outside the highlight are blocked.
  const back = await page.getByRole('link', { name: 'All site evaluations' }).boundingBox();
  await page.mouse.click(back!.x + back!.width / 2, back!.y + back!.height / 2);
  expect(page.url()).toContain('#/se/');
  await projectNo.fill('999');
  await projectNo.press('Enter');
  await expect(tip(page).getByRole('alert')).toHaveText('Use 4 digits, a dot, then 3 digits, like 0999.001.');
  await expect(tip(page).getByRole('heading')).toContainText('Project #');
  await projectNo.fill('0999.001');
  await projectNo.press('Enter');

  await arrive(page, 'Project name', 'project-name');
  await page.getByLabel('Project name').fill('Demo Ranch Minor Subdivision');
  await next(page);
  await arrive(page, 'Location', 'location');
  await showMe(page);
  await expect(page.getByLabel('Location')).toHaveValue('1 Sample Road, Belgrade');
  await arrive(page, 'Who and when', 'eval-by-date');
  await page.getByLabel('Eval. by').fill('Nathan');
  await page.getByLabel('Date').fill('2026-10-03');
  await next(page);
  await arrive(page, 'Confirmation number', 'confirmation');
  await page.getByLabel('Confirmation number').fill('se confirm 00999');
  await page.getByLabel('Confirmation number').press('Enter');

  // Add the pit (GPS warning), then the GPS fix: none indoors, so Show me fills a made-up one.
  await arrive(page, 'only when you are standing at it', 'add-pit');
  await page.getByLabel('New test pit #').fill('1');
  await page.getByRole('button', { name: 'Add test pit' }).click();
  await arrive(page, 'GPS starts by itself', 'gps');
  await showMe(page);
  await arrive(page, 'Recalibrate', 'gps-retake');
  await next(page);

  // Wall A, horizon 1 by the user's own taps.
  await arrive(page, 'Log the first horizon', 'add-horizon');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await arrive(page, 'Horizon and depth', 'h1-depth');
  await pick(page, 'Horizon', 'A');
  await page.getByRole('region', { name: 'Horizon 1' }).getByRole('textbox', { name: 'Bottom', exact: true }).fill('0');
  await page.getByRole('region', { name: 'Horizon 1' }).getByRole('textbox', { name: 'Bottom', exact: true }).blur();
  await expect(tip(page).getByRole('alert')).toHaveText('Bottom must be below the top.');
  await pick(page, 'Quick bottom', '12"');
  await arrive(page, 'Munsell color', 'h1-color');
  await pick(page, 'Hue', '10YR');
  await pick(page, 'Value', '3');
  await pick(page, 'Chroma', '2');
  await arrive(page, 'Texture', 'h1-texture');
  await pick(page, 'USDA class', 'LOAM');
  await arrive(page, 'Rock fragments', 'h1-rock');
  await page.getByRole('region', { name: 'Horizon 1' }).getByLabel('Rock fragments (by volume)').fill('5');
  await next(page);
  await arrive(page, 'Structure', 'h1-structure');
  await pick(page, 'Shape', 'GRANULAR');
  await pick(page, 'Grade', 'WEAK');
  await pick(page, 'Size', 'FINE');
  await arrive(page, 'Consistence and plasticity', 'h1-consistence');
  await pick(page, 'Consistence', 'FRIABLE');
  await pick(page, 'Plasticity', 'SLIGHTLY PLASTIC');
  await arrive(page, 'Roots and mottling', 'h1-roots');
  await pick(page, 'Roots', 'Yes');
  await pick(page, 'Mottling', 'No');

  // Horizon 2: the highlight walks the next blank group; Show me finishes it.
  await arrive(page, 'Horizon 2 on your own', 'h2-add');
  await page.getByRole('button', { name: 'Add horizon' }).click();
  await expect(tip(page)).toContainText('Now: horizon and depth');
  await arrive(page, 'Horizon 2 on your own', 'h2-depth');
  await pick(page, 'Horizon', 'B');
  await pick(page, 'Quick bottom', '96"');
  await expect(tip(page)).toContainText('Now: color');
  await arrive(page, 'Horizon 2 on your own', 'h2-color');
  await showMe(page);

  await arrive(page, 'Test pit summary', 'summary', { timeout: 20_000 });
  await next(page);

  // If the user wanders off, the tip offers to take them back.
  await arrive(page, 'Photo of the wall', 'photo');
  await page.evaluate(() => (location.hash = '#/'));
  await arrive(page, 'You left the demo step', 'left-step', { hole: false });
  await tip(page).getByRole('button', { name: 'Take me back' }).click();
  await arrive(page, 'Photo of the wall', 'photo-back');
  await page.locator('[data-coach-target] input[type="file"][capture]').setInputFiles('src/app/demo/demo-wall-good.jpg');

  await arrive(page, 'On to wall B', 'to-site');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();
  await arrive(page, 'Open wall 1B', 'open-b');
  await page.getByRole('link', { name: /Wall 1B, south/ }).click();
  await arrive(page, 'Start from wall A', 'copy-a');
  await page.getByRole('button', { name: /Start from wall 1A/ }).click();

  // The planted pit check: a dark, blurred photo to retake.
  await arrive(page, 'retake this photo', 'retake');
  await expect(page.locator('[data-coach-target].alert')).toHaveText('Blurry, too dark: retake it.');
  await page.getByLabel('Retake photo 1').setInputFiles('src/app/demo/demo-wall-good.jpg');
  await arrive(page, 'Back to the site evaluation', 'to-site-2');
  await page.getByRole('link', { name: 'Back to site evaluation' }).click();

  await arrive(page, 'Dropbox: off in the demo', 'dropbox');
  await next(page);
  await arrive(page, 'Generate the soil log', 'soil-log');
  await showMe(page);
  await arrive(page, 'Your finished soil log', 'finished', { timeout: 15_000 });

  // Nothing reached Dropbox.
  expect(await page.evaluate(() => [...(window as any).__fakeDropbox.files.keys()])).toEqual([]);
  await next(page, 'Finish');

  await arrive(page, 'The demo lives in Settings', 'home-settings');
  await expect(page.getByText('Demo Ranch')).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await arrive(page, 'Replay the demo', 'replay');
  await next(page, 'Done');
  await expect(tip(page)).toHaveCount(0);

  // Finished once: the next launch goes straight to work.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await expect(tip(page)).toHaveCount(0);

  // A replay from Settings can be exited.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Replay the demo' }).click();
  await arrive(page, 'Practice on a made-up job', 'replay-welcome', { hole: false });
  await tip(page).getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByRole('heading', { name: 'Site evaluations' })).toBeVisible();
  await expect(tip(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Demo|No project #/ })).toHaveCount(0);
});
