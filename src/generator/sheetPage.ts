// Renders a generated worksheet's print area onto one letter page the way Excel prints it
// (column widths, row heights, borders, merges, alignment, wrap, number formats, images, fit
// to page). The PDFs are drawn from the same workbook as the .xlsx, so the two never disagree.
import type ExcelJS from 'exceljs';
import { LETTER, printable, wrap, type FontKey, type Measure, type Op, type Page } from './page';
import { splitAddr } from './xlsx';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetPage {
  page: Page;
  /** Page rect of a cell range (`A20:C29`) on this sheet. */
  rect(range: string): Rect;
  /** Bottom of the printable area (page height less the bottom margin). */
  bottom: number;
  scale: number;
}

const EMU_PER_PT = 12700;
const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Excel column width (characters of the default font's digit) → points, for an 11 pt Calibri workbook. */
const widthPt = (chars: number) => Math.trunc(((256 * chars + Math.trunc(128 / 7)) / 256) * 7) * 0.75;

const BORDER: Record<string, { w: number; dash?: number[]; double?: boolean }> = {
  hair: { w: 0.25 },
  thin: { w: 0.5 },
  dotted: { w: 0.5, dash: [0.5, 1.5] },
  dashed: { w: 0.5, dash: [3, 2] },
  medium: { w: 1 },
  mediumDashed: { w: 1, dash: [4, 2] },
  thick: { w: 1.5 },
  double: { w: 0.5, double: true },
};

export function layoutSheet(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, measure: Measure): SheetPage {
  const [a, b] = (ws.pageSetup.printArea ?? `A1:${ws.getColumn(ws.columnCount || 1).letter}${ws.rowCount || 1}`).split(':');
  const c1 = colIndex(splitAddr(a).col);
  const c2 = colIndex(splitAddr(b).col);
  const r1 = splitAddr(a).row;
  const r2 = splitAddr(b).row;

  const defaultCol = ws.properties.defaultColWidth ?? 8.43;
  const defaultRow = ws.properties.defaultRowHeight ?? 15;
  const colW = (c: number) => widthPt(ws.getColumn(c).width ?? defaultCol);
  const rowH = (r: number) => ws.getRow(r).height ?? defaultRow;

  const landscape = ws.pageSetup.orientation === 'landscape';
  const pw = landscape ? LETTER.h : LETTER.w;
  const ph = landscape ? LETTER.w : LETTER.h;
  const m = ws.pageSetup.margins ?? { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  let contentW = 0;
  for (let c = c1; c <= c2; c++) contentW += colW(c);
  let contentH = 0;
  for (let r = r1; r <= r2; r++) contentH += rowH(r);
  const availW = pw - (m.left + m.right) * 72;
  const availH = ph - (m.top + m.bottom) * 72;
  const scale = ws.pageSetup.fitToPage ? Math.min(1, availW / contentW, availH / contentH) : 1;

  // Edges: X[c] = left edge of column c, Y[r] = top edge of row r (page points).
  const X: number[] = [];
  X[c1] = m.left * 72;
  for (let c = c1; c <= c2 + 1; c++) X[c + 1] = X[c] + colW(c) * scale;
  const Y: number[] = [];
  Y[r1] = m.top * 72;
  for (let r = r1; r <= r2 + 1; r++) Y[r + 1] = Y[r] + rowH(r) * scale;
  // Images may be anchored past the print area; extend the edges with the sheet's sizes.
  const xAt = (c0: number) => {
    let x = X[c1];
    if (c0 + 1 >= c1) for (let c = c1; c < c0 + 1; c++) x += colW(c) * scale;
    return x;
  };
  const yAt = (r0: number) => {
    let y = Y[r1];
    for (let r = r1; r < r0 + 1; r++) y += rowH(r) * scale;
    return y;
  };

  const ops: Op[] = [];
  const merges = Object.values((ws as any)._merges as Record<string, { model: { top: number; left: number; bottom: number; right: number } }>).map(
    (x) => x.model,
  );
  const mergeAt = (r: number, c: number) => merges.find((x) => x.top === r && x.left === c);
  const mergeOver = (r: number, c: number) => merges.find((x) => r >= x.top && r <= x.bottom && c >= x.left && c <= x.right);
  const cellRect = (r: number, c: number): Rect => {
    const mg = mergeAt(r, c);
    const rb = mg ? Math.min(mg.bottom, r2) : r;
    const cb = mg ? Math.min(mg.right, c2) : c;
    return { x: X[c], y: Y[r], w: X[cb + 1] - X[c], h: Y[rb + 1] - Y[r] };
  };
  const hasValue = (r: number, c: number) => {
    const cell = ws.findCell(r, c);
    return !!cell && (cell.isMerged || text(cell) !== '');
  };

  // Borders first, text over them.
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = ws.findCell(r, c);
      const border = cell?.border;
      if (!border) continue;
      const edges = {
        top: [X[c], Y[r], X[c + 1], Y[r]],
        bottom: [X[c], Y[r + 1], X[c + 1], Y[r + 1]],
        left: [X[c], Y[r], X[c], Y[r + 1]],
        right: [X[c + 1], Y[r], X[c + 1], Y[r + 1]],
      } as const;
      // Excel draws no borders inside a merged range.
      const mg = mergeOver(r, c);
      const inside = { top: !!mg && r > mg.top, bottom: !!mg && r < mg.bottom, left: !!mg && c > mg.left, right: !!mg && c < mg.right };
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        if (inside[side]) continue;
        const style = border[side]?.style;
        const s = style && BORDER[style];
        if (!s) continue;
        const [x1, y1, x2, y2] = edges[side];
        const w = Math.max(0.35, s.w * scale);
        if (s.double) {
          const d = 0.9 * scale;
          const [dx, dy] = side === 'top' || side === 'bottom' ? [0, d] : [d, 0];
          ops.push({ k: 'line', x1: x1 - dx, y1: y1 - dy, x2: x2 - dx, y2: y2 - dy, w });
          ops.push({ k: 'line', x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy, w });
        } else ops.push({ k: 'line', x1, y1, x2, y2, w, dash: s.dash?.map((d) => d * scale) });
      }
    }

  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = ws.findCell(r, c);
      if (!cell || (cell.isMerged && cell.master !== cell)) continue;
      const value = printable(text(cell));
      if (!value) continue;
      const box = cellRect(r, c);
      const f = cell.font ?? {};
      const serif = /times|serif|georgia|garamond|cambria/i.test(f.name ?? 'Calibri');
      const font: FontKey = `${serif ? 'serif' : 'sans'}${f.bold ? '-bold' : ''}` as FontKey;
      // Calibri runs ~12% narrower than Helvetica; shrink so text fits where Excel fit it.
      let size = (f.size ?? 11) * scale * (serif ? 1 : 0.88);
      const al = cell.alignment ?? {};
      const isNum = typeof cell.value === 'number' || (cell.value as any)?.result !== undefined;
      const h = al.horizontal === 'centerContinuous' ? 'center' : (al.horizontal ?? (isNum ? 'right' : 'left'));
      const v = al.vertical ?? 'bottom';
      const pad = 1.5 * scale;
      const innerW = box.w - 2 * pad;

      let lines: string[];
      if (al.wrapText) {
        lines = wrap(value, innerW, font, size, measure);
        // Never print outside the cell: shrink a block that is taller than its box.
        for (let i = 0; i < 6 && lines.length * size * 1.17 > box.h; i++) {
          size *= 0.92;
          lines = wrap(value, innerW, font, size, measure);
        }
      } else {
        lines = value.split('\n');
        const widest = Math.max(...lines.map((l) => measure(l, font, size)));
        // Excel lets text run into empty neighbours; otherwise it would be cut off, so shrink it.
        const neighbour = h === 'right' ? c - 1 : (mergeAt(r, c)?.right ?? c) + 1;
        const blocked = h === 'center' ? hasValue(r, c - 1) || hasValue(r, c + 1) : neighbour >= c1 && neighbour <= c2 && hasValue(r, neighbour);
        if (widest > innerW && (blocked || isNum)) size *= innerW / widest;
      }
      const lh = size * 1.17;
      const blockH = lines.length * lh;
      const top = v === 'top' ? box.y + pad : v === 'middle' ? box.y + (box.h - blockH) / 2 : box.y + box.h - pad - blockH;
      lines.forEach((line, i) => {
        const w = measure(line, font, size);
        const x = h === 'center' ? box.x + (box.w - w) / 2 : h === 'right' ? box.x + box.w - pad - w : box.x + pad;
        ops.push({ k: 'text', x, y: top + i * lh + size * 0.92, size, font, text: line, w });
      });
    }

  const media = (wb.model as any).media as { buffer?: Uint8Array; extension: string }[] | undefined;
  for (const img of ws.getImages()) {
    const data = wb.getImage(Number(img.imageId)) ?? media?.[Number(img.imageId)];
    if (!data?.buffer) continue;
    const range = img.range as any;
    const tl = range.tl;
    const x = xAt(tl.nativeCol) + (tl.nativeColOff / EMU_PER_PT) * scale;
    const y = yAt(tl.nativeRow) + (tl.nativeRowOff / EMU_PER_PT) * scale;
    let w: number;
    let hgt: number;
    if (range.ext) {
      w = range.ext.width * 0.75 * scale;
      hgt = range.ext.height * 0.75 * scale;
    } else {
      const br = range.br;
      w = xAt(br.nativeCol) + (br.nativeColOff / EMU_PER_PT) * scale - x;
      hgt = yAt(br.nativeRow) + (br.nativeRowOff / EMU_PER_PT) * scale - y;
    }
    ops.push({ k: 'image', x, y, w, h: hgt, bytes: new Uint8Array(data.buffer as any), mime: data.extension === 'png' ? 'image/png' : 'image/jpeg' });
  }

  return {
    page: { w: pw, h: ph, ops },
    rect(range) {
      const [p, q = p] = range.split(':').map(splitAddr);
      const ca = colIndex(p.col);
      const cb = colIndex(q.col);
      return { x: xAt(ca - 1), y: yAt(p.row - 1), w: xAt(cb) - xAt(ca - 1), h: yAt(q.row) - yAt(p.row - 1) };
    },
    bottom: ph - m.bottom * 72,
    scale,
  };
}

