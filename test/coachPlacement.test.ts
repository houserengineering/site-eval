import { describe, expect, it } from 'vitest';
import { placeTip, scrollToFit, unionRect, type Box } from '../src/app/demo/placement';

const view = { top: 0, left: 0, width: 412, height: 800 };
const tip = { width: 380, height: 180 };
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe('coach tip placement (demo spec decision 9)', () => {
  it('sits below a field near the top, with the arrow at the field', () => {
    const target = { top: 120, left: 16, width: 380, height: 70 };
    const p = placeTip(target, tip, view);
    expect(p.side).toBe('below');
    expect(overlaps(p, target)).toBe(false);
    expect(p.arrowLeft + p.left).toBeCloseTo(target.left + target.width / 2, 0);
  });

  it('sits above a field near the bottom', () => {
    const target = { top: 640, left: 16, width: 380, height: 70 };
    const p = placeTip(target, tip, view);
    expect(p.side).toBe('above');
    expect(overlaps(p, target)).toBe(false);
  });

  it('stays inside the screen with 8px gutters (the edges of a full-width highlight)', () => {
    const target = { top: 300, left: 360, width: 40, height: 40 };
    const p = placeTip(target, { width: 500, height: 150 }, view);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + p.width).toBeLessThanOrEqual(view.width - 8);
  });

  it('takes the width of a wide highlight, so their edges line up', () => {
    const target = { top: 120, left: 8, width: 396, height: 100 };
    const p = placeTip(target, { width: 420, height: 150 }, view);
    expect(p.left).toBe(8);
    expect(p.width).toBe(396);
  });

  it('respects the visible part of the screen when the keyboard is up', () => {
    const kb = { ...view, height: 420 };
    const target = { top: 300, left: 16, width: 380, height: 60 };
    const p = placeTip(target, tip, kb);
    expect(p.side).toBe('above');
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(overlaps(p, target)).toBe(false);
  });
});

describe('never over the field (Nathan, step 2 with the number keyboard up)', () => {
  // Visual viewport over the keyboard, less the title bar; the field and its label are about 100px.
  const kb = { top: 62, left: 0, width: 412, height: 424 };
  const target = { top: 180, left: 8, width: 396, height: 100 };

  it('does not slide the tip onto the field when neither side has its full height', () => {
    const p = placeTip(target, { width: 420, height: 240 }, kb);
    expect(overlaps(p, target)).toBe(false);
    expect(p.top).toBeGreaterThanOrEqual(kb.top);
    expect(p.top + p.height).toBeLessThanOrEqual(kb.top + kb.height);
    expect(p.height).toBe(p.maxHeight);
  });

  it('scrolls the field down onto the keyboard and puts the tip above it', () => {
    const d = scrollToFit(target, 240, kb, 'above');
    const moved = { ...target, top: target.top - d };
    expect(moved.top + moved.height).toBeLessThanOrEqual(kb.top + kb.height);
    const p = placeTip(moved, { width: 420, height: 240 }, kb, 'above');
    expect(p.side).toBe('above');
    expect(p.height).toBe(240);
    expect(overlaps(p, moved)).toBe(false);
    expect(p.top).toBeGreaterThanOrEqual(kb.top);
  });
});

describe('scrolling the field into view', () => {
  it('does not move a field that already has room for its tip', () => {
    expect(scrollToFit({ top: 200, left: 0, width: 380, height: 80 }, tip.height, view)).toBe(0);
  });

  it('brings a field below the screen up with room for the tip', () => {
    const target = { top: 1500, left: 0, width: 380, height: 80 };
    const d = scrollToFit(target, tip.height, view);
    const moved = { ...target, top: target.top - d };
    expect(moved.top).toBeGreaterThanOrEqual(0);
    const p = placeTip(moved, tip, view);
    expect(overlaps(p, moved)).toBe(false);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.top + p.height).toBeLessThanOrEqual(view.height);
  });

  it('puts the top of a tall field just under the tip', () => {
    const target = { top: 900, left: 0, width: 380, height: 1200 };
    const d = scrollToFit(target, tip.height, view);
    const moved = { ...target, top: target.top - d };
    const p = placeTip(moved, tip, view);
    expect(p.side).toBe('above');
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(overlaps(p, moved)).toBe(false);
  });
});

it('unions several elements into one highlight', () => {
  expect(unionRect([{ top: 10, left: 20, width: 100, height: 30 }, { top: 60, left: 10, width: 50, height: 20 }])).toEqual({ top: 10, left: 10, width: 110, height: 70 });
});
