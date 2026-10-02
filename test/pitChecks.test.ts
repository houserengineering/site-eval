import { describe, expect, it } from 'vitest';
import { emptyHorizon, emptyTestPit, migrate, newSiteEvaluation, type FieldRecord, type Horizon, type TestPit } from '../src/domain/fieldRecord';
import { acceptFlag, lumaOf, measurePhoto, openFlags, photoProblems, wallFlags, type PhotoQuality } from '../src/domain/pitChecks';
import { mergeRecords } from '../src/domain/merge';

let n = 0;
const hz = (designation: string, topIn: number | null, bottomIn: number | null, extra: Partial<Horizon> = {}): Horizon => {
  const e = emptyHorizon();
  return {
    ...e,
    id: `h${n++}`,
    designation,
    topIn,
    bottomIn,
    color: { ...e.color, hue: '10YR', value: '4', chroma: '3' },
    texture: { cls: 'LOAM', sandSize: '' },
    ...extra,
  };
};
const wall = (label: string, horizons: Horizon[], extra: Partial<TestPit> = {}): TestPit => ({ id: `w${label}`, label, ...emptyTestPit(), horizons, ...extra });
const site = (...pits: TestPit[]): FieldRecord => ({ ...newSiteEvaluation(), testPits: pits });
const ids = (r: FieldRecord, label: string) => wallFlags(r, r.testPits.find((p) => p.label === label)!).map((f) => f.id);
const messages = (r: FieldRecord, label: string) => wallFlags(r, r.testPits.find((p) => p.label === label)!).map((f) => f.message);

const good = () => [hz('A', 0, 12), hz('B', 12, 40), hz('C', 40, 96)];

describe('data checks on a wall (ticket 09)', () => {
  it('a complete wall and an unstarted wall have no flags', () => {
    const r = site(wall('1A', good()), wall('1B', []));
    expect(ids(r, '1A')).toEqual([]);
    expect(ids(r, '1B')).toEqual([]);
  });

  it('flags depth gaps and overlaps between horizons, and a log that does not start at the surface', () => {
    const r = site(wall('1A', [hz('A', 2, 12), hz('B', 14, 40), hz('C', 36, 96)]));
    expect(messages(r, '1A')).toEqual(['Nothing logged from 0" to 2".', 'Nothing logged from 12" to 14".', 'Horizons overlap from 36" to 40".']);
    expect(ids(r, '1A')).toEqual(['gap:0-2', 'gap:12-14', 'overlap:36-40']);
  });

  it('flags a horizon whose bottom is not below its top', () => {
    const r = site(wall('1A', [hz('A', 0, 12), hz('B', 12, 10), hz('C', 12, 96)]));
    expect(messages(r, '1A')).toContain('Horizon B: bottom 10" is not below its top 12".');
  });

  it('flags a log that stops short of 96", or of the water or limiting depth when that is shallower', () => {
    expect(messages(site(wall('1A', [hz('A', 0, 12), hz('B', 12, 84)])), '1A')).toEqual(['Log ends at 84"; log the wall to 96".']);
    const bedrock = { limitingLayer: { type: 'BEDROCK' as const, depthIn: 60, other: '' } };
    expect(ids(site(wall('1A', [hz('A', 0, 12), hz('B', 12, 60)], bedrock)), '1A')).toEqual([]);
    expect(messages(site(wall('1A', [hz('A', 0, 12), hz('B', 12, 50)], bedrock)), '1A')).toEqual(['Log ends at 50"; log the wall to the bedrock at 60".']);
    const water = { observedWater: { kind: 'SEEPAGE' as const, depthIn: 70 } };
    expect(ids(site(wall('1A', [hz('A', 0, 12), hz('B', 12, 72)], water)), '1A')).toEqual([]);
    // An open-ended last horizon (72"+) still ends where it was measured.
    expect(ids(site(wall('1A', [hz('A', 0, 12), hz('B', 12, null)])), '1A')).toEqual(['short:12']);
  });

  it('flags walls A and B of a pit with different horizon counts, on both walls', () => {
    const r = site(wall('1A', good()), wall('1B', [hz('A', 0, 12), hz('C', 12, 96)]));
    expect(messages(r, '1A')).toEqual(['Wall 1A has 3 horizons and wall 1B has 2.']);
    expect(ids(r, '1B')).toEqual(['walls:3-2']);
  });

  it('flags a hue outside the site pattern, rock of 60% or more, and a horizon with no color or texture', () => {
    const odd = hz('B', 12, 40, { color: { ...emptyHorizon().color, hue: '2.5YR', value: '4', chroma: '4' } });
    const rocky = hz('C', 40, 96, { rock: { pct: 65, kind: 'COBBLES' } });
    const r = site(wall('1A', good()), wall('2A', [hz('A', 0, 12), odd, rocky]));
    expect(messages(r, '2A')).toEqual([
      'Horizon B: 2.5YR is not used on other B horizons on this site (10YR). Check the chip.',
      'Horizon C: rock 65% is bedrock (60% or more). Check the percent or record bedrock.',
    ]);
    const blank = hz('A', 0, 12, { color: emptyHorizon().color, texture: { cls: '', sandSize: '' } });
    expect(messages(site(wall('1A', [blank, hz('B', 12, 96)])), '1A')).toEqual(['Horizon A: no color and no texture.']);
  });

  it('a blank that gap fill can fill (other wall, nearest pit) is not a flag', () => {
    const blank = hz('A', 0, 12, { texture: { cls: '', sandSize: '' } });
    const r = site(wall('1A', good()), wall('1B', [blank, hz('B', 12, 40), hz('C', 40, 96)]));
    expect(ids(r, '1B')).toEqual([]);
  });
});

