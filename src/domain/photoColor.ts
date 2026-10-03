// Photo color check (ticket 10): the wall-face photo, sampled in each horizon's depth band, against
// the logged Munsell color. It only flags large differences and never sets a color; light varies
// too much for that (Justin). A white card or tape in frame calibrates value and chroma; without
// one only the hue is judged, on the phone's own white balance. The user marks both the
// wall-face photo and that the card or tape is in it.
//
// Calibration, 2026-10-02, on the 39 photos of 0271: every one looks down into the pit from the
// surface (backdirt and grass at the top, the pit in shadow below), so depth bands over the photo
// height sampled backdirt and shadow: topsoil logged 10YR 3/2 read value 5.9–8.2 and subsoil logged
// 10YR 5/3 read 2.1–5.1. Grass and white-looking pixels did not tell those photos from a wall face,
// so the check runs only on a photo marked as the wall face (square to the wall, surface at the top
// edge, log bottom at the bottom edge).

/** Measured once when the photo is taken (on a ≤ 512 px copy); see `measureColor`. */
export interface PhotoColor {
  /** Mean sRGB of the middle half of each of `STRIPS` bands, top down; null when too little soil shows. */
  strips: ([number, number, number] | null)[];
  /** Mean sRGB of what may be a white card or tape; used only when the photo is marked `whiteInFrame`. */
  white?: [number, number, number];
}

export const STRIPS = 24;

/** CIELAB hue angle (D65) of each soil chart page, from the Munsell renotation at values 3–6, chromas 2–6. */
const PAGES: [string, number][] = [
  ['10R', 41],
  ['2.5YR', 51],
  ['5YR', 60],
  ['7.5YR', 68],
  ['10YR', 77],
  ['2.5Y', 85],
  ['5Y', 92],
];
/** C*ab per Munsell chroma step on the soil pages (renotation 10R–5Y, values 3–6: 5.6–7.3). */
const CSTAR_PER_CHROMA = 6.2;
/** A white card or tape reads about N 9 (Y = 0.79). */
const WHITE_Y = 0.79;

/**
 * Thresholds: hue 3 chart pages apart (2.5YR against 10YR, the 0271 mis-entry); value or chroma 2
 * chips off; hue judged only at chroma 1.5 or more. On 0271 dry grass and backdirt pulled topsoil
 * bands to 5Y, 2 pages from the logged 10YR, so 2 pages would flag sound logs.
 */
export const COLOR_LIMITS = { huePages: 3, value: 2, chroma: 2, minChromaForHue: 1.5 };

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const isVegetation = (r: number, g: number, b: number) => g > r && g > b + 8;
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Strip colors and the white reference of an RGBA image (as from a canvas `getImageData`). */
export function measureColor(rgba: ArrayLike<number>, w: number, h: number): PhotoColor {
  const strips: PhotoColor['strips'] = [];
  const x0 = Math.floor(w / 4);
  const x1 = Math.ceil((3 * w) / 4);
  const lumas: number[] = [];
  for (let s = 0; s < STRIPS; s++) {
    const y0 = Math.floor((s * h) / STRIPS);
    const y1 = Math.floor(((s + 1) * h) / STRIPS);
    let n = 0;
    const sum = [0, 0, 0];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
        if (Math.max(r, g, b) >= 250 || Math.min(r, g, b) <= 5 || isVegetation(r, g, b)) continue;
        n++;
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
      }
    const ok = n >= 0.25 * (y1 - y0) * (x1 - x0) && n > 0;
    const mean = sum.map((v) => Math.round((v / n) * 10) / 10) as [number, number, number];
    strips.push(ok ? mean : null);
    if (ok) lumas.push(luma(...mean));
  }
  return { strips, white: findWhite(rgba, w, h, lumas) };
}

/**
 * The largest patch of unclipped, near-neutral pixels brighter than the soil, if it covers 0.1% of
 * the frame. Sunlit backdirt and pale rock pass too (on 0271, 38 of 39 photos had a candidate under
 * looser limits), so the check uses it only when the photo is marked as having a white card or tape.
 */
