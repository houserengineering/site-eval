import { describe, expect, it } from 'vitest';
import { emptyPercTest, type PercReading, type PercTest } from '../src/domain/fieldRecord';
import { countdown, nextReadingDue, parseTape, percSummary, percTimer, readingCalc, soakStatus, stopRule, tapeText } from '../src/domain/perc';

const at = (hhmm: string, day = '2026-10-02') => `${day}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}`;
const reading = (start: string, end: string, initialIn: number | null, finalIn: number | null): PercReading => ({
  id: crypto.randomUUID(),
  startAt: start ? at(start) : '',
  endAt: end ? at(end) : '',
  initialIn,
  finalIn,
});
const test_ = (p: Partial<PercTest>): PercTest => ({ id: 't', label: '1', ...emptyPercTest(), ...p });

describe('tape measurements to 1/16"', () => {
  it.each([
    ['22-1/8', 22.125],
    ['22 1/8"', 22.125],
    ['7/16', 0.4375],
    ['19.5', 19.5],
    ['26"', 26],
    ['', null],
    ['abc', null],
    ['3/0', null],
  ])('parses %j', (s, n) => expect(parseTape(s)).toBe(n));

  it.each([
    [22.125, '22-1/8"'],
    [26.0625, '26-1/16"'],
    [0.4375, '7/16"'],
    [18, '18"'],
    [19.333, '19-5/16"'],
  ])('prints %d as %s', (n, s) => expect(tapeText(n)).toBe(s));
});

describe('reading arithmetic (DEQ-4 App. A: rate = interval / drop)', () => {
  it.each([
    // start, end, initial, final → interval, drop, rate
    ['14:30', '15:00', 22.125, 23.625, 30, 1.5, 20],
    ['10:40', '11:00', 18.9375, 19.5, 20, 0.5625, 35.6],
    ['23:50', '00:10', 10, 10.5, 20, 0.5, 40], // past midnight (end is next day)
    ['09:00:00', '09:01:05', 12, 12.5, 1.083, 0.5, 2.2], // fixed-drop timing, m:ss
  ])('%s–%s %d→%d', (s, e, i, f, interval, drop, rate) => {
    const r = reading(s, e, i, f);
    if (e < s) r.endAt = at(e, '2026-10-03');
    const c = readingCalc(r);
    expect(c.intervalMin).toBeCloseTo(interval, 2);
    expect(c.dropIn).toBeCloseTo(drop, 4);
    expect(c.rateMpi).toBeCloseTo(rate, 1);
  });

  it('leaves the rate blank when the water did not drop or a value is missing', () => {
    expect(readingCalc(reading('10:00', '10:30', 12, 12)).rateMpi).toBeNull();
    expect(readingCalc(reading('10:00', '', 12, null))).toEqual({ intervalMin: null, dropIn: null, rateMpi: null });
  });
});

describe('soak branch (DEQ-4 App. A p124)', () => {
  const fills = (...mins: number[]) =>
    mins.map((m, i) => ({ startAt: at(`${10 + i}:00`), endAt: at(`${10 + i}:${String(m).padStart(2, '0')}`) }));
  it.each<[string, Partial<PercTest>, string]>([
    ['nothing yet', {}, 'not-started'],
    ['SCL or finer goes straight to the 4-h presoak', { soilFinerThanSCL: 'Y' }, 'presoak'],
    ['first filling still draining', { fills: [{ startAt: at('12:00'), endAt: '' }] }, 'fill-1'],
    ['first filling not drained in 60 min stays running (overdue alert)', { fills: [{ startAt: at('11:00'), endAt: '' }] }, 'fill-1'],
    ['…until the presoak is started', { fills: [{ startAt: at('11:00'), endAt: '' }], presoak: { startAt: at('12:05'), endAt: '' } }, 'presoaking'],
    ['first filling slower than 60 min', { fills: fills(59).map((f) => ({ ...f, endAt: at('11:05') })) }, 'presoak'],
    ['first filling ≤60 min → add a second', { fills: fills(50) }, 'fill-2-needed'],
    ['second filling ≤60 min → sandy test now', { fills: fills(50, 45) }, 'sandy'],
    ['both faster than 3 mpi (<36 min) → may stop', { fills: fills(30, 35) }, 'may-stop'],
    ['36 min is exactly 3 mpi, not faster', { fills: fills(30, 36) }, 'sandy'],
    ['presoak done after 4 h', { soilFinerThanSCL: 'Y', presoak: { startAt: at('08:00'), endAt: at('12:00') } }, 'presoak-done'],
    ['presoak ended early', { soilFinerThanSCL: 'Y', presoak: { startAt: at('08:00'), endAt: at('11:00') } }, 'presoak-short'],
  ])('%s', (_, p, step) => expect(soakStatus(test_(p), at('12:30')).step).toBe(step));

  it('an undrained filling past 60 min is overdue and says the other-soils test applies', () => {
    const s = soakStatus(test_({ fills: [{ startAt: at('11:00'), endAt: '' }] }), at('12:30'));
    expect(s).toMatchObject({ overdue: true, dueAt: at('12:00') });
    expect(s.message).toMatch(/other-soils test/);
  });

  it('counts the presoak down from timestamps', () => {
    const s = soakStatus(test_({ soilFinerThanSCL: 'Y', presoak: { startAt: at('08:00'), endAt: '' } }), at('11:15'));
    expect(s.step).toBe('presoaking');
    expect(s.dueAt).toBe(at('12:00'));
  });
});

