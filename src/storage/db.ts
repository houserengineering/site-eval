// On-device persistence (IndexedDB). Every edit is saved immediately.
import { openDB } from 'idb';
import type { CertifierProfile } from '../domain/certify';
import { migrate, type FieldRecord } from '../domain/fieldRecord';
import type { PrintableKind } from '../sync/engine';

const STORE = 'fieldRecords';
/** Pit photo bytes by photo id (records hold only PhotoRefs). */
const PHOTOS = 'photos';
/** Settings that belong to this device only, never synced (the certifier's signature, Dropbox sign-in). */
const DEVICE = 'device';
/** Records with changes not yet in Dropbox, and what else is waiting for them. */
const OUTBOX = 'outbox';

export interface OutboxEntry {
  recordId: string;
  /** When the latest unsynced change was saved. */
  changedAt: string;
  /** Deliverables need regenerating and filing. */
  deliverables: boolean;
  /** PDFs waiting to go to the office print queue. */
  print: PrintableKind[];
}

export interface RecordStore {
  /** Readable records, newest first; records this app cannot read are reported, not hidden. */
  list(): Promise<{ records: FieldRecord[]; unreadable: { id: string; error: string }[] }>;
  get(id: string): Promise<FieldRecord | undefined>;
  save(r: FieldRecord): Promise<void>;
  /** Read-modify-write in one transaction (`fn` must be synchronous); returns what was saved. */
  update(id: string, fn: (cur: FieldRecord | undefined) => FieldRecord | undefined): Promise<FieldRecord | undefined>;
  /** Writes without validation (import/sync paths, tests). */
  saveRaw(r: unknown): Promise<void>;
  remove(id: string): Promise<void>;
  putPhoto(id: string, recordId: string, blob: Blob): Promise<void>;
  getPhoto(id: string): Promise<Blob | undefined>;
  removePhoto(id: string): Promise<void>;
  getCertifier(): Promise<CertifierProfile | undefined>;
  setCertifier(p: CertifierProfile | undefined): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting(key: string, value: unknown): Promise<void>;
  outbox(): Promise<OutboxEntry[]>;
  putOutbox(e: OutboxEntry): Promise<void>;
  removeOutbox(recordId: string): Promise<void>;
}

export async function openStore(name = 'site-eval'): Promise<RecordStore> {
  let refuse: (e: Error) => void = () => {};
  const blocked = new Promise<never>((_, reject) => (refuse = reject));
  const opening = openDB(name, 3, {
    // An older copy of the app open in another tab holds the old database version.
    blocked() {
      refuse(new Error('another tab or window has an older version of this app open. Close it, then reload.'));
    },
    blocking() {
      db.close();
      if (typeof location !== 'undefined') location.reload();
    },
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore(STORE, { keyPath: 'id' });
      if (oldVersion < 2) {
        db.createObjectStore(PHOTOS, { keyPath: 'id' }).createIndex('recordId', 'recordId');
        db.createObjectStore(DEVICE);
      }
      if (oldVersion < 3) db.createObjectStore(OUTBOX, { keyPath: 'recordId' });
    },
  });
  const db = await Promise.race([opening, blocked]);
  return {
    async list() {
      const records: FieldRecord[] = [];
      const unreadable: { id: string; error: string }[] = [];
      for (const raw of await db.getAll(STORE)) {
        try {
          records.push(migrate(raw));
        } catch (e: any) {
          unreadable.push({ id: String(raw?.id), error: e.message });
        }
      }
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { records, unreadable };
    },
    async get(id) {
      const raw = await db.get(STORE, id);
      return raw === undefined ? undefined : migrate(raw);
    },
    async save(r) {
      await db.put(STORE, r);
    },
    async update(id, fn) {
      const tx = db.transaction(STORE, 'readwrite');
      const raw = await tx.store.get(id);
      const next = fn(raw === undefined ? undefined : migrate(raw));
      if (next) await tx.store.put(next);
      await tx.done;
      return next;
    },
    async saveRaw(r) {
      await db.put(STORE, r);
    },
    async remove(id) {
      const tx = db.transaction([STORE, PHOTOS, OUTBOX], 'readwrite');
      await tx.objectStore(STORE).delete(id);
      await tx.objectStore(OUTBOX).delete(id);
      for (const key of await tx.objectStore(PHOTOS).index('recordId').getAllKeys(id)) await tx.objectStore(PHOTOS).delete(key);
      await tx.done;
    },
    async putPhoto(id, recordId, blob) {
      // Stored as bytes: some browsers cannot keep Blobs in IndexedDB.
      await db.put(PHOTOS, { id, recordId, type: blob.type, bytes: await blob.arrayBuffer() });
    },
    async getPhoto(id) {
      const row = await db.get(PHOTOS, id);
      return row && new Blob([row.bytes], { type: row.type });
    },
    async removePhoto(id) {
      await db.delete(PHOTOS, id);
    },
    async getCertifier() {
      return db.get(DEVICE, 'certifier');
    },
    async setCertifier(p) {
      if (p) await db.put(DEVICE, p, 'certifier');
      else await db.delete(DEVICE, 'certifier');
    },
    async getSetting(key) {
      return db.get(DEVICE, key);
    },
    async setSetting(key, value) {
      if (value === undefined) await db.delete(DEVICE, key);
      else await db.put(DEVICE, value, key);
    },
    async outbox() {
      return db.getAll(OUTBOX);
    },
    async putOutbox(e) {
      await db.put(OUTBOX, e);
    },
    async removeOutbox(recordId) {
      await db.delete(OUTBOX, recordId);
    },
  };
}
