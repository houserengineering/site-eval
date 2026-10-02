import { describe, expect, it } from 'vitest';
import {
  emptyDesign,
  emptyHorizon,
  emptyPercTest,
  emptyTestPit,
  migrate,
  newSiteEvaluation,
  type Design,
  type FieldRecord,
  type Horizon,
  type PercTest,
  type TestPit,
} from '../src/domain/fieldRecord';
import { allWarnings, applicationRate, limitingDepth, percWarnings, pitWarnings, RULES, siteWarnings, wellReading } from '../src/domain/rules';

const hz = (top: number, bottom: number, cls: string, p: Partial<Horizon> = {}): Horizon => ({
  id: crypto.randomUUID(),
  ...emptyHorizon(),
  topIn: top,
  bottomIn: bottom,
  texture: { cls, sandSize: '' },
  ...p,
});
const GPS = { lat: 45.6, lon: -111.2, accuracyM: 3, at: '2026-10-02T10:00:00Z' };
const pit = (p: Partial<TestPit> = {}): TestPit => ({
  id: 'p1',
  label: '1',
  ...emptyTestPit(),
  horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'SILT LOAM')],
  limitingLayer: { type: 'NONE', depthIn: null, other: '' },
  location: GPS,
  ...p,
});
const record = (pits: TestPit[], design: Partial<Design> = {}, percs: PercTest[] = []): FieldRecord => ({
  ...newSiteEvaluation({ confirmationNumber: 'SE 00001' }),
  design: { ...emptyDesign(), ...design },
  testPits: pits,
  percTests: percs,
});
const perc = (p: Partial<PercTest> = {}): PercTest => ({ id: 't1', label: '1', ...emptyPercTest(), testPitId: 'p1', holeDepthIn: 24, ...p });
const ids = (ws: { rule: { id: string } }[]) => ws.map((w) => w.rule.id);
const NOW = '2026-10-02T12:00:00';

