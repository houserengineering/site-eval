// Turns structured soil descriptions into the soil log's printed wording. The office
// writes ALL CAPS (2026 template), depths as `72"`, and puts DEQ-4 extras the form has
// no column for into NOTES (research/01 §1.9, §6).
import { pitDepth, type Horizon, type TestPit } from './fieldRecord';
import { munsellName, munsellNotation, rockModifier, STRUCTURELESS, textureWithSandSize } from './vocabulary';

const up = (s: string) => s.trim().toUpperCase();
const join = (parts: (string | false | null | undefined)[], sep = ', ') => parts.filter(Boolean).join(sep);
const inches = (n: number) => `${n}"`;

/** `2.5Y 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED` */
export function colorText(h: Horizon): string {
  const c = h.color;
  if (c.other.trim()) return up(c.other);
  const notation = munsellNotation(c.hue, c.value, c.chroma);
  if (!notation) return '';
  return join([notation, munsellName(c.hue, c.value, c.chroma), up(c.moisture), up(c.physicalState)]);
}

/** USDA texture with sand size: `COARSE SANDY LOAM`. Rock content prints in NOTES (office template). */
export function textureText(h: Horizon): string {
  return textureWithSandSize(up(h.texture.cls), h.texture.sandSize);
}

/** `WEAK, FINE TO MEDIUM GRANULAR`; structureless shapes print alone. */
export function structureText(h: Horizon): string {
  const s = h.structure;
  if (s.other.trim()) return up(s.other);
  if (STRUCTURELESS.includes(s.shape)) return s.shape;
  const size = s.size && s.size2 && s.size2 !== s.size ? `${s.size} TO ${s.size2}` : s.size;
  const body = join([size, s.shape], ' ');
  return body ? join([s.grade, body]) : '';
}

/** `40% ROCKS (GRAVEL TO COBBLES)`: percent by volume, then the size range seen. */
function rockNote(h: Horizon): string {
  if (h.rock.pct == null) return '';
  if (h.rock.pct === 0) return 'NO ROCKS';
  const from = up(h.rock.kind);
  const to = up(h.rock.kind2 ?? '');
  const size = to && to !== from ? `${from} TO ${to}` : from;
  return `${h.rock.pct}% ROCKS${size && size !== 'ROCKS' ? ` (${size})` : ''}`;
}

function mottleNote(h: Horizon): string {
  const m = h.mottling;
  if (m.present !== 'Y') return '';
  const detail = join([m.quantity, m.size, m.contrast, munsellNotation(m.color.hue, m.color.value, m.color.chroma)], ' ');
  return detail ? `${detail} MOTTLES` : '';
}

/** Index of the horizon containing a depth (a depth at a boundary belongs to the lower horizon). */
function horizonAt(pit: TestPit, depth: number): number {
  const hs = pit.horizons;
  for (let i = hs.length - 1; i >= 0; i--) if (hs[i].topIn != null && depth >= hs[i].topIn!) return i;
  return 0;
}

const LIMITING_WORDS: Record<string, string> = { IMPERVIOUS: 'IMPERVIOUS LAYER', SHGW: 'SEASONAL HIGH GROUNDWATER' };

function depthNotes(pit: TestPit, i: number): string[] {
  const out: [number, string][] = [];
  const w = pit.observedWater;
  if ((w.kind === 'SEEPAGE' || w.kind === 'STANDING') && w.depthIn != null && horizonAt(pit, w.depthIn) === i) {
    out.push([w.depthIn, `${w.kind === 'SEEPAGE' ? 'GROUNDWATER SEEPS AT' : 'GROUNDWATER AT'} ${inches(w.depthIn)}`]);
  }
  const l = pit.limitingLayer;
  if (l.type && l.type !== 'NONE' && l.depthIn != null && horizonAt(pit, l.depthIn) === i) {
    if (l.type === 'BEDROCK') out.push([l.depthIn, `BEDROCK AT ${inches(l.depthIn)}`]);
    else out.push([l.depthIn, `LIMITING LAYER AT ${inches(l.depthIn)} (${l.type === 'OTHER' ? up(l.other) || 'OTHER' : LIMITING_WORDS[l.type]})`]);
  }
  // Top to bottom, the way the pit is read.
  return out.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
}

/** NOTES cell for horizon `i`: rock %, consistence, plasticity, mottles, free notes, then pit items at that depth. */
export function horizonNotes(pit: TestPit, i: number): string {
  const h = pit.horizons[i];
  return join([rockNote(h), up(h.consistence), up(h.plasticity), mottleNote(h), up(h.notes), ...depthNotes(pit, i)]);
}

