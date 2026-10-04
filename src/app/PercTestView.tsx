import {
  addReading,
  removePercTest,
  removeReading,
  updatePercTest,
  updateReading,
  type FieldRecord,
  type PercMode,
  type PercReading,
  type PercTest,
} from '../domain/fieldRecord';
import { percWarnings } from '../domain/rules';
import { RuleWarnings } from './RuleWarnings';
import { clock, countdown, nextReadingDue, readingCalc, soakStatus, stopRule, tapeText } from '../domain/perc';
import { go } from './App';
import { Chips, NumberField, TapeField, TextField, TimeField, YesNoChips } from './fields';
import { primeAlerts, secondsUntil, useNow } from './PercTimers';

const MODES = [
  { value: 'standard', label: 'Standard', help: 'measure drop' },
  { value: 'sandy', label: 'Sandy-soil test', help: 'refill to 6"' },
  { value: 'fixed-drop', label: 'Fixed-drop timing', help: 'time a set drop' },
];

export function PercTestView(props: { record: FieldRecord; testId: string; save: (r: FieldRecord) => void }) {
  const r = props.record;
  const t = r.percTests.find((x) => x.id === props.testId);
  const now = useNow();
  const back = `#/se/${r.id}`;
  if (!t)
    return (
      <main class="page">
        <p>That perc test is not in this site evaluation.</p>
        <a class="btn" href={back}>Back</a>
      </main>
    );

  const saveTest = (patch: Partial<Omit<PercTest, 'id'>>) => props.save(updatePercTest(r, t.id, patch));
  const remove = () => {
    if (!confirm(`Delete perc test ${t.label}? This cannot be undone.`)) return;
    props.save(removePercTest(r, t.id));
    go(back);
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href={back} aria-label="Back to site evaluation">‹</a>
        <h1>Perc test {t.label}</h1>
      </header>

      <section class="card" aria-labelledby="hole">
        <h2 id="hole">Test hole</h2>
        <TextField label="Perc test #" value={t.label} onInput={(v) => saveTest({ label: v })} autoCapitalize="characters" />
        {r.testPits.length > 0 && (
          <Chips
            label="At test pit"
            options={r.testPits.map((p) => ({ value: p.id, label: p.label }))}
            value={t.testPitId}
            onChange={(v) => saveTest({ testPitId: v })}
          />
        )}
        <TextField label="Lot" value={t.lot} onInput={(v) => saveTest({ lot: v })} autoCapitalize="characters" />
        <div class="pair">
          <NumberField label="Hole diameter" value={t.holeDiameterIn} onInput={(v) => saveTest({ holeDiameterIn: v })} />
          <NumberField label="Hole depth" value={t.holeDepthIn} onInput={(v) => saveTest({ holeDepthIn: v })} />
        </div>
        <NumberField
          label="Reference point above hole bottom"
          value={t.referenceHeightIn}
          onInput={(v) => saveTest({ referenceHeightIn: v })}
          hint={t.referenceHeightIn != null ? `Prints as ${tapeText(t.referenceHeightIn)}` : undefined}
        />
        <TextField label="Tester (printed name)" value={t.tester} onInput={(v) => saveTest({ tester: v })} autoCapitalize="words" hint={`Blank prints Evaluated by${r.header.evalBy ? ` (${r.header.evalBy})` : ''}.`} />
      </section>

      <Soak test={t} now={now} saveTest={saveTest} />

      <section class="card" aria-labelledby="readings">
        <h2 id="readings">Readings</h2>
        <Chips label="Method" options={MODES} value={t.mode} onChange={(v) => v && saveTest({ mode: v as PercMode })} />
        {t.mode === 'fixed-drop' ? (
          <TapeField label="Fixed drop" value={t.fixedDropIn} onInput={(v) => saveTest({ fixedDropIn: v })} />
        ) : (
          <NumberField label="Reading interval" unit="min" value={t.intervalMin} onInput={(v) => saveTest({ intervalMin: v })} />
        )}
        {t.readings.map((reading, i) => (
          <ReadingCard key={reading.id} record={r} test={t} reading={reading} index={i} now={now} save={props.save} />
        ))}
        <NextAction record={r} test={t} now={now} save={props.save} />
        <StopRuleBox test={t} />
      </section>

      {/* Stop-rule warnings already show in the readings box above. */}
      <RuleWarnings warnings={percWarnings(r, t, now).filter((w) => w.rule.id !== 'perc-stop')} />

      <section aria-labelledby="pnotes">
        <h2 id="pnotes">Notes</h2>
        <TextField label="Perc test notes" value={t.notes} onInput={(v) => saveTest({ notes: v })} hint='Printed under the readings, e.g. "Hole lined with 4" perforated pipe and drain rock."' />
      </section>

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete perc test
        </button>
      </section>
    </main>
  );
}

