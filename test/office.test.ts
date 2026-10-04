import { describe, expect, it } from 'vitest';
import { OfflineError } from '../src/sync/adapter';
import { GoogleSignInNeeded, OfficeDropbox, SERVICE_GIST } from '../src/sync/office';
import { accountProblem, decodeIdToken } from '../src/app/google';

const NOW = Date.UTC(2026, 9, 4, 18);
const gist = (url: string) => ({ files: { 'site-eval-service.json': { content: JSON.stringify({ url }) } } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function rig(routes: Record<string, (init: RequestInit) => Response | Promise<Response>>, idToken?: string) {
  const settings = new Map<string, unknown>();
  const calls: string[] = [];
  const office = new OfficeDropbox({
    fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      if (!route) throw new TypeError('Failed to fetch');
      return route(init);
    }) as typeof fetch,
    getSetting: async <T,>(k: string) => settings.get(k) as T | undefined,
    setSetting: async (k, v) => void settings.set(k, v),
    idToken: async () => idToken,
    now: () => NOW,
  });
  return { office, settings, calls };
}

const GIST = `https://api.github.com/gists/${SERVICE_GIST}`;
const token = { accessToken: 'sl.a', expiresAt: NOW + 4 * 3600e3, accountName: 'Justin Houser' };

describe('office Dropbox', () => {
  it('finds the service in the gist, signs in with the Google token, then gets a Dropbox token', async () => {
    const r = rig(
      {
        [GIST]: () => json(gist('https://a.trycloudflare.com/')),
        'https://a.trycloudflare.com/v1/session': (init) => {
          expect(JSON.parse(String(init.body))).toEqual({ idToken: 'google-id' });
          return json({ session: 'ses_1', email: 'nathan@houserengineering.com', expiresAt: NOW + 7 * 86400e3 });
        },
        'https://a.trycloudflare.com/v1/dropbox-token': (init) => {
          expect((init.headers as any).Authorization).toBe('Bearer ses_1');
          return json(token);
        },
      },
      'google-id',
    );
    expect(await r.office.accessToken()).toEqual(token);
    // The next call within the token's life asks nobody.
    const before = r.calls.length;
    expect(await r.office.accessToken()).toEqual(token);
    expect(r.calls.length).toBe(before);
    expect(r.settings.get('officeServiceUrl')).toBe('https://a.trycloudflare.com');
  });

  it('follows a restarted tunnel to its new address', async () => {
    const r = rig({
      [GIST]: () => json(gist('https://b.trycloudflare.com')),
      'https://a.trycloudflare.com/v1/dropbox-token': () => new Response('', { status: 530 }),
      'https://b.trycloudflare.com/v1/dropbox-token': () => json(token),
    });
    r.settings.set('officeServiceUrl', 'https://a.trycloudflare.com');
    r.settings.set('officeSession', { session: 'ses_1', email: 'x', expiresAt: NOW + 86400e3 });
    expect((await r.office.accessToken()).accessToken).toBe('sl.a');
    expect(r.settings.get('officeServiceUrl')).toBe('https://b.trycloudflare.com');
  });

  it('an office PC that is off is an offline error, not a sign-in problem', async () => {
    const r = rig({ [GIST]: () => json(gist('https://a.trycloudflare.com')) });
    r.settings.set('officeServiceUrl', 'https://a.trycloudflare.com');
    r.settings.set('officeSession', { session: 'ses_1', email: 'x', expiresAt: NOW + 86400e3 });
    await expect(r.office.accessToken()).rejects.toBeInstanceOf(OfflineError);
  });

  it('an ended session with no fresh Google token asks for Google sign-in', async () => {
    const r = rig({ 'https://a.trycloudflare.com/v1/dropbox-token': () => json({ error: 'session_invalid' }, 401) });
    r.settings.set('officeServiceUrl', 'https://a.trycloudflare.com');
    r.settings.set('officeSession', { session: 'ses_old', email: 'x', expiresAt: NOW + 86400e3 });
    await expect(r.office.accessToken()).rejects.toBeInstanceOf(GoogleSignInNeeded);
    expect(r.settings.get('officeSession')).toBeUndefined();
  });

  it('a non-company Google account is refused with a plain reason', async () => {
    const r = rig({ 'https://a.trycloudflare.com/v1/session': () => json({ error: 'not_company_account' }, 401) }, 'gmail-id');
    r.settings.set('officeServiceUrl', 'https://a.trycloudflare.com');
    await expect(r.office.session('gmail-id')).rejects.toThrow('only for Houser Engineering Google accounts');
  });
});

const jwt = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`;

describe('Google account check (UI gate only; the office service verifies the token)', () => {
  const ok = { aud: 'client', email: 'justin@houserengineering.com', email_verified: true, hd: 'houserengineering.com', name: 'Justin Houser' };
  it('lets a company account in', () => {
    expect(decodeIdToken(jwt(ok)).name).toBe('Justin Houser');
    expect(accountProblem(ok, 'client')).toBeUndefined();
  });
  it('refuses other domains, other apps and unverified emails', () => {
    expect(accountProblem({ ...ok, hd: undefined, email: 'nathan.x@gmail.com' }, 'client')).toMatch(/not a Houser Engineering account/);
    expect(accountProblem({ ...ok, email: 'a@other.com' }, 'client')).toMatch(/not a Houser Engineering account/);
    expect(accountProblem(ok, 'other-client')).toMatch(/another app/);
    expect(accountProblem({ ...ok, email_verified: false }, 'client')).toMatch(/verified/);
  });
});
