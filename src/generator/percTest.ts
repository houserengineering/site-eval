// Perc test workbook in the office Perc Test.xlsx layout: one perc test per sheet, live formulas.
import ExcelJS from 'exceljs';
import { dateText, localNow, type FieldRecord, type LocalDateTime, type PercTest } from '../domain/fieldRecord';
import { certificationState } from '../domain/certify';
import { readingCalc, soakStatus, stopRule, tapeText } from '../domain/perc';
import { asEntered } from './marking';
import { dataUrlBytes, imageSize } from './page';
import type { PercTestSnapshot, TemplateSet } from '../templates/types';
import { splitAddr, styleCell } from './xlsx';

const TIME_FMT = 'h:mm AM/PM';
/** Tape fractions, as the newest approved Houser perc workbook prints them (0104.019). */
const DISTANCE_FMT = '# ??/??';
const RATE_FMT = '0.0';
const CERTIFICATION =
  'I certify that this percolation test was done by a qualified site evaluator in accordance with DEQ-4 Section 1.2.68 and Appendix A.';

export async function percTestXlsx(record: FieldRecord, templates: TemplateSet): Promise<Uint8Array> {
  return new Uint8Array(await percTestWorkbook(record, templates).xlsx.writeBuffer());
}

/** One sheet per perc test, in `record.percTests` order. */
export function percTestWorkbook(record: FieldRecord, templates: TemplateSet): ExcelJS.Workbook {
  const { spec } = templates.percTest;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Houser Engineering site evaluation app';
  wb.created = wb.modified = new Date(record.updatedAt);
  const used = new Set<string>();
  for (const test of record.percTests) {
    const ws = wb.addWorksheet(sheetName(test, used));
    const notes = noteLines(record, test);
    const layout = drawTemplate(ws, spec, Math.max(0, test.readings.length - spec.table.rows), notes);
    fill(ws, spec, record, test, layout, notes);
  }
  return wb;
}

function sheetName(t: PercTest, used: Set<string>): string {
  const base = `Perc Test ${t.label || '?'}`.replace(/[\[\]:*?/\\]/g, '-').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

interface Layout {
  /** Maps a template row to its row on this sheet. */
  shift: (row: number) => number;
  firstNoteRow: number;
}

function drawTemplate(ws: ExcelJS.Worksheet, spec: PercTestSnapshot, extraRows: number, notes: string[]): Layout {
  const t = spec.table;
  const lastDataRow = t.firstRow + t.rows - 1;
  const inserted = extraRows + notes.length;
  const shift = (row: number) => (row > lastDataRow ? row + inserted : row);
  const shiftAddr = (addr: string) => {
    const { col, row } = splitAddr(addr);
    return `${col}${shift(row)}`;
  };

  ws.properties.defaultColWidth = spec.defaultColumnWidth;
  for (const [col, width] of Object.entries(spec.columns)) ws.getColumn(col).width = width;
  for (const [row, height] of Object.entries(spec.rows)) ws.getRow(shift(Number(row))).height = height;
  // The template's two-row table header clips "Initial Distance Below / Reference Point" (3 lines in E:F).
  const headerRows = t.firstRow - t.headerRow;
  const headerHeight = Array.from({ length: headerRows }, (_, i) => spec.rows[t.headerRow + i] ?? 15).reduce((a, b) => a + b, 0);
  if (headerHeight < 3 * HEADER_LINE_PT) ws.getRow(t.firstRow - 1).height = (spec.rows[t.firstRow - 1] ?? 15) + 3 * HEADER_LINE_PT - headerHeight;

  for (const [addr, c] of Object.entries(spec.cells)) {
    styleCell(ws.getCell(shiftAddr(addr)), c);
    const { col, row } = splitAddr(addr);
    if (row === lastDataRow) for (let i = 1; i <= extraRows; i++) styleCell(ws.getCell(`${col}${row + i}`), c);
  }
  for (const range of spec.merges) {
    const [a, b] = range.split(':');
    ws.mergeCells(`${shiftAddr(a)}:${shiftAddr(b)}`);
    if (splitAddr(a).row === lastDataRow && splitAddr(b).row === lastDataRow)
      for (let i = 1; i <= extraRows; i++) ws.mergeCells(`${splitAddr(a).col}${lastDataRow + i}:${splitAddr(b).col}${lastDataRow + i}`);
  }

  const ps = spec.pageSetup;
  const [first, last] = (spec.printArea ?? `A1:K${Math.max(...Object.keys(spec.cells).map((a) => splitAddr(a).row))}`).split(':');
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: ps.paperSize as any,
    orientation: ps.orientation,
    fitToPage: ps.fitToPage,
    fitToWidth: ps.fitToWidth,
    fitToHeight: ps.fitToHeight,
    margins: ps.margins,
    printArea: `${first}:${shiftAddr(last)}`,
  };
  return { shift, firstNoteRow: lastDataRow + extraRows + 1 };
}

