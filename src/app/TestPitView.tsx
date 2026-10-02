import { lastEdit, pitPath } from '../domain/merge';
import {
  addHorizon,
  copyHorizons,
  depthText,
  pitDepth,
  removeHorizon,
  removeTestPit,
  updateHorizon,
  updateTestPit,
  type FieldRecord,
  type Horizon,
  type TestPit,
} from '../domain/fieldRecord';
import { colorText, horizonNotes, missingItems, pitFootnotes, structureText, textureText } from '../domain/soilLogText';
import * as V from '../domain/vocabulary';
import { go } from './App';
import { Chips, NumberField, TextField, YesNoChips } from './fields';
import type { RecordStore } from '../storage/db';
import { MunsellPicker } from './MunsellPicker';
import { PitMedia } from './PitMedia';
import { TextureGuide } from './TextureGuide';
import { pitWarnings } from '../domain/rules';
import { RuleWarnings } from './RuleWarnings';

export function TestPitView(props: { record: FieldRecord; pitId: string; save: (r: FieldRecord) => void; store: RecordStore }) {
  const r = props.record;
  const pitIndex = r.testPits.findIndex((p) => p.id === props.pitId);
  const pit = r.testPits[pitIndex];
  const back = `#/se/${r.id}`;
  if (!pit)
    return (
      <main class="page">
        <p>That test pit is not in this site evaluation.</p>
        <a class="btn" href={back}>Back</a>
      </main>
    );

  const missing = missingItems(pit);
  const savePit = (patch: Partial<Omit<TestPit, 'id'>>) => props.save(updateTestPit(r, pit.id, patch));
  const previous = r.testPits.slice(0, pitIndex).reverse().find((p) => p.horizons.length > 0);

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
      <EditedBy record={props.record} pitId={pit.id} />

      <TextField label="Test pit #" value={pit.label} onInput={(v) => savePit({ label: v })} autoCapitalize="characters" />

      {pit.horizons.length === 0 && previous && (
        <button class="btn block" onClick={() => props.save(copyHorizons(r, previous.id, pit.id))}>
          Copy horizons from test pit {previous.label}
        </button>
      )}

      {pit.horizons.map((hz, i) => (
        <HorizonCard
          key={hz.id}
          pit={pit}
          index={i}
          missing={missing.horizons[i]}
          open={i === pit.horizons.length - 1}
          set={(patch) => props.save(updateHorizon(r, pit.id, hz.id, patch))}
          remove={() => {
            if (confirm(`Delete horizon ${i + 1}${hz.designation ? ` (${hz.designation})` : ''}?`)) props.save(removeHorizon(r, pit.id, hz.id));
          }}
        />
      ))}

      <button class="btn primary block" onClick={() => props.save(addHorizon(r, pit.id))}>
        Add horizon
      </button>

      <PitSummary pit={pit} missing={missing.pit} save={savePit} />

      <RuleWarnings warnings={pitWarnings(r, pit)} />

      <PitMedia record={r} pit={pit} save={props.save} store={props.store} />

      <section class="danger-zone">
        <button class="btn danger" onClick={remove}>
          Delete test pit
        </button>
      </section>
    </main>
  );
}