function Soak(props: { test: PercTest; now: string; saveTest: (p: Partial<Omit<PercTest, 'id'>>) => void }) {
  const { test: t, now, saveTest } = props;
  const s = soakStatus(t, now);
  const setFill = (i: number, patch: Partial<PercTest['fills'][number]>) =>
    saveTest({ fills: Array.from({ length: Math.max(t.fills.length, i + 1) }, (_, k) => (k === i ? { ...(t.fills[k] ?? { startAt: '', endAt: '' }), ...patch } : t.fills[k])) });
  const start = (fn: () => void) => () => {
    primeAlerts();
    fn();
  };
  const left = s.dueAt ? secondsUntil(s.dueAt, now) : null;

  return (
    <section class="card" aria-labelledby="soak">
      <h2 id="soak">Soak</h2>
      <YesNoChips label="Soil at test depth is sandy clay loam or finer" value={t.soilFinerThanSCL} onChange={(v) => saveTest({ soilFinerThanSCL: v })} />
      <p class="readout" role="status">{s.message}</p>
      {left != null && (
        <p class={`timer${left <= 0 ? ' due' : ''}`} aria-label={left <= 0 ? 'Time limit reached' : 'Time left'}>
          {left <= 0 ? `+${countdown(left)}` : countdown(left)}
        </p>
      )}
      {s.step === 'not-started' && (
        <div class="btn-row">
          <button class="btn primary" onClick={start(() => setFill(0, { startAt: props.now }))}>
            Start first 12" filling
          </button>
          <button class="btn" onClick={start(() => saveTest({ presoak: { startAt: props.now, endAt: '' } }))}>
            Start 4-h presoak
          </button>
        </div>
      )}
      {(s.step === 'fill-1' || s.step === 'fill-2') && (
        <div class={s.overdue ? 'btn-row' : ''}>
          <button class={`btn${s.overdue ? '' : ' primary block'}`} onClick={() => setFill(s.step === 'fill-1' ? 0 : 1, { endAt: props.now })}>
            Drained (hole empty)
          </button>
          {s.overdue && (
            <button class="btn primary" onClick={start(() => saveTest({ presoak: { startAt: props.now, endAt: '' } }))}>
              Start 4-h presoak
            </button>
          )}
        </div>
      )}
      {s.step === 'fill-2-needed' && (
        <button class="btn primary block" onClick={start(() => setFill(1, { startAt: props.now }))}>
          Start second 12" filling
        </button>
      )}
      {s.step === 'presoak' && (
        <button class="btn primary block" onClick={start(() => saveTest({ presoak: { startAt: props.now, endAt: '' } }))}>
          Start 4-h presoak
        </button>
      )}
      {s.step === 'presoaking' && (
        <button class="btn primary block" onClick={() => saveTest({ presoak: { ...t.presoak, endAt: props.now } })}>
          End presoak
        </button>
      )}
      {s.step === 'sandy' && t.mode !== 'sandy' && (
        <button class="btn block" onClick={() => saveTest({ mode: 'sandy', intervalMin: 15 })}>
          Use the sandy-soil test
        </button>
      )}
      {t.fills.map((f, i) => (
        <div class="pair" key={i}>
          <TimeField day={now.slice(0, 10)} label={`Filling ${i + 1} start`} value={f.startAt} onInput={(v) => setFill(i, { startAt: v })} />
          <TimeField day={now.slice(0, 10)} label={`Filling ${i + 1} drained`} value={f.endAt} onInput={(v) => setFill(i, { endAt: v })} />
        </div>
      ))}
      {t.presoak.startAt && (
        <div class="pair">
          <TimeField day={now.slice(0, 10)} label="Presoak start" value={t.presoak.startAt} onInput={(v) => saveTest({ presoak: { ...t.presoak, startAt: v } })} />
          <TimeField day={now.slice(0, 10)} label="Presoak end" value={t.presoak.endAt} onInput={(v) => saveTest({ presoak: { ...t.presoak, endAt: v } })} />
        </div>
      )}
    </section>
  );
}