describe('every rule cites its source', () => {
  it.each(Object.values(RULES).map((r) => [r.id, r]))('%s', (_, r) => {
    expect(r.text.length).toBeGreaterThan(20);
    expect(r.source).toBeTruthy();
    expect(r.section).toMatch(/§|\(|p\d|Rev\.|Table/);
    expect(r.effective).toMatch(/\d{4}/);
  });
});

describe('application rate from texture (DEQ-4 Table 2.1-1)', () => {
  it.each([
    ['SAND', 'COARSE', 0.8],
    ['SAND', 'MEDIUM', 0.6],
    ['SAND', 'VERY FINE', 0.4],
    ['SAND', '', null],
    ['LOAMY SAND', '', 0.8],
    ['SANDY LOAM', '', 0.6],
    ['SANDY LOAM', 'FINE', 0.5],
    ['LOAM', '', 0.5],
    ['SILT LOAM', '', 0.4],
    ['SANDY CLAY LOAM', '', 0.4],
    ['SILTY CLAY LOAM', '', 0.3],
    ['SANDY CLAY', '', 0.2],
    ['CLAY', '', 0.15],
    ['GRAVELLY MUCK', '', null],
  ])('%s %s → %s', (cls, sandSize, rate) => expect(applicationRate({ texture: { cls, sandSize } })).toBe(rate));
});

describe('test pit checks', () => {
  it.each<[string, Partial<TestPit>, Partial<Design>, string[]]>([
    ['clean 100" pit, silt loam with its perc test: no warnings', {}, {}, []],
    // 0224 GCCHD comment: pits to 84" with nothing recorded.
    ['84" pit, no limiting layer', { horizons: [hz(0, 84, 'LOAM')], limitingLayer: { type: '', depthIn: null, other: '' } }, {}, ['pit-depth']],
    ['84" pit stopped by bedrock: depth ok, but limiting within 84 and separation', { horizons: [hz(0, 84, 'LOAM')], limitingLayer: { type: 'BEDROCK', depthIn: 84, other: '' } }, {}, ['limiting-within-84']],
    ['bedrock at 60": separation 36" below a 24" trench', { limitingLayer: { type: 'BEDROCK', depthIn: 60, other: '' } }, {}, ['separation', 'limiting-within-84']],
    ['seepage at 70": GW trigger and separation 46"', { observedWater: { kind: 'SEEPAGE', depthIn: 70 } }, {}, ['gw-trigger', 'separation', 'limiting-within-84']],
    ['SHGW > 100" (deeper than): no trigger', { shgw: { depthIn: 100, deeperThan: true, basis: 'X' } }, {}, []],
    ['mottles from 60": GW trigger', { horizons: [hz(0, 60, 'LOAM'), hz(60, 100, 'LOAM', { mottling: { ...emptyHorizon().mottling, present: 'Y' } })] }, {}, ['gw-trigger']],
    ['18% slope, gravity', { slope: { pct: 18, shape: '', direction: '', method: '' } }, { system: 'GRAVITY' }, ['slope-limit', 'slope-contours']],
    ['18% slope, SHGW 90": steep separation 66" < 72"', { slope: { pct: 18, shape: '', direction: '', method: '' }, shgw: { depthIn: 90, deeperThan: false, basis: '' } }, { system: 'PRESSURE' }, ['steep-separation', 'slope-limit', 'slope-contours']],
    ['30% slope: waiver band', { slope: { pct: 30, shape: '', direction: '', method: '' } }, { system: 'PRESSURE' }, ['slope-limit', 'slope-contours']],
    ['40% slope: not allowed + setback', { slope: { pct: 40, shape: '', direction: '', method: '' } }, { system: 'PRESSURE' }, ['slope-limit', 'slope-contours', 'steep-setback']],
    ['8% slope at-grade', { slope: { pct: 8, shape: '', direction: '', method: '' } }, { system: 'AT-GRADE' }, ['system-slope']],
    ['8% slope mound on loam (0.5): ok', { slope: { pct: 8, shape: '', direction: '', method: '' } }, { system: 'MOUND' }, []],
    ['8% slope mound on clay loam (0.3)', { slope: { pct: 8, shape: '', direction: '', method: '' }, horizons: [hz(0, 100, 'CLAY LOAM')] }, { system: 'MOUND' }, ['system-slope']],
    ['sandy loam at 24", gravity: pressure required (Gallatin)', { horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'SANDY LOAM')] }, { system: 'GRAVITY' }, ['pressure-required']],
    ['sandy loam at 24", pressure: ok', { horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'SANDY LOAM')] }, { system: 'PRESSURE' }, []],
    ['loamy sand with SHGW 80": coarse soil < 6 ft', { horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'LOAMY SAND')], shgw: { depthIn: 80, deeperThan: false, basis: '' } }, { system: 'PRESSURE' }, ['gw-trigger', 'coarse-soil', 'limiting-within-84']],
    ['no GPS', { location: null }, {}, ['location']],
    ['loamy sand to 100" with nothing limiting: 76" below a 24" trench is enough', { horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'LOAMY SAND')] }, { system: 'PRESSURE' }, []],
    ['very coarse sand: pressure + sand liner regardless of depth', { horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'SAND', { texture: { cls: 'SAND', sandSize: 'VERY COARSE' } })] }, { system: 'PRESSURE' }, ['coarse-soil']],
    ['subdivision review hides county-only rules', { location: null, horizons: [hz(0, 100, 'SANDY LOAM')] }, { review: 'SUB', system: 'GRAVITY' }, []],
    ['county review hides subdivision-only rules', { limitingLayer: { type: 'BEDROCK', depthIn: 80, other: '' } }, { review: 'CTY' }, []],
  ])('%s', (_, p, design, expected) => {
    const r = record([pit(p)], design, [perc()]);
    const got = ids(pitWarnings(r, r.testPits[0]));
    expect(got.sort()).toEqual([...expected].sort());
  });

  it('requires a perc test for 0.4-or-slower soil at the infiltrative depth when none is linked (HC-3 §3.8)', () => {
    const r = record([pit({ horizons: [hz(0, 12, 'LOAM'), hz(12, 100, 'SILTY CLAY LOAM')] })]);
    const w = pitWarnings(r, r.testPits[0]).find((x) => x.rule.id === 'perc-required');
    expect(w?.message).toContain('SILTY CLAY LOAM');
    expect(w?.rule.section).toBe('HC-3 §3.8');
  });

  it('requires pressure distribution from a linked perc test faster than 10 mpi (HC-3 §4.4)', () => {
    const rd = (a: string, b: string, i: number, f: number) => ({ id: crypto.randomUUID(), startAt: `2026-10-02T${a}:00`, endAt: `2026-10-02T${b}:00`, initialIn: i, finalIn: f });
    const t = perc({ mode: 'sandy', intervalMin: 15, readings: [rd('10:00', '10:15', 6, 9), rd('10:15', '10:30', 6, 9), rd('10:30', '10:45', 6, 9), rd('10:45', '11:00', 6, 9)] });
    const r = record([pit({ horizons: [hz(0, 100, 'LOAM')] })], { system: 'GRAVITY' }, [t]);
    expect(pitWarnings(r, r.testPits[0]).find((w) => w.rule.id === 'pressure-required')?.message).toBe('Perc test 1 final rate 5.0 mpi (faster than 10 mpi): the system must be pressure distributed.');
  });

  it('uses the entered infiltrative depth and the shallowest limiting condition', () => {
    const p = pit({ limitingLayer: { type: 'BEDROCK', depthIn: 90, other: '' }, observedWater: { kind: 'STANDING', depthIn: 80 } });
    expect(limitingDepth(p)).toEqual({ depthIn: 80, what: 'observed groundwater' });
    const r = record([p], { infiltrativeDepthIn: 36 });
    expect(pitWarnings(r, p).find((w) => w.rule.id === 'separation')?.message).toContain('44" from the 36" infiltrative surface');
  });

  it('measures mound separation from the ground surface', () => {
    const p = pit({ limitingLayer: { type: 'BEDROCK', depthIn: 40, other: '' } });
    expect(pitWarnings(record([p], { system: 'MOUND' }), p).find((w) => w.rule.id === 'separation')?.message).toContain('40" from the ground surface');
  });
});

