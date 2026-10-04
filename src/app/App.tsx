import { useEffect, useRef, useState } from 'preact/hooks';
import { newSiteEvaluation, type FieldRecord } from '../domain/fieldRecord';
import { openStore, type RecordStore } from '../storage/db';
import type { PrintKind } from '../generator';
import { CertifierSetup } from './Certify';
import { PercTestView } from './PercTestView';
import { PRINT_KINDS, PrintView } from './PrintView';
import { PercTimers } from './PercTimers';
import { SiteEvaluationView } from './SiteEvaluationView';
import { GroundwaterView, WellView } from './GroundwaterView';
import { SiteMapView } from './SiteMapView';
import { readJob } from '../domain/job';
import { TestPitView } from './TestPitView';
import { setSyncService, SyncService, syncService } from './sync';
import { DropboxOpenView } from './SyncPanel';
import { readBackup, isBackup } from '../domain/backup';
import { changeSettings, loadSettings, settings, useSettings } from './settings';
import { markEnrolled, takeEnrollment, type Enrollment } from './enroll';
import { ReviewQueue, setReviewQueue } from './reviewQueue';
import { SettingsView } from './SettingsView';
import { Coach } from './demo/Coach';
import { demoDone, demoState, publishLive, setDemoState, startDemo } from './demo/state';
import { STEPS } from './demo/steps';
import { setFixFallback } from './gps';

type Route =
  | { name: 'home' }
  | { name: 'site'; id: string }
  | { name: 'pit'; id: string; pitId: string }
  | { name: 'perc'; id: string; testId: string }
  | { name: 'print'; id: string; kind: PrintKind }
  | { name: 'map'; id: string }
  | { name: 'gw'; id: string }
  | { name: 'well'; id: string; wellId: string }
  | { name: 'certifier' }
  | { name: 'settings' }
  | { name: 'dropbox' };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'se' && parts[1] && parts[2] === 'pit' && parts[3]) return { name: 'pit', id: parts[1], pitId: parts[3] };
  if (parts[0] === 'se' && parts[1] && parts[2] === 'perc' && parts[3]) return { name: 'perc', id: parts[1], testId: parts[3] };
  if (parts[0] === 'se' && parts[1] && parts[2] === 'print' && parts[3] && parts[3] in PRINT_KINDS) return { name: 'print', id: parts[1], kind: parts[3] as PrintKind };
  if (parts[0] === 'se' && parts[1] && parts[2] === 'map') return { name: 'map', id: parts[1] };
  if (parts[0] === 'se' && parts[1] && parts[2] === 'gw' && parts[3]) return { name: 'well', id: parts[1], wellId: parts[3] };
  if (parts[0] === 'se' && parts[1] && parts[2] === 'gw') return { name: 'gw', id: parts[1] };
  if (parts[0] === 'se' && parts[1]) return { name: 'site', id: parts[1] };
  if (parts[0] === 'certifier') return { name: 'certifier' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'dropbox') return { name: 'dropbox' };
  return { name: 'home' };
}

/** Steps from here on run on Home and Settings, after the demo evaluation is deleted. */
const FINALE = STEPS.findIndex((x) => x.id === 'home-settings');

async function saveEnrollment(store: RecordStore, e: Enrollment) {
  await changeSettings(store, { reviewToken: e.token });
  if (e.serviceUrl) await store.setSetting('reviewServiceUrl', e.serviceUrl);
  markEnrolled();
}

export const go = (hash: string) => {
  location.hash = hash;
};

