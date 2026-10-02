// Printed page model: a display list in points (1/72 in), origin top-left. One model feeds both
// the PDF writer (deliverables) and the SVG print view (system print dialog), so they match.

export type FontKey = 'serif' | 'serif-bold' | 'sans' | 'sans-bold';

export type Op =
  /** `y` is the text baseline; `w` is the width measured with the PDF font (SVG stretches to it). */
  | { k: 'text'; x: number; y: number; size: number; font: FontKey; text: string; w: number; color?: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; dash?: number[]; color?: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; stroke?: number; fill?: string; color?: string }
  | { k: 'circle'; x: number; y: number; r: number; stroke?: number; fill?: string; dash?: number[] }
  | { k: 'image'; x: number; y: number; w: number; h: number; bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' };

export interface Page {
  w: number;
  h: number;
  ops: Op[];
}

export const LETTER = { w: 612, h: 792 };

/** Text width in points (standard PDF font metrics). */
export type Measure = (text: string, font: FontKey, size: number) => number;

/**
 * The PDF standard fonts encode WinAnsi only; anything else would throw in the PDF writer and
 * print differently in the SVG view, so it is mapped to the nearest ASCII here, once.
 */
export function printable(s: string): string {
  return s
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/\t/g, ' ')
    .replace(/[^\n\x20-\x7e\xa0-\xff•…€]/g, '?');
}

/** Greedy word wrap to a width; explicit newlines are kept. */
export function wrap(text: string, width: number, font: FontKey, size: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measure(next, font, size) <= width) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

/** Pixel size of a PNG or JPEG from its header (no decoding). */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (imageMime(bytes) === 'image/png') return bytes.length > 24 ? { width: dv.getUint32(16), height: dv.getUint32(20) } : null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = dv.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** Largest rect of the image's aspect inside a box, centered horizontally, top-aligned. */
export function fitImage(box: { x: number; y: number; w: number; h: number }, size: { width: number; height: number }) {
  const s = Math.min(box.w / size.width, box.h / size.height);
  const w = size.width * s;
  const h = size.height * s;
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h };
}

export function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