describe('perc test checks', () => {
  const rd = (start: string, end: string, i: number, f: number) => ({ id: crypto.randomUUID(), startAt: `2026-10-02T${start}:00`, endAt: `2026-10-02T${end}:00`, initialIn: i, finalIn: f });
  it.each<[string, Partial<PercTest>, Partial<Design>, string[]]>([
    ['nothing yet', {}, {}, []],
    ['no hole depth', { holeDepthIn: null }, {}, ['perc-hole']],
    ['4" hole', { holeDiameterIn: 4 }, {}, ['perc-hole']],
    ['36" hole for a 24" trench', { holeDepthIn: 36 }, {}, ['perc-hole']],
    ['mound perc must be 12"', { holeDepthIn: 24 }, { system: 'MOUND' }, ['perc-hole']],
    ['mound perc at 12": ok', { holeDepthIn: 12 }, { system: 'MOUND' }, []],
    ['3-h presoak', { soilFinerThanSCL: 'Y', presoak: { startAt: '2026-10-02T08:00:00', endAt: '2026-10-02T11:00:00' } }, {}, ['perc-soak']],
    ['not linked to a pit', { testPitId: '' }, {}, ['location']],
    ['negative drop', { readings: [rd('10:00', '10:30', 12, 11)] }, {}, ['perc-rate', 'perc-stop']],
    ['two readings, stop rule not met', { readings: [rd('10:00', '10:30', 12, 13), rd('10:30', '11:00', 13, 14)] }, {}, ['perc-stop']],
    [
      'stable after 1 h, 4 readings: no warning',
      { readings: [rd('10:00', '10:20', 12, 12.5), rd('10:20', '10:40', 12.5, 13), rd('10:40', '11:00', 13, 13.5), rd('11:00', '11:20', 13.5, 14)] },
      {},
      [],
    ],
    ['sandy mode, unequal intervals', { mode: 'sandy', readings: [rd('10:00', '10:10', 6, 8), rd('10:10', '10:25', 6, 8)] }, {}, ['perc-stop', 'perc-stop']],
  ])('%s', (_, p, design, expected) => {
    const r = record([pit()], design, [perc(p)]);
    expect(ids(percWarnings(r, r.percTests[0], NOW)).sort()).toEqual([...expected].sort());
  });
});

