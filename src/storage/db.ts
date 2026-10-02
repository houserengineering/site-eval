// On-device persistence (IndexedDB). Every edit is saved immediately.
import { openDB } from 'idb';
import type { CertifierProfile } from '../domain/certify';
import { migrate, type FieldRecord } from '../domain/fieldRecord';

const STORE = 'fieldRecords';
/** Pit photo bytes by photo id (records hold only PhotoRefs). */
const PHOTOS = 'photos';
/** Settings that belong to this device only, never synced (the certifier's signature). */
const DEVICE = 'device';

export interface RecordStore {
  /** Readable records, newest first; records this app cannot read are reported, not hidden. */
  list(): Promise<{ records: FieldRecord[]; unreadable: { id: string; error: string }[] }>;
  get(id: string): Promise<FieldRecord | undefined>;
  save(r: FieldRecord): Promise<void>;
  /** Writes without validation (import/sync paths, tests). */
  saveRaw(r: unknown): Promise<void>;
  remove(id: string): Promise<void>;
  putPhoto(id: string, recordId: string, blob: Blob): Promise<void>;
  getPhoto(id: string): Promise<Blob | undefined>;
  removePhoto(id: string): Promise<void>;
  getCertifier(): Promise<CertifierProfile | undefined>;
  setCertifier(p: CertifierProfile | undefined): Promise<void>;
}

export async function openStore(name = 'site-eval'): Promise<RecordStore> {
  let refuse: (e: Error) => void = () => {};
  const blocked = new Promise<never>((_, reject) => (refuse = reject));
  const opening = openDB(name, 2, {
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
    async saveRaw(r) {
      await db.put(STORE, r);
    },
    async remove(id) {
      const tx = db.transaction([STORE, PHOTOS], 'readwrite');
      await tx.objectStore(STORE).delete(id);
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
  };
}
