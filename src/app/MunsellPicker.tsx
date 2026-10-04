import { useState } from 'preact/hooks';
import type { Munsell } from '../domain/fieldRecord';
import { chromasFor, GLEY_HUES, HUES, munsellName, munsellNotation, VALUES } from '../domain/vocabulary';
import { Chips } from './fields';

/** Hue / value / chroma by tapping, with the chart name looked up as you go. */
export function MunsellPicker(props: { label: string; value: Munsell; onChange: (m: Munsell) => void }) {
  const m = props.value;
  // The set shown follows the picked hue, so the picked chip is always in view (Nathan, 2026-10-04: Show
  // me picked 10YR while the gley set was showing). The link switches sets until the hue changes again.
  const pickedGley = (GLEY_HUES as readonly string[]).includes(m.hue);
  const [toggled, setToggled] = useState<{ hue: string; gley: boolean } | null>(null);
  const gley = toggled && toggled.hue === m.hue ? toggled.gley : pickedGley;
  const setGley = (g: boolean) => setToggled({ hue: m.hue, gley: g });
  const set = (patch: Partial<Munsell>) => {
    const next = { ...m, ...patch };
    // Drop a chroma that is not on the chart page for the new hue/value.
    if (next.chroma && next.hue && next.value && !munsellName(next.hue, next.value, next.chroma)) next.chroma = '';
    if (next.hue === 'N') next.chroma = '';
    props.onChange(next);
  };
  const notation = munsellNotation(m.hue, m.value, m.chroma);
  const name = m.hue && m.value ? munsellName(m.hue, m.value, m.chroma) : '';
  const chromas = m.hue && m.value ? chromasFor(m.hue, m.value) : null;

  return (
    <fieldset class="group">
      <legend>{props.label}</legend>
      <p class="readout" aria-live="polite">
        {notation ? (
          <>
            <strong>{notation}</strong> {name || <span class="alert">not on the chart</span>}
          </>
        ) : (
          <span class="muted">Pick hue, value and chroma</span>
        )}
      </p>
      <Chips label="Hue" options={gley ? GLEY_HUES : HUES} value={m.hue} onChange={(hue) => set({ hue })} />
      <button type="button" class="link-btn" onClick={() => setGley(!gley)}>
        {gley ? 'Show soil hues' : 'Show gley hues'}
      </button>
      <Chips label="Value" options={VALUES} value={m.value} onChange={(value) => set({ value })} />
      {m.hue !== 'N' && (
        <Chips
          label="Chroma"
          options={['1', '2', '3', '4', '6', '8']}
          value={m.chroma}
          onChange={(chroma) => set({ chroma })}
          disabled={(c) => !!chromas && !chromas.includes(c)}
        />
      )}
    </fieldset>
  );
}
