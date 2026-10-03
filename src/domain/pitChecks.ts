// Checks on a wall before leaving it (ticket 09), all offline: horizon depths, log depth, wall A/B
// horizon counts, hue outside the site pattern, rock that is really bedrock, horizons with nothing
// recorded, and a photo minimum standard. Each open flag blocks the soil log until it is fixed or
// accepted; an acceptance records who and when on the wall and covers only the condition accepted
// (the flag id carries the values), so a later change flags again.
import { limitingDepth } from './rules';
import { updateTestPit, type FieldRecord, type Horizon, type TestPit } from './fieldRecord';
import { fillRecord } from './fillGaps';
import { hueWarning } from './hueCheck';
import { wallOf } from './pitWalls';
import { bandColor, colorMismatch } from './photoColor';
import { munsellNotation } from './vocabulary';

/** Measured once when the photo is taken (on a downscaled copy); see `measurePhoto`. */
export interface PhotoQuality {
  /** The camera's image size, before the app shrinks it for storage. */
  srcWidth: number;
  srcHeight: number;
  /** Variance of the 4-neighbour Laplacian of luma (0–255) at ≤ 512 px. */
  sharpness: number;
  meanLuma: number;
  /** Share of pixels at or below 8 / at or above 247. */
  darkClip: number;
  brightClip: number;
}

export interface Acceptance {
  by: string;
  at: string;
}

export type FlagKind = 'depth' | 'short' | 'walls' | 'hue' | 'rock' | 'blank' | 'photo' | 'color';

export interface Flag {
  /** Stable for one condition: `gap:12-14`, `short:84`, `rock:<horizon id>:65`. */
  id: string;
  kind: FlagKind;
  wallId: string;
  wallLabel: string;
  message: string;
  horizonId?: string;
  photoId?: string;
  accepted?: Acceptance;
}

/**
 * Photo minimum standard. Calibrated 2026-10-02 on 12 phone photos (outdoor, 1500–4080 px):
 * sharp ones measured 455–4900 and means 98–154; the same photos blurred (σ ≈ 0.3% of the width)
 * measured 5–42, darkened to 25% means 24–38, brightened 2.5× clipped 15–83% white.
 */
export const PHOTO_LIMITS = { minShortSide: 1000, minSharpness: 40, minMean: 50, maxMean: 210, maxClip: 0.2 };

/** Luma (Rec. 601) of RGBA pixels, as from a canvas `getImageData`. */
export function lumaOf(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return out;
}

/** Sharpness and exposure of a `w`×`h` luma image (the photo drawn at ≤ 512 px); `source` is the camera size. */
export function measurePhoto(luma: ArrayLike<number>, w: number, h: number, source: { width: number; height: number }): PhotoQuality {
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < w * h; i++) {
    const v = luma[i];
    sum += v;
    if (v <= 8) dark++;
    if (v >= 247) bright++;
  }
  let n = 0;
  let s = 0;
  let s2 = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - w] + luma[i + w] - 4 * luma[i];
      n++;
      s += lap;
      s2 += lap * lap;
    }
  const round = (v: number, k = 10) => Math.round(v * k) / k;
  return {
    srcWidth: source.width,
    srcHeight: source.height,
    sharpness: n ? round(s2 / n - (s / n) ** 2) : 0,
    meanLuma: round(sum / (w * h)),
    darkClip: round(dark / (w * h), 1000),
    brightClip: round(bright / (w * h), 1000),
  };
}

/** What is wrong with a photo, in words (`blurry`, `too dark`, `washed out`, `too small (300 × 400)`). */
export function photoProblems(q: PhotoQuality): string[] {
  const L = PHOTO_LIMITS;
  const out: string[] = [];
  if (q.sharpness < L.minSharpness) out.push('blurry');
  if (q.meanLuma < L.minMean || q.darkClip > L.maxClip) out.push('too dark');
  else if (q.meanLuma > L.maxMean || q.brightClip > L.maxClip) out.push('washed out');
  if (Math.min(q.srcWidth, q.srcHeight) < L.minShortSide) out.push(`too small (${q.srcWidth} × ${q.srcHeight})`);
  return out;
}

const join = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const name = (h: Horizon) => `Horizon ${h.designation.trim() || `${h.topIn ?? '?'}"–${h.bottomIn ?? '?'}"`}`;

