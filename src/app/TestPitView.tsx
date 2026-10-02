import { addHorizon, depthText, removeTestPit, updateHorizon, updateTestPit, type FieldRecord, type Horizon } from '../domain/fieldRecord';
import { go } from './App';
import { InchesField, TextField } from './fields';

export function TestPitView(props: { record: FieldRecord; pitId: string; save: (r: FieldRecord) => void }) {
  const r = props.record;
  const pit = r.testPits.find((p) => p.id === props.pitId);
  const back = `#/se/${r.id}`;
  if (!pit)
    return (
      <main class="page">
        <p>That test pit is not in this site evaluation.</p>
        <a class="btn" href={back}>Back</a>
      </main>
    );

  const set = (hz: Horizon, k: keyof Omit<Horizon, 'id'>) => (v: any) => props.save(updateHorizon(r, pit.id, hz.id, { [k]: v }));

  const remove = () => {
    if (!confirm(`Delete test pit ${pit.label}? This cannot be undone.`)) return;
    props.save(removeTestPit(r, pit.id));
    go(back);
  };

  return (
    <main class="page">
      <header class="bar">
        <a class="back" href={back} aria-label="Back to site evaluation">‹</a>
        <h1>Test pit {pit.label}</h1>
      </header>

      <TextField
        label="Test pit #"
        value={pit.label}
        onInput={(v) => props.save(updateTestPit(r, pit.id, { label: v }))}
        autoCapitalize="characters"
      />

      {pit.horizons.map((hz, i) => (
        <section class="card" key={hz.id} aria-label={`Horizon ${i + 1}`}>
          <h2>
            Horizon {i + 1}
            {depthText(hz) && <span class="muted"> · {depthText(hz)}</span>}
          </h2>
          <TextField label="Horizon" value={hz.designation} onInput={set(hz, 'designation')} autoCapitalize="characters" />
          <div class="pair">
            <InchesField label="Top" value={hz.topIn} onInput={set(hz, 'topIn')} />
            <InchesField label="Bottom" value={hz.bottomIn} onInput={set(hz, 'bottomIn')} />
          </div>
          <TextField label="Color" value={hz.color} onInput={set(hz, 'color')} autoCapitalize="characters" />
          <TextField label="Texture" value={hz.texture} onInput={set(hz, 'texture')} autoCapitalize="characters" />
          <TextField label="Structure" value={hz.structure} onInput={set(hz, 'structure')} autoCapitalize="characters" />
          <div class="pair">
            <TextField label="Roots" value={hz.roots} onInput={set(hz, 'roots')} autoCapitalize="characters" />
            <TextField label="Mottling" value={hz.mottling} onInput={set(hz, 'mottling')} autoCapitalize="characters" />
          </div>
          <TextField label="Notes" value={hz.notes} onInput={set(hz, 'notes')} autoCapitalize="characters" />
        </section>
      ))}

      <button class="btn primary block" onClick={() => props.save(addHorizon(r, pit.id))}>
        Add horizon
      </button>

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete test pit
        </button>
      </section>
    </main>
  );
}
