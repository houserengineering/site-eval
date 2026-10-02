// Test pit location plan from GPS fixes: pits plotted to scale (local east/north feet), north
// arrow, scale bar, accuracy circles. Used in the soil log's location box and the map page.
import { dateText, localNow, type GpsFix, type TestPit } from '../domain/fieldRecord';
import type { Measure, Op } from './page';
import type { Rect } from './sheetPage';

const FT_PER_M = 3.28084;
const HIGHLIGHT = '#c0392b';

export const accuracyFt = (fix: GpsFix) => Math.round(fix.accuracyM * FT_PER_M);

/** `45.678901° N, 111.234567° W ±12 ft` (WGS84; the PDF fonts have the degree sign). */
export function fixText(fix: GpsFix): string {
  const ns = fix.lat >= 0 ? 'N' : 'S';
  const ew = fix.lon >= 0 ? 'E' : 'W';
  return `${Math.abs(fix.lat).toFixed(6)}° ${ns}, ${Math.abs(fix.lon).toFixed(6)}° ${ew} ±${accuracyFt(fix)} ft`;
}

/** `10/2/2026 9:14 AM`, device local time. */
export function stampText(iso: string): string {
  const t = localNow(new Date(iso));
  const h = Number(t.slice(11, 13));
  return `${dateText(t.slice(0, 10))} ${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function drawSitePlan(box: Rect, pits: TestPit[], measure: Measure, opts: { highlightId?: string; labelSize?: number } = {}): Op[] {
  const ops: Op[] = [{ k: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, stroke: 0.5 }];
  const located = pits.filter((p) => p.location);
  const size = opts.labelSize ?? 8;
  if (!located.length) {
    const msg = 'No GPS location recorded';
    const w = measure(msg, 'sans', size);
    ops.push({ k: 'text', x: box.x + (box.w - w) / 2, y: box.y + box.h / 2, size, font: 'sans', text: msg, w });
    return ops;
  }

  const lat0 = located.reduce((s, p) => s + p.location!.lat, 0) / located.length;
  const lon0 = located.reduce((s, p) => s + p.location!.lon, 0) / located.length;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180) * FT_PER_M;
  const ky = 110_574 * FT_PER_M;
  const pts = located.map((p) => ({ pit: p, e: (p.location!.lon - lon0) * kx, n: (p.location!.lat - lat0) * ky }));

  const pad = Math.max(18, size * 3);
  // Room for labels beside the points, the north arrow above and the scale bar below.
  const inner = { x: box.x + pad, y: box.y + pad * 1.6, w: box.w - 2 * pad - size * 2.5, h: box.h - pad * 3.2 };
  const spanE = Math.max(...pts.map((p) => p.e)) - Math.min(...pts.map((p) => p.e));
  const spanN = Math.max(...pts.map((p) => p.n)) - Math.min(...pts.map((p) => p.n));
  // At least 100 ft across so a single pit (or two close pits) still reads as a plan.
  const ptPerFt = Math.min(inner.w / Math.max(spanE, 100), inner.h / Math.max(spanN, 100));
  const midE = (Math.max(...pts.map((p) => p.e)) + Math.min(...pts.map((p) => p.e))) / 2;
  const midN = (Math.max(...pts.map((p) => p.n)) + Math.min(...pts.map((p) => p.n))) / 2;
  const X = (e: number) => inner.x + inner.w / 2 + (e - midE) * ptPerFt;
  const Y = (n: number) => inner.y + inner.h / 2 - (n - midN) * ptPerFt;

  // Others first, the highlighted pit on top.
  const order = [...pts].sort((a, b) => Number(a.pit.id === opts.highlightId) - Number(b.pit.id === opts.highlightId));
  for (const { pit, e, n } of order) {
    const hi = pit.id === opts.highlightId;
    const x = X(e);
    const y = Y(n);
    const acc = pit.location!.accuracyM * FT_PER_M * ptPerFt;
    if (acc > 3) ops.push({ k: 'circle', x, y, r: acc, stroke: 0.4, dash: [1.5, 1.5] });
    ops.push({ k: 'circle', x, y, r: hi ? size * 0.45 : size * 0.3, fill: hi ? HIGHLIGHT : '#000000' });
    const label = `TP ${pit.label}`;
    const font = hi ? 'sans-bold' : 'sans';
    const w = measure(label, font, size);
    // Label to the right unless it would leave the box.
    const lx = x + size * 0.7 + w > box.x + box.w - 2 ? x - size * 0.7 - w : x + size * 0.7;
    ops.push({ k: 'text', x: lx, y: y + size * 0.35, size, font, text: label, w, color: hi ? HIGHLIGHT : undefined });
  }

  // North arrow, top right.
  const ax = box.x + box.w - pad * 0.6;
  const ay = box.y + pad * 0.35;
  const al = size * 2.2;
  ops.push({ k: 'line', x1: ax, y1: ay + al, x2: ax, y2: ay + size * 0.6, w: 0.8 });
  ops.push({ k: 'line', x1: ax - size * 0.4, y1: ay + size * 1.2, x2: ax, y2: ay + size * 0.6, w: 0.8 });
  ops.push({ k: 'line', x1: ax + size * 0.4, y1: ay + size * 1.2, x2: ax, y2: ay + size * 0.6, w: 0.8 });
  const nw = measure('N', 'sans-bold', size);
  ops.push({ k: 'text', x: ax - nw / 2, y: ay + size * 0.4, size, font: 'sans-bold', text: 'N', w: nw });

  // Scale bar, bottom left: a round length near a quarter of the box.
  const target = box.w / 4 / ptPerFt;
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  const sx = box.x + pad * 0.5;
  const sy = box.y + box.h - pad * 0.45;
  const sl = nice * ptPerFt;
  ops.push({ k: 'line', x1: sx, y1: sy, x2: sx + sl, y2: sy, w: 1 });
  for (const t of [sx, sx + sl]) ops.push({ k: 'line', x1: t, y1: sy - size * 0.4, x2: t, y2: sy + size * 0.1, w: 0.8 });
  const label = `${nice} ft`;
  ops.push({ k: 'text', x: sx + sl + size * 0.4, y: sy + size * 0.3, size: size * 0.9, font: 'sans', text: label, w: measure(label, 'sans', size * 0.9) });
  return ops;
}
