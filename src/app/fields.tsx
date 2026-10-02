import { useId } from 'preact/hooks';

export function TextField(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  type?: 'text' | 'date';
  hint?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  autoCapitalize?: 'characters' | 'words' | 'off';
}) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        {...({ type: props.type ?? 'text' } as {})}
        value={props.value}
        inputMode={props.inputMode}
        autoCapitalize={props.autoCapitalize}
        autoComplete="off"
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      {props.hint && <p class="hint">{props.hint}</p>}
    </div>
  );
}

export function InchesField(props: { label: string; value: number | null; onInput: (v: number | null) => void }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <div class="suffixed">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={props.value ?? ''}
          onInput={(e) => {
            const t = e.currentTarget.value.trim();
            const n = Number(t);
            props.onInput(t === '' || !Number.isFinite(n) ? null : n);
          }}
        />
        <span aria-hidden="true">in</span>
      </div>
    </div>
  );
}
