import { useState } from 'preact/hooks';
import { addPercTest, addTestPit, updateHeader, type FieldRecord, type Header } from '../domain/fieldRecord';
import { percSummary } from '../domain/perc';
import type { RecordStore } from '../storage/db';
import { go } from './App';
import { TextField } from './fields';
import { useNow } from './PercTimers';
import type { PrintKind } from '../generator';
import { CertifyPanel } from './Certify';
import { download, photoSource } from './deliverables';
import { PRINT_KINDS } from './PrintView';
import { loadTemplates } from './templates';

export function SiteEvaluationView(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const [pitLabel, setPitLabel] = useState('');
  const [percLabel, setPercLabel] = useState('');
  const now = useNow(5000);
  const [status, setStatus] = useState<string>();
  const h = (k: keyof Header) => (v: string) => props.save(updateHeader(r, { [k]: v }));

  const addPit = (e: Event) => {
    e.preventDefault();
    const label = pitLabel.trim() || String(r.testPits.length + 1);
    const next = addTestPit(r, label);
    props.save(next);
    setPitLabel('');
    go(`#/se/${r.id}/pit/${next.testPits.at(-1)!.id}`);
  };

  const addPerc = (e: Event) => {
    e.preventDefault();
    const label = percLabel.trim() || String(r.percTests.length + 1);
    const next = addPercTest(r, label);
    props.save(next);
    setPercLabel('');
    go(`#/se/${r.id}/perc/${next.percTests.at(-1)!.id}`);
  };

  const exportXlsx = (kind: 'soil-log-xlsx' | 'perc-test-xlsx', what: string) => async () => {
    setStatus(`Generating ${what}…`);
    try {
      const { generate } = await import('../generator');
      const files = await generate(r, await loadTemplates(), { photo: photoSource(props.store) });
      const f = files.find((x) => x.kind === kind)!;
      const name = [r.header.projectNumber, f.path].filter(Boolean).join(' ');
      download(new Blob([f.bytes as BlobPart], { type: f.mimeType }), name);
      setStatus(`Saved ${name}`);
    } catch (e: any) {
      setStatus(`Export failed: ${e.message}`);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this site evaluation from this device? This cannot be undone.')) return;
    await props.store.remove(r.id);
    go('#/');
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href="#/" aria-label="All site evaluations">‹</a>
        <h1>{r.header.projectNumber || 'New site evaluation'}</h1>
      </header>

      <section aria-labelledby="hdr">
        <h2 id="hdr">Header</h2>
        <TextField label="Project #" value={r.header.projectNumber} onInput={h('projectNumber')} inputMode="decimal" />
        <TextField label="Project name" value={r.header.projectName} onInput={h('projectName')} autoCapitalize="words" />
        <TextField label="Location" value={r.header.location} onInput={h('location')} autoCapitalize="words" />
        <TextField label="Eval. by" value={r.header.evalBy} onInput={h('evalBy')} autoCapitalize="words" />
        <TextField label="Date" type="date" value={r.header.date} onInput={h('date')} />
        <TextField
          label="Confirmation number"
          value={r.header.confirmationNumber}
          onInput={h('confirmationNumber')}
          autoCapitalize="characters"
          hint="From GCCHD for Gallatin County site evaluations; leave blank elsewhere."
        />
        <TextField label="Owner name" value={r.header.ownerName} onInput={h('ownerName')} autoCapitalize="words" hint="Printed on the perc test forms." />
      </section>

      <section aria-labelledby="pits">
        <h2 id="pits">Test pits</h2>
        {r.testPits.length === 0 && <p class="muted">No test pits yet.</p>}
        <ul class="list">
          {r.testPits.map((p) => (
            <li key={p.id}>
              <a class="row-link" href={`#/se/${r.id}/pit/${p.id}`}>
                <span class="row-title">Test pit {p.label}</span>
                <span class="row-sub">
                  {p.horizons.length} horizon{p.horizons.length === 1 ? '' : 's'}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <form class="inline-form" onSubmit={addPit}>
          <TextField
            label="New test pit #"
            value={pitLabel}
            onInput={setPitLabel}
            autoCapitalize="characters"
            hint={`Blank uses ${r.testPits.length + 1}.`}
          />
          <button class="btn primary" type="submit">
            Add test pit
          </button>
        </form>
      </section>

      <section aria-labelledby="percs">
        <h2 id="percs">Perc tests</h2>
        {r.percTests.length === 0 && <p class="muted">No perc tests yet.</p>}
        <ul class="list">
          {r.percTests.map((t) => (
            <li key={t.id}>
              <a class="row-link" href={`#/se/${r.id}/perc/${t.id}`}>
                <span class="row-title">
                  Perc test {t.label}
                  {t.lot && ` · Lot ${t.lot.replace(/^lot\s*/i, '')}`}
                </span>
                <span class="row-sub">{percSummary(t, now)}</span>
              </a>
            </li>
          ))}
        </ul>
        <form class="inline-form" onSubmit={addPerc}>
          <TextField label="New perc test #" value={percLabel} onInput={setPercLabel} autoCapitalize="characters" hint={`Blank uses ${r.percTests.length + 1}.`} />
          <button class="btn primary" type="submit">
            Add perc test
          </button>
        </form>
        <CertifyPanel record={r} save={props.save} store={props.store} />
      </section>

      <section aria-labelledby="out">
        <h2 id="out">Deliverables</h2>
        <p class="hint">Print or save PDF (letter):</p>
        <ul class="list">
          {(Object.keys(PRINT_KINDS) as PrintKind[])
            .filter((k) => k !== 'perc-tests' || r.percTests.length > 0)
            .map((k) => (
              <li key={k}>
                <a class="row-link" href={`#/se/${r.id}/print/${k}`}>
                  <span class="row-title">{PRINT_KINDS[k].title}</span>
                  <span class="row-sub">{PRINT_SUB[k]}</span>
                </a>
              </li>
            ))}
        </ul>
        <button class="btn primary block" onClick={exportXlsx('soil-log-xlsx', 'soil logs')}>
          Export soil logs (Excel)
        </button>
        {r.percTests.length > 0 && (
          <button class="btn primary block" onClick={exportXlsx('perc-test-xlsx', 'perc tests')}>
            Export perc tests (Excel)
          </button>
        )}
        {status && (
          <p class="status" role="status">
            {status}
          </p>
        )}
      </section>

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete site evaluation
        </button>
      </section>
    </main>
  );
}

const PRINT_SUB: Record<PrintKind, string> = {
  'soil-logs': 'One page per test pit, with photo and location',
  'perc-tests': 'One page per perc test',
  'site-evaluation': 'Location map, all soil logs and perc tests, further photos',
};
