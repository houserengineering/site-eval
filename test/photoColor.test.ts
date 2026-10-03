import { describe, expect, it } from 'vitest';
import { emptyHorizon, emptyTestPit, migrate, newSiteEvaluation, SCHEMA_VERSION, type FieldRecord, type Horizon, type PhotoRef, type TestPit } from '../src/domain/fieldRecord';
import { estimateMunsell, measureColor, type PhotoColor } from '../src/domain/photoColor';
import { wallFlags } from '../src/domain/pitChecks';

// sRGB of Munsell chips (renotation, Illuminant C → D65 Bradford), and a white card (N 9).
const CHIP: Record<string, [number, number, number]> = {
  '10YR 3/2': [84, 69, 53],
  '10YR 5/3': [141, 118, 90],
  '10YR 4/4': [120, 91, 54],
  '5Y 5/3': [133, 121, 85],
  '10R 4/4': [130, 85, 74],
};
const WHITE: [number, number, number] = [230, 230, 230];

/**
 * A synthetic wall photo, surface at the top edge and 96" at the bottom: `bands` of [bottom inch,
 * color], a white card in the top-left corner unless `card` is false, and light scaled by `light`.
 */
function wallPhoto(bands: [number, [number, number, number]][], opts: { card?: boolean; light?: number } = {}): PhotoColor {
  const w = 120;
  const h = 160;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const enc = (l: number) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
  const shade = (c: number) => enc(lin(c) * (opts.light ?? 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inch = ((y + 0.5) / h) * 96;
      let c = (bands.find(([bottom]) => inch < bottom) ?? bands.at(-1)!)[1];
      if (opts.card !== false && x < 16 && y < 12) c = WHITE;
      // A little texture, as on a real wall.
      const j = ((x * 7 + y * 13) % 5) - 2;
      rgba.set([shade(c[0]) + j, shade(c[1]) + j, shade(c[2]) + j, 255], (y * w + x) * 4);
    }
  return measureColor(rgba, w, h);
}

describe('photo color estimate (ticket 10)', () => {
  it('reads a chip back to its Munsell hue, value and chroma against a white card', () => {
    const m = estimateMunsell(CHIP['10YR 5/3'], WHITE);
    expect(m.hue).toBe('10YR');
    expect(m.value!).toBeCloseTo(5, 0);
    expect(m.chroma!).toBeCloseTo(3, 0);
    expect(estimateMunsell(CHIP['10R 4/4'], WHITE).hue).toBe('10R');
    expect(estimateMunsell(CHIP['5Y 5/3'], WHITE).hue).toBe('5Y');
  });

  it('without a white card gives the hue only', () => {
    const m = estimateMunsell(CHIP['10YR 4/4']);
    expect(m.hue).toBe('10YR');
    expect(m.value).toBeUndefined();
  });

  it('finds the white card and samples the middle of the wall in strips', () => {
    const pc = wallPhoto([[96, CHIP['10YR 5/3']]]);
    expect(pc.white).toBeDefined();
    expect(pc.strips.every((s) => s !== null)).toBe(true);
    expect(wallPhoto([[96, CHIP['10YR 5/3']]], { card: false }).white).toBeUndefined();
  });
});

let n = 0;
const hz = (topIn: number, bottomIn: number, munsell: string): Horizon => {
  const [hue, vc] = munsell.split(' ');
  const [value, chroma] = vc.split('/');
  const e = emptyHorizon();
  return { ...e, id: `h${n++}`, designation: '', topIn, bottomIn, color: { ...e.color, hue, value, chroma }, texture: { cls: 'LOAM', sandSize: '' } };
};
const photo = (color: PhotoColor, face = true, whiteInFrame = !!color.white): PhotoRef => ({ id: `p${n++}`, takenAt: '2026-10-02T12:00:00Z', width: 1200, height: 1600, face, whiteInFrame, color });
const wall = (horizons: Horizon[], photos: PhotoRef[]): TestPit => ({ id: 'w1A', label: '1A', ...emptyTestPit(), horizons, photos });
const colorFlags = (t: TestPit) => {
  const r: FieldRecord = { ...newSiteEvaluation(), testPits: [t] };
  return wallFlags(r, t).filter((f) => f.kind === 'color');
};
const topsoil = () => wallPhoto([[16, CHIP['10YR 3/2']], [96, CHIP['10YR 5/3']]]);

describe('color check against the wall-face photo (ticket 10)', () => {
  it('passes a log that matches the photo, in bright or dim light', () => {
    const log = () => [hz(0, 16, '10YR 3/2'), hz(16, 96, '10YR 5/3')];
    expect(colorFlags(wall(log(), [photo(topsoil())]))).toEqual([]);
    const dim = wallPhoto([[16, CHIP['10YR 3/2']], [96, CHIP['10YR 5/3']]], { light: 0.35 });
    expect(colorFlags(wall(log(), [photo(dim)]))).toEqual([]);
  });

  it('flags value off by 2 or more, naming what the photo reads; the id carries the logged color and photo', () => {
    const h = hz(0, 16, '10YR 5/3');
    const p = photo(topsoil());
    const flags = colorFlags(wall([h, hz(16, 96, '10YR 5/3')], [p]));
    expect(flags.map((f) => f.id)).toEqual([`color:${h.id}:10YR 5/3:${p.id}`]);
    expect(flags[0].message).toMatch(/^Horizon 0"–16": the wall-face photo reads about 10YR 3\/2; logged 10YR 5\/3\. Check the color\.$/);
    expect(flags[0].horizonId).toBe(h.id);
  });

  it('judges value and chroma only when the photo is marked as having the white card or tape', () => {
    const log = [hz(0, 16, '10YR 5/3'), hz(16, 96, '10YR 5/3')];
    expect(colorFlags(wall(log, [photo(topsoil(), true, false)]))).toEqual([]);
  });

  it('does not flag value or chroma off by 1', () => {
    expect(colorFlags(wall([hz(0, 16, '10YR 4/2'), hz(16, 96, '10YR 5/4')], [photo(topsoil())]))).toEqual([]);
  });

  it('flags a hue three chart pages away, even without a white card', () => {
    const noCard = wallPhoto([[16, CHIP['10YR 4/4']], [96, CHIP['10YR 5/3']]], { card: false });
    const flags = colorFlags(wall([hz(0, 16, '2.5YR 4/4'), hz(16, 96, '10YR 5/3')], [photo(noCard)]));
    expect(flags.map((f) => f.message)).toEqual(['Horizon 0"–16": the wall-face photo reads about 10YR; logged 2.5YR 4/4. Check the color.']);
    // Hues up to two pages off (10YR against 5Y) are within the light's error and pass.
    expect(colorFlags(wall([hz(0, 16, '5Y 4/4'), hz(16, 96, '10YR 5/3')], [photo(noCard)]))).toEqual([]);
    expect(colorFlags(wall([hz(0, 16, '2.5Y 4/4'), hz(16, 96, '10YR 5/3')], [photo(noCard)]))).toEqual([]);
    // Without a card, value and chroma are not judged.
    expect(colorFlags(wall([hz(0, 16, '10YR 6/8'), hz(16, 96, '10YR 5/3')], [photo(noCard)]))).toEqual([]);
  });

  it('uses only a photo marked as the wall face; never changes the color', () => {
    const h = hz(0, 16, '10YR 5/3');
    expect(colorFlags(wall([h, hz(16, 96, '10YR 5/3')], [photo(topsoil(), false)]))).toEqual([]);
    expect(h.color.value).toBe('5');
  });

  it('skips gley and neutral colors and horizons without a full color', () => {
    const gley = hz(0, 16, '5GY 5/1');
    const blank = { ...hz(16, 96, '10YR 5/3'), color: { ...emptyHorizon().color } };
    expect(colorFlags(wall([gley, blank], [photo(topsoil())]))).toEqual([]);
  });
});

describe('schema', () => {
  it('migrates v10 records to the current version unchanged', () => {
    const r = { ...newSiteEvaluation(), schemaVersion: 10 } as any;
    expect(migrate(r).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(11);
  });
});
