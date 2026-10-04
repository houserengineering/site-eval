// Dropbox UI: the sync status line, the per-site-evaluation Dropbox section (how it works, account,
// destination folder, one main action, backup), connecting Dropbox, and opening a site evaluation from Dropbox.

import { useEffect, useState } from 'preact/hooks';
import { backupName, makeBackup } from '../domain/backup';
import type { FieldRecord } from '../domain/fieldRecord';
import { readJob } from '../domain/job';
import { migrate } from '../domain/fieldRecord';
import type { RecordStore } from '../storage/db';
import type { RemoteEntry } from '../sync/adapter';
import { APP_FOLDER, dropboxFolder, folderProblem, isFieldRecordName, projectFolder, SERVER_ROOT } from '../sync/naming';
import { resolveProjectFolder, type FolderPlan } from '../sync/projectFolder';
import { syncRecord, type FilingResult } from '../sync/engine';
import { go } from './App';
import { download } from './deliverables';
import { TextField } from './fields';
import { syncService, useSyncState, type SyncState } from './sync';
import { dropboxSetupLink, takeDropboxSetupResult } from './dropboxSetup';

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

/** One line: where this site evaluation stands with Dropbox. */
export function syncLine(s: SyncState, r: FieldRecord): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const rs = s.records[r.id] ?? {};
  const entry = s.pending[r.id];
  // The record reached Dropbox after the last change; only the deliverables wait (refreshed each minute).
  const recordSynced = !!rs.at && (!entry || rs.at >= entry.changedAt);
  const waiting = !!entry && !recordSynced;
  if (!s.connected) return { text: 'Saved on this device. Dropbox not connected.', tone: 'warn' };
  if (s.error) return { text: s.error, tone: 'bad' };
  if (!r.deliverableFolder) {
    const p = rs.plan;
    if (p?.kind === 'missing') return { text: `Waiting for your OK to create the project folder ${p.folder}. Saved on this device until then.`, tone: 'warn' };
    if (p?.kind === 'wrong-account') return { text: `Wrong Dropbox account: ${s.account || 'this account'} has no ${SERVER_ROOT}/Office folder. Nothing was created or filed. Connect the Houser Dropbox account.`, tone: 'bad' };
    if (p?.kind === 'fallback') return { text: `Saved on this device. No project number, so it saves to ${p.folder} once you add a test pit.`, tone: 'warn' };
    return { text: 'Saved on this device. Choose a Dropbox folder to sync.', tone: 'warn' };
  }
  if (rs.error) return { text: rs.error, tone: 'bad' };
  if (s.busy && waiting) return { text: 'Syncing…', tone: 'ok' };
  if (waiting) return { text: s.online ? 'Saved on this device. Syncing shortly.' : 'Saved on this device. Will sync when there is signal.', tone: 'warn' };
  if (rs.at) return { text: `Synced to Dropbox ${time(rs.at)}.${entry?.print.length ? ' Printing at the office shortly.' : entry ? ' Deliverables refresh within a minute.' : ''}`, tone: 'ok' };
  return { text: 'Saved on this device.', tone: 'ok' };
}

export function SyncStatus({ record }: { record: FieldRecord }) {
  const s = useSyncState();
  const line = record.demo ? { text: 'Demo: saved on this device only. Nothing goes to Dropbox.', tone: 'ok' } : syncLine(s, record);
  return (
    <p class={`sync-line ${line.tone}`} role="status">
      {line.text}
    </p>
  );
}

const STATUS_TEXT: Record<FilingResult['status'], string> = {
  written: 'filed',
  unchanged: 'up to date',
  renamed: 'filed under this name (an office file has the usual name)',
  blocked: 'NOT filed: both names belong to office files',
};