describe('accepting a flag (ticket 09)', () => {
  const short = () => site(wall('1A', [hz('A', 0, 12), hz('B', 12, 84)]), wall('1B', [hz('A', 0, 12), hz('B', 12, 84), hz('C', 84, 96)]));

  it('records who and when on the wall, and the flag is no longer open', () => {
    const r = short();
    expect(openFlags(r).map((f) => `${f.wallLabel} ${f.id}`)).toEqual(['1A short:84', '1A walls:2-3', '1B walls:2-3']);
    const a = acceptFlag(r, 'w1A', 'short:84', 'Justin', '2026-10-02T15:00:00Z');
    expect(a.testPits[0].accepted).toEqual({ 'short:84': { by: 'Justin', at: '2026-10-02T15:00:00Z' } });
    const f = wallFlags(a, a.testPits[0]).find((x) => x.id === 'short:84')!;
    expect(f.accepted).toEqual({ by: 'Justin', at: '2026-10-02T15:00:00Z' });
    expect(openFlags(a).map((x) => x.id)).toEqual(['walls:2-3', 'walls:2-3']);
  });

  it('a wall-count flag accepted on one wall is accepted on both', () => {
    const a = acceptFlag(short(), 'w1B', 'walls:2-3', 'Nate', '2026-10-02T15:01:00Z');
    expect(openFlags(a).map((x) => x.id)).toEqual(['short:84']);
  });

  it('an acceptance covers only the condition accepted: a changed depth flags again', () => {
    const a = acceptFlag(short(), 'w1A', 'short:84', 'Justin', '2026-10-02T15:00:00Z');
    const changed = { ...a, testPits: [{ ...a.testPits[0], horizons: [hz('A', 0, 12), hz('B', 12, 80)] }, a.testPits[1]] };
    expect(openFlags(changed).map((x) => x.id)).toContain('short:80');
  });

  it('acceptances on two devices merge', () => {
    const base = short();
    const a = { ...acceptFlag(base, 'w1A', 'short:84', 'Justin', '2026-10-02T15:00:00Z'), edits: { '/testPits/@w1A/accepted/short:84': { by: 'Justin', at: '2026-10-02T15:00:00Z' } } };
    const b = { ...acceptFlag(base, 'w1B', 'walls:2-3', 'Nate', '2026-10-02T15:01:00Z'), edits: { '/testPits/@w1B/accepted/walls:2-3': { by: 'Nate', at: '2026-10-02T15:01:00Z' } } };
    expect(openFlags(mergeRecords(a, b))).toEqual([]);
  });

  it('schema v10 adds an empty acceptance list to every wall', () => {
    const v9 = { ...newSiteEvaluation(), schemaVersion: 9, testPits: [{ ...wall('1A', []), accepted: undefined }] } as any;
    expect(migrate(v9).testPits[0].accepted).toEqual({});
  });
});

