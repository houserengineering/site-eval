// Where the demo tip goes (demo spec decision 9): above or below the highlighted field, whichever has
// room on the visible screen, never over it; and how far to scroll so the field and its tip both fit.

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TipPlace extends Box {
  side: 'above' | 'below';
  /** Arrow position from the tip's left edge, pointing at the field's middle. */
  arrowLeft: number;
}

/** Room between the field and its tip (the arrow sits in it). */
export const GAP = 14;
/** Side gutters and the margin kept from the top and bottom of the screen. */
const GUTTER = 16;
const EDGE = 8;

export function unionRect(rects: Box[]): Box {
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/** `view` is the visible screen (the visual viewport: smaller while the keyboard is up). */
export function placeTip(target: Box, tip: { width: number; height: number }, view: Box): TipPlace {
  const width = Math.min(tip.width, view.width - 2 * GUTTER);
  const mid = target.left + target.width / 2;
  const left = clamp(mid - width / 2, view.left + GUTTER, view.left + view.width - GUTTER - width);
  const arrowLeft = clamp(mid - left, 20, width - 20);
  const viewBottom = view.top + view.height;
  const below = viewBottom - (target.top + target.height);
  const above = target.top - view.top;
  const need = tip.height + GAP + EDGE;
  const side = below >= need ? 'below' : above >= need ? 'above' : below >= above ? 'below' : 'above';
  const top =
    side === 'below'
      ? Math.min(target.top + target.height + GAP, viewBottom - EDGE - tip.height)
      : Math.max(target.top - GAP - tip.height, view.top + EDGE);
  return { side, top, left, width, height: tip.height, arrowLeft };
}

/** Pixels to scroll down (negative: up) so the field and its tip fit; 0 when they already do. */
export function scrollToFit(target: Box, tipHeight: number, view: Box): number {
  const need = tipHeight + GAP + EDGE;
  const viewBottom = view.top + view.height;
  const visible = target.top >= view.top + EDGE && target.top + target.height <= viewBottom - EDGE;
  const roomBelow = viewBottom - (target.top + target.height) >= need;
  const roomAbove = target.top - view.top >= need;
  if (visible && (roomBelow || roomAbove)) return 0;
  if (target.height + need + EDGE <= view.height) {
    // Centre the field and its tip (below it) on the screen.
    const block = target.height + GAP + tipHeight;
    return Math.round(target.top - (view.top + (view.height - block) / 2));
  }
  // Taller than the screen: its top goes just under the tip.
  return Math.round(target.top - (view.top + EDGE + need));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
