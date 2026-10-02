// Sync engine: pushes and pulls the field record (merging field by field), mirrors photos, files
// the deliverables under Houser's names without ever overwriting a file the app did not write,
// and drops PDFs into the office print queue. Pure over the SyncAdapter seam.
import { migrate, type FieldRecord } from '../domain/fieldRecord';
import { mergeRecords, sameRecord, stampEdits } from '../domain/merge';
import type { GeneratedFile } from '../generator';
import { ConflictError, contentHash, type SyncAdapter } from './adapter';
import { alternatePath, deliverablePath, dropboxFolder, fieldRecordPath, folderProblem, photoFolder, printQueuePath } from './naming';

export interface PhotoStore {
  getPhoto(id: string): Promise<Blob | undefined>;
  putPhoto(id: string, recordId: string, blob: Blob): Promise<void>;
}

export interface SyncContext {
  adapter: SyncAdapter;
  photos: PhotoStore;
  /** Who is editing on this device (stamped on edits and filings). */
  who: string;
}

export class NoFolderError extends Error {
  constructor() {
    super('Choose the Dropbox folder for this site evaluation first.');
  }
}

/** The deliverable folder is not usable in the connected account; filing would put files where nobody looks. */
export class MissingFolderError extends Error {}

/** Throws unless the record's deliverable folder is a sound path that exists in this Dropbox account. */
export async function checkFolder(record: FieldRecord, adapter: SyncAdapter) {
  const folder = dropboxFolder(record.deliverableFolder);
  if (!folder) throw new NoFolderError();
  const problem = folderProblem(folder);
  if (problem) throw new MissingFolderError(problem);
  if (!(await adapter.folderExists(folder)))
    throw new MissingFolderError(
      `${folder} is not in the Dropbox account ${adapter.account || 'that is connected'}. Nothing was filed. Connect the Houser Dropbox account, or choose a folder that exists.`,
    );
}

/** Canonical JSON (object keys sorted) so equal records hash equal on every device. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as any)[k])])) : v;
const encode = (r: FieldRecord) => new TextEncoder().encode(JSON.stringify(canonical(r), null, 1));

/**
 * Brings the record in Dropbox and this copy together: reads the remote copy, merges, writes the
 * result back (guarded by revision, retried if another device wrote in between), and mirrors
 * photos both ways. Returns the merged record; `pulled` says whether it differs from `local`.
 */
export async function syncRecord(local: FieldRecord, ctx: SyncContext): Promise<{ record: FieldRecord; pulled: boolean }> {
  await checkFolder(local, ctx.adapter);
  const path = fieldRecordPath(local);
  for (let attempt = 0; ; attempt++) {
    const remote = await ctx.adapter.read(path);
    const merged = remote ? mergeRecords(local, migrate(JSON.parse(new TextDecoder().decode(remote.bytes)))) : local;
    const bytes = encode(merged);
    try {
      if (!remote || (await contentHash(bytes)) !== remote.file.hash) await ctx.adapter.write(path, bytes, { ifRev: remote?.file.rev ?? null });
    } catch (e) {
      if (e instanceof ConflictError && attempt < 4) continue;
      throw e;
    }
    await syncPhotos(merged, ctx);
    return { record: merged, pulled: !sameRecord(merged, local) };
  }
}

