// App-side sync service: stamps edits, keeps the outbox, and syncs it to Dropbox whenever there
// is a connection (after edits, when the phone comes back online, and every 30 s while open).
import { useEffect, useState } from 'preact/hooks';
import type { FieldRecord, TestPit } from '../domain/fieldRecord';
import { mergeRecords, sameRecord, stampEdits } from '../domain/merge';
import type { OutboxEntry, RecordStore } from '../storage/db';
import { AuthError, FakeSync, OfflineError, type SyncAdapter } from '../sync/adapter';
import { DropboxSync } from '../sync/dropbox';
import { GoogleSignInNeeded, OfficeDropbox, type OfficeDropboxToken } from '../sync/office';
import { freshIdToken, signedInUser } from './google';
import { fileDeliverables, MissingFolderError, NoFolderError, sendToPrintQueue, syncRecord, type FilingResult, type PrintableKind, type SyncContext } from '../sync/engine';
import { photoSource } from './deliverables';
import { loadTemplates } from './templates';
import { settings } from './settings';
import { FEATURES } from './features';
import { openFlags } from '../domain/pitChecks';
import { updateTestPit } from '../domain/fieldRecord';
import type { AiReview } from '../domain/aiReview';
import { dropboxFolder, REVIEW_SERVICE } from '../sync/naming';
import { planProjectFolder, resolveProjectFolder, type FolderPlan } from '../sync/projectFolder';

export interface RecordSyncStatus {
  at?: string;
  error?: string;
  /** The deliverable folder is not in the connected account (or is not a sound path): choose another. */
  folderMissing?: boolean;
  filed?: FilingResult[];
  filedAt?: string;
  printed?: string[];
  /** Why the soil log was not filed (open pit checks); the rest was. */
  held?: string;
  /** Set while the evaluation has no usable folder: what the project number points to in this account. */
  plan?: FolderPlan;
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
  /** Only a new Google sign-in gets Dropbox access back (the office session ended). */
  needsGoogle?: boolean;
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
  private office: OfficeDropbox;
  private adapter?: SyncAdapter;
  private timer?: ReturnType<typeof setTimeout>;
  private open?: string;
  private lastFiled: Record<string, number> = {};
  private running?: Promise<void>;
  private again = false;

  constructor(private store: RecordStore) {
    this.office = new OfficeDropbox({
      fetch: (...a) => fetch(...a),
      getSetting: (k) => store.getSetting(k),
      setSetting: (k, v) => store.setSetting(k, v),
      idToken: async () => freshIdToken(),
    });
  }

  async init(): Promise<void> {
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
      // Dropbox comes only through the office PC now; a phone's own old connection (Connect Dropbox or a setup
      // link, possibly to the wrong account) is dropped.
      if (await this.store.getSetting('dropbox')) await this.store.setSetting('dropbox', undefined);
      if (signedInUser()) await this.useOffice();
    }
    const who = (await this.store.getSetting<string>('editor')) || signedInUser()?.name || this.state.account || 'This device';
    this.set({ who, pending: Object.fromEntries((await this.store.outbox()).map((e) => [e.recordId, e])) });
    addEventListener('online', () => {
      this.set({ online: true });
      this.kick(0);
    });
    addEventListener('offline', () => this.set({ online: false }));
    setInterval(() => this.kick(0), AUTO_MS);
    this.kick(0);
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

  /** Files through the office PC's Dropbox connection (src/sync/office.ts). */
  private async useOffice() {
    const last = await this.store.getSetting<OfficeDropboxToken>('officeDropbox');
    const account = last?.accountName ?? '';
    const adapter = new DropboxSync(async () => {
      const t = await this.office.accessToken();
      if (t.accountName && t.accountName !== this.state.account) {
        adapter.account = t.accountName;
        this.set({ account: t.accountName });
      }
      return t.accessToken;
    }, account);
    this.adapter = adapter;
    this.set({ connected: true, account });
  }

  /** After the Google button: starts the office session now, while the ID token is fresh. */
  async signedIn(idToken: string, name: string) {
    if (this.state.fake) return;
    if (this.state.who === 'This device') await this.setWho(name);
    this.set({ error: undefined, needsGoogle: false });
    if (!this.adapter) await this.useOffice();
    try {
      await this.office.session(idToken);
    } catch (e: any) {
      // No signal or the office PC is off: the token stays usable for an hour, and later syncs retry.
      if (!(e instanceof OfflineError)) this.set({ error: e.message, needsGoogle: e instanceof GoogleSignInNeeded });
    }
    this.kick(0);
  }

  /** Settings › Sign out: this device keeps its saved work but loses Dropbox until someone signs in again. */
  async signedOut() {
    await this.office.forget();
    if (!this.state.fake) {
      this.adapter = undefined;
      this.set({ connected: false, account: '', error: undefined, needsGoogle: false });
    }
  }

  async setWho(name: string) {
    await this.store.setSetting('editor', name);
    this.set({ who: name });
  }

  getAdapter(): SyncAdapter | undefined {
    return this.adapter;
  }

  /** Stores an AI review on its wall like an edit (stamped, synced) and shows it in open views. */
  saveReview(recordId: string, wallId: string, review: AiReview): Promise<FieldRecord | undefined> {
    return this.patchWall(recordId, wallId, { aiReview: review });
  }

  /** Saves a change to one wall from outside its screen (stamped, synced) and shows it in open views. */
  async patchWall(recordId: string, wallId: string, patch: Partial<Omit<TestPit, 'id'>>): Promise<FieldRecord | undefined> {
    let edited = false;
    const saved = await this.store.update(recordId, (cur) => {
      if (!cur?.testPits.some((p) => p.id === wallId)) return undefined;
      edited = true;
      return this.recordEdited(cur, updateTestPit(cur, wallId, patch));
    });
    if (edited && saved) for (const fn of this.recordListeners) fn(saved);
    return saved;
  }

