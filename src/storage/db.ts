// On-device persistence (IndexedDB). Every edit is saved immediately.
import { openDB } from 'idb';
import { migrate, type FieldRecord } from '../domain/fieldRecord';

const STORE = 'fieldRecords';

export interface RecordStore {
  /** Readable records, newest first; records this app cannot read are reported, not hidden. */
  list(): Promise<{ records: FieldRecord[]; unreadable: { id: string; error: string }[] }>;
  get(id: string): Promise<FieldRecord | undefined>;
  save(r: FieldRecord): Promise<void>;
  /** Writes without validation (import/sync paths, tests). */
  saveRaw(r: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

export async function openStore(name = 'site-eval'): Promise<RecordStore> {
  const db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' });
    },
  });
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
      await db.delete(STORE, id);
    },
  };
}
