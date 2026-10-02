import { describe, expect, it } from 'vitest';
import { emptyHorizon, emptyTestPit, type Horizon, type TestPit } from '../src/domain/fieldRecord';
import { hueWarning } from '../src/domain/hueCheck';

let n = 0;
const hz = (designation: string, hue: string, extra: Partial<Horizon['color']> = {}): Horizon => {
  const e = emptyHorizon();
  return { ...e, id: `h${n++}`, designation, color: { ...e.color, hue, value: '4', chroma: '3', ...extra } };
};
const pit = (label: string, horizons: Horizon[]): TestPit => ({ id: `p${label}`, label, ...emptyTestPit(), horizons });

describe('Munsell hue outside the site pattern (ticket 03)', () => {
  // 0271: A horizons 10YR, B horizons 2.5Y; a 2.5YR B was a mis-tap.
  const site = [pit('1A', [hz('A', '10YR'), hz('B', '2.5Y')]), pit('1B', [hz('A', '10YR'), hz('B', '2.5Y')])];

  it('warns when a horizon hue is not used on the same horizon elsewhere on the site', () => {
    const odd = hz('B', '2.5YR');
    const pits = [...site, pit('2A', [hz('A', '10YR'), odd])];
    expect(hueWarning(pits, odd)).toBe('2.5YR is not used on other B horizons on this site (2.5Y). Check the chip.');
  });

  it('stays quiet for the usual hues, the first pit, and a hue kept on purpose', () => {
    const b = hz('B', '2.5Y');
    expect(hueWarning([...site, pit('2A', [b])], b)).toBeUndefined();
    const first = hz('B', '2.5YR');
    expect(hueWarning([pit('1A', [hz('A', '10YR'), first])], first)).toBeUndefined();
    const kept = hz('B', '2.5YR', { keptHue: '2.5YR' });
    expect(hueWarning([...site, pit('2A', [kept])], kept)).toBeUndefined();
  });

  it('a kept hue no longer warns elsewhere, and a horizon without a designation compares with all hues', () => {
    const kept = hz('B', '10R', { keptHue: '10R' });
    const again = hz('B', '10R');
    expect(hueWarning([...site, pit('2A', [kept]), pit('3A', [again])], again)).toBeUndefined();
    const loose = hz('', '5YR');
    expect(hueWarning([...site, pit('4A', [loose])], loose)).toBe('5YR is not used elsewhere on this site (10YR, 2.5Y). Check the chip.');
  });
});
