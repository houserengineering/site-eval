// Employees only (Nathan, 2026-10-04): the app opens on Google sign-in, lets in only @houserengineering.com, and then
// gets Dropbox through the office PC. Google's script, the gist and the office service are mocked here.
import { expect, test, type Page } from '@playwright/test';

const origin = new URL(process.env.E2E_URL ?? 'http://localhost:4173').origin;
test.use({ storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: 'site-eval:demo-done', value: '1' }] }] } });

const shots = process.env.SHOTS_DIR;
const OFFICE = 'https://office.example.trycloudflare.com';

/** Stands in for Google Identity Services: its button signs in as window.__as. */
const GIS = `
window.google = { accounts: { id: {
  initialize(c) { window.__gis = c; },
  disableAutoSelect() {},
  renderButton(el) {
    const b = document.createElement('button');
    b.textContent = 'Sign in with Google (test)';
    b.onclick = () => {
      const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
      const claims = { aud: window.__gis.client_id, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true, ...window.__as };
      window.__gis.callback({ credential: 'h.' + enc(claims) + '.sig' });
    };
    el.appendChild(b);
  },
} } };`;

async function rig(page: Page, as: object) {
  const calls: string[] = [];
  await page.addInitScript((a) => ((window as any).__as = a), as);
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
  await page.route('https://api.github.com/gists/*', (r) => r.fulfill({ json: { files: { 'site-eval-service.json': { content: JSON.stringify({ url: OFFICE }) } } } }));
  await page.route(`${OFFICE}/v1/session`, (r) => {
    calls.push(`session ${JSON.parse(r.request().postData() ?? '{}').idToken ? 'with Google token' : 'without token'}`);
    return r.fulfill({ json: { session: 'ses_test', email: 'nathan@houserengineering.com', expiresAt: Date.now() + 7 * 86400e3 } });
  });
  await page.route(`${OFFICE}/v1/dropbox-token`, (r) => {
    calls.push(`dropbox-token ${r.request().headers().authorization}`);
    return r.fulfill({ json: { accessToken: 'sl.test', expiresAt: Date.now() + 4 * 3600e3, accountName: 'Justin Houser' } });
  });
  await page.route('https://api.dropboxapi.com/2/files/list_folder', (r) => {
    calls.push(`dropbox list ${r.request().headers().authorization}`);
    return r.fulfill({ json: { entries: [{ '.tag': 'folder', name: '0999', path_display: '/Server/0999' }], has_more: false } });
  });
  return calls;
}

test('a personal Google account is turned away', async ({ page }) => {
  await rig(page, { email: 'someone@gmail.com' });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Sign in to start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New site evaluation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in with Google (test)' }).click();
  await expect(page.getByRole('alert')).toHaveText('someone@gmail.com is not a Houser Engineering account. Sign in with your @houserengineering.com Google account.');
  await expect(page.getByRole('button', { name: 'New site evaluation' })).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/signin-refused.png` });
});

test('a company account signs in once, gets Dropbox through the office, and stays signed in', async ({ page }) => {
  const calls = await rig(page, { email: 'nathan@houserengineering.com', hd: 'houserengineering.com', name: 'Nathan Hart' });
  await page.goto('./');
  if (shots) await page.screenshot({ path: `${shots}/signin.png` });
  await page.getByRole('button', { name: 'Sign in with Google (test)' }).click();
  await expect(page.getByRole('button', { name: 'New site evaluation' })).toBeVisible();
  await expect.poll(() => calls).toContain('session with Google token');

  // Dropbox works with no setup: the office session buys a Dropbox token.
  await page.getByRole('link', { name: 'Open from Dropbox' }).click();
  await expect(page.getByRole('button', { name: /0999/ })).toBeVisible({ timeout: 15_000 });
  expect(calls).toContain('dropbox-token Bearer ses_test');
  expect(calls).toContain('dropbox list Bearer sl.test');

  await page.goto('./#/settings');
  await expect(page.getByText('Signed in as nathan@houserengineering.com.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dropbox' }).getByText('Justin Houser')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/settings-account.png`, fullPage: true });

  // Opening the app again needs no sign-in (and no signal: nothing is asked of Google).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to start' })).toBeVisible();
});