function fill(ws: ExcelJS.Worksheet, spec: PercTestSnapshot, record: FieldRecord, test: PercTest, layout: Layout, notes: string[]) {
  const h = record.header;
  const inp = spec.inputs;
  const put = (addr: string, v: ExcelJS.CellValue) => {
    ws.getCell(addr).value = v === '' ? null : v;
  };
  const inch = (n: number | null) => (n == null ? '' : ` ${tapeText(n)}`);

  put(inp.ownerName, h.ownerName);
  put(inp.projectName, h.projectName);
  const soak = soakPeriod(test);
  put(inp.soakBegan, soak.began ? stamp(soak.began) : '');
  put(inp.soakEnded, soak.ended ? stamp(soak.ended) : '');
  const testDay = test.readings.find((r) => r.startAt)?.startAt.slice(0, 10) || h.date;
  put(inp.testDate, excelDate(testDay));
  put(inp.holeDiameter, `${spec.labels.holeDiameter}${inch(test.holeDiameterIn)}`);
  put(inp.referenceHeight, `${spec.labels.referenceHeight}${inch(test.referenceHeightIn)}`);
  put(inp.confirmationNumber, h.gallatin === 'N' ? '' : h.confirmationNumber);
  const lot = test.lot.trim();
  put(inp.title, `${lot ? (/^lot\b/i.test(lot) ? `${lot} ` : `Lot ${lot} `) : ''}${spec.labels.title}${test.label}`);
  // Hole depth is on the DEQ form (App. A p126) but not the office template; it goes beside the diameter.
  const { col: diaCol, row: diaRow } = splitAddr(inp.holeDiameter);
  const depthCell = ws.getCell(`${String.fromCharCode(diaCol.charCodeAt(0) + 2)}${diaRow}`);
  if (test.holeDepthIn != null && depthCell.value == null) {
    depthCell.value = `Hole depth:${inch(test.holeDepthIn)}`;
    depthCell.font = { ...ws.getCell(inp.holeDiameter).font };
  }

  const c = spec.table.columns;
  test.readings.forEach((r, i) => {
    const row = spec.table.firstRow + i;
    const prev = test.readings[i - 1];
    const at = (k: keyof typeof c) => ws.getCell(`${c[k]}${row}`);
    const calc = readingCalc(r);
    const ref = (k: keyof typeof c, dr = 0) => `${c[k]}${row + dr}`;

    if (r.startAt) at('start').value = prev && prev.endAt === r.startAt ? { formula: ref('end', -1), result: dayFraction(r.startAt) } : dayFraction(r.startAt);
    if (r.endAt) at('end').value = dayFraction(r.endAt);
    if (r.initialIn != null)
      at('initial').value = prev && prev.finalIn === r.initialIn ? { formula: ref('final', -1), result: r.initialIn } : r.initialIn;
    if (r.finalIn != null) at('final').value = r.finalIn;
    if (calc.intervalMin != null) at('interval').value = { formula: `MOD(${ref('end')}-${ref('start')},1)*1440`, result: calc.intervalMin };
    if (calc.dropIn != null) at('drop').value = { formula: `${ref('final')}-${ref('initial')}`, result: calc.dropIn };
    if (calc.intervalMin != null && calc.dropIn != null)
      at('rate').value = { formula: `IF(${ref('drop')}>0,${ref('interval')}/${ref('drop')},"")`, result: calc.rateMpi ?? '' };

    for (const k of ['start', 'end'] as const) at(k).numFmt = TIME_FMT;
    for (const k of ['initial', 'final', 'drop'] as const) at(k).numFmt = DISTANCE_FMT;
    at('interval').numFmt = test.mode === 'fixed-drop' ? '0.00' : '0';
    at('rate').numFmt = RATE_FMT;
  });

  // Notes: one merged, wrapped row each, across the form, under the readings.
  const firstCol = splitAddr(spec.printArea?.split(':')[0] ?? 'A1').col === 'A' ? 'B' : 'A';
  const lastCol = (spec.printArea?.split(':')[1] ?? 'K').replace(/\d/g, '');
  notes.forEach((text, i) => {
    const r = layout.firstNoteRow + i;
    ws.mergeCells(`${firstCol}${r}:${lastCol}${r}`);
    const cell = ws.getCell(`${firstCol}${r}`);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 10 };
    cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.max(1, Math.ceil(text.length / NOTE_CHARS_PER_LINE)) * NOTE_LINE_PT;
  });

  const sig = spec.signature;
  const s = (addr: string) => {
    const { col, row } = splitAddr(addr);
    return `${col}${layout.shift(row)}`;
  };
  // The signature is applied only by the certifier's Certify tap, and only while the certified
  // content is unchanged; then the printed name, company and date are the certifier's.
  const cert = certificationState(asEntered(record), test);
  if (cert.state === 'certified') {
    put(s(sig.testerName), cert.cert.name);
    put(s(sig.company), cert.cert.company);
    put(s(sig.certDate), excelDate(localNow(new Date(cert.cert.at)).slice(0, 10)));
    placeSignature(ws, s(sig.signature), dataUrlBytes(cert.cert.signaturePng));
  } else {
    put(s(sig.testerName), test.tester.trim() || h.evalBy);
    put(s(sig.certDate), excelDate(testDay));
  }
}

