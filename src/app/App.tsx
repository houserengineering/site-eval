import { useEffect, useState } from 'preact/hooks';
import { newSiteEvaluation, type FieldRecord } from '../domain/fieldRecord';
import { openStore, type RecordStore } from '../storage/db';
import { SiteEvaluationView } from './SiteEvaluationView';
import { TestPitView } from './TestPitView';

type Route = { name: 'home' } | { name: 'site'; id: string } | { name: 'pit'; id: string; pitId: string };

function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'se' && parts[1] && parts[2] === 'pit' && parts[3]) return { name: 'pit', id: parts[1], pitId: parts[3] };
  if (parts[0] === 'se' && parts[1]) return { name: 'site', id: parts[1] };
  return { name: 'home' };
}

export const go = (hash: string) => {
  location.hash = hash;
};

export function App() {
  const [store, setStore] = useState<RecordStore>();
  const [error, setError] = useState<string>();
  const [route, setRoute] = useState(() => parseRoute(location.hash));

  useEffect(() => {
    openStore().then(setStore, (e) => setError(`Storage unavailable on this device: ${e.message}`));
    const onHash = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <main class="page"><p class="alert" role="alert">{error}</p></main>;
  if (!store) return <main class="page" aria-busy="true" />;
  if (route.name === 'pit') return <RecordLoader store={store} id={route.id} render={(r, save) => <TestPitView record={r} pitId={route.pitId} save={save} />} />;
  if (route.name === 'site') return <RecordLoader store={store} id={route.id} render={(r, save) => <SiteEvaluationView record={r} save={save} store={store} />} />;
  return <Home store={store} />;
}

function RecordLoader(props: {
  store: RecordStore;
  id: string;
  render: (r: FieldRecord, save: (r: FieldRecord) => void) => preact.ComponentChildren;
}) {
  const [record, setRecord] = useState<FieldRecord | null>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    setRecord(undefined);
    props.store.get(props.id).then((r) => setRecord(r ?? null), (e) => setError(e.message));
  }, [props.id]);
  const save = (r: FieldRecord) => {
    setRecord(r);
    props.store.save(r).catch((e) => setError(`Not saved: ${e.message}`));
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
  return <>{props.render(record, save)}</>;
}

function Home({ store }: { store: RecordStore }) {
  const [records, setRecords] = useState<FieldRecord[]>();
  const [problem, setProblem] = useState<string>();
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

  return (
    <main class="page">
      <header class="bar">
        <h1>Site evaluations</h1>
      </header>
      <button class="btn primary block" onClick={create}>
        New site evaluation
      </button>
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
              <span class="row-title">{r.header.projectNumber || 'No project #'} {r.header.projectName}</span>
              <span class="row-sub">
                {r.testPits.length} test pit{r.testPits.length === 1 ? '' : 's'}
                {r.header.date && ` · ${r.header.date}`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
