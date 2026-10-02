// Perc engine: DEQ-4 Appendix A (Dec 2023, pp. 124–126) arithmetic, soak branch and stop rule.
// Pure functions of the perc test; times are LocalDateTime strings, so results survive reload.
import type { LocalDateTime, PercReading, PercTest } from './fieldRecord';

const MIN = 60_000;
const minutes = (a: LocalDateTime, b: LocalDateTime) => (Date.parse(b) - Date.parse(a)) / MIN;
const plusMinutes = (a: LocalDateTime, m: number): LocalDateTime => {
  const d = new Date(Date.parse(a) + m * MIN);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Tape reading → inches: `22-1/8`, `22 1/8"`, `7/16`, `19.5`. Null if unreadable. */
export function parseTape(text: string): number | null {
  const t = text.replace(/["”]/g, '').trim();
  const m = /^(?:(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?|(\d+)\/(\d+))$/.exec(t);
  if (!m) return null;
  const frac = (n?: string, d?: string) => (n && d ? (Number(d) ? Number(n) / Number(d) : NaN) : 0);
  const v = m[4] ? frac(m[4], m[5]) : Number(m[1]) + frac(m[2], m[3]);
  return Number.isFinite(v) ? v : null;
}

/** Inches → tape text to the nearest 1/16": `22-1/8"`, `7/16"`, `18"`. */
export function tapeText(inches: number): string {
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let n = sixteenths % 16;
  let d = 16;
  while (n && n % 2 === 0) (n /= 2), (d /= 2);
  if (!n) return `${whole}"`;
  return whole ? `${whole}-${n}/${d}"` : `${n}/${d}"`;
}

export interface ReadingCalc {
  intervalMin: number | null;
  dropIn: number | null;
  /** Minutes per inch; null when not computable (missing value or no drop). */
  rateMpi: number | null;
}

/** "Percolation Rate = Time interval in minutes/water-level drop in inches" (App. A p125). */
export function readingCalc(r: PercReading): ReadingCalc {
  const intervalMin = r.startAt && r.endAt ? minutes(r.startAt, r.endAt) : null;
  const dropIn = r.initialIn != null && r.finalIn != null ? r.finalIn - r.initialIn : null;
  const rateMpi = intervalMin != null && dropIn != null && dropIn > 0 && intervalMin > 0 ? intervalMin / dropIn : null;
  return { intervalMin, dropIn, rateMpi };
}

export type SoakStep =
  | 'not-started'
  | 'fill-1'
  | 'fill-2-needed'
  | 'fill-2'
  | 'sandy'
  | 'may-stop'
  | 'presoak'
  | 'presoaking'
  | 'presoak-short'
  | 'presoak-done';

export interface SoakStatus {
  step: SoakStep;
  /** What to do next, citing App. A. */
  message: string;
  /** When the running fill/presoak reaches its limit (60 min / 4 h). */
  dueAt?: LocalDateTime;
  /** A filling ran past 60 minutes without draining (other-soils test applies). */
  overdue?: boolean;
}

const FILL_LIMIT_MIN = 60;
const PRESOAK_MIN = 240;
const CITE = 'DEQ-4 App. A p124';

/** Where the soak stands and what App. A says comes next. */
export function soakStatus(t: PercTest, now: LocalDateTime): SoakStatus {
  const presoak = (): SoakStatus => {
    const { startAt, endAt } = t.presoak;
    if (!startAt) return { step: 'presoak', message: `Presoak: keep at least 12" of water in the hole for at least 4 hours (${CITE}).` };
    const dueAt = plusMinutes(startAt, PRESOAK_MIN);
    if (!endAt) return { step: 'presoaking', message: `Presoaking; 4 hours reached at ${clock(dueAt)}.`, dueAt };
    if (minutes(startAt, endAt) < PRESOAK_MIN)
      return { step: 'presoak-short', message: `Presoak was ${Math.round(minutes(startAt, endAt))} min; App. A requires at least 4 hours (${CITE}).` };
    return { step: 'presoak-done', message: 'Presoak complete. Start the other-soils test: 6" of water, readings until two rates agree within 15% or 4 hours.' };
  };
  if (t.soilFinerThanSCL === 'Y') return presoak();
  const [f1, f2] = t.fills;
  if (!f1?.startAt) {
    if (t.presoak.startAt) return presoak();
    return { step: 'not-started', message: `Fill the hole to at least 12" above the gravel and time how long it takes to seep away (${CITE}).` };
  }
  const seep = (f: { startAt: string; endAt: string }) => (f.endAt ? minutes(f.startAt, f.endAt) : null);
  // A filling still draining stays the running step (its timer overdue) until the evaluator
  // records Drained or starts the presoak, so the 60-minute alert is never skipped.
  const draining = (f: { startAt: string }, which: 'fill-1' | 'fill-2'): SoakStatus => {
    if (t.presoak.startAt) return presoak();
    const dueAt = plusMinutes(f.startAt, FILL_LIMIT_MIN);
    const name = which === 'fill-1' ? 'First' : 'Second';
    return minutes(f.startAt, now) > FILL_LIMIT_MIN
      ? { step: which, overdue: true, message: `${name} 12" filling did not seep away within 60 minutes: run the other-soils test after a 4-hour presoak (${CITE}).`, dueAt }
      : { step: which, message: `${name} 12" filling seeping away; tap Drained when the hole is empty.`, dueAt };
  };
  const s1 = seep(f1);
  if (s1 == null) return draining(f1, 'fill-1');
  if (s1 > FILL_LIMIT_MIN) return presoak();
  if (!f2?.startAt) return { step: 'fill-2-needed', message: `First filling seeped away in ${fmtMin(s1)}. Fill 12" a second time (${CITE}).` };
  const s2 = seep(f2);
  if (s2 == null) return draining(f2, 'fill-2');
  if (s2 > FILL_LIMIT_MIN) return presoak();
  // Each filling's rate = minutes for 12" to seep away ÷ 12; faster than 3 mpi = under 36 min.
  if (s1 / 12 < 3 && s2 / 12 < 3)
    return { step: 'may-stop', message: `Both fillings faster than 3 mpi (${fmtMin(s1)}, ${fmtMin(s2)}): the test may be stopped (${CITE}).` };
  return { step: 'sandy', message: `Both fillings seeped away within 60 minutes: run the sandy-soil test now (${CITE}).` };
}

export interface StopRule {
  met: boolean;
  /** Why the test may end, or what is still needed. */
  message: string;
  /** Index of the reading whose final drop gives the rate (App. A "use final water-level drop"). */
  finalIndex: number | null;
  finalRateMpi: number | null;
  /** Change between the last two rates, relative to the smaller (conservative 15% test). */
  lastChange: number | null;
  warnings: string[];
}

export const STABLE_CHANGE = 0.15;

/**
 * App. A p125. Other soils: at least 1 h and 4 readings, until two successive rates agree within
 * 15% or readings have run 4 hours. Sandy: at least 4 readings at equal intervals within 1 hour.
 * Fixed-drop timing: 4 readings, the last two within 15%.
 * The rule does not say what the 15% is relative to; the smaller rate is used, which satisfies
 * either reading of it (Houser's P1-Δ sheets divide by the later rate; research/02 assumed the earlier).
 */
export function stopRule(t: PercTest): StopRule {
  const done = t.readings.filter((r) => r.endAt && r.finalIn != null);
  const calcs = done.map(readingCalc);
  const rates = calcs.map((c) => c.rateMpi);
  const warnings: string[] = [];
  const n = done.length;
  const lastIdx = n ? t.readings.indexOf(done[n - 1]) : null;
  const finalRate = n ? rates[n - 1] : null;
  const a = rates[n - 2];
  const b = rates[n - 1];
  const lastChange = a != null && b != null && n >= 2 ? Math.abs(b - a) / Math.min(a, b) : null;
  const elapsed = n ? minutes(done[0].startAt, done[n - 1].endAt) : 0;
  const result = (met: boolean, message: string): StopRule => ({
    met,
    message,
    finalIndex: met ? lastIdx : null,
    finalRateMpi: met ? finalRate : null,
    lastChange,
    warnings,
  });
  const stable = lastChange != null && lastChange <= STABLE_CHANGE;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  if (t.mode === 'sandy') {
    const intervals = calcs.map((c) => c.intervalMin ?? 0);
    if (intervals.some((m) => Math.abs(m - intervals[0]) > 0.5)) warnings.push('Sandy-soil readings must be at equal intervals (App. A p124).');
    if (finalRate != null && finalRate > 10) warnings.push(`Rate ${finalRate.toFixed(1)} mpi is slower than 10 mpi: the other-soils test applies (App. A p125).`);
    if (n < 4) return result(false, `${n} of at least 4 readings within 1 hour (App. A p124).`);
    if (elapsed > 60.5) warnings.push(`Readings span ${Math.round(elapsed)} min; the sandy test takes 4 readings within 1 hour.`);
    return result(true, `4 or more readings taken: use the final drop (App. A p125).`);
  }
  if (t.mode === 'fixed-drop') {
    if (n < 4) return result(false, `${n} of at least 4 timed drops.`);
    if (stable) return result(true, `Last two times agree within 15% (${pct(lastChange!)}): use the final reading.`);
    return result(false, `Last two times differ by ${lastChange == null ? '—' : pct(lastChange)}; keep timing until two agree within 15%.`);
  }
  if (n && elapsed >= PRESOAK_MIN) return result(true, `Readings have run 4 hours: use the final drop (App. A p125).`);
  if (n < 4 || elapsed < 60)
    return result(false, `${n} of at least 4 readings, ${Math.round(elapsed)} of at least 60 min (App. A p125).`);
  if (stable) return result(true, `Last two rates agree within 15% (${pct(lastChange!)}): use the final drop (App. A p125).`);
  return result(false, `Last two rates differ by ${lastChange == null ? '—' : pct(lastChange)}; continue until two agree within 15% or 4 hours.`);
}

/** When the open reading is due (standard and sandy modes); null if none is running. */
export function nextReadingDue(t: PercTest): LocalDateTime | null {
  if (t.mode === 'fixed-drop' || !t.intervalMin) return null;
  const open = t.readings.at(-1);
  if (!open?.startAt || open.endAt) return null;
  return plusMinutes(open.startAt, t.intervalMin);
}

/** `14:05` from a LocalDateTime. */
export const clock = (t: LocalDateTime) => t.slice(11, 16);
const fmtMin = (m: number) => `${Math.round(m)} min`;

export interface PercTimer {
  kind: 'fill' | 'presoak' | 'reading';
  /** When it is due (fill: 60-min limit; presoak: 4 h; reading: one interval). */
  dueAt: LocalDateTime;
  label: string;
}

/** The running timer of a perc test, if any (at most one runs at a time per test). */
export function percTimer(t: PercTest, now: LocalDateTime): PercTimer | null {
  const due = nextReadingDue(t);
  if (due) return { kind: 'reading', dueAt: due, label: `Reading ${t.readings.length}` };
  if (t.readings.length) return null;
  const s = soakStatus(t, now);
  if (!s.dueAt) return null;
  if (s.step === 'presoaking') return { kind: 'presoak', dueAt: s.dueAt, label: 'Presoak 4 h' };
  return { kind: 'fill', dueAt: s.dueAt, label: s.step === 'fill-1' ? 'Filling 1 (60-min limit)' : 'Filling 2 (60-min limit)' };
}

/** One-line state for lists: `Final 45.7 mpi`, `Reading 3 running`, `Soaking`. */
export function percSummary(t: PercTest, now: LocalDateTime): string {
  const rule = stopRule(t);
  if (rule.met && rule.finalRateMpi != null) return `Final ${rule.finalRateMpi.toFixed(1)} mpi`;
  if (t.readings.length) {
    const open = t.readings.at(-1)!;
    return open.endAt ? `${t.readings.length} reading${t.readings.length === 1 ? '' : 's'}, not complete` : `Reading ${t.readings.length} running`;
  }
  const step = soakStatus(t, now).step;
  if (step === 'not-started') return 'Not started';
  if (step === 'may-stop') return 'Faster than 3 mpi; may stop';
  return 'Soaking';
}

/** Seconds → `m:ss` or `h:mm:ss`; negative values count up as overdue. */
export function countdown(seconds: number): string {
  const s = Math.abs(Math.trunc(seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
