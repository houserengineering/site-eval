// "Location of test pit within property": the job's georeferenced aerial cropped to the test pits,
// every pit marked, this one in red, with a scale bar and north arrow. Without a map image the
// pits are plotted to scale instead (sitePlan). Coordinates print under the panel.
import type { FieldRecord, TestPit } from '../domain/fieldRecord';
import { lonLatToPx, metresPerPx } from '../domain/georef';
import { wallLocation, wallOf, type WallLocation } from '../domain/pitWalls';
import { imageMime, type Measure, type Op } from './page';
import type { Rect } from './sheetPage';
import { drawSitePlan, stampText } from './sitePlan';

const RED = '#c0392b';
const FT_PER_M = 3.28084;

/** One marker per pit (its first located wall). */
function pitMarkers(all: TestPit[]): { pit: string; loc: WallLocation }[] {
  const seen = new Map<string, WallLocation>();
  for (const p of all) {
    const key = wallOf(p.label).pit;
    if (seen.has(key)) continue;
    const loc = wallLocation(p, all);
    if (loc) seen.set(key, loc);
  }
  return [...seen].map(([pit, loc]) => ({ pit, loc }));
}

export function locationCaption(loc: WallLocation | null): string {
  if (!loc) return 'Location not recorded';
  const ns = loc.lat >= 0 ? 'N' : 'S';
  const ew = loc.lon >= 0 ? 'E' : 'W';
  const at = `${Math.abs(loc.lat).toFixed(6)}° ${ns}, ${Math.abs(loc.lon).toFixed(6)}° ${ew}`;
  if (loc.source === 'planned') return `${at} (planned location, job map)`;
  const acc = loc.accuracyM != null ? ` ±${Math.round(loc.accuracyM * FT_PER_M)} ft` : '';
  const how = loc.source === 'field' ? 'GPS' : 'GPS at other wall of this pit';
  return `${at}${acc} (${how}${loc.at ? `, ${stampText(loc.at)}` : ''})`;
}

