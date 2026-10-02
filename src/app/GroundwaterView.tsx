// Groundwater observation wells: a separate module with its own screens. Wells are registered
// once and read weekly through the seasonal high (DEQ-4 App. C).
import { useId, useState } from 'preact/hooks';
import type { FieldRecord } from '../domain/fieldRecord';
import { download } from './deliverables';
import { go } from './App';
import { Chips, NumberField, TextField } from './fields';
import { RuleWarnings } from './RuleWarnings';
import { loadTemplates } from './templates';
import { SyncStatus } from './SyncPanel';
import { syncService } from './sync';
import {
  addWell,
  nextWellLabel,
  addWellReading,
  depthText,
  readingResult,
  removeWell,
  removeWellReading,
  sortedReadings,
  updateWell,
  updateWellReading,
  wellWarnings,
  type ObservationWell,
  type WellReading,
} from '../groundwater/wells';
import { dateText } from '../domain/fieldRecord';

export function GroundwaterView(props: { record: FieldRecord; save: (r: FieldRecord) => void }) {
  const r = props.record;
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<string>();

  const add = (e: Event) => {
    e.preventDefault();
    const next = addWell(r, label.trim() || nextWellLabel(r));
    props.save(next);
    setLabel('');
    go(`#/se/${r.id}/gw/${next.wells.at(-1)!.id}`);
  };

  const exportXlsx = async () => {
    setStatus('Generating groundwater results…');
    try {
      const { generate } = await import('../generator');
      const f = (await generate(r, await loadTemplates())).find((x) => x.kind === 'groundwater-xlsx')!;
      const name = [r.header.projectNumber, f.path].filter(Boolean).join(' ');
      download(new Blob([f.bytes as BlobPart], { type: f.mimeType }), name);
      setStatus(`Saved ${name}`);
    } catch (e: any) {
      setStatus(`Export failed: ${e.message}`);
    }
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href={`#/se/${r.id}`} aria-label="Back to site evaluation">‹</a>
        <h1>Groundwater wells</h1>
      </header>
      <SyncStatus record={r} />
      <p class="muted">
        {r.header.projectNumber} {r.header.projectName}. Observation wells read weekly or more often through the seasonal high (DEQ-4 Appendix C).
      </p>

      <section aria-labelledby="wells">
        <h2 id="wells">Observation wells</h2>
        {r.wells.length === 0 && <p class="muted">No observation wells yet.</p>}
        <ul class="list">
          {r.wells.map((w) => (
            <li key={w.id}>
              <a class="row-link" href={`#/se/${r.id}/gw/${w.id}`}>
                <span class="row-title">
                  Well # {w.label}
                  {w.lot && ` · Lot ${w.lot.replace(/^lot\s*/i, '')}`}
                </span>
                <span class="row-sub">{wellSummary(w)}</span>
              </a>
            </li>
          ))}
        </ul>
        <form class="inline-form" onSubmit={add}>
          <TextField label="New observation well #" value={label} onInput={setLabel} autoCapitalize="characters" hint={`Blank uses ${nextWellLabel(r)}.`} />
          <button class="btn primary" type="submit">
            Add observation well
          </button>
        </form>
      </section>

      {r.wells.length > 0 && (
        <section aria-labelledby="gw-out">
          <h2 id="gw-out">Ground Water Observation Results</h2>
          <RuleWarnings warnings={r.wells.flatMap(wellWarnings)} title="Monitoring checks" showSubject />
          <a class="btn primary block" href={`#/se/${r.id}/print/groundwater`}>
            Print or save PDF
          </a>
          <button class="btn primary block" onClick={exportXlsx}>
            Export results (Excel)
          </button>
          {r.deliverableFolder && (
            <button
              class="btn block"
              onClick={async () => {
                await syncService().printAtOffice(r.id, ['groundwater-pdf']);
                setStatus(navigator.onLine ? 'Sending the results PDF to the office printer…' : 'Will send to the office printer when there is signal.');
              }}
            >
              Print at office
            </button>
          )}
          {status && (
            <p class="status" role="status">
              {status}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

/** `5 readings · last 6/14/2027 · water 94" below ground` */
export function wellSummary(w: ObservationWell): string {
  const rs = sortedReadings(w);
  const last = rs.at(-1);
  if (!last) return 'No readings yet';
  const res = readingResult(last);
  const what = res.depthIn != null ? `water ${res.depthIn}" below ground` : res.deeperThanIn != null ? `dry (deeper than ${res.deeperThanIn}")` : 'incomplete';
  return `${rs.length} reading${rs.length === 1 ? '' : 's'} · last ${dateText(last.date)} · ${what}`;
}

export function WellView(props: { record: FieldRecord; wellId: string; save: (r: FieldRecord) => void }) {
  const r = props.record;
  const w = r.wells.find((x) => x.id === props.wellId);
  const back = `#/se/${r.id}/gw`;
  if (!w)
    return (
      <main class="page">
        <p>That observation well is not in this site evaluation.</p>
        <a class="btn" href={back}>Back</a>
      </main>
    );
  const set = (patch: Partial<Omit<ObservationWell, 'id'>>) => props.save(updateWell(r, w.id, patch));
  const remove = () => {
    if (!confirm(`Delete well # ${w.label} and its readings? This cannot be undone.`)) return;
    props.save(removeWell(r, w.id));
    go(back);
  };
  const newestFirst = sortedReadings(w).reverse();

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href={back} aria-label="Back to groundwater wells">‹</a>
        <h1>Well # {w.label}</h1>
      </header>
      <SyncStatus record={r} />

      <section aria-labelledby="readings">
        <h2 id="readings">Readings</h2>
        <button class="btn primary block" onClick={() => props.save(addWellReading(r, w.id))}>
          Add reading now
        </button>
        <p class="hint">Measure to the nearest inch from the top of the pipe. B is the stick-up above natural ground.</p>
        <RuleWarnings warnings={wellWarnings(w)} title="Monitoring checks" />
        {newestFirst.length === 0 && <p class="muted">No readings yet.</p>}
        {newestFirst.map((x, i) => (
          <ReadingCard key={x.id} record={r} well={w} reading={x} n={newestFirst.length - i} save={props.save} />
        ))}
      </section>

      <section aria-labelledby="well-hdr">
        <h2 id="well-hdr">Well</h2>
        <TextField label="Observation well #" value={w.label} onInput={(v) => set({ label: v })} autoCapitalize="characters" />
        <TextField label="Monitored by" value={w.monitoredBy} onInput={(v) => set({ monitoredBy: v })} autoCapitalize="words" />
        <TextField label="Location" value={w.location} onInput={(v) => set({ location: v })} autoCapitalize="words" />
        <TextField label="Section, township, range" value={w.str} onInput={(v) => set({ str: v })} autoCapitalize="characters" hint="For example S12 T2S R5E." />
        <TextField label="Lot #" value={w.lot} onInput={(v) => set({ lot: v })} autoCapitalize="characters" />
        <TextField
          label="Other location info"
          value={w.otherInfo}
          onInput={(v) => set({ otherInfo: v })}
          hint="Which absorption area, distance from it (within 25 ft, same elevation), pipe size and depth."
        />
        <NumberField label="Stick-up as installed (B)" value={w.stickUpIn} onInput={(v) => set({ stickUpIn: v })} hint="At least 24 in. New readings start with the last B." />
      </section>

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete well # {w.label}
        </button>
      </section>
    </main>
  );
}

const WATER = [
  { value: 'WATER', label: 'Water in pipe' },
  { value: 'DRY', label: 'Dry' },
];

function ReadingCard(props: { record: FieldRecord; well: ObservationWell; reading: WellReading; n: number; save: (r: FieldRecord) => void }) {
  const { record: r, well: w, reading: x } = props;
  const set = (patch: Partial<Omit<WellReading, 'id'>>) => props.save(updateWellReading(r, w.id, x.id, patch));
  const timeId = useId();
  const res = readingResult(x);
  return (
    <section class="card" aria-label={`Reading ${props.n}`}>
      <h3>Reading {props.n}</h3>
      <div class="pair">
        <TextField label="Date" type="date" value={x.date} onInput={(v) => set({ date: v })} />
        <div class="field">
          <label for={timeId}>Time</label>
          <input id={timeId} type="time" value={x.time} onInput={(e) => set({ time: e.currentTarget.value })} />
        </div>
      </div>
      <Chips label="Pipe" options={WATER} value={x.dry ? 'DRY' : 'WATER'} onChange={(v) => set({ dry: v === 'DRY' })} />
      <div class="pair">
        <NumberField label={x.dry ? 'A: total depth measured' : 'A: top of pipe to water'} value={x.aIn} onInput={(v) => set({ aIn: v })} />
        <NumberField label="B: top of pipe to ground" value={x.bIn} onInput={(v) => set({ bIn: v })} />
      </div>
      <dl class="calc" aria-label={`Reading ${props.n} result`}>
        <div>
          <dt>A − B</dt>
          <dd>{depthText(x) ? `${depthText(x)}"` : '—'}</dd>
        </div>
        <div>
          <dt>Water</dt>
          <dd>{res.depthIn != null ? `${res.depthIn}" below ground` : res.deeperThanIn != null ? 'not reached (dry)' : '—'}</dd>
        </div>
      </dl>
      <TextField label="Notes" value={x.notes} onInput={(v) => set({ notes: v })} />
      <TextField label="Read by" value={x.by} onInput={(v) => set({ by: v })} autoCapitalize="words" hint={w.monitoredBy ? `Blank means ${w.monitoredBy}.` : undefined} />
      <button class="link-btn" onClick={() => confirm(`Delete reading ${props.n}?`) && props.save(removeWellReading(r, w.id, x.id))}>
        Delete reading {props.n}
      </button>
    </section>
  );
}
