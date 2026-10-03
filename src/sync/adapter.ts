// The sync seam: the few file operations the app needs from Dropbox. The Dropbox implementation
// talks to the real API; FakeSync keeps files in memory for tests and the end-to-end rehearsal.

export interface RemoteEntry {
  path: string;
  name: string;
  folder: boolean;
  /** Files only. */
  rev?: string;
  /** Dropbox content hash (see contentHash). Files only. */
  hash?: string;
}

export interface RemoteFile extends RemoteEntry {
  rev: string;
  hash: string;
}

/**
 * `ifRev` guards a write: undefined = overwrite, null = create only (fails if the file exists),
 * a rev = replace only that revision (fails if someone wrote since).
 */
export interface WriteOptions {
  ifRev?: string | null;
}

export interface SyncAdapter {
  /** Entries directly in `folder`; [] if it does not exist. */
  list(folder: string): Promise<RemoteEntry[]>;
  stat(path: string): Promise<RemoteFile | null>;
  read(path: string): Promise<{ bytes: Uint8Array; file: RemoteFile } | null>;
  write(path: string, bytes: Uint8Array, opts?: WriteOptions): Promise<RemoteFile>;
  /** Whether `path` is a folder in this account. Writing creates missing parents, so check first. */
  folderExists(path: string): Promise<boolean>;
  /** Creates `path` and any missing parents; nothing happens if it already exists. */
  createFolder(path: string): Promise<void>;
  /** The signed-in account's display name, for messages. */
  readonly account: string;
}

/** The file changed (or appeared) since it was read. */
export class ConflictError extends Error {}
/** No connection; the change stays queued. */
export class OfflineError extends Error {}
/** Dropbox needs signing in again. */
export class AuthError extends Error {}

const BLOCK = 4 * 1024 * 1024;
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Dropbox content hash: SHA-256 of the concatenated SHA-256s of each 4 MiB block. */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const blocks = Math.ceil(bytes.length / BLOCK);
  const all = new Uint8Array(blocks * 32);
  for (let i = 0; i < blocks; i++) all.set(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice(i * BLOCK, (i + 1) * BLOCK))), i * 32);
  return hex(await crypto.subtle.digest('SHA-256', all));
}

const key = (path: string) => path.toLowerCase();
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** In-memory Dropbox: case-insensitive paths, revisions, content hashes, and an offline switch. */
export class FakeSync implements SyncAdapter {
  files = new Map<string, { path: string; bytes: Uint8Array; rev: string; hash: string }>();
  /** Folders created empty; folders holding files exist implicitly. */
  folders = new Set<string>();
  offline = false;
  writes: string[] = [];
  private revs = 0;

  constructor(folders: string[] = [], public account = 'Test Dropbox') {
    for (const f of folders) this.mkdir(f);
  }

  mkdir(path: string) {
    this.folders.add(key(path));
  }

  async createFolder(path: string): Promise<void> {
    this.check();
    this.mkdir(path);
  }

  async folderExists(path: string): Promise<boolean> {
    this.check();
    const k = key(path).replace(/\/+$/, '');
    if (!k || this.folders.has(k)) return true;
    const prefix = `${k}/`;
    return [...this.folders].some((f) => f.startsWith(prefix)) || [...this.files.keys()].some((f) => f.startsWith(prefix));
  }

  private check() {
    if (this.offline) throw new OfflineError('No connection');
  }

  async list(folder: string): Promise<RemoteEntry[]> {
    this.check();
    const prefix = `${key(folder)}/`;
    const out = new Map<string, RemoteEntry>();
    for (const f of this.files.values()) {
      if (!key(f.path).startsWith(prefix)) continue;
      const rest = f.path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) out.set(key(f.path), { path: f.path, name: rest, folder: false, rev: f.rev, hash: f.hash });
      else {
        const p = `${folder}/${rest.slice(0, slash)}`;
        out.set(key(p), { path: p, name: rest.slice(0, slash), folder: true });
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async stat(path: string): Promise<RemoteFile | null> {
    this.check();
    const f = this.files.get(key(path));
    return f ? { path: f.path, name: nameOf(f.path), folder: false, rev: f.rev, hash: f.hash } : null;
  }

  async read(path: string) {
    const file = await this.stat(path);
    return file && { bytes: this.files.get(key(path))!.bytes.slice(), file };
  }

  async write(path: string, bytes: Uint8Array, opts: WriteOptions = {}): Promise<RemoteFile> {
    this.check();
    const cur = this.files.get(key(path));
    if (opts.ifRev === null && cur) throw new ConflictError(`${path} already exists`);
    if (opts.ifRev && cur?.rev !== opts.ifRev) throw new ConflictError(`${path} changed since it was read`);
    const f = { path: cur?.path ?? path, bytes: bytes.slice(), rev: `r${++this.revs}`, hash: await contentHash(bytes) };
    this.files.set(key(path), f);
    this.writes.push(f.path);
    return { path: f.path, name: nameOf(f.path), folder: false, rev: f.rev, hash: f.hash };
  }
}
