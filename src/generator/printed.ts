// Printed deliverables as pages: soil logs (with photo and pit location), perc tests, and the
// combined site evaluation (location map, soil logs, perc tests, further photos).
import type ExcelJS from 'exceljs';
import { dateText, type FieldRecord, type TestPit } from '../domain/fieldRecord';
import type { TemplateSet } from '../templates/types';
import { fitImage, imageMime, imageSize, LETTER, type Measure, type Op, type Page } from './page';
import { layoutSheet, type Rect } from './sheetPage';
import { accuracyFt, drawSitePlan, fixText, stampText } from './sitePlan';

/** Photo bytes by id (the on-device photo store); undefined when not on this device. */
export type PhotoSource = (id: string) => Promise<Uint8Array | undefined>;

export type PrintKind = 'soil-logs' | 'perc-tests' | 'site-evaluation';

export interface Workbooks {
  soilLog: ExcelJS.Workbook;
  percTest: ExcelJS.Workbook | null;
}

const CAPTION = 7.5;

export async function soilLogPages(record: FieldRecord, templates: TemplateSet, wb: ExcelJS.Workbook, measure: Measure, photo: PhotoSource): Promise<Page[]> {
  const spec = templates.soilLog.spec;
  const t = spec.horizonTable;
  const pages: Page[] = [];
  const pits = record.testPits.length ? record.testPits : [null];
  for (const [i, pit] of pits.entries()) {
    const sp = layoutSheet(wb, wb.worksheets[i], measure);
    const extra = Math.max(0, (pit?.horizons.length ?? 0) - t.rows);
    const shifted = (range: string) => range.replace(/\d+/g, (r) => String(Number(r) > t.firstRow + t.rows - 1 ? Number(r) + extra : Number(r)));
    // The template's photo/location boxes are short; on the printed log they run to the bottom margin.
    const toBottom = (r: Rect): Rect => ({ ...r, h: Math.max(r.h, sp.bottom - r.y) });
    const photoBox = toBottom(sp.rect(shifted(spec.areas.photo.range)));
    const locBox = toBottom(sp.rect(shifted(spec.areas.location.range)));
    if (pit) {
      sp.page.ops.push(...(await photoOps(photoBox, pit, photo, measure)));
      sp.page.ops.push(...locationOps(locBox, pit, record.testPits, measure));
    }
    pages.push(sp.page);
  }
  return pages;
}

async function photoOps(box: Rect, pit: TestPit, photo: PhotoSource, measure: Measure): Promise<Op[]> {
  const ref = pit.photos[0];
  if (!ref) return [];
  const bytes = await photo(ref.id);
  const captionH = CAPTION * 1.6;
  if (!bytes) return [centered('Photo not on this device', box, measure)];
  const size = imageSize(bytes) ?? { width: ref.width, height: ref.height };
  const img = fitImage({ ...box, y: box.y + 2, h: box.h - captionH - 2 }, size);
  const caption = `Photo ${stampText(ref.takenAt)}`;
  return [
    { k: 'image', ...img, bytes, mime: imageMime(bytes) },
    { k: 'text', x: img.x, y: img.y + img.h + CAPTION * 1.3, size: CAPTION, font: 'sans', text: caption, w: measure(caption, 'sans', CAPTION) },
  ];
}

function locationOps(box: Rect, pit: TestPit, pits: TestPit[], measure: Measure): Op[] {
  if (!pit.location) return [centered('GPS location not recorded', box, measure)];
  const lines = [fixText(pit.location), `GPS ${stampText(pit.location.at)} (WGS84)`];
  const captionH = lines.length * CAPTION * 1.3 + 4;
  const plan = { x: box.x, y: box.y + 2, w: box.w, h: Math.min(box.h - captionH - 2, box.w * 1.1) };
  const ops = drawSitePlan(plan, pits, measure, { highlightId: pit.id, labelSize: 7 });
  lines.forEach((text, i) =>
    ops.push({ k: 'text', x: box.x, y: plan.y + plan.h + CAPTION * 1.3 * (i + 1), size: CAPTION, font: 'sans', text, w: measure(text, 'sans', CAPTION) }),
  );
  return ops;
}

function centered(text: string, box: Rect, measure: Measure): Op {
  const w = measure(text, 'sans', 9);
  return { k: 'text', x: box.x + (box.w - w) / 2, y: box.y + 30, size: 9, font: 'sans', text, w };
}

export function percTestPages(wb: ExcelJS.Workbook, measure: Measure): Page[] {
  return wb.worksheets.map((ws) => layoutSheet(wb, ws, measure).page);
}

const M = 54;