const photoIds = (r: FieldRecord) => [...r.testPits.flatMap((p) => p.photos.map((x) => x.id)), ...(r.siteMap ? [r.siteMap.imageId] : [])];
const ext = (type: string) => (/png/.test(type) ? '.png' : /jpe?g/.test(type) ? '.jpg' : '.bin');
const typeOf = (name: string) => (name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream');

async function syncPhotos(r: FieldRecord, ctx: SyncContext) {
  const ids = photoIds(r);
  if (!ids.length) return;
  const folder = photoFolder(r);
  const remote = new Map((await ctx.adapter.list(folder)).filter((e) => !e.folder).map((e) => [e.name.replace(/\.[^.]+$/, ''), e]));
  for (const id of ids) {
    const mine = await ctx.photos.getPhoto(id);
    const theirs = remote.get(id);
    if (mine && !theirs) {
      try {
        await ctx.adapter.write(`${folder}/${id}${ext(mine.type)}`, new Uint8Array(await mine.arrayBuffer()), { ifRev: null });
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e; // another device uploaded it meanwhile
      }
    } else if (!mine && theirs) {
      const got = await ctx.adapter.read(theirs.path);
      if (got) await ctx.photos.putPhoto(id, r.id, new Blob([got.bytes as BlobPart], { type: typeOf(theirs.name) }));
    }
  }
}

export type FilingStatus = 'written' | 'unchanged' | 'renamed' | 'blocked';
export interface FilingResult {
  kind: GeneratedFile['kind'];
  path: string;
  status: FilingStatus;
}

/**
 * Files deliverables under their conventional names. A file may be replaced only if the app wrote
 * it (it is in `record.filed`) and nobody has changed it since (same content hash). Otherwise the
 * app writes `… (Site Eval App).ext` beside it, under the same rule. Returns the record with
 * `filed` updated; sync it afterwards so other devices learn which files are the app's.
 */
export async function fileDeliverables(
  record: FieldRecord,
  files: GeneratedFile[],
  ctx: SyncContext,
  at = new Date().toISOString(),
): Promise<{ record: FieldRecord; results: FilingResult[] }> {
  await checkFolder(record, ctx.adapter);
  const filed = { ...record.filed };
  const results: FilingResult[] = [];
  for (const f of files) {
    if (f.kind === 'field-record-json') continue; // the synced record in the app folder is the raw field record
    const target = deliverablePath(record, f.kind);
    const hash = await contentHash(f.bytes);
    let result: FilingResult = { kind: f.kind, path: target, status: 'blocked' };
    for (const path of [target, alternatePath(target)]) {
      const status = await fileOne(path, f.bytes, hash, filed, ctx, at);
      if (status) {
        result = { kind: f.kind, path, status: status === 'written' && path !== target ? 'renamed' : status };
        break;
      }
    }
    results.push(result);
  }
  return { record: stampEdits(record, { ...record, filed }, ctx.who, at), results };
}

async function fileOne(path: string, bytes: Uint8Array, hash: string, filed: FieldRecord['filed'], ctx: SyncContext, at: string) {
  const key = path.toLowerCase();
  let current = await ctx.adapter.stat(path);
  if (!current) {
    try {
      const w = await ctx.adapter.write(path, bytes, { ifRev: null });
      filed[key] = { path: w.path, hash: w.hash, at };
      return 'written' as const;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      current = await ctx.adapter.stat(path);
      if (!current) return null;
    }
  }
  const mine = filed[key];
  if (!mine || mine.hash !== current.hash) return null; // not the app's file, or changed by someone since
  if (current.hash === hash) return 'unchanged' as const;
  try {
    const w = await ctx.adapter.write(path, bytes, { ifRev: current.rev });
    filed[key] = { path: w.path, hash: w.hash, at };
    return 'written' as const;
  } catch (e) {
    if (e instanceof ConflictError) return null;
    throw e;
  }
}

export type PrintableKind = 'soil-log-pdf' | 'perc-test-pdf' | 'groundwater-pdf';

/** Drops PDFs into the office print queue (new, time-stamped names: never replaces anything). */
export async function sendToPrintQueue(record: FieldRecord, files: GeneratedFile[], kinds: PrintableKind[], ctx: SyncContext, at = new Date()) {
  const sent: string[] = [];
  for (const kind of kinds) {
    const f = files.find((x) => x.kind === kind);
    if (!f) continue;
    sent.push((await ctx.adapter.write(printQueuePath(record, kind, at), f.bytes, { ifRev: null })).path);
  }
  return sent;
}