describe('stop rule and final rate', () => {
  // 30-min readings; rates from drops.
  const series = (drops: number[], start = '10:00', mins = 30) => {
    let t = Date.parse(at(start));
    let d = 12;
    return drops.map((drop) => {
      const s = new Date(t);
      t += mins * 60_000;
      const r: PercReading = { id: crypto.randomUUID(), startAt: local(s), endAt: local(new Date(t)), initialIn: d, finalIn: d + drop };
      d += drop;
      return r;
    });
  };

  it.each<[string, Partial<PercTest>, boolean, number | null]>([
    ['fewer than 4 readings', { readings: series([1, 0.75, 0.75]) }, false, null],
    ['4 readings, last two equal', { readings: series([1.5, 0.75, 0.75, 0.75]) }, true, 3],
    ['last two differ by more than 15%', { readings: series([1.5, 0.75, 0.75, 0.5]) }, false, null],
    // Judged on the latest pair: 40 vs 45.7 mpi differ by 14.3% of the smaller rate.
    ['within 15% either way', { readings: series([1, 0.75, 0.75, 0.75, 0.65625]) }, true, 4],
    // 4 readings at 10 min span only 40 min (App. A minimum is 1 hour).
    ['under the 1-hour minimum', { readings: series([0.5, 0.5, 0.5, 0.5], '10:00', 10) }, false, null],
    ['4 hours of readings ends the test', { readings: series([1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5]) }, true, 7],
    ['an open reading is not counted', { readings: [...series([1, 0.75, 0.75, 0.75]), reading('12:00', '', 12, null)] }, true, 3],
  ])('standard: %s', (_, p, met, finalIndex) => {
    const s = stopRule(test_({ mode: 'standard', ...p }));
    expect(s.met).toBe(met);
    expect(s.finalIndex).toBe(finalIndex);
    if (finalIndex != null) expect(s.finalRateMpi).toBeCloseTo(readingCalc(p.readings![finalIndex]).rateMpi!, 6);
  });

  it('sandy: 4 equally spaced readings within one hour ends the test on the final drop', () => {
    const s = stopRule(test_({ mode: 'sandy', readings: series([3, 3, 2.5, 2.5], '10:00', 15) }));
    expect(s).toMatchObject({ met: true, finalIndex: 3 });
    expect(s.finalRateMpi).toBeCloseTo(6, 6);
  });

  it('sandy: warns when the rate is slower than 10 mpi (other-soils test applies)', () => {
    const s = stopRule(test_({ mode: 'sandy', readings: series([1, 1, 1, 1], '10:00', 15) }));
    expect(s.warnings.join(' ')).toMatch(/slower than 10 mpi/);
  });

  it('sandy: warns when intervals are unequal', () => {
    const r = series([3, 3, 3, 3], '10:00', 15);
    r[3] = { ...r[3], endAt: at('11:05') };
    expect(stopRule(test_({ mode: 'sandy', readings: r })).warnings.join(' ')).toMatch(/equal/);
  });

  it('fixed-drop timing: stops when two successive times agree within 15%', () => {
    const fd = (secs: number[]) => {
      let t = Date.parse(at('09:00'));
      return secs.map((s) => {
        const start = new Date(t);
        t += s * 1000;
        return { id: crypto.randomUUID(), startAt: local(start), endAt: local(new Date(t)), initialIn: 12, finalIn: 12.5 };
      });
    };
    expect(stopRule(test_({ mode: 'fixed-drop', fixedDropIn: 0.5, readings: fd([65, 85, 54, 60]) })).met).toBe(true);
    expect(stopRule(test_({ mode: 'fixed-drop', fixedDropIn: 0.5, readings: fd([65, 85, 54, 70]) })).met).toBe(false);
  });
});

describe('interval timer (timestamps survive reload)', () => {
  it('the open reading is due one interval after it started', () => {
    expect(nextReadingDue(test_({ intervalMin: 30, readings: [reading('10:00', '', 12, null)] }))).toBe(at('10:30'));
  });
  it('nothing is due without an open reading or interval', () => {
    expect(nextReadingDue(test_({ intervalMin: 30, readings: [reading('10:00', '10:30', 12, 13)] }))).toBeNull();
    expect(nextReadingDue(test_({ intervalMin: null, readings: [reading('10:00', '', 12, null)] }))).toBeNull();
    expect(nextReadingDue(test_({ mode: 'fixed-drop', intervalMin: 30, readings: [reading('10:00', '', 12, null)] }))).toBeNull();
  });
});

function local(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

describe('running timers and list summary', () => {
  it('a running reading, fill or presoak shows one timer', () => {
    expect(percTimer(test_({ intervalMin: 30, readings: [reading('10:00', '', 12, null)] }), at('10:10'))).toMatchObject({ kind: 'reading', dueAt: at('10:30') });
    expect(percTimer(test_({ fills: [{ startAt: at('10:00'), endAt: '' }] }), at('10:10'))).toMatchObject({ kind: 'fill', dueAt: at('11:00') });
    expect(percTimer(test_({ soilFinerThanSCL: 'Y', presoak: { startAt: at('08:00'), endAt: '' } }), at('10:10'))).toMatchObject({ kind: 'presoak', dueAt: at('12:00') });
    expect(percTimer(test_({}), at('10:10'))).toBeNull();
  });

  it('summarises state for the site evaluation list', () => {
    expect(percSummary(test_({}), at('10:00'))).toBe('Not started');
    expect(percSummary(test_({ readings: [reading('10:00', '', 12, null)] }), at('10:10'))).toBe('Reading 1 running');
    const done = [0, 1, 2, 3].map((i) => reading(`1${i}:00`, `1${i}:30`, 12, 12.75));
    expect(percSummary(test_({ readings: done }), at('14:00'))).toBe('Final 40.0 mpi');
  });

  it.each([
    [0, '0:00'],
    [75, '1:15'],
    [3725, '1:02:05'],
    [-30, '0:30'],
  ])('countdown %d s → %s', (s, text) => expect(countdown(s)).toBe(text));
});
