// What a typed number box shows. Saves are asynchronous, so the record lags behind typing: falling
// back to the record meanwhile blanked a tape field and a quick sixteenths pick then recorded 0"
// (ticket 14). The typed text stays until the record changes some other way.

export interface Draft {
  text: string;
  /** The record's value when the text was typed. */
  base: number | null;
}

/** The typed text while the record is unchanged or agrees with it, else the record's own text. */
export const draftShown = (draft: Draft, value: number | null, agrees: boolean, recordText: string) => (value === draft.base || agrees ? draft.text : recordText);

export const wholeInches = (v: number | null) => (v == null ? null : Math.floor(Math.round(v * 16) / 16));

/** The inches box of a tape field. */
export function tapeShown(draft: Draft, value: number | null): string {
  const whole = wholeInches(value);
  return draftShown(draft, value, draft.text.trim() !== '' && Number(draft.text) === whole, whole == null ? '' : String(whole));
}
