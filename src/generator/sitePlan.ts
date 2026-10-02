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

  const placed = pts.map(({ pit, e, n }) => {
    const hi = pit.id === opts.highlightId;
    const label = `TP ${pit.label}`;
    const font = hi ? 'sans-bold' : 'sans';
    return { pit, hi, x: X(e), y: Y(n), r: hi ? size * 0.45 : size * 0.3, label, font: font as 'sans' | 'sans-bold', w: measure(label, font, size), lx: 0, ly: 0 };
  });
  // Labels beside their points without covering another label or marker: the highlighted pit
  // first, then the rest; each takes the first clear spot of several around its point.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const taken: Box[] = placed.map((p) => ({ x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r }));
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const gap = size * 0.7;
  for (const p of [...placed].sort((a, b) => Number(b.hi) - Number(a.hi))) {
    const own = taken[placed.indexOf(p)];
    let best: { box: Box; cost: number } | null = null;
    for (const k of [1, 2, 3]) {
      const d = gap * k;
      const spots: [number, number][] = [
        [p.x + d, p.y + size * 0.35], // right
        [p.x - d - p.w, p.y + size * 0.35], // left
        [p.x - p.w / 2, p.y - d + size * 0.1], // above
        [p.x - p.w / 2, p.y + d + size * 0.6], // below
        [p.x + d * 0.7, p.y - d * 0.7 + size * 0.2], // above right
        [p.x + d * 0.7, p.y + d * 0.7 + size * 0.6], // below right
        [p.x - d * 0.7 - p.w, p.y - d * 0.7 + size * 0.2], // above left
        [p.x - d * 0.7 - p.w, p.y + d * 0.7 + size * 0.6], // below left
      ];
      for (const [lx, ly] of spots) {
        const box_ = { x0: lx, x1: lx + p.w, y0: ly - size * 0.75, y1: ly + size * 0.2 };
        const outside = box_.x0 < box.x + 2 || box_.x1 > box.x + box.w - 2 || box_.y0 < box.y + 2 || box_.y1 > box.y + box.h - 2;
        const cost = (outside ? 1e6 : 0) + taken.reduce((c, t) => (t === own ? c : c + overlap(box_, t)), 0) + (k - 1) * 0.01;
        if (!best || cost < best.cost) {
          best = { box: box_, cost };
          p.lx = lx;
          p.ly = ly;
        }
      }
      if (best && best.cost < 1) break;
    }
    taken.push(best!.box);
  }

  // Others first, the highlighted pit on top.
  for (const p of [...placed].sort((a, b) => Number(a.hi) - Number(b.hi))) {
    const acc = p.pit.location!.accuracyM * FT_PER_M * ptPerFt;
    if (acc > 3) ops.push({ k: 'circle', x: p.x, y: p.y, r: acc, stroke: 0.4, dash: [1.5, 1.5] });
    ops.push({ k: 'circle', x: p.x, y: p.y, r: p.r, fill: p.hi ? HIGHLIGHT : '#000000' });
  }
  for (const p of [...placed].sort((a, b) => Number(a.hi) - Number(b.hi)))
    ops.push({ k: 'text', x: p.lx, y: p.ly, size, font: p.font, text: p.label, w: p.w, color: p.hi ? HIGHLIGHT : undefined });

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
