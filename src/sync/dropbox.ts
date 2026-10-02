// Dropbox over its HTTP API, straight from the browser (Dropbox allows CORS). Sign-in is OAuth
// 2 PKCE: no client secret, so the app key can ship in this public app.
import { AuthError, ConflictError, OfflineError, type RemoteEntry, type RemoteFile, type SyncAdapter, type WriteOptions } from './adapter';

/** Public PKCE client id of the Houser site evaluation Dropbox app. */
export const DROPBOX_APP_KEY = 'fu9slrgdzzkic4t';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export interface DropboxAuth {
  accessToken: string;
  /** Absent for a pasted access token (it lasts about 4 hours). */
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  accountName: string;
}

/** Dropbox-API-Arg must be ASCII: escape everything else as \uXXXX. */
const apiArg = (v: unknown) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

async function call(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: any) {
    throw new OfflineError(`No connection to Dropbox (${e.message})`);
  }
  return res;
}

async function failure(res: Response): Promise<Error> {
  const text = await res.text();
  if (res.status === 401) return new AuthError('Dropbox sign-in expired. Connect Dropbox again.');
  if (res.status === 409 && /conflict/.test(text)) return new ConflictError(text);
  if (res.status === 429 || res.status >= 500) return new OfflineError(`Dropbox is busy (${res.status}); will retry.`);
  return new Error(`Dropbox ${res.status}: ${text.slice(0, 300)}`);
}

const toFile = (m: any): RemoteFile => ({ path: m.path_display, name: m.name, folder: false, rev: m.rev, hash: m.content_hash });

export class DropboxSync implements SyncAdapter {
  constructor(
    private token: () => Promise<string>,
    public account = '',
  ) {}

  async folderExists(path: string): Promise<boolean> {
    const m = await this.rpc('files/get_metadata', { path });
    return m?.['.tag'] === 'folder';
  }

  private async rpc(endpoint: string, body: unknown): Promise<any | null> {
    const run = async () =>
      call(`${API}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const res = await run();
    if (res.ok) return res.json();
    const text = await res.clone().text();
    if (res.status === 409 && /not_found/.test(text)) return null;
    throw await failure(res);
  }

  async list(folder: string): Promise<RemoteEntry[]> {
    const out: RemoteEntry[] = [];
    let page = await this.rpc('files/list_folder', { path: folder, limit: 2000 });
    while (page) {
      for (const e of page.entries) {
        if (e['.tag'] === 'file') out.push(toFile(e));
        else if (e['.tag'] === 'folder') out.push({ path: e.path_display, name: e.name, folder: true });
      }
      page = page.has_more ? await this.rpc('files/list_folder/continue', { cursor: page.cursor }) : null;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async stat(path: string): Promise<RemoteFile | null> {
    const m = await this.rpc('files/get_metadata', { path });
    return m && m['.tag'] === 'file' ? toFile(m) : null;
  }

  async read(path: string) {
    const res = await call(`${CONTENT}/files/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Dropbox-API-Arg': apiArg({ path }) },
    });
    if (res.status === 409 && /not_found/.test(await res.clone().text())) return null;
    if (!res.ok) throw await failure(res);
    const file = toFile(JSON.parse(res.headers.get('Dropbox-API-Result') ?? '{}'));
    return { bytes: new Uint8Array(await res.arrayBuffer()), file };
  }

  async write(path: string, bytes: Uint8Array, opts: WriteOptions = {}): Promise<RemoteFile> {
    const mode = opts.ifRev === undefined ? 'overwrite' : opts.ifRev === null ? 'add' : { '.tag': 'update', update: opts.ifRev };
    const res = await call(`${CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path, mode, autorename: false, mute: true }),
      },
      body: bytes as BodyInit,
    });
    if (!res.ok) throw await failure(res);
    return toFile(await res.json());
  }
}

// ---- sign-in (OAuth 2 PKCE) ----------------------------------------------------------

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VERIFIER = 'site-eval:dropbox-verifier';

/** The app's own URL, where Dropbox sends the browser back (registered in the Dropbox app). */
export const redirectUri = () => `${location.origin}${location.pathname}`;

export async function startSignIn(appKey = DROPBOX_APP_KEY) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER, JSON.stringify({ verifier, hash: location.hash }));
  const q = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri(),
    token_access_type: 'offline',
  });
  location.assign(`https://www.dropbox.com/oauth2/authorize?${q}`);
}

async function token(body: Record<string, string>): Promise<any> {
  const res = await call('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new AuthError(`Dropbox sign-in failed: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Finishes sign-in when Dropbox returns with `?code=`; returns the route to go back to. */
export async function finishSignIn(appKey = DROPBOX_APP_KEY): Promise<{ auth: DropboxAuth; hash: string } | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const saved = sessionStorage.getItem(VERIFIER);
  if (!code && !params.get('error')) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  if (!code) throw new AuthError(`Dropbox sign-in cancelled: ${params.get('error_description') ?? params.get('error')}`);
  if (!saved) throw new AuthError('Dropbox sign-in was started in another tab. Try again.');
  sessionStorage.removeItem(VERIFIER);
  const { verifier, hash } = JSON.parse(saved);
  const t = await token({ code, grant_type: 'authorization_code', code_verifier: verifier, client_id: appKey, redirect_uri: redirectUri() });
  const auth = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000, accountName: '' };
  return { auth: { ...auth, accountName: await accountName(auth.accessToken) }, hash };
}

export async function refreshAuth(auth: DropboxAuth, appKey = DROPBOX_APP_KEY): Promise<DropboxAuth> {
  if (!auth.refreshToken) throw new AuthError('The Dropbox access token has expired. Connect Dropbox again.');
  const t = await token({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: appKey });
  return { ...auth, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

export async function accountName(accessToken: string): Promise<string> {
  const res = await call(`${API}/users/get_current_account`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await failure(res);
  return (await res.json()).name?.display_name ?? '';
}
