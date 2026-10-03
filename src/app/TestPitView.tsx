import { useEffect, useState } from 'preact/hooks';
import { lastEdit, pitPath } from '../domain/merge';
import {
  addHorizon,
  copyHorizons,
  depthText,
  removeHorizon,
  removeTestPit,
  updateHorizon,
  updateTestPit,
  type FieldRecord,
  type Horizon,
  type TestPit,
} from '../domain/fieldRecord';
import { basisText, colorText, horizonNotes, missingItems, pitSummary, structureText, textureText } from '../domain/soilLogText';
import * as V from '../domain/vocabulary';
import { go } from './App';
import { Chips, NumberField, TextField, YesNoChips } from './fields';
import type { RecordStore } from '../storage/db';
import { MunsellPicker } from './MunsellPicker';
import { PitMedia } from './PitMedia';
import { TextureGuide } from './TextureGuide';
import { pitWarnings } from '../domain/rules';
import { hueWarning } from '../domain/hueCheck';
import { wallOf, wallSide } from '../domain/pitWalls';
import { RuleWarnings } from './RuleWarnings';
import { AiReviewLine, OpenChecksLink, WallChecks } from './PitChecks';
import { acceptFill, suggestions, type Fill, type FillField } from '../domain/fillGaps';

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
  const fills = suggestions(r).filter((f) => f.wallId === pit.id);
  const savePit = (patch: Partial<Omit<TestPit, 'id'>>) => props.save(updateTestPit(r, pit.id, patch));
  // Wall B starts from wall A of the same hole (only depths change); otherwise the previous pit.
  const otherWall = r.testPits.find((p) => p !== pit && p.horizons.length > 0 && wallOf(p.label).pit === wallOf(pit.label).pit);
  const previous = otherWall ?? r.testPits.slice(0, pitIndex).reverse().find((p) => p.horizons.length > 0);
  const side = wallSide(pit.label);

  const remove = () => {
    if (!confirm(`Delete test pit ${pit.label}? This cannot be undone.`)) return;
    props.save(removeTestPit(r, pit.id));
    go(back);
  };

  return (
    <main class="page pit-page">
      <header class="bar">
        <a class="back" href={back} aria-label="Back to site evaluation">‹</a>
        <h1>Test pit {pit.label}</h1>
      </header>
      {side && <p class="hint">{side === 'north' ? 'North' : 'South'} wall of test pit {wallOf(pit.label).pit}</p>}
      <EditedBy record={props.record} pitId={pit.id} />
      <OpenChecksLink record={r} wall={pit} />

      <TextField label="Test pit #" value={pit.label} onInput={(v) => savePit({ label: v })} autoCapitalize="characters" />

      {pit.horizons.length === 0 && previous && (
        <button class={`btn block${otherWall ? ' primary' : ''}`} onClick={() => props.save(copyHorizons(r, previous.id, pit.id))}>
          {otherWall ? `Start from wall ${otherWall.label} (same hole: change the depths)` : `Copy horizons from test pit ${previous.label}`}
        </button>
      )}

      {pit.horizons.map((hz, i) => (
        <HorizonCard
          key={hz.id}
          pit={pit}
          pits={r.testPits}
          index={i}
          missing={missing.horizons[i]}
          fills={fills.filter((f) => f.horizonId === hz.id)}
          accept={(f) => props.save(acceptFill(r, f))}
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

      <WallChecks record={r} wall={pit} save={props.save} />
      <AiReviewLine record={r} wall={pit} />

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
  /** Every wall on the site, for the hue check. */
  pits: TestPit[];
  index: number;
  missing: string[];
  /** What the soil log will print in each blank field (domain/fillGaps), with its source. */
  fills: Fill[];
  accept: (f: Fill) => void;
  open: boolean;
  set: (patch: Partial<Omit<Horizon, 'id'>>) => void;
  remove: () => void;
}) {
  const { pit, index: i, set } = props;
  const suggest = (field: FillField) => {
    const f = props.fills.find((x) => x.field === field);
    return f && <Suggestion fill={f} accept={props.accept} />;
  };
  const hz = pit.horizons[i];
  const title = [`Horizon ${i + 1}`, hz.designation, depthText(hz)].filter(Boolean).join(' · ');
  const sandy = V.SANDY_TEXTURES.includes(hz.texture.cls);
  const structureless = V.STRUCTURELESS.includes(hz.structure.shape);
  const quickBottoms = i === 0 ? V.FIRST_BOTTOMS : V.PIT_BOTTOMS;
  const [rockProblem, setRockProblem] = useState<string>();
  const hueCheck = hueWarning(props.pits, hz);

  return (
    <section class="card" aria-label={`Horizon ${i + 1}`}>
      <details open={props.open}>
        <summary>
          <span class="summary-title">{title}</span>
          <span class={props.missing.length ? 'badge warn' : 'badge ok'}>
            {props.missing.length ? `${props.missing.length} to fill` : 'Complete'}
          </span>
        </summary>

        <Chips label="Horizon" options={V.HORIZONS} value={hz.designation} onChange={(v) => set({ designation: v })} other asTyped />

        <div class="pair">
          <NumberField label="Top" value={hz.topIn} onInput={(v) => set({ topIn: v })} readOnly={i > 0} hint={i > 0 ? 'Bottom of horizon above' : undefined} />
          <NumberField label="Bottom" value={hz.bottomIn} onInput={(v) => set({ bottomIn: v })} />
        </div>
        <Chips label="Quick bottom" options={quickBottoms.map((n) => ({ value: String(n), label: `${n}"` }))} value={String(hz.bottomIn ?? '')} onChange={(v) => set({ bottomIn: v ? Number(v) : null })} />

        <MunsellPicker label="Color (Munsell)" value={hz.color} onChange={(m) => set({ color: { ...hz.color, ...m, other: '' } })} />
        {suggest('color')}
        {hueCheck && (
          <p class="hint-warn" role="status">
            {hueCheck}{' '}
            <button type="button" class="btn small" onClick={() => set({ color: { ...hz.color, keptHue: hz.color.hue } })}>
              Keep {hz.color.hue}
            </button>
          </p>
        )}
        <div class="pair">
          <Chips label="Moisture" options={V.MOISTURE} value={hz.color.moisture} onChange={(v) => set({ color: { ...hz.color, moisture: v } })} />
          <Chips label="State" options={V.PHYSICAL_STATE} value={hz.color.physicalState} onChange={(v) => set({ color: { ...hz.color, physicalState: v } })} />
        </div>
        {hz.color.other && <TextField label="Color as typed" value={hz.color.other} onInput={(v) => set({ color: { ...hz.color, other: v } })} autoCapitalize="characters" hint="Picking a Munsell chip replaces this text." />}

        <fieldset class="group">
          <legend>Texture</legend>
          <Chips label="USDA class" options={V.TEXTURES} value={hz.texture.cls} onChange={(v) => set({ texture: { ...hz.texture, cls: v } })} other />
          {suggest('texture')}
          <TextureGuide current={hz.texture.cls} onUse={(cls) => set({ texture: { ...hz.texture, cls } })} />
          {sandy && <Chips label="Sand size" options={V.SAND_SIZES} value={hz.texture.sandSize} onChange={(v) => set({ texture: { ...hz.texture, sandSize: v } })} />}
          <NumberField
            label="Rock fragments (by volume)"
            unit="%"
            value={hz.rock.pct}
            onInput={(v) => {
              setRockProblem(V.rockPctProblem(v));
              if (!V.rockPctProblem(v)) set({ rock: { ...hz.rock, pct: v } });
            }}
          />
          {suggest('rock')}
          {rockProblem && (
            <p class="alert" role="alert">
              {rockProblem}
            </p>
          )}
          {(hz.rock.pct ?? 0) > 0 && (
            <Chips
              label="Rock size"
              options={V.ROCK_KINDS.map((k) => ({ value: k, label: k, help: V.ROCK_KIND_HELP[k] }))}
              value={hz.rock.kind}
              onChange={(v) => set({ rock: { ...hz.rock, kind: v || 'ROCKS', kind2: '' } })}
            />
          )}
          {(hz.rock.pct ?? 0) > 0 && V.rockRangeTo(hz.rock.kind).length > 0 && (
            <Chips
              label="Rock size range to (optional)"
              options={V.rockRangeTo(hz.rock.kind).map((k) => ({ value: k, label: k, help: V.ROCK_KIND_HELP[k] }))}
              value={hz.rock.kind2 ?? ''}
              onChange={(v) => set({ rock: { ...hz.rock, kind2: v } })}
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
          {suggest('structure')}
          {hz.structure.other && <TextField label="Structure as typed" value={hz.structure.other} onInput={(v) => set({ structure: { ...hz.structure, other: v } })} autoCapitalize="characters" hint="Picking above replaces this text." />}
          {structureText(hz) && <p class="readout">Prints as <strong>{structureText(hz)}</strong></p>}
        </fieldset>

        <Chips label="Consistence" options={V.CONSISTENCE} value={hz.consistence} onChange={(v) => set({ consistence: v })} hint="Moist: loose … extremely firm. Dry: soft … very hard." />
        <Chips label="Plasticity" options={V.PLASTICITY} value={hz.plasticity} onChange={(v) => set({ plasticity: v })} hint="Roll a 3 mm wire (DEQ-4 §1.2.60)." />

        <div class="pair">
          <YesNoChips label="Roots" value={hz.roots} onChange={(v) => set({ roots: v })} />
          <YesNoChips label="Mottling" value={hz.mottling.present} onChange={(v) => set({ mottling: { ...hz.mottling, present: v } })} />
        </div>
        {suggest('roots')}
        {suggest('mottling')}
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

/** Collapsed to the row that will print; a normal pit needs nothing here (spec 2026-10-02). */
function PitSummary(props: { pit: TestPit; missing: string[]; save: (patch: Partial<Omit<TestPit, 'id'>>) => void }) {
  const { pit, save } = props;
  const w = pit.observedWater;
  const l = pit.limitingLayer;
  const g = pit.shgw;
  const autoDepth = pit.horizons.at(-1)?.bottomIn;
  const summary = pitSummary(pit);
  // Opens when something becomes missing; never closes by itself (no snapping shut mid-edit).
  const incomplete = props.missing.length > 0;
  const [open, setOpen] = useState(incomplete);
  useEffect(() => {
    if (incomplete) setOpen(true);
  }, [incomplete]);
  return (
    <section class="card" aria-label="Test pit summary">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary class="pit-summary">
          <span class="summary-title">Test pit summary</span>
          <span class={props.missing.length ? 'badge warn' : 'badge ok'}>{props.missing.length ? `${props.missing.length} to fill` : 'Complete'}</span>
          <span class="summary-line">{summary || 'Nothing to print yet.'}</span>
        </summary>

        <NumberField
          label="Total depth"
          value={pit.totalDepthIn}
          onInput={(v) => save({ totalDepthIn: v })}
          placeholder={autoDepth != null ? String(autoDepth) : ''}
          hint={pit.totalDepthIn == null && autoDepth != null ? `Blank uses the deepest horizon (${autoDepth}").` : undefined}
        />

        <Chips label="Groundwater observed in pit" options={V.OBSERVED_WATER} value={w.kind} onChange={(v) => save({ observedWater: { ...w, kind: v as TestPit['observedWater']['kind'] } })} />
        {(w.kind === 'SEEPAGE' || w.kind === 'STANDING') && <NumberField label="Water depth" value={w.depthIn} onInput={(v) => save({ observedWater: { ...w, depthIn: v } })} />}
        <Chips label="Basis" options={V.SHGW_BASIS} value={basisText(g.basis)} onChange={(v) => save({ shgw: { ...g, basis: v } })} other />

        <Chips label="Limiting layer" options={V.LIMITING_LAYERS} value={l.type} onChange={(v) => save({ limitingLayer: { ...l, type: v as TestPit['limitingLayer']['type'] } })} />
        {l.type && l.type !== 'NONE' && <NumberField label="Depth to limiting layer" value={l.depthIn} onInput={(v) => save({ limitingLayer: { ...l, depthIn: v } })} />}
        {l.type === 'OTHER' && <TextField label="Limiting layer description" value={l.other} onInput={(v) => save({ limitingLayer: { ...l, other: v } })} autoCapitalize="characters" />}

        <NumberField label="Slope" unit="%" value={pit.slope.pct} onInput={(v) => save({ slope: { ...pit.slope, pct: v } })} hint="Estimated." />

        <TextField label="Test pit notes" value={pit.notes} onInput={(v) => save({ notes: v })} autoCapitalize="characters" />
        {props.missing.length > 0 && <p class="hint-warn">Still needed: {props.missing.join(', ')}</p>}
      </details>
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

const FIELD_NAMES: Record<FillField, string> = { color: 'Color', texture: 'Texture', rock: 'Rock fragments', structure: 'Structure', roots: 'Roots', mottling: 'Mottling' };
const YES_NO: Record<string, string> = { Y: 'YES', N: 'NO' };

/** A blank field's fill, greyed, with where it comes from; Use saves it, editing the field replaces it. */
function Suggestion(props: { fill: Fill; accept: (f: Fill) => void }) {
  const f = props.fill;
  return (
    <div class="suggest" role="group" aria-label={`Suggested ${FIELD_NAMES[f.field].toLowerCase()}`}>
      <p>
        <span class="suggest-value">
          {FIELD_NAMES[f.field]}: {YES_NO[f.value] ?? f.value}
        </span>
        <span class="suggest-source">Soil log prints this: {f.source}</span>
      </p>
      <button type="button" class="btn small" onClick={() => props.accept(f)}>
        Use
      </button>
    </div>
  );
}