/** Page header in the soil log's style: title left, logo right, project lines under. */
function headerOps(title: string, record: FieldRecord, templates: TemplateSet, measure: Measure): { ops: Op[]; bottom: number } {
  const ops: Op[] = [];
  const text = (s: string, x: number, y: number, size: number, bold = false) =>
    ops.push({ k: 'text', x, y, size, font: bold ? 'serif-bold' : 'serif', text: s, w: measure(s, bold ? 'serif-bold' : 'serif', size) });
  text(title, M, M + 14, 14, true);
  const logo = templates.soilLog.logo;
  const ls = imageSize(logo);
  if (ls) {
    const w = 200;
    ops.push({ k: 'image', x: LETTER.w - M - w, y: M, w, h: (w * ls.height) / ls.width, bytes: logo, mime: imageMime(logo) });
  }
  const h = record.header;
  const rows: [string, string][] = [
    ['PROJECT #:', h.projectNumber],
    ['PROJECT NAME:', h.projectName],
    ['LOCATION:', h.location],
    ['EVAL. BY:', h.evalBy],
    ['DATE:', dateText(h.date)],
    ['CONFIRMATION NUMBER:', h.confirmationNumber],
  ];
  let y = M + 34;
  for (const [k, v] of rows) {
    text(k, M, y, 9, true);
    text(v, M + 120, y, 9);
    y += 12;
  }
  return { ops, bottom: y };
}

/** Location map page(s): every located pit to scale, then a coordinates table. */
export function mapPages(record: FieldRecord, templates: TemplateSet, measure: Measure): Page[] {
  const pits = record.testPits;
  const rowH = 12;
  const pages: Page[] = [];
  const head = headerOps('TEST PIT LOCATIONS', record, templates, measure);
  const ops = [...head.ops];
  const tableRows = pits.length + 1;
  const bottom = LETTER.h - M;
  const planTop = head.bottom + 6;
  const planH = Math.max(260, bottom - planTop - 8 - (tableRows + 1) * rowH);
  ops.push(...drawSitePlan({ x: M, y: planTop, w: LETTER.w - 2 * M, h: planH }, pits, measure, { labelSize: 8 }));
  const note = 'Plotted from phone GPS fixes (WGS84); dashed circles show the reported accuracy.';
  ops.push({ k: 'text', x: M, y: planTop + planH + 10, size: 7.5, font: 'sans', text: note, w: measure(note, 'sans', 7.5) });

  const cols = [
    { title: 'TEST PIT', x: M, get: (p: TestPit) => p.label },
    { title: 'LATITUDE', x: M + 70, get: (p: TestPit) => (p.location ? p.location.lat.toFixed(6) : 'not recorded') },
    { title: 'LONGITUDE', x: M + 160, get: (p: TestPit) => (p.location ? p.location.lon.toFixed(6) : '') },
    { title: 'ACCURACY', x: M + 250, get: (p: TestPit) => (p.location ? `±${accuracyFt(p.location)} ft` : '') },
    { title: 'GPS TIME', x: M + 320, get: (p: TestPit) => (p.location ? stampText(p.location.at) : '') },
  ];
  let page: Page = { ...LETTER, ops };
  let y = planTop + planH + 28;
  const tableHead = () => {
    for (const c of cols) page.ops.push({ k: 'text', x: c.x, y, size: 8, font: 'sans-bold', text: c.title, w: measure(c.title, 'sans-bold', 8) });
    page.ops.push({ k: 'line', x1: M, y1: y + 3, x2: LETTER.w - M, y2: y + 3, w: 0.5 });
    y += rowH;
  };
  tableHead();
  for (const p of pits) {
    if (y > bottom) {
      pages.push(page);
      page = { ...LETTER, ops: [] };
      y = M + 12;
      tableHead();
    }
    for (const c of cols) {
      const s = c.get(p);
      page.ops.push({ k: 'text', x: c.x, y, size: 8, font: 'sans', text: s, w: measure(s, 'sans', 8) });
    }
    y += rowH;
  }
  pages.push(page);
  return pages;
}

/** Second and later photos of each pit, two per page. */
export async function extraPhotoPages(record: FieldRecord, templates: TemplateSet, measure: Measure, photo: PhotoSource): Promise<Page[]> {
  const pages: Page[] = [];
  for (const pit of record.testPits) {
    const refs = pit.photos.slice(1);
    for (let i = 0; i < refs.length; i += 2) {
      const head = headerOps(`TEST PIT ${pit.label} PHOTOS`, record, templates, measure);
      const ops = [...head.ops];
      const top = head.bottom + 8;
      const slotH = (LETTER.h - M - top) / 2;
      for (const [j, ref] of refs.slice(i, i + 2).entries()) {
        const box = { x: M, y: top + j * slotH, w: LETTER.w - 2 * M, h: slotH - 18 };
        const bytes = await photo(ref.id);
        if (!bytes) {
          ops.push(centered('Photo not on this device', box, measure));
          continue;
        }
        const img = fitImage(box, imageSize(bytes) ?? { width: ref.width, height: ref.height });
        ops.push({ k: 'image', ...img, bytes, mime: imageMime(bytes) });
        const caption = `Test pit ${pit.label}, photo ${i + j + 2} of ${pit.photos.length}, ${stampText(ref.takenAt)}`;
        ops.push({ k: 'text', x: img.x, y: img.y + img.h + 11, size: 8, font: 'sans', text: caption, w: measure(caption, 'sans', 8) });
      }
      pages.push({ ...LETTER, ops });
    }
  }
  return pages;
}
