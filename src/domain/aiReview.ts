// AI photo review of a wall (ticket 12): the wall's photos and its log go to the office review
// service, and what comes back joins the pit checks as `ai` flags. A review carries the key of what
// it judged (the photos sent and the logged horizons and water), so an edit to any of those retires
// its findings and the wall is reviewed again; an acceptance covers only the review it accepted.
import type { Horizon, PhotoRef, TestPit } from './fieldRecord';
import { munsellNotation } from './vocabulary';

export type AiCheck = 'horizons' | 'rock' | 'water' | 'mottling' | 'photo';
const CHECKS: AiCheck[] = ['horizons', 'rock', 'water', 'mottling', 'photo'];
/** Checks not asked for and not shown until calibrated: rock % misjudged rock volume on most 0271 walls (Nathan, 2026-10-04). */
export const HIDDEN_CHECKS: readonly AiCheck[] = ['rock'];
const ASKED = CHECKS.filter((c) => !HIDDEN_CHECKS.includes(c));

export interface AiFinding {
  check: AiCheck;
  horizonId?: string;
  message: string;
}

export interface AiReview {
  /** `reviewKey` of the wall as sent. */
  key: string;
  at: string;
  findings: AiFinding[];
  /** The answer could not be read; it raises no flags. */
  unreadable?: boolean;
}

export interface ReviewImage {
  mediaType: string;
  data: string;
}

/** Bump when the prompt changes so walls are reviewed again. */
const PROMPT_VERSION = 1;
export const MAX_REVIEW_IMAGES = 4;

/** The photos sent: the wall-face photo first, then the others in order, at most 4. */
export function reviewPhotos(wall: TestPit): PhotoRef[] {
  const face = [...wall.photos].reverse().find((p) => p.face);
  return [...(face ? [face] : []), ...wall.photos.filter((p) => p !== face)].slice(0, MAX_REVIEW_IMAGES);
}

const byDepth = (wall: TestPit) => [...wall.horizons].sort((a, b) => (a.topIn ?? 1e9) - (b.topIn ?? 1e9));

/** Identifies what a review judges; null when the wall has nothing to review yet. */
export function reviewKey(wall: TestPit): string | null {
  const photos = reviewPhotos(wall);
  if (!wall.horizons.length || !photos.length) return null;
  const judged = [
    PROMPT_VERSION,
    photos.map((p) => p.id),
    byDepth(wall).map((h) => [h.id, h.designation, h.topIn, h.bottomIn, h.color, h.texture, h.rock, h.mottling, h.notes]),
    wall.observedWater,
    wall.limitingLayer,
  ];
  return fnv1a(JSON.stringify(judged));
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const SYSTEM = `You check septic site-evaluation test pit logs against photos of the open pit, for a field crew still at the pit. Flag only clear disagreements between the log and what the photos show; when the photos cannot tell, do not flag. Answer with JSON only, no other text.`;

function horizonLine(h: Horizon, i: number): string {
  const parts = [`${i + 1}. ${h.designation || '?'} ${h.topIn ?? '?'}-${h.bottomIn ?? '?'}"`];
  if (h.texture.cls) parts.push(h.texture.cls);
  const color = h.color.other.trim() || munsellNotation(h.color.hue, h.color.value, h.color.chroma);
  if (color) parts.push(color);
  if (h.rock.pct != null) parts.push(`rock ${h.rock.pct}%${h.rock.kind ? ` ${h.rock.kind}${h.rock.kind2 ? ` to ${h.rock.kind2}` : ''}` : ''}`);
  if (h.mottling.present === 'Y') parts.push('mottles');
  if (h.notes.trim()) parts.push(`notes: ${h.notes.trim()}`);
  return parts.join(', ');
}

/** The request body for `POST /v1/review`. `images` are the `reviewPhotos`, base64. */
export function reviewRequest(wall: TestPit, images: ReviewImage[]): { system: string; prompt: string; images: ReviewImage[] } {
  const water = wall.observedWater.kind && wall.observedWater.kind !== 'NONE' ? `${wall.observedWater.kind.toLowerCase()} at ${wall.observedWater.depthIn ?? '?'}"` : 'none';
  const limit = wall.limitingLayer.type && wall.limitingLayer.type !== 'NONE' ? `${wall.limitingLayer.type.toLowerCase()} at ${wall.limitingLayer.depthIn ?? '?'}"` : 'none';
  const prompt = [
    `Wall ${wall.label} of a test pit. ${images.length} photo${images.length === 1 ? '' : 's'} attached${reviewPhotos(wall)[0]?.face ? '; the first is square to the wall, surface at the top edge' : ''}. A tape may be in frame: read depths from it when you can.`,
    '',
    'Logged horizons (depths in inches below the surface):',
    ...byDepth(wall).map(horizonLine),
    `Water seen in the pit: ${water}. Limiting layer: ${limit}.`,
    '',
    'Check:',
    '- "horizons": the number of horizons and their boundary depths against the layers visible.',
    '- "water": standing water or seepage visible but not logged, or logged but not visible.',
    '- "mottling": mottles or redox colors visible but not logged.',
    '- "photo": a photo that does not show the pit wall at all (backdirt, sky, equipment).',
    '',
    `Answer exactly: {"flags":[{"check":"${ASKED.join('|')}","horizon":<horizon number or null>,"say":"<one short sentence for the crew>"}]}`,
    'At most 6 flags. {"flags":[]} when the log agrees with the photos.',
  ].join('\n');
  return { system: SYSTEM, prompt, images };
}

/** Findings from the service's answer; null when it is not the JSON asked for (no flags). */
export function parseReview(text: string, wall: TestPit): AiFinding[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.flags)) return null;
  const hs = byDepth(wall);
  const out: AiFinding[] = [];
  for (const f of parsed.flags) {
    if (!f || !ASKED.includes(f.check)) continue;
    const say = typeof f.say === 'string' ? f.say.trim() : typeof f.message === 'string' ? f.message.trim() : '';
    if (!say) continue;
    const h = Number.isInteger(f.horizon) ? hs[f.horizon - 1] : undefined;
    out.push({ check: f.check, ...(h ? { horizonId: h.id } : {}), message: say.slice(0, 240) });
  }
  return out;
}