export function App() {
  const [store, setStore] = useState<RecordStore>();
  const [error, setError] = useState<string>();
  // Taken before the first route is read, so the token never shows in the address bar.
  const [enrollment] = useState(takeEnrollment);
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const { percTests } = useSettings();

  useEffect(() => {
    let opened: RecordStore | undefined;
    openStore().then(
      async (s) => {
        await loadSettings(s);
        if (enrollment) await saveEnrollment(s, enrollment);
        const sync = new SyncService(s);
        setSyncService(sync);
        const returnTo = await sync.init();
        const reviews = new ReviewQueue({
          store: s,
          token: () => settings().reviewToken.trim(),
          serviceUrl: () => sync.reviewServiceUrl(),
          fetch: (...a) => fetch(...a),
          save: (recordId, wallId, review) => sync.saveReview(recordId, wallId, review),
        });
        setReviewQueue(reviews);
        setFixFallback((recordId, wallId, fix) => void sync.patchWall(recordId, wallId, { location: fix }));
        void reviews.start();
        if (returnTo) location.hash = returnTo;
        // The demo: resumed where it was left; required on a device's first launch (spec decision 6).
        const demo = demoState();
        if (demo && demo.step < FINALE && !(await s.get(demo.recordId))) setDemoState(null);
        if (!returnTo && !enrollment && !demoDone() && !demoState()) await startDemo(s, false);
        setStore(s);
        opened = s;
      },
      (e) => setError(`Storage unavailable on this device: ${e.message}`),
    );
    const onHash = async () => {
      // An enrollment link opened while the app is already running.
      const e = takeEnrollment();
      if (e && opened) await saveEnrollment(opened, e);
      setRoute(parseRoute(location.hash));
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <main class="page"><p class="alert" role="alert">{error}</p></main>;
  if (!store) return <main class="page" aria-busy="true" />;
  return (
    <>
      {page(route, store, percTests)}
      <Coach store={store} />
    </>
  );
}

function page(route: Route, store: RecordStore, percTests: boolean) {
  if (route.name === 'pit') return <RecordLoader store={store} id={route.id} render={(r, save) => <TestPitView record={r} pitId={route.pitId} save={save} store={store} />} />;
  if (route.name === 'perc' && percTests) return <RecordLoader store={store} id={route.id} render={(r, save) => <PercTestView record={r} testId={route.testId} save={save} />} />;
  if (route.name === 'print') return <RecordLoader store={store} id={route.id} render={(r, save) => <PrintView record={r} kind={route.kind} store={store} save={save} />} />;
  if (route.name === 'map') return <RecordLoader store={store} id={route.id} render={(r, save) => <SiteMapView record={r} save={save} store={store} />} />;
  if (route.name === 'gw') return <RecordLoader store={store} id={route.id} render={(r, save) => <GroundwaterView record={r} save={save} />} />;
  if (route.name === 'well') return <RecordLoader store={store} id={route.id} render={(r, save) => <WellView record={r} wellId={route.wellId} save={save} />} />;
  if (route.name === 'certifier') return <CertifierSetup store={store} />;
  if (route.name === 'settings') return <SettingsView store={store} />;
  if (route.name === 'dropbox') return <DropboxOpenView store={store} />;
  if (route.name === 'site' || route.name === 'perc') return <RecordLoader store={store} id={route.id} render={(r, save) => <SiteEvaluationView record={r} save={save} store={store} />} />;
  return <Home store={store} />;
}

function RecordLoader(props: {
  store: RecordStore;
  id: string;
  render: (r: FieldRecord, save: (r: FieldRecord) => void) => preact.ComponentChildren;
}) {
  const [record, setRecord] = useState<FieldRecord | null>();
  const current = useRef<FieldRecord | null | undefined>(undefined);
  const [error, setError] = useState<string>();
  const { percTests } = useSettings();
  useEffect(() => {
    setRecord(undefined);
    props.store.get(props.id).then((r) => setRecord(r ?? null), (e) => setError(e.message));
    const sync = syncService();
    sync.watch(props.id);
    const off = sync.onRecord((r) => r.id === props.id && setRecord(r));
    return () => {
      off();
      sync.watch(undefined);
    };
  }, [props.id]);
  current.current = record;
  const save = (next: FieldRecord) => {
    const prev = current.current;
    const stamped = prev ? syncService().recordEdited(prev, next) : next;
    current.current = stamped;
    setRecord(stamped);
    props.store.save(stamped).catch((e) => setError(`Not saved: ${e.message}`));
  };
  if (error) return <main class="page"><p class="alert" role="alert">{error}</p></main>;
  if (record === undefined) return <main class="page" aria-busy="true" />;
  if (record === null)
    return (
      <main class="page">
        <p>That site evaluation is not on this device.</p>
        <a class="btn" href="#/">All site evaluations</a>
      </main>
    );
  if (record.demo) publishLive(record, save);
  return (
    <>
      {props.render(record, save)}
      {percTests && <PercTimers record={record} />}
    </>
  );
}

function Home({ store }: { store: RecordStore }) {
  const [records, setRecords] = useState<FieldRecord[]>();
  const [problem, setProblem] = useState<string>();
  const { percTests } = useSettings();
  useEffect(() => {
    store.list().then(
      ({ records, unreadable }) => {
        setRecords(records);
        if (unreadable.length)
          setProblem(`${unreadable.length} saved site evaluation(s) could not be opened by this version of the app: ${unreadable[0].error}`);
      },
      (e) => setProblem(`Could not read saved site evaluations: ${e.message}`),
    );
  }, []);

  const create = async () => {
    const r = newSiteEvaluation();
    await store.save(r);
    go(`#/se/${r.id}`);
  };

  const loadJob = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {}
      if (isBackup(json)) {
        const { record, photos } = readBackup(json);
        if ((await store.get(record.id)) && !confirm('This site evaluation is already on this device. Replace it with the backup?')) return;
        for (const p of photos) await store.putPhoto(p.id, record.id, p.blob);
        await store.save(record);
        go(`#/se/${record.id}`);
        return;
      }
      const { record, mapImage } = readJob(text);
      if (mapImage) await store.putPhoto(mapImage.id, record.id, mapImage.blob);
      await store.save(record);
      if (record.deliverableFolder) await syncService().queue(record.id, { deliverables: false });
      go(`#/se/${record.id}`);
    } catch (e: any) {
      setProblem(`Could not load ${file.name}: ${e.message}`);
    }
  };

  return (
    <main class="page">
      <header class="bar">
        <h1>Site evaluations</h1>
        <a class="bar-link" href="#/settings">
          Settings
        </a>
      </header>
      <button class="btn primary block" onClick={create}>
        New site evaluation
      </button>
      <a class="btn block" href="#/dropbox">
        Open from Dropbox
      </a>
      <label class="btn block">
        Load job file or backup
        <input class="visually-hidden" type="file" accept=".json,application/json" onChange={(e) => loadJob(e.currentTarget)} />
      </label>
      {problem && (
        <p class="alert" role="alert">
          {problem}
        </p>
      )}
      {records && records.length === 0 && <p class="muted">No site evaluations on this device yet.</p>}
      <ul class="list">
        {records?.map((r) => (
          <li key={r.id}>
            <a class="row-link" href={`#/se/${r.id}`}>
              <span class="row-title">{r.demo ? 'Demo:' : r.header.projectNumber || 'No project #'} {r.header.projectName}</span>
              <span class="row-sub">
                {r.testPits.length} test pit{r.testPits.length === 1 ? '' : 's'}
                {percTests && r.percTests.length > 0 && ` · ${r.percTests.length} perc test${r.percTests.length === 1 ? '' : 's'}`}
                {r.wells?.length > 0 && ` · ${r.wells.length} observation well${r.wells.length === 1 ? '' : 's'}`}
                {r.header.date && ` · ${r.header.date}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
