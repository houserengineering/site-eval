import { useId, useState } from 'preact/hooks';
import { draftShown, tapeShown, wholeInches, type Draft } from './draft';
import { placeholderFor } from './fieldGuide';

/** Upper-cases typed text in place (as the soil log prints it), keeping the caret where it was. */
function upperInPlace(el: HTMLInputElement): string {
  const v = el.value.toUpperCase();
  if (v !== el.value) {
    const [a, b] = [el.selectionStart, el.selectionEnd];
    el.value = v;
    if (a != null && b != null) el.setSelectionRange(a, b);
  }
  return v;
}

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
        placeholder={placeholderFor(props.label)}
        inputMode={props.inputMode}
        autoCapitalize={props.autoCapitalize}
        autoComplete="off"
        // ALL CAPS fields store what prints (2026-10-02 field feedback).
        onInput={(e) => props.onInput(props.autoCapitalize === 'characters' ? upperInPlace(e.currentTarget) : e.currentTarget.value)}
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
  const [draft, setDraft] = useState<Draft>({ text: props.value == null ? '' : String(props.value), base: props.value });
  const parse = (t: string) => {
    const n = Number(t.trim());
    return t.trim() === '' || !Number.isFinite(n) ? null : n;
  };
  const shown = draftShown(draft, props.value, parse(draft.text) === props.value, props.value == null ? '' : String(props.value));
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
          placeholder={props.placeholder || placeholderFor(props.label)}
          onInput={(e) => {
            setDraft({ text: e.currentTarget.value, base: props.value });
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
  /** Prints exactly as entered (horizon designations: Bw, Bt), so no ALL CAPS. */
  asTyped?: boolean;
}) {
  const id = useId();
  const options = props.options.map(opt);
  const isOther = props.value !== '' && !options.some((o) => o.value === props.value);
  const [typing, setTyping] = useState(false);
  const showOther = props.other && (isOther || typing);
  return (
    <div class={`field${props.asTyped ? ' as-typed' : ''}`}>
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
          onInput={(e) => props.onChange(props.asTyped ? e.currentTarget.value : upperInPlace(e.currentTarget))}
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

const SIXTEENTHS = Array.from({ length: 16 }, (_, i) => {
  let n = i;
  let d = 16;
  while (n && n % 2 === 0) (n /= 2), (d /= 2);
  return { value: i, label: i ? `${n}/${d}` : '0' };
});

/** Tape reading: whole inches plus sixteenths (no "/" needed on a phone keypad). */
export function TapeField(props: { label: string; value: number | null; onInput: (v: number | null) => void }) {
  const id = useId();
  const whole = wholeInches(props.value);
  const six = props.value == null ? 0 : Math.round(props.value * 16) - (whole ?? 0) * 16;
  const [draft, setDraft] = useState<Draft>({ text: whole == null ? '' : String(whole), base: props.value });
  const shown = tapeShown(draft, props.value);
  const set = (w: string, s: number) => {
    const n = Number(w.trim());
    // Whole inches take the sixteenths pick; a typed decimal (19.5) is kept, to the nearest 1/16.
    props.onInput(w.trim() === '' || !Number.isFinite(n) ? null : Number.isInteger(n) ? n + s / 16 : Math.round(n * 16) / 16);
  };
  return (
    <fieldset class="field tape" aria-labelledby={id}>
      <span class="label" id={id}>{props.label}</span>
      <div class="tape-row">
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${props.label}, inches`}
          value={shown}
          placeholder={placeholderFor(props.label)}
          autoComplete="off"
          onInput={(e) => {
            setDraft({ text: e.currentTarget.value, base: props.value });
            set(e.currentTarget.value, six);
          }}
        />
        <span aria-hidden="true">in +</span>
        <select aria-label={`${props.label}, sixteenths`} value={six} onChange={(e) => set(shown || '0', Number(e.currentTarget.value))}>
          {SIXTEENTHS.map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

/**
 * Clock time of a LocalDateTime (`YYYY-MM-DDTHH:MM:SS`), editing only the time so it fits a phone
 * column; the date is kept, or taken from `day` when the time is first entered.
 */
export function TimeField(props: { label: string; value: string; day: string; seconds?: boolean; onInput: (v: string) => void }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        type="time"
        step={props.seconds ? 1 : 60}
        value={props.value.slice(11, props.seconds ? 19 : 16)}
        onInput={(e) => {
          const v = e.currentTarget.value;
          if (!v) return props.onInput('');
          const day = props.value.slice(0, 10) || props.day;
          // Without seconds shown, keep the recorded seconds so the interval does not shift.
          const secs = props.value.slice(16, 19) || ':00';
          props.onInput(`${day}T${v.length === 5 ? `${v}${props.seconds ? ':00' : secs}` : v}`);
        }}
      />
    </div>
  );
}
