import { useId, useState } from 'preact/hooks';

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

/** Number field with a unit suffix (inches, percent). Blank = not recorded. */
export function NumberField(props: {
  label: string;
  value: number | null;
  onInput: (v: number | null) => void;
  unit?: string;
  readOnly?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  // Keep the typed text (e.g. "5." on the way to "5.5") while it parses to the stored value.
  const [draft, setDraft] = useState(props.value == null ? '' : String(props.value));
  const parse = (t: string) => {
    const n = Number(t.trim());
    return t.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  const shown = parse(draft) === props.value ? draft : props.value == null ? '' : String(props.value);
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <div class="suffixed">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={shown}
          readOnly={props.readOnly}
          placeholder={props.placeholder}
          onInput={(e) => {
            setDraft(e.currentTarget.value);
            props.onInput(parse(e.currentTarget.value));
          }}
        />
        <span aria-hidden="true">{props.unit ?? 'in'}</span>
      </div>
      {props.hint && <p class="hint">{props.hint}</p>}
    </div>
  );
}

type Option = string | { value: string; label: string; help?: string };
const opt = (o: Option) => (typeof o === 'string' ? { value: o, label: o, help: undefined } : o);

/**
 * Single-choice tap-pick. Tapping the selected chip clears it. With `other`, an
 * "Other…" chip reveals a text box and any value not in the list is kept as typed.
 */
export function Chips(props: {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (v: string) => void;
  other?: boolean;
  disabled?: (v: string) => boolean;
  hint?: string;
}) {
  const id = useId();
  const options = props.options.map(opt);
  const isOther = props.value !== '' && !options.some((o) => o.value === props.value);
  const [typing, setTyping] = useState(false);
  const showOther = props.other && (isOther || typing);
  return (
    <div class="field">
      <span class="label" id={id}>{props.label}</span>
      <div class="chips" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => {
          const on = props.value === o.value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              class={`chip${on ? ' on' : ''}`}
              disabled={props.disabled?.(o.value) && !on}
              onClick={() => {
                setTyping(false);
                props.onChange(on ? '' : o.value);
              }}
            >
              {o.label}
              {o.help && <small> {o.help}</small>}
            </button>
          );
        })}
        {props.other && (
          <button
            type="button"
            role="radio"
            aria-checked={!!showOther}
            class={`chip${showOther ? ' on' : ''}`}
            onClick={() => {
              if (showOther) {
                setTyping(false);
                if (isOther) props.onChange('');
              } else setTyping(true);
            }}
          >
            Other…
          </button>
        )}
      </div>
      {showOther && (
        <input
          class="other-input"
          aria-label={`${props.label} (other)`}
          value={isOther ? props.value : ''}
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus={typing && !isOther}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      )}
      {props.hint && <p class="hint">{props.hint}</p>}
    </div>
  );
}

/** Yes/No pick printed as Y/N. */
export const YesNoChips = (props: { label: string; value: string; onChange: (v: '' | 'Y' | 'N') => void }) => (
  <Chips
    label={props.label}
    options={[{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' }]}
    value={props.value}
    onChange={(v) => props.onChange(v as '' | 'Y' | 'N')}
  />
);