/** Every check on a wall, accepted ones included (with who and when). A wall with no horizons has none. */
export function wallFlags(r: FieldRecord, wall: TestPit): Flag[] {
  if (!wall.horizons.length) return [];
  const out: Omit<Flag, 'wallId' | 'wallLabel'>[] = [];
  const add = (kind: FlagKind, id: string, message: string, extra: Partial<Flag> = {}) => out.push({ kind, id, message, ...extra });
  const hs = wall.horizons;

  // Depths, top down.
  const sorted = [...hs].filter((h) => h.topIn != null).sort((a, b) => a.topIn! - b.topIn!);
  if (sorted.length && sorted[0].topIn! > 0) add('depth', `gap:0-${sorted[0].topIn}`, `Nothing logged from 0" to ${sorted[0].topIn}".`);
  for (const h of hs)
    if (h.topIn != null && h.bottomIn != null && h.bottomIn <= h.topIn)
      add('depth', `depth:${h.id}:${h.topIn}-${h.bottomIn}`, `${name(h)}: bottom ${h.bottomIn}" is not below its top ${h.topIn}".`, { horizonId: h.id });
  for (let i = 1; i < sorted.length; i++) {
    const above = sorted[i - 1].bottomIn;
    const top = sorted[i].topIn!;
    if (above == null || above <= sorted[i - 1].topIn!) continue;
    if (top > above) add('depth', `gap:${above}-${top}`, `Nothing logged from ${above}" to ${top}".`);
    else if (top < above) add('depth', `overlap:${top}-${above}`, `Horizons overlap from ${top}" to ${above}".`);
  }

  // Log depth: 96", or the water or limiting depth when shallower.
  const ends = Math.max(...hs.map((h) => h.bottomIn ?? h.topIn ?? 0));
  const lim = limitingDepth(wall);
  const target = lim && lim.depthIn < 96 ? lim : null;
  if (ends < (target?.depthIn ?? 96)) add('short', `short:${ends}`, `Log ends at ${ends}"; log the wall to ${target ? `the ${target.what} at ${target.depthIn}"` : '96"'}.`);

  // Walls A and B of the same pit.
  const { pit, wall: letter } = wallOf(wall.label);
  const other = letter ? r.testPits.find((p) => p !== wall && p.horizons.length && wallOf(p.label).pit === pit && wallOf(p.label).wall) : undefined;
  if (other && other.horizons.length !== hs.length) {
    const [a, b] = letter < wallOf(other.label).wall ? [wall, other] : [other, wall];
    add('walls', `walls:${a.horizons.length}-${b.horizons.length}`, `Wall ${a.label} has ${a.horizons.length} horizons and wall ${b.label} has ${b.horizons.length}.`);
  }

  // Horizons.
  const filled = fillRecord(r).pits.find((p) => p.id === wall.id)!;
  for (const h of hs) {
    const hue = hueWarning(r.testPits, h);
    if (hue) add('hue', `hue:${h.id}:${h.color.hue}`, `${name(h)}: ${hue}`, { horizonId: h.id });
    if ((h.rock.pct ?? 0) >= 60) add('rock', `rock:${h.id}:${h.rock.pct}`, `${name(h)}: rock ${h.rock.pct}% is bedrock (60% or more). Check the percent or record bedrock.`, { horizonId: h.id });
    const f = filled.horizons.find((x) => x.id === h.id)!;
    const missing = [!(f.color.hue && f.color.value && f.color.chroma) && !f.color.other.trim() && 'no color', !f.texture.cls.trim() && 'no texture'].filter(Boolean) as string[];
    if (missing.length) add('blank', `blank:${h.id}`, `${name(h)}: ${missing.join(' and ')}.`, { horizonId: h.id });
  }

  // Color against the wall-face photo, the photo spanning the surface to the log bottom.
  const face = [...wall.photos].reverse().find((p) => p.face && p.color);
  if (face?.color && ends > 0)
    for (const h of hs) {
      if (h.topIn == null || h.bottomIn == null) continue;
      const band = bandColor(face.color, h.topIn, h.bottomIn, ends);
      const reads = band && colorMismatch(h.color, band, face.whiteInFrame ? face.color.white : undefined);
      const logged = munsellNotation(h.color.hue, h.color.value, h.color.chroma);
      if (reads)
        add('color', `color:${h.id}:${logged}:${face.id}`, `${name(h)}: the wall-face photo reads about ${reads}; logged ${logged}. Check the color.`, {
          horizonId: h.id,
          photoId: face.id,
        });
    }

  wall.photos.forEach((p, i) => {
    const problems = p.quality ? photoProblems(p.quality) : [];
    if (problems.length) add('photo', `photo:${p.id}`, `Photo ${i + 1} is ${join(problems)}: retake it.`, { photoId: p.id });
  });

  return out.map((f) => ({ ...f, wallId: wall.id, wallLabel: wall.label, ...accepted(r, wall, f) }));
}

/** A wall-count flag accepted on either wall counts for both. */
function accepted(r: FieldRecord, wall: TestPit, f: { id: string; kind: FlagKind }): { accepted?: Acceptance } {
  const own = wall.accepted?.[f.id];
  if (own) return { accepted: own };
  if (f.kind !== 'walls') return {};
  const { pit } = wallOf(wall.label);
  const twin = r.testPits.find((p) => p !== wall && wallOf(p.label).pit === pit && p.accepted?.[f.id]);
  return twin ? { accepted: twin.accepted[f.id] } : {};
}

/** Flags not yet fixed or accepted, walls in record order. */
export const openFlags = (r: FieldRecord): Flag[] => r.testPits.flatMap((w) => wallFlags(r, w)).filter((f) => !f.accepted);

export function acceptFlag(r: FieldRecord, wallId: string, flagId: string, by: string, at = new Date().toISOString()): FieldRecord {
  const wall = r.testPits.find((p) => p.id === wallId);
  if (!wall) return r;
  return updateTestPit(r, wallId, { accepted: { ...wall.accepted, [flagId]: { by, at } } });
}
