import { useState } from 'preact/hooks';
import { TEXTURE_STEPS, walk, type TextureStep } from '../domain/textureByFeel';

/**
 * Step-by-step texture-by-feel guide (Thien flowchart). The class it reaches is only
 * applied when the evaluator taps "Use"; the USDA class chips remain the record and can override it.
 */
export function TextureGuide(props: { current: string; onUse: (cls: string) => void }) {
  const [answers, setAnswers] = useState<string[] | null>(null);

  if (!answers)
    return (
      <button class="link-btn" onClick={() => setAnswers([])}>
        Not sure? Texture by feel guide
      </button>
    );

  const state = walk(answers);
  const back = () => setAnswers(answers.slice(0, -1));
  const close = () => setAnswers(null);

  return (
    <div class="guide" role="group" aria-label="Texture by feel guide">
      {'result' in state ? (
        <>
          <p class="guide-result">
            Texture by feel: <strong>{state.result}</strong>
          </p>
          {props.current && props.current !== state.result && (
            <p class="hint">Currently recorded: {props.current}</p>
          )}
          <button
            class="btn primary block"
            onClick={() => {
              props.onUse(state.result);
              close();
            }}
          >
            Use {state.result}
          </button>
        </>
      ) : (
        <Question step={TEXTURE_STEPS[state.at]} onAnswer={(v) => setAnswers([...answers, v])} />
      )}
      <div class="guide-nav">
        {answers.length > 0 && (
          <button class="btn small" onClick={back}>
            Back a step
          </button>
        )}
        <button class="btn small" onClick={close}>
          Close guide
        </button>
      </div>
    </div>
  );
}

function Question(props: { step: TextureStep; onAnswer: (v: string) => void }) {
  const { step } = props;
  return (
    <>
      {step.instruction && <p class="guide-do">{step.instruction}</p>}
      <p class="guide-q">{step.question}</p>
      <div class="guide-answers">
        {step.answers.map((a) => (
          <button key={a.value} class="btn" onClick={() => props.onAnswer(a.value)}>
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}