// ---- photos -------------------------------------------------------------------

/** Deterministic textured "pit wall": brown speckle at several scales (like a soil face). */
function texture(w: number, h: number, mean = 120, contrast = 1): Uint8ClampedArray {
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const coarse = Array.from({ length: Math.ceil(w / 16) * Math.ceil(h / 16) }, rnd);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = mean + contrast * ((coarse[Math.floor(y / 16) * Math.ceil(w / 16) + Math.floor(x / 16)] - 0.5) * 60 + (rnd() - 0.5) * 70);
      const i = (y * w + x) * 4;
      out[i] = v * 1.15;
      out[i + 1] = v;
      out[i + 2] = v * 0.75;
      out[i + 3] = 255;
    }
  return out;
}

/** Box blur on luma, `passes` times (≈ Gaussian). */
function blur(luma: Float32Array, w: number, h: number, passes: number): Float32Array {
  let a = luma;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let k = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w) {
              sum += a[yy * w + xx];
              k++;
            }
          }
        b[y * w + x] = sum / k;
      }
    a = b;
  }
  return a;
}

describe('photo minimum standard (ticket 09)', () => {
  const W = 384;
  const H = 512;
  const src = { width: 3060, height: 4080 };
  const measure = (rgba: Uint8ClampedArray, source = src) => measurePhoto(lumaOf(rgba), W, H, source);

  it('a sharp, well exposed, full-size photo passes', () => {
    const q = measure(texture(W, H));
    expect(q.sharpness).toBeGreaterThan(400);
    expect(q.meanLuma).toBeGreaterThan(90);
    expect(photoProblems(q)).toEqual([]);
  });

  it('a blurred photo is flagged', () => {
    const q = measurePhoto(blur(lumaOf(texture(W, H)), W, H, 2), W, H, src);
    expect(q.sharpness).toBeLessThan(40);
    expect(photoProblems(q)).toEqual(['blurry']);
  });

  it('too dark and washed out photos are flagged', () => {
    expect(photoProblems(measure(texture(W, H, 30, 0.4)))).toContain('too dark');
    expect(photoProblems(measure(texture(W, H, 245, 0.6)))).toContain('washed out');
  });

  it('a small photo is flagged', () => {
    expect(photoProblems(measure(texture(W, H), { width: 300, height: 400 }))).toEqual(['too small (300 × 400)']);
  });

  it('a wall photo with problems is a flag; one without a measurement is not', () => {
    const q: PhotoQuality = { srcWidth: 300, srcHeight: 400, sharpness: 10, meanLuma: 120, darkClip: 0, brightClip: 0 };
    const photos = [
      { id: 'ph1', takenAt: '2026-10-02T15:00:00Z', width: 300, height: 400, quality: q },
      { id: 'ph2', takenAt: '2026-10-02T15:00:00Z', width: 300, height: 400 },
    ];
    const r = site(wall('1A', good(), { photos }));
    expect(wallFlags(r, r.testPits[0]).map((f) => [f.id, f.message])).toEqual([['photo:ph1', 'Photo 1 is blurry and too small (300 × 400): retake it.']]);
  });
});
