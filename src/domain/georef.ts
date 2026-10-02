// Map image georeference: an affine from image pixels to WGS84 lon/lat (phone GNSS datum).
// Over a site a few hundred metres across the projection is affine to well under an inch;
// the job builder fits it and reports the control-point residuals carried here.

export interface Georef {
  /** lon = a·x + b·y + c, lat = d·x + e·y + f (x right, y down, image pixels). */
  pxToLonLat: [number, number, number, number, number, number];
  method: string;
  controlPoints: number;
  rmsFt: number;
  p95Ft: number;
  maxFt: number;
}

export function pxToLonLat(g: Georef, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = g.pxToLonLat;
  return [a * x + b * y + c, d * x + e * y + f];
}

export function lonLatToPx(g: Georef, lon: number, lat: number): [number, number] {
  const [a, b, c, d, e, f] = g.pxToLonLat;
  const det = a * e - b * d;
  const u = lon - c;
  const v = lat - f;
  return [(e * u - b * v) / det, (a * v - d * u) / det];
}

/** Metres per image pixel along x (for accuracy circles and scale bars). */
export function metresPerPx(g: Georef): number {
  const [a, , , d, , f] = g.pxToLonLat;
  return Math.hypot(a * 111_320 * Math.cos((f * Math.PI) / 180), d * 110_574);
}

const FT_PER_M = 3.28084;

/** Ground distance in feet between two WGS84 points (equirectangular; exact enough on a site). */
export function distanceFt(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 110_574) * FT_PER_M;
}

/** Compass direction from a to b: N, NE, E … */
export function bearingText(a: { lat: number; lon: number }, b: { lat: number; lon: number }): string {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const deg = (Math.atan2((b.lon - a.lon) * kx, (b.lat - a.lat) * 110_574) * 180) / Math.PI;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg + 360) % 360) / 45) % 8];
}
