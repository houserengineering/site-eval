import { useEffect, useRef, useState } from 'preact/hooks';
import { addPercTest, addPitWalls, updateHeader, type FieldRecord, type Header, type TestPit } from '../domain/fieldRecord';
import { groupStatus, nextPitNumber, pitGroups } from '../domain/pitWalls';
import { percSummary } from '../domain/perc';
import type { RecordStore } from '../storage/db';
import { go } from './App';
import { TextField, YesNoChips } from './fields';
import { findCounty } from './county';
import { useNow } from './PercTimers';
import { startFix } from './gps';
import type { PrintKind } from '../generator';
import { CertifyPanel } from './Certify';
import { download, photoSource } from './deliverables';
import { PRINT_KINDS, printKindOn } from './PrintView';
import { FEATURES } from './features';
import { loadTemplates } from './templates';
import { STATUS_TEXT } from './SiteMapView';
import { UnconfirmedNotice } from './Unconfirmed';
import { pitStatus } from '../domain/soilLogText';
import { lastEdit, pitPath } from '../domain/merge';
import { DropboxSection, SyncStatus } from './SyncPanel';
import { allWarnings } from '../domain/rules';
import { RuleWarnings } from './RuleWarnings';
import { wellSummary } from './GroundwaterView';
import { useSettings } from './settings';
import { SoilLogHold } from './PitChecks';
import { openFlags, wallFlags } from '../domain/pitChecks';