export const DEFAULT_BASIS = 'NO REDOXIMORPHIC FEATURES TO TEST PIT DEPTH';
/** Records saved before Justin's 2026-10-03 wording hold the old default; they read and print the new one. */
const LEGACY_BASIS = 'NO REDOXIMORPHIC FEATURES TO PIT DEPTH';
export const basisText = (basis: string) => (basis === LEGACY_BASIS ? DEFAULT_BASIS : basis);

/**
 * The summary row under a wall's horizon table: groundwater, its basis, limiting layer and slope
 * (always estimated), then the pit's own notes. No total depth: the horizon table shows it
 * (Justin's 2026-10-03 markup).
 */
export function pitSummary(pit: TestPit): string {
  const w = pit.observedWater;
  const water =
    w.kind === 'NONE'
      ? 'NO GROUNDWATER OBSERVED'
      : (w.kind === 'SEEPAGE' || w.kind === 'STANDING') && w.depthIn != null
        ? `${w.kind === 'SEEPAGE' ? 'GROUNDWATER SEEPS AT' : 'GROUNDWATER AT'} ${inches(w.depthIn)}`
        : '';
  const l = pit.limitingLayer;
  const limit =
    l.type === 'NONE'
      ? 'NO LIMITING LAYER WITHIN TEST PIT'
      : l.type === 'BEDROCK' && l.depthIn != null
        ? `BEDROCK AT ${inches(l.depthIn)}`
        : l.type && l.depthIn != null
          ? `LIMITING LAYER AT ${inches(l.depthIn)} (${l.type === 'OTHER' ? up(l.other) || 'OTHER' : LIMITING_WORDS[l.type]})`
          : '';
  return join(
    [
      water,
      up(basisText(pit.shgw.basis)),
      limit,
      pit.slope.pct != null && `SLOPE ${pit.slope.pct}% (ESTIMATED)`,
      up(pit.notes).replace(/\.$/, ''),
    ],
    '. ',
  ).concat('.')
    .replace(/^\.$/, '');
}

/** DEQ-4-required items still blank. Hints only; nothing blocks the evaluator. */
export function missingItems(pit: TestPit): { horizons: string[][]; pit: string[] } {
  const horizons = pit.horizons.map((h) => {
    const m: string[] = [];
    if (!h.designation.trim()) m.push('horizon');
    if (h.bottomIn == null) m.push('bottom depth');
    if (!colorText(h)) m.push('color');
    if (!h.texture.cls.trim()) m.push('texture');
    if (!structureText(h)) m.push('structure');
    if (!h.consistence) m.push('consistence');
    if (!h.plasticity) m.push('plasticity');
    if (!h.roots) m.push('roots');
    if (!h.mottling.present) m.push('mottling');
    else if (h.mottling.present === 'Y' && !mottleNote(h)) m.push('mottle description');
    if (h.rock.pct == null) m.push('rock %');
    else if (h.rock.pct >= 15 && !rockModifier(h.rock.pct, h.rock.kind).prefix && !rockModifier(h.rock.pct, h.rock.kind).noun)
      m.push('rock size (for the texture modifier)');
    return m;
  });
  const p: string[] = [];
  if (!pit.observedWater.kind) p.push('observed water');
  else if (pit.observedWater.kind !== 'NONE' && pit.observedWater.depthIn == null) p.push('observed water depth');
  if (!pit.limitingLayer.type) p.push('limiting layer');
  else if (pit.limitingLayer.type !== 'NONE' && pit.limitingLayer.depthIn == null) p.push('limiting layer depth');
  if (pit.slope.pct == null) p.push('slope %');
  const depth = pitDepth(pit);
  const limited = pit.limitingLayer.type && pit.limitingLayer.type !== 'NONE';
  if (depth != null && depth < 96 && !limited) p.push('pit is shallower than 8 ft: record the limiting layer or reason');
  return { horizons, pit: p };
}

export type PitStatus = 'not-started' | 'in-progress' | 'complete';

/** Complete = GPS fix taken and nothing DEQ-4 asks for is blank (the same items the pit hints list). */
export function pitStatus(pit: TestPit): PitStatus {
  if (!pit.horizons.length && !pit.photos.length && !pit.location && !pit.notes) return 'not-started';
  const m = missingItems(pit);
  return pit.location && pit.horizons.length && !m.pit.length && m.horizons.every((h) => !h.length) ? 'complete' : 'in-progress';
}
