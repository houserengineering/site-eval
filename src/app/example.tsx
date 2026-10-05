// The shared example of a completed site evaluation (0271.001, Nathan 2026-10-04). It lives in the office Dropbox,
// not in this public app, because it is a real client's job. Each phone downloads its own copy, marked `example`,
// which never syncs or files, so the real job's folder is never touched.
import { useEffect, useState } from 'preact/hooks';
import { readBackup } from '../domain/backup';
import type { RecordStore } from '../storage/db';
import { SERVER_ROOT } from '../sync/naming';
import { go } from './App';
import { syncService, useSyncState } from './sync';

export const EXAMPLE_PATH = `${SERVER_ROOT}/Office/Site Eval App/Examples/Completed site evaluation.json`;

/** The example already on this phone, or a fresh copy from Dropbox. */
export async function openExample(store: RecordStore): Promise<string> {
  const here = (await store.list()).records.find((r) => r.example);
  if (here) return here.id;
  const adapter = syncService().getAdapter();
  if (!adapter) throw new Error('Sign in first; the example comes from the office Dropbox.');
  const got = await adapter.read(EXAMPLE_PATH);
  if (!got) throw new Error('The office has not shared an example yet.');
  const { record, photos } = readBackup(JSON.parse(new TextDecoder().decode(got.bytes)));
  for (const p of photos) await store.putPhoto(p.id, record.id, p.blob);
  await store.save({ ...record, example: true, deliverableFolder: '', filed: {} });
  return record.id;
}

export function ExampleButton({ store }: { store: RecordStore }) {
  const s = useSyncState();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [here, setHere] = useState(false);
  useEffect(() => {
    store.list().then((l) => setHere(l.records.some((r) => r.example)), () => {});
  }, []);
  if (!here && !s.connected) return null;
  const open = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      go(`#/se/${await openExample(store)}`);
    } catch (e: any) {
      setProblem(e.message);
      setBusy(false);
    }
  };
  return (
    <>
      <button class="btn block" onClick={open} disabled={busy}>
        {busy ? 'Downloading the example…' : 'Example: completed site evaluation'}
      </button>
      {problem && (
        <p class="alert" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
