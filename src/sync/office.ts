// Dropbox access through the office PC (Nathan, 2026-10-04). The office service holds the Houser Dropbox's refresh
// token; the app signs in there with a Google ID token, keeps the session it gets back (7 days), and trades it for
// short-lived Dropbox access tokens. Nothing secret ships in the app. The service's address changes when the office
// PC restarts its tunnel, so it is read from a public gist; the address is not secret, the session is.
import { AuthError, OfflineError } from './adapter';

/** The gist the office service writes its current address to (apps/site-eval-review-service, publishGist). */
export const SERVICE_GIST = '498d646549cf700a46fed9c8ae99494d';

export interface OfficeSession {
  session: string;
  email: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface OfficeDropboxToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  accountName: string;
}

export interface OfficeDeps {
  fetch: typeof fetch;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
  /** A fresh Google ID token if one can be had without the user (or the one from signing in); else undefined. */
  idToken(): Promise<string | undefined>;
  now?: () => number;
}

/** Thrown when only a new Google sign-in can get Dropbox access back. */
export class GoogleSignInNeeded extends AuthError {
  constructor(message = 'Sign in with Google again to save to Dropbox.') {
    super(message);
  }
}

const OFFICE_DOWN = 'The office PC is not answering, so nothing reaches Dropbox until it is back. Your work is saved on this phone.';

/** Reads the office service's current address from the gist. */
export async function discoverServiceUrl(f: typeof fetch): Promise<string | undefined> {
  try {
    const res = await f(`https://api.github.com/gists/${SERVICE_GIST}`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!res.ok) return undefined;
    const url = JSON.parse((await res.json()).files?.['site-eval-service.json']?.content ?? '{}').url;
    return typeof url === 'string' && /^https:\/\//.test(url) ? url.replace(/\/+$/, '') : undefined;
  } catch {
    return undefined;
  }
}

export class OfficeDropbox {
  private now: () => number;
  private pending?: Promise<OfficeDropboxToken>;

  constructor(private deps: OfficeDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** The cached address, or the gist's when there is none or `fresh` is asked for after a failed request. */
  async serviceUrl(fresh = false): Promise<string | undefined> {
    const cached = await this.deps.getSetting<string>('officeServiceUrl');
    if (cached && !fresh) return cached;
    const found = await discoverServiceUrl(this.deps.fetch);
    if (found && found !== cached) await this.deps.setSetting('officeServiceUrl', found);
    return found ?? cached;
  }

  /** A Dropbox access token with at least five minutes left; one request at a time. */
  accessToken(): Promise<OfficeDropboxToken> {
    return (this.pending ??= this.fetchToken().finally(() => (this.pending = undefined)));
  }

  private async fetchToken(): Promise<OfficeDropboxToken> {
    const cached = await this.deps.getSetting<OfficeDropboxToken>('officeDropbox');
    if (cached && cached.expiresAt - this.now() > 5 * 60_000) return cached;
    let session = await this.session();
    let res = await this.post('/v1/dropbox-token', {}, session.session);
    if (res.status === 401) {
      // The office ended the session (expired, or `revoke-user`): sign in again with Google if possible.
      await this.deps.setSetting('officeSession', undefined);
      session = await this.session();
      res = await this.post('/v1/dropbox-token', {}, session.session);
    }
    if (!res.ok) throw await this.failure(res);
    const t: OfficeDropboxToken = await res.json();
    await this.deps.setSetting('officeDropbox', t);
    return t;
  }

  /** The stored session, or a new one from a Google ID token. */
  async session(idToken?: string): Promise<OfficeSession> {
    const stored = idToken ? undefined : await this.deps.getSetting<OfficeSession>('officeSession');
    if (stored && stored.expiresAt - this.now() > 60_000) return stored;
    const token = idToken ?? (await this.deps.idToken());
    if (!token) throw new GoogleSignInNeeded();
    const res = await this.post('/v1/session', { idToken: token });
    if (res.status === 401) {
      const code = (await res.json().catch(() => ({}))).error;
      throw new GoogleSignInNeeded(code === 'not_company_account' ? 'Dropbox is only for Houser Engineering Google accounts.' : undefined);
    }
    if (!res.ok) throw await this.failure(res);
    const s = await res.json();
    const session: OfficeSession = { session: s.session, email: s.email, expiresAt: s.expiresAt };
    await this.deps.setSetting('officeSession', session);
    return session;
  }

  /** Forgets this device's office session and Dropbox token (Settings › Sign out). */
  async forget() {
    await this.deps.setSetting('officeSession', undefined);
    await this.deps.setSetting('officeDropbox', undefined);
  }

  /** Drops the cached Dropbox token after Dropbox refused it, so the next sync asks the office for a new one. */
  async dropToken() {
    await this.deps.setSetting('officeDropbox', undefined);
  }

  /** POSTs to the service; on no answer, re-reads the address once (the tunnel may have restarted). */
  private async post(route: string, body: unknown, session?: string): Promise<Response> {
    const send = (base: string) =>
      this.deps.fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(body),
      });
    let base = await this.serviceUrl();
    if (base) {
      try {
        const res = await send(base);
        // Cloudflare answers 502/530 for a tunnel whose PC is gone.
        if (![502, 503, 530].includes(res.status) || (await res.clone().json().catch(() => null))?.error) return res;
      } catch {}
    }
    if (globalThis.navigator?.onLine === false) throw new OfflineError('No signal. Your work is saved on this phone and goes to Dropbox when there is signal.');
    const again = await this.serviceUrl(true);
    if (!again || again === base) throw new OfflineError(OFFICE_DOWN);
    base = again;
    try {
      return await send(base);
    } catch {
      throw new OfflineError(OFFICE_DOWN);
    }
  }

  private async failure(res: Response): Promise<Error> {
    const code = (await res.json().catch(() => ({}))).error;
    if (code === 'dropbox_not_connected' || code === 'dropbox_refresh_revoked')
      return new AuthError('The office PC is not connected to the Houser Dropbox. Ask the office to connect it again.');
    if (code === 'google_not_configured') return new AuthError('Google sign-in is not set up on the office PC yet.');
    if (res.status === 429) return new OfflineError('Too many Dropbox requests this hour; trying again shortly.');
    return new OfflineError(OFFICE_DOWN);
  }
}