  /** The review service URL the office PC publishes in Dropbox (ticket 11), else in the gist; the last one read when offline. */
  async reviewServiceUrl(): Promise<string | undefined> {
    const cached = await this.store.getSetting<string>('reviewServiceUrl');
    try {
      const got = this.adapter && (await this.adapter.read(REVIEW_SERVICE));
      const url = got && JSON.parse(new TextDecoder().decode(got.bytes)).url;
      if (typeof url === 'string' && /^https?:\/\//.test(url)) {
        if (url !== cached) await this.store.setSetting('reviewServiceUrl', url);
        return url;
      }
    } catch {}
    return (await this.office.serviceUrl(true)) ?? cached;
  }

  /** Stamps the change, queues it, and schedules a sync. Returns the record to save. */
  recordEdited(prev: FieldRecord, next: FieldRecord): FieldRecord {
    const stamped = stampEdits(prev, next, this.state.who);
    if (next.demo) return stamped;
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

  /** Creates the missing project folder the user confirmed, then files there. */
  async createProjectFolder(recordId: string, folder: string) {
    await this.adapter!.createFolder(folder);
    const saved = await this.store.update(recordId, (latest) =>
      latest && stampEdits(latest, { ...latest, deliverableFolder: folder, deliverableFolderSource: 'project' }, this.state.who),
    );
    if (saved) for (const fn of this.recordListeners) fn(saved);
    this.setRecord(recordId, { plan: undefined, error: undefined, folderMissing: false });
    await this.syncNow(recordId);
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
          if (this.state.error) this.set({ error: undefined, needsGoogle: false });
        } catch (e: any) {
          if (e instanceof OfflineError) {
            this.set({ online: navigator.onLine });
            this.setRecord(id, { error: navigator.onLine ? e.message : undefined });
            break;
          }
          if (e instanceof AuthError) {
            this.set({ error: e.message, needsGoogle: e instanceof GoogleSignInNeeded });
            if (!(e instanceof GoogleSignInNeeded) && !this.state.fake) await this.office.dropToken();
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
    let local = await this.store.get(id);
    if (!local) {
      if (entry) await this.dequeue(id, entry);
      return;
    }
    if (local.demo) {
      if (entry) await this.dequeue(id, entry);
      return;
    }
    const observed = local;
    const automatic = local.deliverableFolderSource === 'project';
    let resolvedFolder = await resolveProjectFolder(this.adapter!, local.header.projectNumber, automatic ? '' : local.deliverableFolder);
    let plan: FolderPlan | undefined;
    if (!resolvedFolder && (automatic || !local.deliverableFolder)) {
      plan = await planProjectFolder(this.adapter!, local.header, local.deliverableFolder);
      // No readable project number: file to the evaluation's own fallback folder, once there is a pit
      // to file (so the folder is named after the header, not after a half-typed one).
      if (plan.kind === 'fallback' && local.testPits.length) {
        await this.adapter!.createFolder(plan.folder);
        resolvedFolder = plan.folder;
        plan = undefined;
      }
    }
    this.setRecord(id, { plan });
    if (resolvedFolder !== local.deliverableFolder && (resolvedFolder || automatic)) {
      const saved = await this.store.update(id, (latest) => {
        // A slow account lookup must not replace a project edit or manual choice made meanwhile.
        if (!latest || latest.header.projectNumber !== observed.header.projectNumber || latest.deliverableFolder !== observed.deliverableFolder || latest.deliverableFolderSource !== observed.deliverableFolderSource) return undefined;
        const source = !automatic && resolvedFolder === dropboxFolder(observed.deliverableFolder) ? 'chosen' : 'project';
        return stampEdits(latest, { ...latest, deliverableFolder: resolvedFolder, deliverableFolderSource: source }, this.state.who);
      });
      if (saved) for (const fn of this.recordListeners) fn(saved);
    }
    local = await this.store.get(id);
    if (!local) return;
    if (local.header.projectNumber !== observed.header.projectNumber || (local.deliverableFolder !== resolvedFolder && local.deliverableFolder !== observed.deliverableFolder)) return;
    if (!local.deliverableFolder) {
      if (plan) return; // the Dropbox section shows the plan; the edit stays queued until there is a folder
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
      // Open pit checks hold the soil log files and its printing; the field record, perc tests and
      // groundwater results still file. Fixing or accepting a check is an edit, which files again.
      const open = openFlags(record).length;
      const files = (await generate(record, templates, { photo: photoSource(this.store), percTests: settings().percTests, groundwater: FEATURES.GROUNDWATER })).filter((f) => !open || !f.kind.startsWith('soil-log'));
      const out = await fileDeliverables(record, files, ctx);
      await this.saveMerged(out.record); // keep which files are the app's even if the next sync fails
      record = (await syncRecord(out.record, ctx)).record;
      await this.saveMerged(record);
      const printed: string[] = [];
      for (const kind of entry.print.filter((k) => !open || k !== 'soil-log-pdf')) {
        printed.push(...(await sendToPrintQueue(record, files, [kind], ctx)));
        await this.printed(id, kind); // a later failure must not print this one again
      }
      this.lastFiled[id] = Date.now();
      const held = open ? `Soil log not filed: ${open} pit check${open === 1 ? '' : 's'} open.` : undefined;
      this.setRecord(id, { filed: out.results, filedAt: new Date().toISOString(), held, ...(printed.length ? { printed } : {}) });
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