/** Signature image standing on the signature line: bottom at the line, up to 36 pt tall, within the merged width. */
function placeSignature(ws: ExcelJS.Worksheet, addr: string, png: Uint8Array) {
  const size = imageSize(png);
  if (!size) return;
  const { col, row } = splitAddr(addr);
  const merge = Object.values((ws as any)._merges as Record<string, { model: { top: number; left: number; right: number } }>).find(
    (m) => m.model.top === row && m.model.left === ws.getColumn(col).number,
  );
  const colPt = (c: number) => Math.trunc(((256 * (ws.getColumn(c).width ?? ws.properties.defaultColWidth ?? 8.43) + 18) / 256) * 7) * 0.75;
  const left = ws.getColumn(col).number;
  let maxW = 0;
  for (let c = left; c <= (merge?.model.right ?? left); c++) maxW += colPt(c);
  const rowPt = (r: number) => ws.getRow(r).height ?? ws.properties.defaultRowHeight ?? 15;
  const k = Math.min(SIGNATURE_PT / size.height, (maxW - 4) / size.width);
  const w = size.width * k;
  const hgt = size.height * k;
  // Walk up from the line until the rows above hold the image.
  let top = row;
  let above = rowPt(row);
  while (above < hgt + 2 && top > 1) above += rowPt(--top);
  const id = ws.workbook.addImage({ buffer: png as any, extension: 'png' });
  ws.addImage(id, {
    tl: { nativeCol: left - 1, nativeColOff: Math.round(((maxW - w) / 2) * 12700), nativeRow: top - 1, nativeRowOff: Math.round((above - hgt - 2) * 12700) } as any,
    ext: { width: w / 0.75, height: hgt / 0.75 },
    editAs: 'oneCell',
  });
}

