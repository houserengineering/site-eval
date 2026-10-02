import { updateDesign, type Design, type FieldRecord } from '../domain/fieldRecord';
import { infiltrativeDepth, type Warning } from '../domain/rules';
import { Chips, NumberField } from './fields';

/** Advisory rule warnings; each opens to the rule text and its source. Never blocks anything. */
export function RuleWarnings(props: { warnings: Warning[]; title?: string; showSubject?: boolean }) {
  const { warnings } = props;
  if (!warnings.length) return null;
  return (
    <section class="rules" aria-label={props.title ?? 'Rule checks'}>
      <h3>
        {props.title ?? 'Rule checks'} <span class="badge warn">{warnings.length}</span>
      </h3>
      <p class="hint">Warnings only; the PE decides. Tap one for the rule and its source.</p>
      <ul class="rule-list">
        {warnings.map((w, i) => (
          <li key={`${w.rule.id}-${w.subject.id}-${i}`}>
            <details class="rule">
              <summary>
                {props.showSubject && <strong>{w.subject.name}: </strong>}
                {w.message}
              </summary>
              <div class="rule-body">
                <p class="rule-title">{w.rule.title}</p>
                <p>{w.rule.text}</p>
                <p class="rule-cite">
                  {citation(w)}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `ARM 17.36.320(4) · effective 4/15/2023`; the source name is added only when the section does not already name it. */
function citation(w: Warning): string {
  const { section, source, effective } = w.rule;
  const named = section.startsWith(source.split(' ')[0]);
  return [section, named ? '' : source, `effective ${effective}`].filter(Boolean).join(' · ');
}

const REVIEWS = [
  { value: 'SUB', label: 'DEQ subdivision' },
  { value: 'CTY', label: 'County permit' },
];
const USES = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'SHARED', label: 'Shared' },
  { value: 'MULTIPLE', label: 'Multiple-user' },
  { value: 'PUBLIC', label: 'Public' },
];
const SYSTEMS = [
  { value: 'GRAVITY', label: 'Gravity trench' },
  { value: 'PRESSURE', label: 'Pressure trench' },
  { value: 'AT-GRADE', label: 'At-grade' },
  { value: 'MOUND', label: 'Sand mound' },
  { value: 'ETA', label: 'ETA/ET' },
];

/** What is proposed, as far as known on site; only the rule checks use it. */
export function DesignSection(props: { record: FieldRecord; save: (r: FieldRecord) => void }) {
  const d = props.record.design;
  const set = (patch: Partial<Design>) => props.save(updateDesign(props.record, patch));
  return (
    <section aria-labelledby="design">
      <h2 id="design">Proposed system</h2>
      <p class="hint">For the rule checks only; not printed. Blank review checks both.</p>
      <Chips label="Review" options={REVIEWS} value={d.review} onChange={(v) => set({ review: v as Design['review'] })} />
      <Chips label="Use" options={USES} value={d.use} onChange={(v) => set({ use: v as Design['use'] })} />
      <Chips label="System" options={SYSTEMS} value={d.system} onChange={(v) => set({ system: v as Design['system'] })} />
      <NumberField
        label="Infiltrative depth"
        value={d.infiltrativeDepthIn}
        onInput={(v) => set({ infiltrativeDepthIn: v })}
        placeholder={String(infiltrativeDepth({ ...d, infiltrativeDepthIn: null }))}
        hint={d.infiltrativeDepthIn == null ? `Blank uses ${infiltrativeDepth(d)}" (${d.system === 'MOUND' || d.system === 'AT-GRADE' ? 'ground surface' : 'standard trench'}).` : undefined}
      />
      <div class="pair">
        <NumberField label="Drainfields" unit="" value={d.drainfields} onInput={(v) => set({ drainfields: v })} />
        {d.system === 'PRESSURE' && <NumberField label="Pressure zones" unit="" value={d.pressureZones} onInput={(v) => set({ pressureZones: v })} />}
      </div>
    </section>
  );
}
