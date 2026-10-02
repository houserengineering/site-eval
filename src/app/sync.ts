// App-side sync service: stamps edits, keeps the outbox, and syncs it to Dropbox whenever there
// is a connection (after edits, when the phone comes back online, and every 30 s while open).
import { useEffect, useState } from 'preact/hooks';
import type { FieldRecord } from '../domain/fieldRecord';
import { mergeRecords, sameRecord, stampEdits } from '../domain/merge';
import type { OutboxEntry, RecordStore } from '../storage/db';
import { AuthError, FakeSync, OfflineError, type SyncAdapter } from '../sync/adapter';
import { accountName, DropboxSync, finishSignIn, refreshAuth, startSignIn, type DropboxAuth } from '../sync/dropbox';
import { fileDeliverables, MissingFolderError, NoFolderError, sendToPrintQueue, syncRecord, type FilingResult, type PrintableKind, type SyncContext } from '../sync/engine';
import { photoSource } from './deliverables';
import { loadTemplates } from './templates';

export interface RecordSyncStatus {
  at?: string;
  error?: string;
  /** The deliverable folder is not in the connected account (or is not a sound path): choose another. */
  folderMissing?: boolean;
  filed?: FilingResult[];
  filedAt?: string;
  printed?: string[];
}

export interface SyncState {
  /** Signed in to Dropbox (or using the test fake). */
  connected: boolean;
  account: string;
  /** Name stamped on this device's edits. */
  who: string;
  online: boolean;
  busy: boolean;
  /** Outbox, by record id. */
  pending: Record<string, OutboxEntry>;
  records: Record<string, RecordSyncStatus>;
  /** Problem not tied to one record (sign-in). */
  error?: string;
  fake: boolean;
}

const FAKE_FLAG = 'site-eval:fake-dropbox';
/** Deliverables are regenerated at most this often while editing (Sync now forces it). */
const FILE_EVERY_MS = 60_000;
const AUTO_MS = 30_000;

type Listener = (s: SyncState) => void;

export class SyncService {
  state: SyncState = { connected: false, account: '', who: '', online: navigator.onLine, busy: false, pending: {}, records: {}, fake: false };
  private listeners = new Set<Listener>();
  private recordListeners = new Set<(r: FieldRecord) => void>();
  private auth?: DropboxAuth;
  private adapter?: SyncAdapter;
  private timer?: ReturnType<typeof setTimeout>;
  private open?: string;
  private lastFiled: Record<string, number> = {};
  private running?: Promise<void>;
  private again = false;

  constructor(private store: RecordStore) {}