export function DropboxSection(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const s = useSyncState();
  const rs = s.records[r.id] ?? {};
  const [choosing, setChoosing] = useState(false);
  const [note, setNote] = useState<string>();
  const sync = syncService();

  const backup = async () => {
    const text = await makeBackup(r, (id) => props.store.getPhoto(id));
    const name = backupName(r);
    download(new Blob([text], { type: 'application/json' }), name);
    setNote(`Saved ${name}. Keep it off this phone (email it or save it to Drive).`);
  };

  if (r.demo)
    return (
      <section aria-labelledby="dbx">
        <h2 id="dbx">Dropbox</h2>
        <p class="hint">On a real job, connect Dropbox here once. The soil logs, photos and field record are then saved to the project folder. It is turned off for this practice job.</p>
      </section>
    );
  const folder = r.deliverableFolder ? dropboxFolder(r.deliverableFolder) : '';
  const plan = folder ? undefined : rs.plan;
  const wrongAccount = plan?.kind === 'wrong-account';
  // One main action at a time: create the missing folder, fix the account, pick another folder, or sync.
  const main = plan?.kind === 'missing' ? 'create' : wrongAccount ? 'account' : rs.folderMissing ? 'choose' : folder ? 'sync' : '';
  return (
    <section aria-labelledby="dbx">
      <h2 id="dbx">Dropbox</h2>
      <p class="hint">Connect Dropbox once. Each site evaluation then saves to its project folder on the Server: the soil logs, photos and field record.</p>
      <SyncStatus record={r} />
      {!s.connected && <ConnectDropbox />}
      {s.connected && (
        <dl class="dbx-facts">
          <div>
            <dt>Account</dt>
            <dd>
              <DropboxAccount account={s.account} fake={s.fake} main={main === 'account'} />
            </dd>
          </div>
          <div>
            <dt>Saves to</dt>
            <dd>
              <p class="path">{folder || (plan && !wrongAccount ? plan.folder : '') || 'Not chosen'}</p>
              <p class="hint">{folderState(r, plan, !!rs.folderMissing)}</p>
            </dd>
          </div>
        </dl>
      )}
      {s.connected && main === 'create' && !choosing && <CreateProjectFolder create={() => sync.createProjectFolder(r.id, plan!.folder)} />}
      {s.connected && main === 'sync' && !choosing && (
        <button class="btn primary block" onClick={() => sync.syncNow(r.id)} disabled={s.busy}>
          Sync now
        </button>
      )}
      {rs.filed && (
        <div class="filed">
          <p class="hint">Filed {time(rs.filedAt)}:</p>
          <ul class="filed-list">
            {rs.filed.map((f) => (
              <li key={f.kind} class={f.status === 'blocked' ? 'alert' : ''}>
                <span class="path">{f.path.slice(f.path.lastIndexOf('/') + 1)}</span> {STATUS_TEXT[f.status]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rs.held && (
        <p class="hint alert" role="status">
          {rs.held}
        </p>
      )}
      {rs.printed && <p class="hint">Sent to the office print queue: {rs.printed.map((p) => p.slice(p.lastIndexOf('/') + 1)).join(', ')}</p>}
      {/* No "Print at office" button: soil logs are only ever PDFs (Nathan, 2026-10-04). The print queue
          (sync.printAtOffice) is kept, unused. */}
      {s.connected && !choosing && (
        <div class="dbx-option">
          {main !== 'choose' && !wrongAccount && <p class="hint">The folder follows the project number. Change it only when this job files somewhere else, such as an older project number or another subproject.</p>}
          <button class={`btn ${main === 'choose' ? 'primary' : 'small'}`} onClick={() => setChoosing(true)}>
            {rs.folderMissing ? 'Choose another folder' : folder ? 'Change folder' : 'Choose folder'}
          </button>
        </div>
      )}
      {choosing && (
        <FolderBrowser
          start={folder || projectFolder(r.header.projectNumber) || SERVER_ROOT}
          project={r.header.projectNumber}
          action="Use this folder"
          onCancel={() => setChoosing(false)}
          onPick={(picked) => {
            props.save({ ...r, deliverableFolder: picked, deliverableFolderSource: 'chosen' });
            setChoosing(false);
          }}
        />
      )}
      {s.connected && <TextField label="Your name" value={s.who} onInput={(v) => sync.setWho(v)} autoCapitalize="words" hint={'Shown on your edits as "edited by".'} />}
      <div class="dbx-option">
        <p class="hint">A backup file is a full copy you can email when Dropbox is not an option.</p>
        <button class="btn small" onClick={backup}>
          Back up to a file
        </button>
      </div>
      {note && (
        <p class="status" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

/** What the destination folder is and why, in one sentence. */
function folderState(r: FieldRecord, plan: FolderPlan | undefined, missing: boolean): string {
  if (missing) return 'This folder is not in the connected account, so nothing is filed until you choose another.';
  if (r.deliverableFolder)
    return r.deliverableFolderSource === 'chosen' ? 'You chose this folder. It stays even if the project number changes.' : 'The project folder, found from the project number.';
  if (plan?.kind === 'missing') return 'This project folder is not in Dropbox yet.';
  if (plan?.kind === 'wrong-account') return 'Nothing is filed: this account has no Server/Office folder, so it is not the Houser account.';
  if (plan?.kind === 'fallback') return 'No project number, so it gets its own folder under Office once you add a test pit.';
  return 'Enter the project number at the top, or choose a folder.';
}

/** Which Dropbox account files go to. On 0271 the phone was signed in to another account and nothing reached the office. */
function DropboxAccount({ account, fake, main }: { account: string; fake: boolean; main: boolean }) {
  return (
    <>
      <p>
        Connected to Dropbox as <strong>{account || 'an unnamed account'}</strong>.
      </p>
      {main && <p class="hint">Disconnect, then connect again with your Houser Engineering login.</p>}
      {!fake && (
        <button class={`btn ${main ? 'primary' : 'small'}`} onClick={() => syncService().disconnect()}>
          Disconnect Dropbox
        </button>
      )}
    </>
  );
}

export function ConnectDropbox() {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const use = async () => {
    try {
      await syncService().useAccessToken(token);
      setToken('');
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div class="connect">
      <button class="btn primary block" onClick={() => syncService().connect()}>
        Connect Dropbox
      </button>
      <p class="hint">
        Easiest: open the phone setup link from the office once. Or tap Connect Dropbox, sign in to the Houser Dropbox (Justin Houser's account, the one with the Server
        folder) and tap Allow. If Dropbox shows another account, sign out of it at dropbox.com first.
      </p>
      <details>
        <summary>Sign-in not working?</summary>
        <p class="hint">The office can make an access token in the Dropbox app console. Paste it here. It lasts about 4 hours, then you connect again.</p>
        <TextField label="Access token" value={token} onInput={setToken} autoCapitalize="off" />
        <button class="btn small" onClick={use} disabled={!token.trim()}>
          Use token
        </button>
        {error && (
          <p class="alert" role="alert">
            {error}
          </p>
        )}
      </details>
    </div>
  );
}

/** Steps through Dropbox folders under the server root; a path can also be pasted. */
export function FolderBrowser(props: {
  start: string;
  project?: string;
  action?: string;
  onPick?: (folder: string) => void;
  onCancel?: () => void;
  /** Called with the folder's entries, so the caller can offer files in it. */
  renderFiles?: (folder: string, entries: RemoteEntry[]) => preact.ComponentChildren;
}) {
  const [folder, setFolder] = useState(props.start || SERVER_ROOT);
  const [typed, setTyped] = useState('');
  const [entries, setEntries] = useState<RemoteEntry[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!props.project) return;
    let live = true;
    resolveProjectFolder(syncService().getAdapter()!, props.project, props.start).then(
      (resolved) => { if (live) setFolder(resolved || SERVER_ROOT); },
      (e) => { if (live) setError(e.message); },
    );
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    setEntries(undefined);
    setError(undefined);
    syncService()
      .getAdapter()!
      .list(folder)
      .then(
        (e) => live && setEntries(e),
        (e) => live && setError(e.message),
      );
    return () => {
      live = false;
    };
  }, [folder]);
  const pick = async () => {
    const problem = folderProblem(folder);
    if (problem) return setError(problem);
    try {
      const adapter = syncService().getAdapter()!;
      if (!(await adapter.folderExists(folder))) return setError(`${folder} is not in the Dropbox account ${adapter.account}. Choose a folder that exists.`);
    } catch (e: any) {
      return setError(e.message);
    }
    props.onPick!(folder);
  };
  const up = folder.slice(0, folder.lastIndexOf('/')) || SERVER_ROOT;
  const folders = entries?.filter((e) => e.folder) ?? [];
  return (
    <div class="browser" role="group" aria-label="Dropbox folders">
      <p class="path">{folder}</p>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) {
            const path = dropboxFolder(typed);
            if (!path) setError('Enter a project number or a path inside the Dropbox Server folder.');
            else setFolder(path);
          }
          setTyped('');
        }}
      >
        <TextField label="Go to folder" value={typed} onInput={setTyped} autoCapitalize="off" hint="Project # (0271) or a pasted server path." />
      </form>
      {folder !== SERVER_ROOT && (
        <button class="btn small" onClick={() => setFolder(up)}>
          ‹ Up a folder
        </button>
      )}
      {error && (
        <p class="alert" role="alert">
          {error}
        </p>
      )}
      {!entries && !error && <p class="muted">Loading…</p>}
      {entries && props.renderFiles?.(folder, entries)}
      {entries && (
        <ul class="list">
          {folders.map((f) => (
            <li key={f.path}>
              <button class="row-link folder" onClick={() => setFolder(f.path)}>
                <span class="row-title">
                  <span aria-hidden="true">📁 </span>
                  {f.name}
                </span>
              </button>
            </li>
          ))}
          {!folders.length && <li class="muted">No subfolders.</li>}
        </ul>
      )}
      {props.onPick && (
        <div class="btn-row">
          <button class="btn primary" onClick={pick}>
            {props.action ?? 'Choose'}
          </button>
          <button class="btn" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** Home → Open from Dropbox: a synced site evaluation (join it) or a job file (start it). */
export function DropboxOpenView({ store }: { store: RecordStore }) {
  const s = useSyncState();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const open = async (deliverableFolder: string, file: RemoteEntry) => {
    setBusy(`Opening ${file.name}…`);
    setProblem(undefined);
    try {
      const adapter = syncService().getAdapter()!;
      const got = await adapter.read(file.path);
      if (!got) throw new Error('The file is gone.');
      const text = new TextDecoder().decode(got.bytes);
      let record: FieldRecord;
      if (isFieldRecordName(file.name)) {
        const remote = migrate(JSON.parse(text));
        const local = await store.get(remote.id);
        record = (await syncRecord(local ?? remote, { adapter, photos: store, who: s.who })).record;
      } else {
        const job = readJob(text);
        if (job.mapImage) await store.putPhoto(job.mapImage.id, job.record.id, job.mapImage.blob);
        record = { ...job.record, deliverableFolder };
      }
      await store.save(record);
      if (!isFieldRecordName(file.name)) await syncService().queue(record.id, { deliverables: false });
      go(`#/se/${record.id}`);
    } catch (e: any) {
      setProblem(`Could not open ${file.name}: ${e.message}`);
      setBusy(undefined);
    }
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href="#/" aria-label="All site evaluations">
          ‹
        </a>
        <h1>Open from Dropbox</h1>
      </header>
      {!s.connected && <ConnectDropbox />}
      {s.connected && (
        <>
          <p class="hint">
            Go to the project's site evaluation folder. Site evaluations already started on another phone and job files are listed there.
          </p>
          <FolderBrowser
            start={SERVER_ROOT}
            renderFiles={(folder, entries) => <AppFiles folder={folder} entries={entries} onOpen={open} />}
          />
        </>
      )}
      {busy && (
        <p class="status" role="status">
          {busy}
        </p>
      )}
      {problem && (
        <p class="alert" role="alert">
          {problem}
        </p>
      )}
    </main>
  );
}

function AppFiles(props: { folder: string; entries: RemoteEntry[]; onOpen: (deliverableFolder: string, f: RemoteEntry) => void }) {
  const [files, setFiles] = useState<RemoteEntry[]>([]);
  const inApp = props.folder.endsWith(`/${APP_FOLDER}`);
  const deliverableFolder = inApp ? props.folder.slice(0, -APP_FOLDER.length - 1) : props.folder;
  useEffect(() => {
    let live = true;
    const pick = (es: RemoteEntry[]) => es.filter((e) => !e.folder && (isFieldRecordName(e.name) || /job\.json$/i.test(e.name)));
    if (inApp) setFiles(pick(props.entries));
    else if (props.entries.some((e) => e.folder && e.name === APP_FOLDER))
      syncService()
        .getAdapter()!
        .list(`${props.folder}/${APP_FOLDER}`)
        .then((es) => live && setFiles(pick(es)), () => live && setFiles([]));
    else setFiles([]);
    return () => {
      live = false;
    };
  }, [props.folder, props.entries]);
  if (!files.length) return null;
  return (
    <ul class="list open-files" aria-label="Site evaluations in this folder">
      {files.map((f) => (
        <li key={f.path}>
          <button class="row-link" onClick={() => props.onOpen(deliverableFolder, f)}>
            <span class="row-title">{isFieldRecordName(f.name) ? 'Site evaluation in progress' : 'Start from job file'}</span>
            <span class="row-sub">{f.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A readable project number without a folder: show the exact path, create it after one OK (Nathan, 2026-10-04). */
function CreateProjectFolder(props: { create: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await props.create();
    } catch (e: any) {
      setError(`Could not create the folder: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="create-folder">
      <p>Create this folder and save this site evaluation there?</p>
      <p class="hint">Wrong project number? Fix it at the top instead.</p>
      <button class="btn primary" onClick={create} disabled={busy}>
        {busy ? 'Creating…' : 'Create folder'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

/** Settings › Dropbox: this device's connection, and the setup link that connects other phones. */
export function DropboxSettings() {
  const s = useSyncState();
  const [result] = useState(takeDropboxSetupResult);
  const [copied, setCopied] = useState<string>();
  const refresh = s.connected && !s.fake ? syncService().refreshToken() : undefined;
  const copy = async () => {
    const link = dropboxSetupLink(refresh!);
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Copied. Paste it into a text or email to each phone.');
    } catch {
      setCopied(link);
    }
  };
  return (
    <section aria-labelledby="dbx-settings">
      <h2 id="dbx-settings">Dropbox</h2>
      {result === 'ok' && (
        <p class="sync-line ok" role="status">
          This phone is connected to Dropbox as {s.account}. It stays connected; there is nothing else to set up.
        </p>
      )}
      {result && result !== 'ok' && (
        <p class="sync-line bad" role="alert">
          The setup link did not work ({result}). Ask the office for a new one.
        </p>
      )}
      {!s.connected && <ConnectDropbox />}
      {s.connected && (
        <p>
          Connected to Dropbox as <strong>{s.account || 'an unnamed account'}</strong>.
        </p>
      )}
      {refresh && (
        <div class="dbx-option">
          <p class="hint">
            The phone setup link connects another phone to this Dropbox in one tap, for good: the phone renews its own access. Send it privately. Anyone with the link can
            open the Houser Dropbox, so never post it.
          </p>
          <button class="btn small" onClick={copy}>
            Copy phone setup link
          </button>
          {copied && (
            <p class="hint path" role="status">
              {copied}
            </p>
          )}
        </div>
      )}
      {s.connected && !s.fake && !refresh && (
        <p class="hint">This connection came from a pasted access token. It lasts about 4 hours and cannot make a phone setup link. To make one, disconnect and tap Connect Dropbox.</p>
      )}
    </section>
  );
}