function HorizonCard(props: {
  pit: TestPit;
  index: number;
  missing: string[];
  open: boolean;
  set: (patch: Partial<Omit<Horizon, 'id'>>) => void;
  remove: () => void;
}) {
  const { pit, index: i, set } = props;
  const hz = pit.horizons[i];
  const title = [`Horizon ${i + 1}`, hz.designation, depthText(hz)].filter(Boolean).join(' · ');
  const sandy = V.SANDY_TEXTURES.includes(hz.texture.cls);
  const structureless = V.STRUCTURELESS.includes(hz.structure.shape);
  const quickBottoms = i === 0 ? V.FIRST_BOTTOMS : V.PIT_BOTTOMS;

  return (
    <section class="card" aria-label={`Horizon ${i + 1}`}>
      <details open={props.open}>
        <summary>
          <span class="summary-title">{title}</span>
          <span class={props.missing.length ? 'badge warn' : 'badge ok'}>
            {props.missing.length ? `${props.missing.length} to fill` : 'Complete'}
          </span>
        </summary>

        <Chips label="Horizon" options={V.HORIZONS} value={hz.designation} onChange={(v) => set({ designation: v })} other />

        <div class="pair">
          <NumberField label="Top" value={hz.topIn} onInput={(v) => set({ topIn: v })} readOnly={i > 0} hint={i > 0 ? 'Bottom of horizon above' : undefined} />
          <NumberField label="Bottom" value={hz.bottomIn} onInput={(v) => set({ bottomIn: v })} />
        </div>
        <Chips label="Quick bottom" options={quickBottoms.map((n) => ({ value: String(n), label: `${n}"` }))} value={String(hz.bottomIn ?? '')} onChange={(v) => set({ bottomIn: v ? Number(v) : null })} />

        <MunsellPicker label="Color (Munsell)" value={hz.color} onChange={(m) => set({ color: { ...hz.color, ...m, other: '' } })} />
        <div class="pair">
          <Chips label="Moisture" options={V.MOISTURE} value={hz.color.moisture} onChange={(v) => set({ color: { ...hz.color, moisture: v } })} />
          <Chips label="State" options={V.PHYSICAL_STATE} value={hz.color.physicalState} onChange={(v) => set({ color: { ...hz.color, physicalState: v } })} />
        </div>
        {hz.color.other && <TextField label="Color as typed" value={hz.color.other} onInput={(v) => set({ color: { ...hz.color, other: v } })} autoCapitalize="characters" hint="Picking a Munsell chip replaces this text." />}

        <fieldset class="group">
          <legend>Texture</legend>
          <Chips label="USDA class" options={V.TEXTURES} value={hz.texture.cls} onChange={(v) => set({ texture: { ...hz.texture, cls: v } })} other />
          <TextureGuide current={hz.texture.cls} onUse={(cls) => set({ texture: { ...hz.texture, cls } })} />
          {sandy && <Chips label="Sand size" options={V.SAND_SIZES} value={hz.texture.sandSize} onChange={(v) => set({ texture: { ...hz.texture, sandSize: v } })} />}
          <NumberField label="Rock fragments (by volume)" unit="%" value={hz.rock.pct} onInput={(v) => set({ rock: { ...hz.rock, pct: v } })} />
          {(hz.rock.pct ?? 0) > 0 && (
            <Chips
              label="Rock size"
              options={V.ROCK_KINDS.map((k) => ({ value: k, label: k, help: V.ROCK_KIND_HELP[k] }))}
              value={hz.rock.kind}
              onChange={(v) => set({ rock: { ...hz.rock, kind: v || 'ROCKS' } })}
            />
          )}
          {textureText(hz) && <p class="readout">Prints as <strong>{textureText(hz)}</strong></p>}
        </fieldset>

        <fieldset class="group">
          <legend>Structure</legend>
          <Chips label="Shape" options={V.STRUCTURE_SHAPES} value={hz.structure.shape} onChange={(v) => set({ structure: { ...hz.structure, shape: v, other: '' } })} />
          {!structureless && (
            <>
              <Chips label="Grade" options={V.STRUCTURE_GRADES} value={hz.structure.grade} onChange={(v) => set({ structure: { ...hz.structure, grade: v, other: '' } })} />
              <Chips label="Size" options={V.STRUCTURE_SIZES} value={hz.structure.size} onChange={(v) => set({ structure: { ...hz.structure, size: v, other: '' } })} />
              {hz.structure.size && (
                <Chips label="Size range to (optional)" options={V.STRUCTURE_SIZES.filter((s) => s !== hz.structure.size)} value={hz.structure.size2} onChange={(v) => set({ structure: { ...hz.structure, size2: v, other: '' } })} />
              )}
            </>
          )}
          {hz.structure.other && <TextField label="Structure as typed" value={hz.structure.other} onInput={(v) => set({ structure: { ...hz.structure, other: v } })} autoCapitalize="characters" hint="Picking above replaces this text." />}
          {structureText(hz) && <p class="readout">Prints as <strong>{structureText(hz)}</strong></p>}
        </fieldset>

        <Chips label="Consistence" options={V.CONSISTENCE} value={hz.consistence} onChange={(v) => set({ consistence: v })} hint="Moist: loose … extremely firm. Dry: soft … very hard." />
        <Chips label="Plasticity" options={V.PLASTICITY} value={hz.plasticity} onChange={(v) => set({ plasticity: v })} hint="Roll a 3 mm wire (DEQ-4 §1.2.60)." />

        <div class="pair">
          <YesNoChips label="Roots" value={hz.roots} onChange={(v) => set({ roots: v })} />
          <YesNoChips label="Mottling" value={hz.mottling.present} onChange={(v) => set({ mottling: { ...hz.mottling, present: v } })} />
        </div>
        {hz.mottling.present === 'Y' && (
          <fieldset class="group">
            <legend>Mottles (redoximorphic features)</legend>
            <Chips label="Quantity" options={V.MOTTLE_QUANTITY.map((q) => ({ value: q, label: q, help: V.MOTTLE_QUANTITY_HELP[q] }))} value={hz.mottling.quantity} onChange={(v) => set({ mottling: { ...hz.mottling, quantity: v } })} />
            <Chips label="Size" options={V.MOTTLE_SIZE} value={hz.mottling.size} onChange={(v) => set({ mottling: { ...hz.mottling, size: v } })} />
            <Chips label="Contrast" options={V.MOTTLE_CONTRAST} value={hz.mottling.contrast} onChange={(v) => set({ mottling: { ...hz.mottling, contrast: v } })} />
            <MunsellPicker label="Mottle color" value={hz.mottling.color} onChange={(m) => set({ mottling: { ...hz.mottling, color: m } })} />
          </fieldset>
        )}

        <TextField label="Notes" value={hz.notes} onInput={(v) => set({ notes: v })} autoCapitalize="characters" />

        <div class="preview" aria-label={`Horizon ${i + 1} soil log preview`}>
          <p><span class="muted">COLOR</span> {colorText(hz) || '—'}</p>
          <p><span class="muted">NOTES</span> {horizonNotes(pit, i) || '—'}</p>
        </div>
        {props.missing.length > 0 && <p class="hint-warn">Still needed (DEQ-4 §2.1.4.1): {props.missing.join(', ')}</p>}

        <button class="btn danger small" onClick={props.remove}>
          Delete horizon
        </button>
      </details>
    </section>
  );
}

