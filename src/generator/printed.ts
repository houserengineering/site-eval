// Printed deliverables as pages: soil logs (both walls of a pit per page, each with photo and
// location) and perc tests.
import type ExcelJS from 'exceljs';
import type { FieldRecord, TestPit } from '../domain/fieldRecord';
import { pitPages } from '../domain/pitWalls';
import type { TemplateSet } from '../templates/types';
import { locationPanel } from './locationPanel';
import { fitImage, imageMime, imageSize, type Measure, type Op, type Page } from './page';
import { layoutSheet, type Rect } from './sheetPage';
import { stampText } from './sitePlan';
import { sheetLayout } from './soilLog';

/** Photo bytes by id (the on-device photo store); undefined when not on this device. */
export type PhotoSource = (id: string) => Promise<Uint8Array | undefined>;

export type PrintKind = 'soil-logs' | 'perc-tests' | 'groundwater';

export interface Workbooks {
  soilLog: ExcelJS.Workbook;
  percTest: ExcelJS.Workbook | null;
}

const CAPTION = 7;

export async function soilLogPages(record: FieldRecord, templates: TemplateSet, wb: ExcelJS.Workbook, measure: Measure, photo: PhotoSource): Promise<Page[]> {
  const spec = templates.soilLog.spec;
  const pages = record.testPits.length ? pitPages(record.testPits) : [null];
  const mapBytes = record.siteMap ? await photo(record.siteMap.imageId) : undefined;
  const out: Page[] = [];
  for (const [i, pg] of pages.entries()) {
    const ws = wb.worksheets[i];
    const layout = sheetLayout(spec, pg?.walls ?? []);
    // The workbook's location cell holds coordinates; the page draws the map and its caption there instead.
    for (const b of layout.blocks) ws.getCell(b.location.split(':')[0]).value = null;
    const sp = layoutSheet(wb, ws, measure);
    for (const b of layout.blocks) {
      if (!b.wall) continue;
      sp.page.ops.push(...(await photoOps(sp.rect(b.photo), b.wall, photo, measure)));
      sp.page.ops.push(...locationPanel(sp.rect(b.location), b.wall, record, mapBytes, measure));
    }
    out.push(sp.page);
  }
  return out;
}

async function photoOps(box: Rect, pit: TestPit, photo: PhotoSource, measure: Measure): Promise<Op[]> {
  const ref = pit.photos[0];
  if (!ref) return [centered('No photo taken', box, measure)];
  const bytes = await photo(ref.id);
  if (!bytes) return [centered('Photo not on this device', box, measure)];
  const captionH = CAPTION * 1.8;
  const size = imageSize(bytes) ?? { width: ref.width, height: ref.height };
  const img = fitImage({ ...box, h: box.h - captionH }, size);
  const caption = `Test pit ${pit.label}, ${stampText(ref.takenAt)}`;
  const w = measure(caption, 'sans', CAPTION);
  return [
    { k: 'image', ...img, bytes, mime: imageMime(bytes) },
    { k: 'rect', x: img.x, y: img.y, w: img.w, h: img.h, stroke: 0.5 },
    { k: 'text', x: img.x + (img.w - w) / 2, y: box.y + box.h - 1, size: CAPTION, font: 'sans', text: caption, w },
  ];
}

function centered(text: string, box: Rect, measure: Measure): Op {
  const w = measure(text, 'sans', 9);
  return { k: 'text', x: box.x + (box.w - w) / 2, y: box.y + 30, size: 9, font: 'sans', text, w };
}

export function percTestPages(wb: ExcelJS.Workbook, measure: Measure): Page[] {
  return wb.worksheets.map((ws) => layoutSheet(wb, ws, measure).page);
}

