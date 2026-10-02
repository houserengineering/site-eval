// Table-driven tests of the pure soil-description functions the generator and UI share.
import { describe, expect, it } from 'vitest';
import { emptyHorizon, emptyTestPit, type Horizon, type TestPit } from '../src/domain/fieldRecord';
import { colorText, horizonNotes, missingItems, pitSummary, structureText, textureText } from '../src/domain/soilLogText';
import { chromasFor, munsellName, rockModifier } from '../src/domain/vocabulary';

const hz = (p: Partial<Omit<Horizon, 'id'>> = {}): Horizon => ({ id: 'h', ...emptyHorizon(), ...p });
const pit = (p: Partial<TestPit> = {}): TestPit => ({ id: 'p', label: '1', ...emptyTestPit(), ...p });

describe('Munsell names (Munsell Soil Color Book)', () => {
  it.each([
    ['10YR', '3', '2', 'VERY DARK GRAYISH BROWN'],
    ['10YR', '2', '2', 'VERY DARK BROWN'],
    ['10YR', '4', '3', 'BROWN'],
    ['10YR', '5', '6', 'YELLOWISH BROWN'],
    ['10YR', '3', '1', 'VERY DARK GRAY'],
    ['7.5YR', '2.5', '1', 'BLACK'],
    ['7.5YR', '3', '2', 'DARK BROWN'],
    ['2.5Y', '3', '2', 'VERY DARK GRAYISH BROWN'],
    ['2.5Y', '4', '2', 'DARK GRAYISH BROWN'],
    ['2.5Y', '5', '3', 'LIGHT OLIVE BROWN'],
    ['5Y', '4', '2', 'OLIVE GRAY'],
    ['5YR', '4', '6', 'YELLOWISH RED'],
    ['N', '5', '', 'GRAY'],
    ['5GY', '5', '1', 'GREENISH GRAY'],
    ['5B', '4', '1', 'DARK BLUISH GRAY'],
  ])('%s %s/%s → %s', (h, v, c, name) => expect(munsellName(h, v, c)).toBe(name));

  it('has no name for chips that are not on the chart', () => {
    expect(munsellName('10YR', '2', '6')).toBe('');
    expect(chromasFor('10YR', '2')).toEqual(['1', '2']);
  });
});

describe('rock fragment texture modifier (DEQ-4 App. B)', () => {
  it.each([
    [null, 'GRAVEL', ''],
    [10, 'GRAVEL', ''],
    [15, 'GRAVEL', 'GRAVELLY'],
    [34, 'COBBLES', 'COBBLY'],
    [35, 'GRAVEL', 'VERY GRAVELLY'],
    [59, 'CHANNERS', 'VERY CHANNERY'],
    [60, 'STONES', 'EXTREMELY STONY'],
    [89, 'FLAGSTONES', 'EXTREMELY FLAGGY'],
    [40, 'ROCKS', ''],
  ] as const)('%s%% %s → "%s"', (pct, kind, prefix) => expect(rockModifier(pct, kind).prefix).toBe(prefix));

  it('uses the fragment noun at 90% and above', () => {
    expect(rockModifier(90, 'GRAVEL')).toEqual({ prefix: '', noun: 'GRAVEL' });
  });
});

// The office template prints rock content in NOTES, so texture is the USDA class alone.
describe('texture', () => {
  it.each([
    [{ cls: 'SILT LOAM', sandSize: '' }, { pct: 5, kind: 'ROCKS' }, 'SILT LOAM'],
    [{ cls: 'LOAM', sandSize: '' }, { pct: 30, kind: 'GRAVEL' }, 'LOAM'],
    [{ cls: 'SANDY LOAM', sandSize: 'COARSE' }, { pct: 40, kind: 'GRAVEL' }, 'COARSE SANDY LOAM'],
    [{ cls: 'LOAMY SAND', sandSize: 'FINE' }, { pct: null, kind: 'ROCKS' }, 'LOAMY FINE SAND'],
    [{ cls: 'SAND', sandSize: 'MEDIUM' }, { pct: 0, kind: 'ROCKS' }, 'MEDIUM SAND'],
    [{ cls: 'CLAY', sandSize: 'FINE' }, { pct: null, kind: 'ROCKS' }, 'CLAY'],
    [{ cls: 'Clay loam', sandSize: '' }, { pct: null, kind: 'ROCKS' }, 'CLAY LOAM'],
  ])('%o %o → %s', (texture, rock, out) => expect(textureText(hz({ texture, rock }))).toBe(out));
});

