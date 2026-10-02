import { useState } from 'preact/hooks';
import { addTestPit, updateHeader, type FieldRecord, type Header } from '../domain/fieldRecord';
import type { RecordStore } from '../storage/db';
import { go } from './App';
import { TextField } from './fields';
import { loadTemplates } from './templates';

export function SiteEvaluationView(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const [pitLabel, setPitLabel] = useState('');
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

  const exportSoilLogs = async () => {
    setStatus('Generating soil logs…');
    try {
      const { generate } = await import('../generator');
      const files = await generate(r, await loadTemplates());
      const f = files.find((x) => x.kind === 'soil-log-xlsx')!;
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

      <section aria-labelledby="out">
        <h2 id="out">Deliverables</h2>
        <button class="btn primary block" onClick={exportSoilLogs}>
          Export soil logs (Excel)
        </button>
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

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
