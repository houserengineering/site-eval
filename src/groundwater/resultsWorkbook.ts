// Ground Water Observation Results (DEQ-4 App. C p141) as a workbook: one sheet per well in the
// layout of Houser's submitted results (0105.003 `11 Groundwater Observation Results _ Cottonwood`:
// landscape, "Well # N Results", Date | Time | A (inches) | B (inches) | A-B (inches) | Notes),
// headed with the p141 form fields. The PDF is drawn from this same workbook.
import ExcelJS from 'exceljs';
import type { FieldRecord } from '../domain/fieldRecord';
import { notesText, sortedReadings, type ObservationWell, type WellReading } from './wells';

/** Readings per printed page; a longer season continues on another sheet. */
export const ROWS_PER_SHEET = 28;
/** Blank rows printed for a well with no readings yet, for a paper fallback. */
const BLANK_ROWS = 15;
const FONT = 'Arial';
const COLUMNS = [
  { title: 'Date', width: 15 },
  { title: 'Time', width: 13 },
  { title: 'A (inches)', width: 13 },
  { title: 'B (inches)', width: 13 },
  { title: 'A-B (inches)', width: 14 },
  // Notes takes the rest of a landscape letter page (0.5" margins).
  { title: 'Notes', width: 68 },
];
export const FOOTNOTE =
  'A = distance from top of pipe to water level. B = distance from top of pipe to natural ground surface. ' +
  'A - B = depth of water below natural ground surface. Measured to the nearest inch. ' +
  'If the pipe is dry, A is the total depth measured, marked "dry", and A - B is shown as greater than (DEQ-4 Appendix C).';

/** Row height for wrapped text: ~`perLine` Arial 10 characters fit the cell's width. */
export const wrappedHeight = (s: string, perLine: number) =>
  15 * Math.max(1, s.split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perLine)), 0));
/** Characters per line in the merged header value cells (C:F) and the Notes column. */
const VALUE_CHARS = 100;
const NOTE_CHARS = 64;

const thin = { style: 'thin' } as ExcelJS.Border;
const box = { top: thin, left: thin, bottom: thin, right: thin };

export function groundwaterWorkbook(record: FieldRecord): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Houser Engineering site evaluation app';
  wb.created = wb.modified = new Date(record.updatedAt);
  const used = new Set<string>();
  for (const well of record.wells) {
    const readings = sortedReadings(well);
    const chunks: WellReading[][] = [];
    for (let i = 0; i < readings.length; i += ROWS_PER_SHEET) chunks.push(readings.slice(i, i + ROWS_PER_SHEET));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((chunk, i) => drawSheet(wb.addWorksheet(sheetName(well, i, used)), record, well, chunk, i, chunks.length));
  }
  return wb;
}

function sheetName(w: ObservationWell, part: number, used: Set<string>): string {
  const base = `Well # ${w.label || '?'}${part ? ` (${part + 1})` : ''}`.replace(/[\[\]:*?/\\]/g, '-').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 27)} ~${i}`;
  used.add(name.toLowerCase());
  return name;
}

function drawSheet(ws: ExcelJS.Worksheet, record: FieldRecord, well: ObservationWell, readings: WellReading[], part: number, parts: number) {
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const font = (bold = false, size = 10) => ({ name: FONT, size, bold });

  const title = ws.getCell('A1');
  title.value = `Well # ${well.label} Results${parts > 1 ? ` (page ${part + 1} of ${parts})` : ''}`;
  title.font = font(true, 11);
  ws.mergeCells('A1:F1');
  ws.getRow(1).height = 18;

  const h = record.header;
  const fields: [string, string][] = [
    ['Project', [h.projectNumber, h.projectName].filter(Boolean).join(' ')],
    ['Monitored by', well.monitoredBy],
    ['Location', well.location],
    ['Section, township, range', well.str],
    ['Lot #', well.lot],
    ['Observation well #', well.label],
    ['Other location info', well.otherInfo],
  ];
  let row = 2;
  for (const [label, value] of fields) {
    const l = ws.getCell(`A${row}`);
    l.value = `${label}:`;
    l.font = font(true);
    ws.mergeCells(`A${row}:B${row}`);
    const v = ws.getCell(`C${row}`);
    v.value = value;
    v.font = font();
    v.alignment = { wrapText: true, vertical: 'bottom' };
    ws.mergeCells(`C${row}:F${row}`);
    ws.getRow(row).height = wrappedHeight(value, VALUE_CHARS);
    row++;
  }
  row++; // spacer, as on the Cottonwood form

  const head = row;
  COLUMNS.forEach((c, i) => {
    const cell = ws.getRow(head).getCell(i + 1);
    cell.value = c.title;
    cell.font = font(true);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = box;
  });
  ws.getRow(head).height = 16;

  const n = Math.max(readings.length, readings.length ? 0 : BLANK_ROWS);
  for (let i = 0; i < n; i++) {
    const r = head + 1 + i;
    const x = readings[i];
    const cells = COLUMNS.map((_, c) => ws.getRow(r).getCell(c + 1));
    cells.forEach((cell, c) => {
      cell.font = font();
      cell.border = box;
      cell.alignment = c === 5 ? { wrapText: true, vertical: 'middle' } : { horizontal: c === 0 ? 'right' : 'center', vertical: 'middle' };
    });
    ws.getRow(r).height = 15;
    if (!x) continue;
    const [date, time, a, b, ab, notes] = cells;
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x.date);
    if (d) {
      date.value = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
      date.numFmt = 'm/d/yyyy';
    } else date.value = x.date;
    const t = /^(\d{1,2}):(\d{2})$/.exec(x.time);
    if (t) {
      time.value = (+t[1] * 60 + +t[2]) / 1440;
      time.numFmt = 'h:mm AM/PM';
    } else time.value = x.time;
    if (x.aIn != null) {
      a.value = x.aIn;
      a.numFmt = x.dry ? '0" dry"' : '0';
    } else if (x.dry) a.value = 'dry';
    if (x.bIn != null) {
      b.value = x.bIn;
      b.numFmt = '0';
    }
    if (x.aIn != null && x.bIn != null) {
      const diff = x.aIn - x.bIn;
      ab.value = x.dry ? { formula: `">"&(C${r}-D${r})`, result: `>${diff}` } : { formula: `C${r}-D${r}`, result: diff };
      ab.numFmt = '0';
    }
    notes.value = notesText(x);
    ws.getRow(r).height = wrappedHeight(notes.value, NOTE_CHARS);
  }

  const foot = head + n + 2;
  const f = ws.getCell(`A${foot}`);
  f.value = FOOTNOTE;
  f.font = font(false, 8);
  f.alignment = { wrapText: true, vertical: 'top' };
  ws.mergeCells(`A${foot}:F${foot}`);
  ws.getRow(foot).height = 24;

  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
    printArea: `A1:F${foot}`,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  } as ExcelJS.PageSetup;
}
