// Soil log workbook in the office Soil Log Template layout: one sheet per test pit, its two walls
// (A over B) in the template's two blocks, each with its horizon table, summary row, photo and location.
import ExcelJS from 'exceljs';
import { dateText, depthText, type FieldRecord, type TestPit } from '../domain/fieldRecord';
import { pitPages, wallLocation, type PitPage } from '../domain/pitWalls';
import { colorText, horizonNotes, pitSummary, structureText, textureText } from '../domain/soilLogText';
import type { SoilLogSnapshot, TemplateSet } from '../templates/types';
import { imageSize } from './page';
import { splitAddr, styleCell } from './xlsx';

const EMU_PER_PX = 9525;

export async function soilLogXlsx(record: FieldRecord, templates: TemplateSet): Promise<Uint8Array> {
  return new Uint8Array(await soilLogWorkbook(record, templates).xlsx.writeBuffer());
}

/** Where one wall's block lands on a sheet once extra horizon rows are inserted. */
export interface WallBlock {
  wall: TestPit | null;
  labelRow: number;
  firstRow: number;
  summaryRow: number;
  photo: string;
  location: string;
}

export interface SheetLayout {
  /** Template row → sheet row. */
  row(r: number): number;
  blocks: WallBlock[];
  lastRow: number;
  /** Extra rows inserted after each block's last template horizon row. */
  inserts: { after: number; count: number }[];
}

/** Rows of the template's horizon table in block `k`. */
const blockRows = (spec: SoilLogSnapshot, k: number) => spec.horizonTable.firstRow + k * spec.wallOffset;

export function sheetLayout(spec: SoilLogSnapshot, walls: (TestPit | null)[]): SheetLayout {
  const t = spec.horizonTable;
  const slots = spec.wallOffset ? 2 : 1;
  const inserts = Array.from({ length: slots }, (_, k) => ({
    after: blockRows(spec, k) + t.rows - 1,
    count: Math.max(0, (walls[k]?.horizons.length ?? 0) - t.rows),
  }));
  const row = (r: number) => r + inserts.reduce((n, ins) => n + (r > ins.after ? ins.count : 0), 0);
  const labelRow = Number(spec.inputs.testPitLabel.replace(/\D/g, ''));
  const shiftRange = (range: string, k: number) =>
    range.replace(/(\D+)(\d+)/g, (_, col, r) => `${col}${row(Number(r) + k * spec.wallOffset)}`);
  const blocks = Array.from({ length: slots }, (_, k): WallBlock => {
    const n = Math.max(t.rows, walls[k]?.horizons.length ?? 0);
    return {
      wall: walls[k] ?? null,
      labelRow: row(labelRow + k * spec.wallOffset),
      firstRow: row(blockRows(spec, k)),
      summaryRow: row(blockRows(spec, k)) + n,
      photo: shiftRange(spec.areas.photo.range, k),
      location: shiftRange(spec.areas.location.range, k),
    };
  });
  const lastTemplateRow = Number((spec.areas.photo.range.split(':')[1] ?? '').replace(/\D/g, '')) + (slots - 1) * spec.wallOffset;
  return { row, blocks, lastRow: row(lastTemplateRow), inserts };
}

/** One sheet per pit page (both walls; one blank form when there are no pits). */
export function soilLogWorkbook(record: FieldRecord, templates: TemplateSet, photos: Map<string, Uint8Array> = new Map()): ExcelJS.Workbook {
  const { spec, logo } = templates.soilLog;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Houser Engineering site evaluation app';
  wb.created = wb.modified = new Date(record.updatedAt);
  const logoId = wb.addImage({ buffer: logo as any, extension: spec.images[0].file.endsWith('.png') ? 'png' : 'jpeg' });

  const pages: (PitPage | null)[] = record.testPits.length ? pitPages(record.testPits) : [null];
  const used = new Set<string>();
  for (const page of pages) {
    const ws = wb.addWorksheet(sheetName(page, used));
    const layout = sheetLayout(spec, page?.walls ?? []);
    drawTemplate(ws, spec, logoId, layout);
    fillHeader(ws, spec, record);
    for (const block of layout.blocks) if (block.wall) fillWall(ws, spec, block, block.wall, record.testPits, wb, photos);
    fitAreas(ws, spec, layout);
  }
  return wb;
}