describe('color', () => {
  it('composes the 2026 template wording with the looked-up name', () => {
    const c = { hue: '2.5Y', value: '3', chroma: '2', moisture: 'MOIST', physicalState: 'RUBBED', other: '' };
    expect(colorText(hz({ color: c }))).toBe('2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED');
    expect(colorText(hz({ color: { ...c, moisture: 'DRY', physicalState: 'BROKEN' } }))).toBe('2.5Y 3/2, VERY DARK GRAYISH BROWN, DRY, BROKEN');
  });
  it('prints free text verbatim (upper case) and blank when nothing is picked', () => {
    expect(colorText(hz({ color: { ...emptyHorizon().color, other: 'Black, 7.5 YR2.5/1' } }))).toBe('BLACK, 7.5 YR2.5/1');
    expect(colorText(hz())).toBe('');
  });
});

describe('structure', () => {
  it.each([
    [{ grade: '', size: 'VERY FINE', size2: '', shape: 'GRANULAR', other: '' }, 'VERY FINE GRANULAR'],
    [{ grade: '', size: 'FINE', size2: 'MEDIUM', shape: 'GRANULAR', other: '' }, 'FINE TO MEDIUM GRANULAR'],
    [{ grade: 'WEAK', size: 'FINE', size2: '', shape: 'GRANULAR', other: '' }, 'WEAK, FINE GRANULAR'],
    [{ grade: 'MODERATE', size: '', size2: '', shape: 'SUBANGULAR BLOCKY', other: '' }, 'MODERATE, SUBANGULAR BLOCKY'],
    [{ grade: 'WEAK', size: 'FINE', size2: '', shape: 'MASSIVE', other: '' }, 'MASSIVE'],
    [{ grade: '', size: '', size2: '', shape: 'SINGLE GRAIN', other: '' }, 'SINGLE GRAIN'],
    [{ grade: '', size: '', size2: '', shape: '', other: 'stiff, massive and blocky' }, 'STIFF, MASSIVE AND BLOCKY'],
  ])('%o → %s', (structure, out) => expect(structureText(hz({ structure }))).toBe(out));
});

