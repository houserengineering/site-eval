import type { Warning } from '../domain/rules';

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