export function locationPanel(box: Rect, wall: TestPit, record: FieldRecord, mapBytes: Uint8Array | undefined, measure: Measure): Op[] {
  const all = record.testPits;
  const here = wallLocation(wall, all);
  const caption = locationCaption(here);
  const capSize = 7;
  const plot: Rect = { x: box.x, y: box.y, w: box.w, h: box.h - capSize * 1.8 };
  const ops: Op[] = [];
  const map = record.siteMap;
  const markers = pitMarkers(all);

  if (map && mapBytes && markers.length) {
    const g = map.georef;
    const px = markers.map((m) => ({ ...m, p: lonLatToPx(g, m.loc.lon, m.loc.lat) }));
    // Crop to the pits plus a margin, widened to the panel's shape.
    let x0 = Math.min(...px.map((m) => m.p[0]));
    let x1 = Math.max(...px.map((m) => m.p[0]));
    let y0 = Math.min(...px.map((m) => m.p[1]));
    let y1 = Math.max(...px.map((m) => m.p[1]));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 40;
    x0 -= pad;
    x1 += pad;
    y0 -= pad;
    y1 += pad;
    const aspect = plot.w / plot.h;
    if ((x1 - x0) / (y1 - y0) < aspect) {
      const grow = (y1 - y0) * aspect - (x1 - x0);
      x0 -= grow / 2;
      x1 += grow / 2;
    } else {
      const grow = (x1 - x0) / aspect - (y1 - y0);
      y0 -= grow / 2;
      y1 += grow / 2;
    }
    const s = plot.w / (x1 - x0);
    const X = (x: number) => plot.x + (x - x0) * s;
    const Y = (y: number) => plot.y + (y - y0) * s;
    ops.push({ k: 'image', x: X(0), y: Y(0), w: map.width * s, h: map.height * s, bytes: mapBytes, mime: imageMime(mapBytes), clip: plot });

    const size = 6.5;
    const thisPit = wallOf(wall.label).pit;
    for (const m of [...px].sort((a, b) => Number(a.pit === thisPit) - Number(b.pit === thisPit))) {
      const hi = m.pit === thisPit;
      const cx = X(m.p[0]);
      const cy = Y(m.p[1]);
      const r = hi ? 3.6 : 2.2;
      ops.push({ k: 'circle', x: cx, y: cy, r: r + 0.9, fill: '#ffffff' });
      ops.push({ k: 'circle', x: cx, y: cy, r, fill: hi ? RED : '#000000' });
      // This wall's exact name (TP1A, not TP 1): Justin's 2026-10-03 markup.
      const label = hi ? `TP${wall.label}` : m.pit;
      const font = hi ? 'sans-bold' : 'sans';
      const w = measure(label, font, hi ? size + 1 : size);
      const lx = cx + r + 2;
      const ly = cy + size * 0.35;
      ops.push({ k: 'rect', x: lx - 0.8, y: ly - (hi ? size + 1 : size) * 0.85, w: w + 1.6, h: (hi ? size + 1 : size) * 1.1, fill: '#ffffff' });
      ops.push({ k: 'text', x: lx, y: ly, size: hi ? size + 1 : size, font, text: label, w, color: hi ? RED : undefined });
    }

    // Scale bar (bottom left) and north arrow (top right), on white so they read over the aerial.
    const ftPerPt = (metresPerPx(g) * FT_PER_M) / s;
    const target = (plot.w / 4) * ftPerPt;
    const nice = [25, 50, 100, 200, 250, 500, 1000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const sl = nice / ftPerPt;
    const sx = plot.x + 5;
    const sy = plot.y + plot.h - 6;
    const label = `${nice} ft`;
    const lw = measure(label, 'sans', 6);
    ops.push({ k: 'rect', x: sx - 3, y: sy - 8, w: sl + lw + 10, h: 12, fill: '#ffffff' });
    ops.push({ k: 'line', x1: sx, y1: sy, x2: sx + sl, y2: sy, w: 1 });
    for (const t of [sx, sx + sl]) ops.push({ k: 'line', x1: t, y1: sy - 3, x2: t, y2: sy, w: 0.8 });
    ops.push({ k: 'text', x: sx + sl + 3, y: sy + 1, size: 6, font: 'sans', text: label, w: lw });
    // North in image space from the georeference (the aerial need not be north-up).
    const c = lonLatToPx(g, markers[0].loc.lon, markers[0].loc.lat);
    const n = lonLatToPx(g, markers[0].loc.lon, markers[0].loc.lat + 0.0005);
    const len = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const [ux, uy] = [(n[0] - c[0]) / len, (n[1] - c[1]) / len];
    const ax = plot.x + plot.w - 10;
    const ay = plot.y + 14;
    ops.push({ k: 'rect', x: ax - 7, y: ay - 13, w: 14, h: 24, fill: '#ffffff' });
    ops.push({ k: 'line', x1: ax - ux * 7, y1: ay - uy * 7, x2: ax + ux * 7, y2: ay + uy * 7, w: 0.9 });
    ops.push({ k: 'line', x1: ax + ux * 7, y1: ay + uy * 7, x2: ax + ux * 3 - uy * 3, y2: ay + uy * 3 + ux * 3, w: 0.9 });
    ops.push({ k: 'line', x1: ax + ux * 7, y1: ay + uy * 7, x2: ax + ux * 3 + uy * 3, y2: ay + uy * 3 - ux * 3, w: 0.9 });
    const nw = measure('N', 'sans-bold', 6);
    ops.push({ k: 'text', x: ax - ux * 11 - nw / 2, y: ay - uy * 11 + 2, size: 6, font: 'sans-bold', text: 'N', w: nw });
    ops.push({ k: 'rect', x: plot.x, y: plot.y, w: plot.w, h: plot.h, stroke: 0.5 });
  } else {
    // No map image: plot the pits to scale from their locations.
    const pseudo = markers.map(({ pit, loc }) => ({
      ...wall,
      id: pit === wallOf(wall.label).pit ? wall.id : `pit-${pit}`,
      label: pit === wallOf(wall.label).pit ? wall.label : pit,
      location: { lat: loc.lat, lon: loc.lon, accuracyM: loc.accuracyM ?? 0, at: loc.at ?? '' },
    }));
    ops.push(...drawSitePlan(plot, pseudo, measure, { highlightId: wall.id, labelSize: 6.5 }));
  }

  ops.push({ k: 'text', x: box.x, y: box.y + box.h - 1, size: capSize, font: 'sans', text: caption, w: measure(caption, 'sans', capSize) });
  return ops;
}
