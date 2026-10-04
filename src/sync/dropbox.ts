// Dropbox over its HTTP API, straight from the browser (Dropbox allows CORS). The access token comes from the
// office PC (office.ts), which holds the Houser Dropbox connection; the app itself never signs in to Dropbox.
import { AuthError, ConflictError, OfflineError, type RemoteEntry, type RemoteFile, type SyncAdapter, type WriteOptions } from './adapter';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

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
  if (res.status === 401) return new AuthError("Dropbox refused the office PC's access. Ask the office to connect Dropbox again.");
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

  async createFolder(path: string): Promise<void> {
    if (await this.folderExists(path)) return;
    try {
      await this.rpc('files/create_folder_v2', { path, autorename: false });
    } catch (e) {
      // Someone (another phone) created it meanwhile.
      if (!(await this.folderExists(path))) throw e;
    }
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