describe('NOTES composer (office wording, research/01 §1.9)', () => {
  it('writes rock percent, consistence, plasticity, mottles and free notes in order', () => {
    const h = hz({
      topIn: 12,
      bottomIn: 66,
      rock: { pct: 40, kind: 'ROCKS' },
      consistence: 'FRIABLE',
      plasticity: 'NON-PLASTIC',
      mottling: { present: 'Y', quantity: 'COMMON', size: 'MEDIUM', contrast: 'DISTINCT', color: { hue: '7.5YR', value: '5', chroma: '6' } },
      notes: 'salts at 40"',
    });
    expect(horizonNotes(pit({ horizons: [h] }), 0)).toBe('40% ROCKS, FRIABLE, NON-PLASTIC, COMMON MEDIUM DISTINCT 7.5YR 5/6 MOTTLES, SALTS AT 40"');
  });

  it('writes NO ROCKS for 0% and nothing when rock was not recorded', () => {
    expect(horizonNotes(pit({ horizons: [hz({ rock: { pct: 0, kind: 'ROCKS' } })] }), 0)).toBe('NO ROCKS');
    expect(horizonNotes(pit({ horizons: [hz({ rock: { pct: 30, kind: 'GRAVEL' } })] }), 0)).toBe('30% ROCKS (GRAVEL)');
    expect(horizonNotes(pit({ horizons: [hz({ rock: { pct: 40, kind: 'GRAVEL TO COBBLES' } })] }), 0)).toBe('40% ROCKS (GRAVEL TO COBBLES)');
    expect(horizonNotes(pit({ horizons: [hz()] }), 0)).toBe('');
  });

  it('puts observed water and the limiting layer in the horizon containing that depth', () => {
    const p = pit({
      horizons: [hz({ topIn: 0, bottomIn: 12 }), hz({ topIn: 12, bottomIn: 60 }), hz({ topIn: 60, bottomIn: 96, rock: { pct: 0, kind: 'ROCKS' } })],
      observedWater: { kind: 'SEEPAGE', depthIn: 72 },
      limitingLayer: { type: 'BEDROCK', depthIn: 96, other: '' },
    });
    expect(horizonNotes(p, 0)).toBe('');
    expect(horizonNotes(p, 2)).toBe('NO ROCKS, GROUNDWATER SEEPS AT 72", BEDROCK AT 96"');
    const p2 = { ...p, observedWater: { kind: 'STANDING' as const, depthIn: 30 }, limitingLayer: { type: 'IMPERVIOUS' as const, depthIn: 12, other: '' } };
    expect(horizonNotes(p2, 1)).toBe('LIMITING LAYER AT 12" (IMPERVIOUS LAYER), GROUNDWATER AT 30"');
  });

  it('summarizes the pit in one row: depth, groundwater, basis, limiting layer, estimated slope, notes', () => {
    const p = pit({
      horizons: [hz({ topIn: 0, bottomIn: 96 })],
      observedWater: { kind: 'NONE', depthIn: null },
      limitingLayer: { type: 'NONE', depthIn: null, other: '' },
      shgw: { depthIn: null, deeperThan: false, basis: 'NO REDOXIMORPHIC FEATURES TO PIT DEPTH' },
      slope: { pct: 2, shape: '', direction: '', method: 'ESTIMATED' },
      notes: 'pit dug by excavator',
    });
    expect(pitSummary(p)).toBe(
      'TOTAL DEPTH 96". NO GROUNDWATER OBSERVED. NO REDOXIMORPHIC FEATURES TO PIT DEPTH. LIMITING LAYER: NONE TO PIT DEPTH. SLOPE 2% (ESTIMATED). PIT DUG BY EXCAVATOR.',
    );
    const wet = { ...p, observedWater: { kind: 'SEEPAGE' as const, depthIn: 72 }, limitingLayer: { type: 'BEDROCK' as const, depthIn: 90, other: '' }, notes: '' };
    expect(pitSummary(wet)).toBe('TOTAL DEPTH 96". GROUNDWATER SEEPS AT 72". NO REDOXIMORPHIC FEATURES TO PIT DEPTH. BEDROCK AT 90". SLOPE 2% (ESTIMATED).');
    expect(pitSummary(pit())).toBe('');
  });
});

describe('required-item hints (DEQ-4 §2.1.4.1, §2.1.8.1)', () => {
  it('lists what a horizon and the pit still need, without blocking', () => {
    const m = missingItems(pit({ horizons: [hz({ designation: 'A', topIn: 0, bottomIn: 12, rock: { pct: 20, kind: 'ROCKS' } })] }));
    expect(m.horizons[0]).toEqual(['color', 'texture', 'structure', 'consistence', 'plasticity', 'roots', 'mottling', 'rock size (for the texture modifier)']);
    expect(m.pit).toEqual(['observed water', 'seasonal high groundwater estimate', 'limiting layer', 'slope', 'pit is shallower than 8 ft: record the limiting layer or reason']);
  });
});