/** The cell as Excel would display it. */
export function text(cell: ExcelJS.Cell): string {
  let v = cell.value as any;
  if (v == null) return '';
  if (typeof v === 'object' && 'formula' in v) v = v.result;
  if (typeof v === 'object' && v && 'richText' in v) return v.richText.map((t: { text: string }) => t.text).join('');
  if (typeof v === 'object' && v && 'text' in v) return String(v.text);
  if (v == null || (typeof v === 'object' && 'error' in v)) return '';
  return formatValue(v, cell.numFmt ?? 'General');
}

export function formatValue(v: unknown, fmt: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) {
    if (/h:mm/.test(fmt)) return formatValue(((v.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000) % 1, fmt);
    const [y, mo, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
    const p = (n: number) => String(n).padStart(2, '0');
    if (/^mm-dd-yy$/.test(fmt)) return `${p(mo)}-${p(d)}-${String(y).slice(2)}`;
    return `${mo}/${d}/${y}`;
  }
  if (typeof v !== 'number') return String(v ?? '');
  if (/h:mm/.test(fmt)) {
    const mins = Math.round((((v % 1) + 1) % 1) * 1440) % 1440;
    const hh = Math.floor(mins / 60);
    const mm = String(mins % 60).padStart(2, '0');
    return /AM\/PM/i.test(fmt) ? `${hh % 12 || 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}` : `${hh}:${mm}`;
  }
  if (/\?\/\?/.test(fmt)) {
    const sixteenths = Math.round(v * 16);
    const whole = Math.floor(sixteenths / 16);
    let n = sixteenths % 16;
    let d = 16;
    while (n && n % 2 === 0) (n /= 2), (d /= 2);
    return n ? `${whole ? `${whole} ` : ''}${n}/${d}` : String(whole);
  }
  // A literal suffix after a number format (`0" dry"`).
  const suffix = /^(.*?)"([^"]*)"$/.exec(fmt);
  if (suffix && suffix[1]) return formatValue(v, suffix[1]) + suffix[2];
  const dec = /^0(?:\.(0+))?(%?)$/.exec(fmt);
  if (dec) return (dec[2] ? (v * 100).toFixed(dec[1]?.length ?? 0) + '%' : v.toFixed(dec[1]?.length ?? 0));
  return String(Number(v.toPrecision(10)));
}