/**
 * Even header rows, then give the page's spare height to the photo/location boxes so the
 * printed page fills the sheet (fit to page is limited by width; height is left over).
 */
function fitAreas(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, layout: SheetLayout) {
  for (const b of layout.blocks) ws.getRow(b.firstRow - 1).height = HEADER_ROW_PT;
  const widthPt = Object.entries(spec.columns)
    .filter(([c]) => c <= 'H')
    .reduce((n, [, w]) => n + Math.trunc(((256 * w + 18) / 256) * 7) * 0.75, 0);
  const avail = (11 - MARGINS.top - MARGINS.bottom) * 72 * (widthPt / ((8.5 - MARGINS.left - MARGINS.right) * 72));
  let used = 0;
  for (let r = 1; r <= layout.lastRow; r++) used += ws.getRow(r).height ?? DEFAULT_ROW_PT;
  const areaRows = layout.blocks.flatMap((b) => {
    const [a, z] = b.photo.split(':').map((x) => splitAddr(x).row);
    return Array.from({ length: z - a + 1 }, (_, i) => a + i);
  });
  const spare = avail - used - 6;
  if (spare <= 0) return;
  for (const r of areaRows) ws.getRow(r).height = (ws.getRow(r).height ?? DEFAULT_ROW_PT) + spare / areaRows.length;
}

function sheetName(page: PitPage | null, used: Set<string>): string {
  const base = (page ? `TP ${page.walls.map((w) => w.label || '?').join(' ')}` : 'Soil Logs').replace(/[\[\]:*?/\\]/g, '-').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function drawTemplate(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, logoId: number, layout: SheetLayout) {
  ws.properties.defaultRowHeight = DEFAULT_ROW_PT;
  for (const [col, width] of Object.entries(spec.columns)) if (col <= 'H') ws.getColumn(col).width = width;
  for (const [row, height] of Object.entries(spec.rows)) ws.getRow(layout.row(Number(row))).height = height;

  for (const [addr, c] of Object.entries(spec.cells)) {
    const { col, row } = splitAddr(addr);
    if (col > 'H') continue;
    styleCell(ws.getCell(`${col}${layout.row(row)}`), c);
    // Inserted horizon rows take the style of the template's last horizon row.
    for (const ins of layout.inserts)
      if (row === ins.after) for (let i = 1; i <= ins.count; i++) styleCell(ws.getCell(`${col}${layout.row(row) + i}`), c);
  }

  const ps = spec.pageSetup;
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: ps.paperSize as any,
    orientation: ps.orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: MARGINS,
    printArea: `A1:H${layout.lastRow}`,
  };

  for (const img of spec.images) {
    ws.addImage(logoId, {
      tl: { nativeCol: img.from.col, nativeColOff: img.from.colOff, nativeRow: layout.row(img.from.row + 1) - 1, nativeRowOff: img.from.rowOff } as any,
      ext: { width: img.extEmu.cx / EMU_PER_PX, height: img.extEmu.cy / EMU_PER_PX },
      editAs: 'oneCell',
    });
  }
}

function fillHeader(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, record: FieldRecord) {
  const h = record.header;
  const put = (addr: string, v: string) => (ws.getCell(addr).value = v === '' ? null : v);
  put(spec.inputs.projectNumber, h.projectNumber);
  put(spec.inputs.projectName, h.projectName);
  put(spec.inputs.location, h.location);
  put(spec.inputs.evalBy, h.evalBy);
  put(spec.inputs.date, dateText(h.date));
  // Outside Gallatin County the confirmation field comes off the log entirely, label and line (the
  // template's own note: "For test pits in other counties, delete this field"; Nathan 2026-10-04).
  const omit = h.gallatin === 'N';
  put(spec.inputs.confirmationNumber, omit ? '' : h.confirmationNumber);
  // The confirmation number is underlined like the other header fields; the template's extra rule
  // above it comes off on every sheet (Justin's 2026-10-03 markup).
  const conf = splitAddr(spec.inputs.confirmationNumber);
  const row = ws.getRow(conf.row);
  if (omit) {
    const label = row.getCell(ws.getColumn(conf.col).number - 1);
    if (typeof label.value === 'string' && /CONFIRMATION/i.test(label.value)) label.value = null;
  }
  for (let c = ws.getColumn(conf.col).number; c <= ws.getColumn('H').number; c++) {
    const cell = row.getCell(c);
    if (omit) {
      cell.border = {};
      cell.fill = { type: 'pattern', pattern: 'none' };
      cell.note = undefined as any;
    } else if (cell.border?.top) cell.border = { ...cell.border, top: undefined };
  }
}