const SIGNATURE_PT = 36;

/** Calibri 10 across B:K of the template (~95 character widths). */
const NOTE_CHARS_PER_LINE = 95;
const NOTE_LINE_PT = 13.5;
/** Calibri 11 line height. */
const HEADER_LINE_PT = 15;

/** Pit-form wording under the readings: location, soak, final rate, warnings, notes, certification. */
function noteLines(record: FieldRecord, t: PercTest): string[] {
  const lines: string[] = [];
  const pit = record.testPits.find((p) => p.id === t.testPitId);
  if (pit) lines.push(`Location: Test pit ${pit.label}.`);
  const soak = soakSummary(t);
  if (soak) lines.push(soak);
  const rule = stopRule(t);
  if (rule.met && rule.finalRateMpi != null)
    lines.push(`Final percolation rate: ${rule.finalRateMpi.toFixed(1)} mpi (reading ${rule.finalIndex! + 1}, final drop; DEQ-4 App. A).`);
  else if (t.readings.length) lines.push(`Test not complete: ${rule.message}`);
  for (const w of rule.warnings) lines.push(`Note: ${w}`);
  if (t.notes.trim()) lines.push(t.notes.trim());
  lines.push(CERTIFICATION);
  return lines;
}

function soakSummary(t: PercTest): string | null {
  const parts: string[] = [];
  const mins = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
  t.fills.forEach((f, i) => {
    if (!f.startAt) return;
    const which = i === 0 ? 'first 12" filling' : 'second';
    const verb = i === 0 ? 'seeped away in' : 'in';
    parts.push(f.endAt ? `${which} ${verb} ${mins(f.startAt, f.endAt)} min` : `${which} did not seep away within 60 min`);
  });
  if (t.presoak.startAt && t.presoak.endAt) {
    const m = mins(t.presoak.startAt, t.presoak.endAt);
    parts.push(`presoaked ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min with at least 12" of water`);
  }
  const branch: Partial<Record<string, string>> = {
    sandy: 'sandy-soil test',
    'may-stop': 'both fillings faster than 3 mpi, test may be stopped',
    'presoak-done': 'other-soils test',
    'presoak-short': 'presoak shorter than the 4 hours required',
  };
  // The branch is judged once the soak is over, so "now" is the soak's end.
  const b = branch[soakStatus(t, soakPeriod(t).ended || '9999-12-31T00:00:00').step];
  if (!parts.length && !b) return null;
  return `Soak: ${parts.join(', ')}${b ? `; ${b}` : ''} (DEQ-4 App. A).`;
}

function soakPeriod(t: PercTest): { began: LocalDateTime; ended: LocalDateTime } {
  const starts = [...t.fills.map((f) => f.startAt), t.presoak.startAt].filter(Boolean).sort();
  const ends = [...t.fills.map((f) => f.endAt), t.presoak.endAt].filter(Boolean).sort();
  return { began: starts[0] ?? '', ended: ends.at(-1) ?? '' };
}

/** `10/2/2026 @ 8:00 AM`: the office's soak wording with explicit AM/PM (research/02 §3). */
function stamp(t: LocalDateTime): string {
  const h = Number(t.slice(11, 13));
  return `${dateText(t.slice(0, 10))} @ ${h % 12 || 12}:${t.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Excel time value (fraction of a day) of a LocalDateTime. */
function dayFraction(t: LocalDateTime): number {
  const [h, m, s = '0'] = t.slice(11).split(':');
  return (Number(h) * 3600 + Number(m) * 60 + Number(s)) / 86400;
}

/** Date cell value; ExcelJS writes Dates as UTC serials. */
function excelDate(iso: string): Date | '' {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : '';
}