describe('site checks', () => {
  const two = [pit(), pit({ id: 'p2', label: '2' })];
  it.each<[string, TestPit[], Partial<Design>, string[]]>([
    ['individual, one pit', [pit()], { use: 'INDIVIDUAL' }, ['pit-distance']],
    ['public, two pits', two, { use: 'PUBLIC' }, ['pit-count', 'pit-distance']],
    ['three drainfields, two pits', two, { use: 'SHARED', drainfields: 3 }, ['pit-count', 'pit-distance']],
    ['pressure with 3 zones, two pits', two, { use: 'INDIVIDUAL', system: 'PRESSURE', pressureZones: 3 }, ['pit-count', 'pit-distance']],
    // 0279: two blocks both labelled TEST PIT# 1.
    ['duplicate pit #', [pit(), pit({ id: 'p2' })], {}, ['keyed', 'pit-distance']],
    ['pit on map without a log', [pit(), pit({ id: 'p2', label: '2', horizons: [], planned: { lat: 1, lon: 2 } })], {}, ['keyed', 'pit-distance']],
    ['county review without Site Evaluation #', [pit()], { review: 'CTY' }, ['site-eval-number', 'pit-distance']],
    ['blank review checks the Site Evaluation # too', [pit()], {}, ['site-eval-number', 'pit-distance']],
    ['two multiple-user drainfields, three pits', [pit(), pit({ id: 'p2', label: '2' }), pit({ id: 'p3', label: '3' })], { use: 'MULTIPLE', drainfields: 2 }, ['pit-count', 'pit-distance']],
    ['subdivision review hides county-only', [pit()], { review: 'SUB' }, ['pit-distance']],
  ])('%s', (name, pits, design, expected) => {
    const r = record(pits, design);
    if (name.includes('Site Evaluation #')) r.header.confirmationNumber = '';
    expect(ids(siteWarnings(r)).sort()).toEqual([...expected].sort());
  });

  it('names the governing count in the message', () => {
    const r = record([pit()], { use: 'MULTIPLE', system: 'PRESSURE', pressureZones: 5 });
    expect(siteWarnings(r).find((w) => w.rule.id === 'pit-count')?.message).toBe('1 test pit logged; 5 pressure zones need at least 5 (one per zone).');
    const r2 = record([pit()], { use: 'MULTIPLE', drainfields: 2 });
    expect(siteWarnings(r2).find((w) => w.rule.id === 'pit-count')?.message).toBe('1 test pit logged; 2 multiple-user drainfields need at least 6 (three each).');
  });

  it('lists site, then pit, then perc warnings, each with a subject', () => {
    const r = record([pit({ location: null })], { use: 'PUBLIC' }, [perc({ holeDepthIn: null })]);
    const all = allWarnings(r, NOW);
    expect(all.map((w) => w.subject.kind)).toEqual(['site', 'site', 'pit', 'perc']);
    expect(all[2].subject.name).toBe('Test pit 1');
  });

  it('leaves out perc warnings when the perc module is off', () => {
    const r = record([pit({ location: null })], { use: 'PUBLIC' }, [perc({ holeDepthIn: null })]);
    expect(allWarnings(r, NOW, { percTests: false }).map((w) => w.subject.kind)).toEqual(['site', 'site', 'pit']);
  });
});

describe('groundwater observation reading A − B (DEQ-4 App. C)', () => {
  it.each([
    // Cottonwood 0105.003: dry reading 137 / 24 → deeper than 113.
    [{ aIn: 137, bIn: 24, dry: true }, null, 113, 0],
    [{ aIn: 120, bIn: 24, dry: false }, 96, null, 0],
    [{ aIn: 80, bIn: 24, dry: false }, 56, null, 1], // shallower than 6 ft
    [{ aIn: 100, bIn: 18, dry: false }, 82, null, 1], // stick-up under 2 ft
    [{ aIn: 20, bIn: 24, dry: false }, -4, null, 2], // A < B, and shallow
    [{ aIn: null, bIn: 24, dry: false }, null, null, 0],
  ])('%j', (x, depth, deeper, nWarn) => {
    const res = wellReading(x);
    expect(res.depthIn).toBe(depth);
    expect(res.deeperThanIn).toBe(deeper);
    expect(res.warnings).toHaveLength(nWarn);
  });
});

it('migrates v6 records to carry an empty design', () => {
  const v6 = { ...newSiteEvaluation(), schemaVersion: 6 } as any;
  delete v6.design;
  expect(migrate(v6).design).toEqual(emptyDesign());
});
