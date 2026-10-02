// Groundwater observation wells (DEQ-4 Appendix C): a separate module from the test pit and perc
// work. Wells are registered once and read weekly through the seasonal high, often for months
// after the site evaluation day, so readings carry their own date and reader.
import { dateText, type FieldRecord } from '../domain/fieldRecord';
import type { Warning } from '../domain/rules';
import { RULES, wellReading } from '../domain/rules';

/** One reading. A is measured to the nearest inch; when the pipe is dry, A is the total depth measured. */
export interface WellReading {
  id: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:MM` (prints with AM/PM so it is never ambiguous). */
  time: string;
  /** Top of pipe to water, inches; with `dry`, the total depth measured. */
  aIn: number | null;
  /** Top of pipe to natural ground (stick-up), inches. */
  bIn: number | null;
  dry: boolean;
  notes: string;
  /** Who read it ('' = the well's "monitored by"). */
  by: string;
}

/** The DEQ-4 App. C p141 results form header, one well per form. */
export interface ObservationWell {
  id: string;
  /** Observation well # (`1`, `SE #1`). */
  label: string;
  monitoredBy: string;
  location: string;
  /** Section, township, range (`S12 T2S R5E`). */
  str: string;
  lot: string;
  otherInfo: string;
  /** Stick-up as installed; the first reading's B defaults to it. */
  stickUpIn: number | null;
  readings: WellReading[];
}

const newId = () => crypto.randomUUID();

export const emptyWell = (): Omit<ObservationWell, 'id' | 'label'> => ({
  monitoredBy: '',
  location: '',
  str: '',
  lot: '',
  otherInfo: '',
  stickUpIn: null,
  readings: [],
});

export function newWell(label: string, p: Partial<Omit<ObservationWell, 'id' | 'label'>> = {}): ObservationWell {
  return { id: newId(), label, ...emptyWell(), ...p };
}

/** A reading taken now: B carries over from the last reading (the pipe does not move), else the stick-up. */
export function newReading(well: ObservationWell, at: Date = new Date(), p: Partial<Omit<WellReading, 'id'>> = {}): WellReading {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    id: newId(),
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    aIn: null,
    bIn: well.readings.at(-1)?.bIn ?? well.stickUpIn,
    dry: false,
    notes: '',
    by: '',
    ...p,
  };
}

/** Readings in time order (entry order can differ when a missed reading is added later). */
export function sortedReadings(well: ObservationWell): WellReading[] {
  return [...well.readings].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

/** What a reading says: A − B below natural ground, or "deeper than" for a dry pipe. */
export function readingResult(x: WellReading) {
  return wellReading(x);
}

/** A − B as printed: `113`; dry → `>113` (no numeric water depth from a dry pipe). */
export function depthText(x: WellReading): string {
  const r = wellReading(x);
  if (r.depthIn != null) return String(r.depthIn);
  if (r.deeperThanIn != null) return `>${r.deeperThanIn}`;
  return '';
}

/** Notes as printed: a dry pipe says "No groundwater", as Houser's results forms do. */
export function notesText(x: WellReading): string {
  return [x.dry ? 'No groundwater (pipe dry)' : '', x.notes.trim()].filter(Boolean).join('. ');
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * DEQ-4 App. C p139 schedule checks: weekly or more often; at least two weeks of readings
 * before and after the peak; water within 6 ft may need more wells. Advisory only.
 */
export function wellWarnings(well: ObservationWell): Warning[] {
  const subject = { kind: 'well' as const, id: well.id, name: `Well # ${well.label}` };
  const out: Warning[] = [];
  const done = sortedReadings(well).filter((x) => x.date && x.aIn != null && x.bIn != null);
  for (const x of done)
    for (const message of wellReading(x).warnings) out.push({ rule: RULES.gwWell, subject, message: `${dateText(x.date)}: ${message}` });
  for (let i = 1; i < done.length; i++) {
    const gap = days(done[i - 1].date, done[i].date);
    if (gap > 7) out.push({ rule: RULES.gwSchedule, subject, message: `${gap} days between readings ${dateText(done[i - 1].date)} and ${dateText(done[i].date)}; read weekly or more often.` });
  }
  const wet = done.filter((x) => !x.dry);
  if (wet.length) {
    const peak = wet.reduce((p, x) => (wellReading(x).depthIn! < wellReading(p).depthIn! ? x : p));
    const before = days(done[0].date, peak.date);
    const after = days(peak.date, done.at(-1)!.date);
    if (before < 14 || after < 14)
      out.push({
        rule: RULES.gwSchedule,
        subject,
        message: `Highest water so far ${wellReading(peak).depthIn}" on ${dateText(peak.date)}: ${before} days of readings before it and ${after} after; at least 14 each side are needed.`,
      });
  }
  return out;
}

// ---- field record edits ------------------------------------------------------

const touch = (r: FieldRecord): FieldRecord => ({ ...r, updatedAt: new Date().toISOString() });

/** The next free well number: one past the highest numbered well, skipping labels in use. */
export function nextWellLabel(r: FieldRecord): string {
  const used = new Set(r.wells.map((w) => w.label.trim().toLowerCase()));
  let n = Math.max(0, ...r.wells.map((w) => Number(/^\d+$/.test(w.label.trim()) ? w.label : 0))) + 1;
  while (used.has(String(n))) n++;
  return String(n);
}

export function addWell(r: FieldRecord, label: string, p: Partial<Omit<ObservationWell, 'id' | 'label'>> = {}): FieldRecord {
  const last = r.wells.at(-1);
  // A new well is usually monitored by the same person on the same site.
  const carried = last ? { monitoredBy: last.monitoredBy, location: last.location, str: last.str, stickUpIn: last.stickUpIn } : {};
  return touch({ ...r, wells: [...r.wells, newWell(label, { ...carried, ...p })] });
}

export function updateWell(r: FieldRecord, wellId: string, patch: Partial<Omit<ObservationWell, 'id'>>): FieldRecord {
  return touch({ ...r, wells: r.wells.map((w) => (w.id === wellId ? { ...w, ...patch } : w)) });
}

export function removeWell(r: FieldRecord, wellId: string): FieldRecord {
  return touch({ ...r, wells: r.wells.filter((w) => w.id !== wellId) });
}

export function addWellReading(r: FieldRecord, wellId: string, at?: Date, p: Partial<Omit<WellReading, 'id'>> = {}): FieldRecord {
  const w = r.wells.find((x) => x.id === wellId);
  if (!w) return r;
  return updateWell(r, wellId, { readings: [...w.readings, newReading(w, at, p)] });
}

export function updateWellReading(r: FieldRecord, wellId: string, readingId: string, patch: Partial<Omit<WellReading, 'id'>>): FieldRecord {
  const w = r.wells.find((x) => x.id === wellId);
  if (!w) return r;
  return updateWell(r, wellId, { readings: w.readings.map((x) => (x.id === readingId ? { ...x, ...patch } : x)) });
}

export function removeWellReading(r: FieldRecord, wellId: string, readingId: string): FieldRecord {
  const w = r.wells.find((x) => x.id === wellId);
  if (!w) return r;
  return updateWell(r, wellId, { readings: w.readings.filter((x) => x.id !== readingId) });
}