function PitSummary(props: { pit: TestPit; missing: string[]; save: (patch: Partial<Omit<TestPit, 'id'>>) => void }) {
  const { pit, save } = props;
  const w = pit.observedWater;
  const l = pit.limitingLayer;
  const g = pit.shgw;
  const s = pit.slope;
  const autoDepth = pit.horizons.at(-1)?.bottomIn;
  const foot = pitFootnotes(pit);
  return (
    <section class="card" aria-label="Test pit summary">
      <h2>Test pit summary</h2>
      <NumberField
        label="Total depth"
        value={pit.totalDepthIn}
        onInput={(v) => save({ totalDepthIn: v })}
        placeholder={autoDepth != null ? String(autoDepth) : ''}
        hint={pit.totalDepthIn == null && autoDepth != null ? `Blank uses the last horizon bottom (${autoDepth}").` : undefined}
      />

      <Chips label="Groundwater observed in pit" options={V.OBSERVED_WATER} value={w.kind} onChange={(v) => save({ observedWater: { ...w, kind: v as TestPit['observedWater']['kind'] } })} />
      {(w.kind === 'SEEPAGE' || w.kind === 'STANDING') && <NumberField label="Water depth" value={w.depthIn} onInput={(v) => save({ observedWater: { ...w, depthIn: v } })} />}

      <fieldset class="group">
        <legend>Seasonal high groundwater (estimate)</legend>
        <div class="pair">
          <NumberField label="Depth" value={g.depthIn} onInput={(v) => save({ shgw: { ...g, depthIn: v } })} />
          <Chips label="Qualifier" options={[{ value: 'Y', label: 'Deeper than (>)' }]} value={g.deeperThan ? 'Y' : ''} onChange={(v) => save({ shgw: { ...g, deeperThan: v === 'Y' } })} />
        </div>
        {g.depthIn == null && pitDepth(pit) != null && (
          <button type="button" class="link-btn" onClick={() => save({ shgw: { depthIn: pitDepth(pit), deeperThan: true, basis: g.basis || 'NO REDOXIMORPHIC FEATURES TO PIT DEPTH' } })}>
            Deeper than pit ({pitDepth(pit)}"), no redox features
          </button>
        )}
        <Chips label="Basis" options={V.SHGW_BASIS} value={g.basis} onChange={(v) => save({ shgw: { ...g, basis: v } })} other />
      </fieldset>

      <fieldset class="group">
        <legend>Limiting layer</legend>
        <Chips label="Type" options={V.LIMITING_LAYERS} value={l.type} onChange={(v) => save({ limitingLayer: { ...l, type: v as TestPit['limitingLayer']['type'] } })} />
        {l.type && l.type !== 'NONE' && <NumberField label="Depth to limiting layer" value={l.depthIn} onInput={(v) => save({ limitingLayer: { ...l, depthIn: v } })} />}
        {l.type === 'OTHER' && <TextField label="Limiting layer description" value={l.other} onInput={(v) => save({ limitingLayer: { ...l, other: v } })} autoCapitalize="characters" />}
      </fieldset>

      <fieldset class="group">
        <legend>Slope</legend>
        <NumberField label="Slope" unit="%" value={s.pct} onInput={(v) => save({ slope: { ...s, pct: v } })} />
        <Chips label="Shape" options={V.SLOPE_SHAPES} value={s.shape} onChange={(v) => save({ slope: { ...s, shape: v } })} />
        <Chips label="Direction (downhill)" options={V.DIRECTIONS} value={s.direction} onChange={(v) => save({ slope: { ...s, direction: v } })} />
        <Chips label="Method" options={V.SLOPE_METHODS} value={s.method} onChange={(v) => save({ slope: { ...s, method: v } })} other />
      </fieldset>

      <TextField label="Test pit notes" value={pit.notes} onInput={(v) => save({ notes: v })} autoCapitalize="characters" />

      {foot.length > 0 && (
        <div class="preview" aria-label="Footnote preview">
          {foot.map((f) => <p>{f}</p>)}
        </div>
      )}
      {props.missing.length > 0 && <p class="hint-warn">Still needed: {props.missing.join(', ')}</p>}
    </section>
  );
}

function EditedBy(props: { record: FieldRecord; pitId: string }) {
  const e = lastEdit(props.record, pitPath(props.pitId));
  if (!e || new Set(Object.values(props.record.edits).map((x) => x.by)).size < 2) return null;
  return (
    <p class="hint">
      Last edited by {e.by}, {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </p>
  );
}