  async init(): Promise<string | undefined> {
    let returnTo: string | undefined;
    const params = new URLSearchParams(location.search);
    // `?fake-dropbox=Name` signs the fake in as another account (the 0271 wrong-account case).
    const saved = safeGet(FAKE_FLAG);
    const fake = params.has('fake-dropbox') ? params.get('fake-dropbox') || 'Test Dropbox' : saved === '1' ? 'Test Dropbox' : saved;
    if (fake) {
      safeSet(FAKE_FLAG, fake);
      const f: FakeSync = ((window as any).__fakeDropbox ??= new FakeSync([], fake));
      // The fake follows the browser's connection, like the real API would.
      f.offline = !navigator.onLine;
      addEventListener('online', () => (f.offline = false));
      addEventListener('offline', () => (f.offline = true));
      this.adapter = f;
      this.set({ connected: true, account: f.account, fake: true });
    } else {
      try {
        const done = await finishSignIn();
        if (done) {
          await this.store.setSetting('dropbox', done.auth);
          returnTo = done.hash;
        }
      } catch (e: any) {
        this.set({ error: e.message });
      }
      this.auth = await this.store.getSetting<DropboxAuth>('dropbox');
      if (this.auth) {
        this.adapter = new DropboxSync(() => this.token(), this.auth.accountName);
        this.set({ connected: true, account: this.auth.accountName });
      }
    }
    const who = (await this.store.getSetting<string>('editor')) || this.state.account || 'This device';
    this.set({ who, pending: Object.fromEntries((await this.store.outbox()).map((e) => [e.recordId, e])) });
    addEventListener('online', () => {
      this.set({ online: true });
      this.kick(0);
    });
    addEventListener('offline', () => this.set({ online: false }));
    setInterval(() => this.kick(0), AUTO_MS);
    this.kick(0);
    return returnTo;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Called with records merged from Dropbox so open views show the other device's edits. */
  onRecord(fn: (r: FieldRecord) => void) {
    this.recordListeners.add(fn);
    return () => void this.recordListeners.delete(fn);
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private setRecord(id: string, patch: RecordSyncStatus) {
    this.set({ records: { ...this.state.records, [id]: { ...this.state.records[id], ...patch } } });
  }

  private async token(): Promise<string> {
    if (!this.auth) throw new AuthError('Connect Dropbox first.');
    if (this.auth.expiresAt - Date.now() < 5 * 60_000 && this.auth.refreshToken) {
      this.auth = await refreshAuth(this.auth);
      await this.store.setSetting('dropbox', this.auth);
    }
    return this.auth.accessToken;
  }

  connect() {
    return startSignIn();
  }

  /** Signs in with an access token generated in the Dropbox app console (lasts about 4 hours). */
  async useAccessToken(token: string) {
    const t = token.trim();
    const auth: DropboxAuth = { accessToken: t, expiresAt: Date.now() + 4 * 3600_000, accountName: await accountName(t) };
    await this.store.setSetting('dropbox', auth);
    this.auth = auth;
    this.adapter = new DropboxSync(() => this.token(), auth.accountName);
    this.set({ connected: true, account: auth.accountName, error: undefined });
    if (this.state.who === 'This device') await this.setWho(auth.accountName);
    this.kick(0);
  }

  async disconnect() {
    await this.store.setSetting('dropbox', undefined);
    this.auth = undefined;
    this.adapter = this.state.fake ? this.adapter : undefined;
    this.set({ connected: this.state.fake, account: this.state.fake ? this.state.account : '' });
  }

  async setWho(name: string) {
    await this.store.setSetting('editor', name);
    this.set({ who: name });
  }

  getAdapter(): SyncAdapter | undefined {
    return this.adapter;
  }

  /** Stamps the change, queues it, and schedules a sync. Returns the record to save. */
  recordEdited(prev: FieldRecord, next: FieldRecord): FieldRecord {
    const stamped = stampEdits(prev, next, this.state.who);
    if (stamped !== next || stamped.deliverableFolder !== prev.deliverableFolder) this.queue(stamped.id, {});
    return stamped;
  }

  async queue(recordId: string, extra: { print?: PrintableKind[]; deliverables?: boolean }) {
    const cur = this.state.pending[recordId];
    const e: OutboxEntry = {
      recordId,
      changedAt: new Date().toISOString(),
      deliverables: (cur?.deliverables ?? false) || (extra.deliverables ?? true),
      print: [...new Set([...(cur?.print ?? []), ...(extra.print ?? [])])],
    };
    this.set({ pending: { ...this.state.pending, [recordId]: e } });
    await this.store.putOutbox(e);
    this.kick(extra.print?.length ? 0 : 4000);
  }

  /** The record on screen is also pulled now and then, for the other device's edits. */
  watch(recordId: string | undefined) {
    this.open = recordId;
    if (recordId) this.kick(0);
  }

  /** Sync now: also regenerates and files deliverables straight away. */
  async syncNow(recordId: string) {
    this.lastFiled[recordId] = 0;
    await this.queue(recordId, {});
    await this.run();
  }

  async printAtOffice(recordId: string, kinds: PrintableKind[]) {
    this.lastFiled[recordId] = 0;
    await this.queue(recordId, { print: kinds });
  }

  private kick(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runOnce().finally(() => {
      this.running = undefined;
      if (this.again) {
        this.again = false;
        this.kick(1000);
      }
    });
    return this.running;
  }

  private async runOnce() {
    if (!this.adapter || !this.state.connected) return;
    const ids = new Set(Object.keys(this.state.pending));
    if (this.open) ids.add(this.open);
    if (!ids.size) return;
    this.set({ busy: true });
    try {
      for (const id of ids) {
        try {
          await this.syncOne(id);
          this.setRecord(id, { error: undefined, folderMissing: false });
        } catch (e: any) {
          if (e instanceof OfflineError) {
            this.set({ online: navigator.onLine });
            this.setRecord(id, { error: navigator.onLine ? e.message : undefined });
            break;
          }
          if (e instanceof AuthError) {
            this.set({ error: e.message });
            break;
          }
          const folder = e instanceof NoFolderError || e instanceof MissingFolderError;
          this.setRecord(id, { error: folder ? e.message : `Sync failed: ${e.message}`, folderMissing: e instanceof MissingFolderError });
        }
      }
    } finally {
      this.set({ busy: false });
    }
  }

  private async syncOne(id: string) {
    const entry = this.state.pending[id]; // before reading the record: an edit queued meanwhile stays queued
    const local = await this.store.get(id);
    if (!local) {
      if (entry) await this.dequeue(id, entry);
      return;
    }
    if (!local.deliverableFolder) {
      if (entry) throw new NoFolderError();
      return;
    }
    const ctx: SyncContext = { adapter: this.adapter!, photos: this.store, who: this.state.who };
    let { record } = await syncRecord(local, ctx);
    await this.saveMerged(record);
    this.setRecord(id, { at: new Date().toISOString() });

    const due = entry && (entry.deliverables || entry.print.length) && Date.now() - (this.lastFiled[id] ?? 0) >= FILE_EVERY_MS;
    if (due) {
      const [{ generate }, templates] = await Promise.all([import('../generator'), loadTemplates()]);
      const files = await generate(record, templates, { photo: photoSource(this.store) });
      const out = await fileDeliverables(record, files, ctx);
      await this.saveMerged(out.record); // keep which files are the app's even if the next sync fails
      record = (await syncRecord(out.record, ctx)).record;
      await this.saveMerged(record);
      const printed: string[] = [];
      for (const kind of entry.print) {
        printed.push(...(await sendToPrintQueue(record, files, [kind], ctx)));
        await this.printed(id, kind); // a later failure must not print this one again
      }
      this.lastFiled[id] = Date.now();
      this.setRecord(id, { filed: out.results, filedAt: new Date().toISOString(), ...(printed.length ? { printed } : {}) });
      await this.dequeue(id, entry);
    } else if (entry && !entry.deliverables && !entry.print.length) await this.dequeue(id, entry);
  }

  /** Saves what came back from Dropbox, merged (atomically) with anything edited here meanwhile. */
  private async saveMerged(synced: FieldRecord) {
    let changed = false;
    const saved = await this.store.update(synced.id, (latest) => {
      const next = latest ? mergeRecords(latest, synced) : synced;
      changed = !latest || !sameRecord(next, latest) || JSON.stringify(next.filed) !== JSON.stringify(latest.filed);
      return changed ? next : undefined;
    });
    if (changed && saved) for (const fn of this.recordListeners) fn(saved);
  }

  private async printed(id: string, kind: PrintableKind) {
    const cur = this.state.pending[id];
    if (!cur) return;
    const rest = { ...cur, print: cur.print.filter((k) => k !== kind) };
    await this.store.putOutbox(rest);
    this.set({ pending: { ...this.state.pending, [id]: rest } });
  }

  /** Clears the outbox entry unless something new was queued while syncing. */
  private async dequeue(id: string, handled: OutboxEntry) {
    const cur = this.state.pending[id];
    if (cur && cur.changedAt !== handled.changedAt) {
      const rest = { ...cur, print: cur.print.filter((k) => !handled.print.includes(k)) };
      await this.store.putOutbox(rest);
      this.set({ pending: { ...this.state.pending, [id]: rest } });
      return;
    }
    const { [id]: _, ...pending } = this.state.pending;
    await this.store.removeOutbox(id);
    this.set({ pending });
  }
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

let service: SyncService | undefined;
export const setSyncService = (s: SyncService) => (service = s);
export const syncService = () => service!;

export function useSyncState(): SyncState {
  const [s, setS] = useState(() => service!.state);
  useEffect(() => {
    const off = service!.subscribe(setS);
    setS(service!.state); // catch up on changes made before this subscribed
    return off;
  }, []);
  return s;
}
