// Test pit location plan: labels must stay legible when pits are close together.
import { describe, expect, it } from 'vitest';
import { emptyTestPit, type TestPit } from '../src/domain/fieldRecord';
import { drawSitePlan } from '../src/generator/sitePlan';

const measure = (text: string, _font: string, size: number) => text.length * size * 0.55;
const pit = (label: string, lat: number, lon: number): TestPit => ({
  ...emptyTestPit(),
  id: `id-${label}`,
  label,
  location: { lat, lon, accuracyM: 2.5, at: '2026-10-02T09:00:00' },
});
type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('site plan labels', () => {
  // Spread like a 20-pit subdivision (~1000 ft), with pairs 15–30 ft apart as in 0271 (pits 7/8, 12/13, 1/5).
  const base = { lat: 45.614, lon: -111.07 };
  const pits = [
    pit('1', base.lat, base.lon),
    pit('5', base.lat - 0.00006, base.lon + 0.00008),
    pit('7', base.lat + 0.001, base.lon + 0.001),
    pit('8', base.lat + 0.001, base.lon + 0.00108),
    pit('12', base.lat - 0.0003, base.lon + 0.0024),
    pit('13', base.lat - 0.0003, base.lon + 0.00232),
    pit('20', base.lat + 0.002, base.lon + 0.004),
    pit('21', base.lat + 0.00197, base.lon + 0.00396), // crowds the top-right corner, by the north arrow
  ];
  const box = { x: 40, y: 100, w: 532, h: 330 };

  it.each([7, 8])('no label overlaps another label or a pit marker (label size %i)', (size) => {
    const ops = drawSitePlan(box, pits, measure, { labelSize: size, highlightId: 'id-7' });
    const labels: Box[] = ops
      .filter((o: any) => o.k === 'text' && /^TP /.test(o.text))
      .map((o: any) => ({ x0: o.x, x1: o.x + o.w, y0: o.y - o.size * 0.75, y1: o.y + o.size * 0.2 }));
    const dots: Box[] = ops
      .filter((o: any) => o.k === 'circle' && o.fill)
      .map((o: any) => ({ x0: o.x - o.r, x1: o.x + o.r, y0: o.y - o.r, y1: o.y + o.r }));
    // North arrow and scale bar strokes, and the scale label.
    for (const o of ops as any[]) {
      if (o.k === 'line') dots.push({ x0: Math.min(o.x1, o.x2) - 0.5, x1: Math.max(o.x1, o.x2) + 0.5, y0: Math.min(o.y1, o.y2) - 0.5, y1: Math.max(o.y1, o.y2) + 0.5 });
      if (o.k === 'text' && !/^TP /.test(o.text)) dots.push({ x0: o.x, x1: o.x + o.w, y0: o.y - o.size * 0.75, y1: o.y + o.size * 0.2 });
    }
    expect(labels).toHaveLength(pits.length);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) expect(overlaps(labels[i], labels[j]), `labels ${i} and ${j}`).toBe(false);
      for (const d of dots) expect(overlaps(labels[i], d), `label ${i} over a marker, arrow or scale bar`).toBe(false);
      expect(labels[i].x0).toBeGreaterThanOrEqual(box.x);
      expect(labels[i].x1).toBeLessThanOrEqual(box.x + box.w);
    }
  });
});