function findWhite(rgba: ArrayLike<number>, w: number, h: number, soilLumas: number[]): PhotoColor['white'] {
  if (!soilLumas.length) return undefined;
  const median = [...soilLumas].sort((a, b) => a - b)[soilLumas.length >> 1];
  const lit = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const [r, g, b] = [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]];
    const hi = Math.max(r, g, b);
    lit[p] = +(hi < 250 && hi - Math.min(r, g, b) <= 0.03 * hi + 2 && luma(r, g, b) >= 1.4 * median);
  }
  // 4-connected patches; keep the largest.
  let best: number[] = [];
  const seen = new Uint8Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!lit[p0] || seen[p0]) continue;
    const patch = [p0];
    seen[p0] = 1;
    for (let k = 0; k < patch.length; k++) {
      const p = patch[k];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w])
        if (q >= 0 && q < w * h && lit[q] && !seen[q]) {
          seen[q] = 1;
          patch.push(q);
        }
    }
    if (patch.length > best.length) best = patch;
  }
  if (best.length < 0.001 * w * h) return undefined;
  const sum = [0, 0, 0];
  for (const p of best) for (let k = 0; k < 3; k++) sum[k] += rgba[p * 4 + k];
  return sum.map((v) => Math.round((v / best.length) * 10) / 10) as [number, number, number];
}

export interface MunsellEstimate {
  /** Nearest soil chart page by hue angle. */
  hue: string;
  page: number;
  /** Only with a white reference. */
  value?: number;
  chroma?: number;
  /** Chroma on the camera's own exposure: enough to tell whether the hue means anything. */
  rawChroma: number;
}

/** Munsell estimate of an sRGB color; `white` (a card or tape in frame) calibrates value and chroma. */
export function estimateMunsell(rgb: readonly number[], white?: readonly number[]): MunsellEstimate {
  let c = rgb.map(lin);
  if (white) c = c.map((v, k) => (v * WHITE_Y) / Math.max(lin(white[k]), 1e-4));
  const [L, a, b] = labOf(c);
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  let page = 0;
  PAGES.forEach(([, deg], i) => Math.abs(deg - angle) < Math.abs(PAGES[page][1] - angle) && (page = i));
  const chroma = Math.hypot(a, b) / CSTAR_PER_CHROMA;
  const rawChroma = Math.hypot(...labOf(rgb.map(lin)).slice(1)) / CSTAR_PER_CHROMA;
  return { hue: PAGES[page][0], page, rawChroma, ...(white ? { value: L / 10, chroma } : {}) };
}

/** CIELAB (D65) of linear sRGB. */
function labOf([r, g, b]: number[]): [number, number, number] {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Mean color of the strips whose middle lies between `topIn` and `bottomIn`, with the photo spanning 0 to `depthIn`. */
export function bandColor(pc: PhotoColor, topIn: number, bottomIn: number, depthIn: number): [number, number, number] | undefined {
  const inBand = pc.strips.filter((_, s) => {
    const mid = ((s + 0.5) / pc.strips.length) * depthIn;
    return mid >= topIn && mid < bottomIn;
  });
  const seen = inBand.filter((s): s is [number, number, number] => !!s);
  if (!seen.length || seen.length * 2 < inBand.length) return undefined;
  return [0, 1, 2].map((k) => seen.reduce((t, s) => t + s[k], 0) / seen.length) as [number, number, number];
}

/** What the photo reads (`10YR 3/2`, or the hue alone without a white reference) when it differs a lot from the logged color. */
export function colorMismatch(logged: { hue: string; value: string; chroma: string }, rgb: readonly number[], white?: readonly number[]): string | undefined {
  const page = PAGES.findIndex(([h]) => h === logged.hue);
  if (page < 0 || !logged.value || !logged.chroma) return undefined;
  const L = COLOR_LIMITS;
  const est = estimateMunsell(rgb, white);
  const hueOff = est.rawChroma >= L.minChromaForHue && Math.abs(est.page - page) >= L.huePages;
  // Compared as the nearest chip, as read off the chart.
  const value = est.value != null ? Math.round(est.value) : undefined;
  const chroma = est.chroma != null ? Math.max(1, Math.round(est.chroma)) : undefined;
  const valueOff = value != null && Math.abs(value - Number(logged.value)) >= L.value;
  const chromaOff = chroma != null && Math.abs(chroma - Number(logged.chroma)) >= L.chroma;
  if (!hueOff && !valueOff && !chromaOff) return undefined;
  return value != null ? `${est.hue} ${value}/${chroma}` : est.hue;
}