export function SiteEvaluationView(props: { record: FieldRecord; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const [pitLabel, setPitLabel] = useState('');
  const [percLabel, setPercLabel] = useState('');
  const now = useNow(5000);
  const { percTests } = useSettings();
  const [status, setStatus] = useState<string>();
  const h = (k: keyof Header) => (v: string) => props.save(updateHeader(r, { [k]: v }));
  const county = useCountyLookup(r, props.save);
  const held = openFlags(r).length > 0;

  const addPit = (e: Event) => {
    e.preventDefault();
    const label = pitLabel.trim() || nextPitNumber(r.testPits);
    const next = addPitWalls(r, label);
    props.save(next);
    setPitLabel('');
    // GPS starts the moment the pit is added: the user is standing at it.
    const wallA = next.testPits[r.testPits.length].id;
    startFix(r.id, wallA);
    go(`#/se/${r.id}/pit/${wallA}`);
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
      const files = await generate(r, await loadTemplates(), { photo: photoSource(props.store), percTests, groundwater: FEATURES.GROUNDWATER });
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

      <SyncStatus record={r} />

      {(r.siteMap || r.testPits.some((p) => p.planned || p.location)) && (
        <a class="btn primary block" href={`#/se/${r.id}/map`}>
          Map
        </a>
      )}

      <section aria-labelledby="hdr">
        <h2 id="hdr">Header</h2>
        <UnconfirmedNotice record={r} save={props.save} context="header" />
        <TextField label="Project #" value={r.header.projectNumber} onInput={h('projectNumber')} inputMode="decimal" />
        <TextField label="Project name" value={r.header.projectName} onInput={h('projectName')} autoCapitalize="words" />
        <TextField label="Location" value={r.header.location} onInput={county.onLocation} autoCapitalize="words" hint={county.hint} />
        <TextField label="Evaluated by" value={r.header.evalBy} onInput={h('evalBy')} autoCapitalize="words" />
        <TextField label="Date" type="date" value={r.header.date} onInput={h('date')} />
        <YesNoChips
          label="Gallatin County site evaluation"
          value={r.header.gallatin}
          onChange={(v) => props.save(updateHeader(r, { gallatin: v }))}
          hint={r.header.gallatin === 'N' ? 'The confirmation number is left off the soil log.' : undefined}
        />
        <TextField
          label="Confirmation number"
          value={r.header.gallatin === 'N' ? '' : r.header.confirmationNumber}
          onInput={h('confirmationNumber')}
          autoCapitalize="characters"
          disabled={r.header.gallatin === 'N'}
          hint={r.header.gallatin === 'N' ? 'Only Gallatin County site evaluations have one.' : 'From the GCCHD.'}
        />
        {/* Only the perc test forms carry the owner: hidden with perc tests off, the value kept (Nathan, 2026-10-04). */}
        {percTests && <TextField label="Owner name" value={r.header.ownerName} onInput={h('ownerName')} autoCapitalize="words" hint="On the perc test forms." />}
      </section>


      <section aria-labelledby="pits">
        <h2 id="pits">Test pits</h2>
        {r.testPits.length === 0 && <p class="muted">No test pits yet.</p>}
        {r.testPits.length > 0 && <p class="muted">{pitCounts(r)}</p>}
        <ul class="list pit-groups">
          {pitGroups(r.testPits).map((g) => (
            <li key={g.pit}>
              <p class="group-title">
                Test pit {g.pit} <span class={`badge st-${groupStatus(g.walls)}`}>{STATUS_TEXT[groupStatus(g.walls)]}</span>
              </p>
              <ul class="walls" aria-label={`Test pit ${g.pit} walls`}>
                {g.walls.map((p) => (
                  <li key={p.id}>
                    <a class="row-link" href={`#/se/${r.id}/pit/${p.id}`}>
                      <span class="row-title">
                        Wall {p.label} <span class={`badge st-${pitStatus(p, r.testPits)}`}>{STATUS_TEXT[pitStatus(p, r.testPits)]}</span>
                      </span>
                      <span class="row-sub">
                        {p.horizons.length} horizon{p.horizons.length === 1 ? '' : 's'}
                        {p.location ? ' · GPS' : ''}
                        {p.photos.length ? ` · ${p.photos.length} photo${p.photos.length === 1 ? '' : 's'}` : ''}
                        {openText(r, p)}
                        {editedBy(r, p.id)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <form class="inline-form" onSubmit={addPit}>
          <TextField
            label="New test pit #"
            value={pitLabel}
            onInput={setPitLabel}
            autoCapitalize="characters"
            hint={`Blank uses ${nextPitNumber(r.testPits)}. Adds walls A and B. GPS starts as soon as you add it.`}
          />
          <button class="btn primary" type="submit">
            Add test pit
          </button>
        </form>
      </section>

      {percTests && (
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
      )}

      {FEATURES.GROUNDWATER && (
      <section aria-labelledby="gw">
        <h2 id="gw">Groundwater monitoring</h2>
        <p class="hint">Separate module: observation wells read weekly through the seasonal high, with their own results form.</p>
        <a class="row-link" href={`#/se/${r.id}/gw`}>
          <span class="row-title">Observation wells{r.wells.length > 0 && ` (${r.wells.length})`}</span>
          <span class="row-sub">{r.wells.length ? r.wells.map((w) => `Well # ${w.label}: ${wellSummary(w)}`).join(' · ') : 'Register wells and enter readings'}</span>
        </a>
      </section>
      )}

      <section aria-labelledby="out">
        <h2 id="out">Deliverables</h2>
        <SoilLogHold record={r} />
        {FEATURES.RULE_WARNINGS && <RuleWarnings warnings={allWarnings(r, now, { percTests })} title="Rule checks before export" showSubject />}
        {/* The PDF is the deliverable, so it is the main button (Nathan, 2026-10-04: a card did not read as tappable). */}
        {(Object.keys(PRINT_KINDS) as PrintKind[])
          .filter((k) => k !== 'groundwater' && printKindOn(k, percTests) && (k !== 'perc-tests' || r.percTests.length > 0))
          .map((k) => (
            <div key={k} class="field">
              <a class="btn primary block" href={`#/se/${r.id}/print/${k}`} aria-describedby={`pdf-${k}`}>
                {PRINT_OPEN[k]}
              </a>
              <p class="hint" id={`pdf-${k}`}>
                {PRINT_SUB[k]}
              </p>
            </div>
          ))}
        <button class="btn block" onClick={exportXlsx('soil-log-xlsx', 'soil logs')} disabled={held}>
          Export soil logs (Excel)
        </button>
        {percTests && r.percTests.length > 0 && (
          <button class="btn block" onClick={exportXlsx('perc-test-xlsx', 'perc tests')}>
            Export perc tests (Excel)
          </button>
        )}
        {status && (
          <p class="status" role="status">
            {status}
          </p>
        )}
      </section>

      <DropboxSection record={r} save={props.save} store={props.store} />

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete site evaluation
        </button>
      </section>
    </main>
  );
}

/**
 * The county for the typed address, looked up a moment after the user stops typing. It sets the
 * Gallatin County Yes/No, which the user can still change. Opening a record never looks it up again.
 */
function useCountyLookup(r: FieldRecord, save: (r: FieldRecord) => void) {
  const [state, setState] = useState<'' | 'busy' | 'offline' | 'not-found'>('');
  const latest = useRef(r);
  latest.current = r;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onLocation = (v: string) => {
    save(updateHeader(latest.current, { location: v, county: '' }));
    clearTimeout(timer.current);
    setState('');
    if (v.trim().length < 8) return;
    timer.current = setTimeout(async () => {
      setState('busy');
      const found = await findCounty(v.trim());
      // Typed on since: that lookup is stale.
      if (latest.current.header.location !== v) return;
      if ('county' in found) {
        save(updateHeader(latest.current, { county: found.county, gallatin: found.gallatin ? 'Y' : 'N' }));
        setState('');
      } else setState('offline' in found ? 'offline' : 'not-found');
    }, 1200);
  };
  const hint =
    state === 'busy'
      ? 'Finding the county…'
      : state === 'offline'
        ? 'The county could not be checked without a connection. Answer the Gallatin County question below yourself.'
        : state === 'not-found'
          ? 'The county could not be found for this address. Answer the Gallatin County question below yourself.'
          : r.header.county || undefined;
  return { onLocation, hint };
}

/** "edited by" note once a second person has edited the site evaluation. */
function editedBy(r: FieldRecord, pitId: string): string {
  const editors = new Set(Object.values(r.edits).map((e) => e.by));
  const e = lastEdit(r, pitPath(pitId));
  return e && editors.size > 1 ? ` · edited by ${e.by}` : '';
}

/** ` · 2 checks open` on a wall with open pit checks. */
function openText(r: FieldRecord, wall: TestPit) {
  const n = wallFlags(r, wall).filter((f) => !f.accepted).length;
  return n ? <span class="warn-text"> · {n} check{n === 1 ? '' : 's'} open</span> : null;
}

function pitCounts(r: FieldRecord): string {
  const n = { 'not-started': 0, 'in-progress': 0, complete: 0 };
  for (const g of pitGroups(r.testPits)) n[groupStatus(g.walls)]++;
  return `${n.complete} complete · ${n['in-progress']} in progress · ${n['not-started']} not started`;
}

const PRINT_OPEN: Record<PrintKind, string> = {
  'soil-logs': 'Open soil log PDF',
  'perc-tests': 'Open perc test PDF',
  groundwater: 'Open groundwater results PDF',
};

const PRINT_SUB: Record<PrintKind, string> = {
  'soil-logs': 'One page per test pit (both walls), with photos and locations. Save PDF is at the top.',
  'perc-tests': 'One page per perc test',
  groundwater: 'One page per observation well',
};