function ReadingCard(props: { record: FieldRecord; test: PercTest; reading: PercReading; index: number; now: string; save: (r: FieldRecord) => void }) {
  const { record: r, test: t, reading } = props;
  const set = (patch: Partial<Omit<PercReading, 'id'>>) => props.save(updateReading(r, t.id, reading.id, patch));
  const c = readingCalc(reading);
  const n = props.index + 1;
  const num = (v: number | null, d: number) => (v == null ? '—' : v.toFixed(d));
  return (
    <section class="card" aria-label={`Reading ${n}`}>
      <h3>Reading {n}</h3>
      <div class="pair">
        <TimeField day={props.now.slice(0, 10)} seconds={t.mode === 'fixed-drop'} label="Start" value={reading.startAt} onInput={(v) => set({ startAt: v })} />
        <TimeField day={props.now.slice(0, 10)} seconds={t.mode === 'fixed-drop'} label="End" value={reading.endAt} onInput={(v) => set({ endAt: v })} />
      </div>
      <TapeField label="Initial distance below reference point" value={reading.initialIn} onInput={(v) => set({ initialIn: v })} />
      <TapeField label="Final distance below reference point" value={reading.finalIn} onInput={(v) => set({ finalIn: v })} />
      <dl class="calc" aria-label={`Reading ${n} results`}>
        <div>
          <dt>Interval</dt>
          <dd>{num(c.intervalMin, t.mode === 'fixed-drop' ? 2 : 0)} min</dd>
        </div>
        <div>
          <dt>Drop</dt>
          <dd>{c.dropIn == null ? '—' : tapeText(c.dropIn)}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{num(c.rateMpi, 1)} mpi</dd>
        </div>
      </dl>
      <button class="link-btn" onClick={() => confirm(`Delete reading ${n}?`) && props.save(removeReading(r, t.id, reading.id))}>
        Delete reading {n}
      </button>
    </section>
  );
}

function NextAction(props: { record: FieldRecord; test: PercTest; now: string; save: (r: FieldRecord) => void }) {
  const { record: r, test: t, now } = props;
  const open = t.readings.at(-1) && !t.readings.at(-1)!.endAt ? t.readings.at(-1)! : null;
  const n = t.readings.length;
  const startNew = () => {
    primeAlerts();
    const prev = t.readings.at(-1);
    // Sandy test: the hole is refilled to 6" before each reading, so the initial distance is re-read.
    props.save(addReading(r, t.id, { startAt: now, initialIn: t.mode === 'sandy' ? null : (prev?.finalIn ?? null) }));
  };

  if (t.mode === 'fixed-drop') {
    if (!open)
      return (
        <button class="btn primary block" onClick={startNew}>
          Start timing drop {n + 1}
        </button>
      );
    const elapsed = -secondsUntil(open.startAt, now);
    return (
      <>
        <p class="timer" aria-label="Elapsed">{countdown(elapsed)}</p>
        <button
          class="btn primary block"
          disabled={open.initialIn == null || t.fixedDropIn == null}
          onClick={() =>
            props.save(updateReading(r, t.id, open.id, { endAt: now, finalIn: open.initialIn != null && t.fixedDropIn != null ? open.initialIn + t.fixedDropIn : open.finalIn }))
          }
        >
          Water dropped {t.fixedDropIn != null ? tapeText(t.fixedDropIn) : ''}
        </button>
        {open.initialIn == null && <p class="hint">Enter the initial distance for drop {n} first.</p>}
      </>
    );
  }

  if (!open)
    return (
      <button class={`btn block${stopRule(t).met ? '' : ' primary'}`} onClick={startNew}>
        Start reading {n + 1} now
      </button>
    );
  const due = nextReadingDue(t);
  const left = due ? secondsUntil(due, now) : null;
  const record = (next: boolean) => {
    let x = updateReading(r, t.id, open.id, { endAt: now });
    if (next) x = addReading(x, t.id, t.mode === 'sandy' ? { initialIn: null } : {});
    props.save(x);
  };
  return (
    <>
      {left != null && (
        <p class={`timer${left <= 0 ? ' due' : ''}`} aria-label={left <= 0 ? 'Reading due' : 'Next reading in'}>
          {left <= 0 ? `Due +${countdown(left)}` : countdown(left)}
          <small class="muted"> {due && `(${clock(due)})`}</small>
        </p>
      )}
      <div class="btn-row">
        <button class="btn primary" disabled={open.finalIn == null} onClick={() => record(true)}>
          Record &amp; start next
        </button>
        <button class="btn" disabled={open.finalIn == null} onClick={() => record(false)}>
          Record &amp; finish
        </button>
      </div>
      {open.finalIn == null && <p class="hint">Enter the final distance for reading {n}, then record it.</p>}
    </>
  );
}

function StopRuleBox({ test }: { test: PercTest }) {
  const s = stopRule(test);
  return (
    <div aria-label="Stop rule" role="status">
      {s.met && s.finalRateMpi != null ? (
        <p class="ok-box">
          Stop rule met. Final rate {s.finalRateMpi.toFixed(1)} mpi (reading {s.finalIndex! + 1}). {s.message}
        </p>
      ) : (
        <p class="readout">{s.message}</p>
      )}
      {s.warnings.map((w) => (
        <p class="hint-warn">{w}</p>
      ))}
    </div>
  );
}