function fillWall(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, b: WallBlock, wall: TestPit, all: TestPit[], wb: ExcelJS.Workbook, photos: Map<string, Uint8Array>) {
  const labelCol = splitAddr(spec.inputs.testPitLabel).col;
  ws.getCell(`${labelCol}${b.labelRow}`).value = wall.label || null;

  const c = spec.horizonTable.columns;
  wall.horizons.forEach((hz, i) => {
    const row = ws.getRow(b.firstRow + i);
    const cells: [string, string][] = [
      [c.designation, hz.designation.trim()],
      [c.depth, depthText(hz)],
      [c.color, colorText(hz)],
      [c.texture, textureText(hz)],
      [c.structure, structureText(hz)],
      [c.roots, hz.roots],
      [c.mottling, hz.mottling.present],
      [c.notes, horizonNotes(wall, i)],
    ];
    for (const [col, v] of cells) row.getCell(col).value = v || null;
    row.height = Math.max(HORIZON_MIN_PT, ...cells.map(([col, v]) => linesIn(v, ws.getColumn(col).width ?? 9) * LINE_PT + 4));
  });

  // Summary row: the last row of the table, across all columns.
  const text = pitSummary(wall);
  const r = b.summaryRow;
  ws.mergeCells(`A${r}:H${r}`);
  const cell = ws.getCell(`A${r}`);
  cell.value = text || null;
  cell.font = { name: 'Times New Roman', size: 9, bold: false };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = { left: { style: 'thin' }, right: { style: 'double' }, bottom: { style: 'double' }, top: { style: 'thin' } };
  ws.getRow(r).height = Math.max(1, linesIn(text, SUMMARY_WIDTH_CHARS)) * 11 + 4;

  // The photo goes in the workbook too; the location map is drawn on the printed page only.
  const ref = wall.photos[0];
  const bytes = ref && photos.get(ref.id);
  if (bytes) {
    const id = wb.addImage({ buffer: bytes as any, extension: bytes[0] === 0x89 ? 'png' : 'jpeg' });
    const [tl, br] = b.photo.split(':').map(splitAddr);
    // Fit the photo inside the box at its own proportions (Excel column widths → pixels).
    let boxW = 0;
    for (let c = colNum(tl.col); c <= colNum(br.col); c++) boxW += Math.trunc(((256 * (ws.getColumn(c).width ?? 9) + 18) / 256) * 7);
    let boxH = 0;
    for (let r = tl.row; r <= br.row; r++) boxH += ((ws.getRow(r).height ?? DEFAULT_ROW_PT) * 4) / 3;
    const size = imageSize(bytes) ?? { width: ref.width, height: ref.height };
    const k = Math.min(boxW / size.width, boxH / size.height);
    ws.addImage(id, { tl: { col: colNum(tl.col) - 1, row: tl.row - 1 } as any, ext: { width: size.width * k, height: size.height * k }, editAs: 'oneCell' });
  }
  const loc = wallLocation(wall, all);
  const locCell = ws.getCell(b.location.split(':')[0]);
  locCell.value = loc ? `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)} (${LOCATION_SOURCE[loc.source]})` : 'Location not recorded';
  locCell.font = { name: 'Times New Roman', size: 9 };
}

export const LOCATION_SOURCE = { field: 'field GPS', 'other-wall': 'field GPS, same pit', planned: 'planned location' } as const;

const colNum = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Wrapped line count of upper-case Times 10 pt text in a column `width` characters wide. */
function linesIn(text: string, width: number): number {
  if (!text) return 1;
  const perLine = Math.max(4, Math.floor(width * 0.92));
  let lines = 1;
  let len = 0;
  for (const word of text.split(' ')) {
    if (len && len + 1 + word.length > perLine) {
      lines++;
      len = word.length;
    } else len += (len ? 1 : 0) + word.length;
  }
  return lines;
}

const DEFAULT_ROW_PT = 12.75;
const LINE_PT = 11.5;
const HEADER_ROW_PT = 15;
const HORIZON_MIN_PT = 27;
/** Characters across A:H at 9 pt. */
const SUMMARY_WIDTH_CHARS = 150;
const MARGINS = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
