// Where the demo tip goes (demo spec decision 9): above or below the highlighted field, whichever has
// room on the visible screen, never over it; and how far to scroll so the field and its tip both fit.

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Side = 'above' | 'below';

export interface TipPlace extends Box {
  /** over: a target taller than the screen (a printed page), the tip at the screen's bottom over it. */
  side: Side | 'over';
  /** Arrow position from the tip's left edge, pointing at the field's middle. */
  arrowLeft: number;
  /** The room on that side: a taller tip scrolls inside it rather than cover the field. */
  maxHeight: number;
}

/** Room between the field and its tip (the arrow sits in it). */
export const GAP = 14;
/** Side gutters (the highlight's own, a full-width field's 16px less its 8px margin) and the margin kept
 * from the top and bottom of the screen. */
const GUTTER = 8;
const EDGE = 8;
/** The least room worth giving a tip that scrolls inside. */
const MIN_TIP = 120;

export function unionRect(rects: Box[]): Box {
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * `view` is the visible screen (the visual viewport: smaller while the keyboard is up). `prefer` wins
 * when the tip fits on both sides ('above' while the keyboard is up, the field sitting just over it).
 */
export function placeTip(target: Box, tip: { width: number; height: number }, view: Box, prefer: Side = 'below', over = false): TipPlace {
  // A wide highlight: the tip takes its width, so their edges line up.
  const width = Math.min(target.width >= 280 ? target.width : tip.width, view.width - 2 * GUTTER);
  const mid = target.left + target.width / 2;
  const left = clamp(mid - width / 2, view.left + GUTTER, view.left + view.width - GUTTER - width);
  const arrowLeft = clamp(mid - left, 20, width - 20);
  const room: Record<Side, number> = {
    below: view.top + view.height - (target.top + target.height) - GAP - EDGE,
    above: target.top - view.top - GAP - EDGE,
  };
  const other: Side = prefer === 'below' ? 'above' : 'below';
  // A target the tip may cover (a printed page): with no room on either side, the tip goes over its
  // lower part at the bottom of the screen rather than squeezed into a strip it cannot be read in.
  if (over && room.above < tip.height && room.below < tip.height) {
    const maxHeight = view.height - 2 * EDGE;
    const height = Math.min(tip.height, maxHeight);
    return { side: 'over', top: view.top + view.height - EDGE - height, left, width, height, arrowLeft, maxHeight };
  }
  const side = room[prefer] >= tip.height ? prefer : room[other] >= tip.height ? other : room[prefer] >= room[other] ? prefer : other;
  const maxHeight = Math.max(0, Math.floor(room[side]));
  const height = Math.min(tip.height, maxHeight);
  const top = side === 'below' ? target.top + target.height + GAP : target.top - GAP - height;
  return { side, top, left, width, height, arrowLeft, maxHeight };
}

/** Pixels to scroll down (negative: up) so the field and its tip fit; 0 when they already do. */
export function scrollToFit(target: Box, tipHeight: number, view: Box, prefer: Side = 'below'): number {
  const need = tipHeight + GAP + EDGE;
  const viewBottom = view.top + view.height;
  const visible = target.top >= view.top + EDGE && target.top + target.height <= viewBottom - EDGE;
  const roomBelow = viewBottom - (target.top + target.height) >= need;
  const roomAbove = target.top - view.top >= need;
  if (visible && (roomBelow || roomAbove)) return 0;
  const fieldBottomDown = Math.round(target.top + target.height - (viewBottom - EDGE));
  // Keyboard up: the field just over the keyboard, its tip in the room left above it.
  if (prefer === 'above' && target.height + GAP + 2 * EDGE + MIN_TIP <= view.height) return fieldBottomDown;
  if (target.height + need + EDGE <= view.height) {
    // Centre the field and its tip (below it) on the screen.
    const block = target.height + GAP + tipHeight;
    return Math.round(target.top - (view.top + (view.height - block) / 2));
  }
  // The field fits, its tip does not in full: the whole field at the bottom, the tip scrolling inside
  // the room above it.
  if (target.height + GAP + 2 * EDGE + MIN_TIP <= view.height) return fieldBottomDown;
  // Taller than the screen: its top goes just under the tip.
  return Math.round(target.top - (view.top + EDGE + need));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
