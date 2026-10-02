// Soil log workbook in the office Soil Log Template layout: one test pit per sheet.
import ExcelJS from 'exceljs';
import { dateText, depthText, type FieldRecord, type TestPit } from '../domain/fieldRecord';
import type { SoilLogSnapshot, TemplateSet } from '../templates/types';

const EMU_PER_PX = 9525;

export async function soilLogXlsx(record: FieldRecord, templates: TemplateSet): Promise<Uint8Array> {
  const { spec, logo } = templates.soilLog;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Houser Engineering site evaluation app';
  wb.created = wb.modified = new Date(record.updatedAt);
  const logoId = wb.addImage({ buffer: logo as any, extension: spec.images[0].file.endsWith('.png') ? 'png' : 'jpeg' });

  const pits: (TestPit | null)[] = record.testPits.length ? record.testPits : [null];
  const used = new Set<string>();
  for (const pit of pits) {
    const ws = wb.addWorksheet(sheetName(pit, used));
    // The template prints 3 horizon rows; extra horizons get extra rows and push the photo/map boxes down.
    const extraRows = Math.max(0, (pit?.horizons.length ?? 0) - spec.horizonTable.rows);
    drawTemplate(ws, spec, logoId, extraRows);
    fill(ws, spec, record, pit);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function sheetName(pit: TestPit | null, used: Set<string>): string {
  const base = (pit ? `TP ${pit.label || '?'}` : 'Soil Logs').replace(/[\[\]:*?/\\]/g, '-').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Last row of the printed form (bottom of the photo/location boxes), before any horizon rows are added. */
export function formLastRow(spec: SoilLogSnapshot): number {
  const range = spec.areas.photo?.range ?? spec.areas.location?.range;
  if (range) return Number(range.split(':')[1].replace(/\D/g, ''));
  return Math.max(...Object.keys(spec.cells).map((a) => Number(a.replace(/\D/g, ''))));
}

function drawTemplate(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, logoId: number, extraRows: number) {
  const t = spec.horizonTable;
  const lastHorizonRow = t.firstRow + t.rows - 1;
  const shift = (row: number) => (row > lastHorizonRow ? row + extraRows : row);
  const at = (addr: string) => {
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(addr)!;
    return { col, row: Number(row) };
  };

  for (const [col, width] of Object.entries(spec.columns)) ws.getColumn(col).width = width;
  for (const [row, height] of Object.entries(spec.rows)) ws.getRow(shift(Number(row))).height = height;
  for (let i = 1; i <= extraRows; i++) ws.getRow(lastHorizonRow + i).height = t.rowHeight;

  const cells = Object.entries(spec.cells).map(([addr, c]) => {
    const { col, row } = at(addr);
    return [`${col}${shift(row)}`, c] as const;
  });
  for (const [addr, c] of Object.entries(spec.cells)) {
    const { col, row } = at(addr);
    if (row !== lastHorizonRow) continue;
    for (let i = 1; i <= extraRows; i++) cells.push([`${col}${row + i}`, c]);
  }

  for (const [addr, c] of cells) {
    const cell = ws.getCell(addr);
    if (c.value !== undefined) cell.value = c.value;
    cell.font = { name: c.font.name, size: c.font.size, bold: c.font.bold };
    if (c.numFmt !== 'General') cell.numFmt = c.numFmt;
    if (c.alignment) {
      // Excel's "center" vertical alignment is ExcelJS's "middle".
      const { vertical, ...rest } = c.alignment;
      cell.alignment = { ...rest, ...(vertical && { vertical: vertical === 'center' ? 'middle' : vertical }) } as ExcelJS.Alignment;
    }
    if (c.border) {
      cell.border = Object.fromEntries(Object.entries(c.border).map(([side, style]) => [side, { style }])) as unknown as ExcelJS.Borders;
    }
    // c.fill (yellow) marks input cells for office typists; deliverables print without it.
    // c.comment is typist guidance; it becomes in-app help, not a deliverable comment.
  }

  const ps = spec.pageSetup;
  const lastRow = shift(formLastRow(spec));
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: ps.paperSize as any,
    orientation: ps.orientation,
    fitToPage: ps.fitToPage,
    fitToWidth: ps.fitToWidth,
    fitToHeight: ps.fitToHeight,
    margins: ps.margins,
    printArea: `A1:H${lastRow}`,
  };

  for (const img of spec.images) {
    ws.addImage(logoId, {
      tl: { nativeCol: img.from.col, nativeColOff: img.from.colOff, nativeRow: shift(img.from.row + 1) - 1, nativeRowOff: img.from.rowOff } as any,
      ext: { width: img.extEmu.cx / EMU_PER_PX, height: img.extEmu.cy / EMU_PER_PX },
      editAs: 'oneCell',
    });
  }
}

function fill(ws: ExcelJS.Worksheet, spec: SoilLogSnapshot, record: FieldRecord, pit: TestPit | null) {
  const h = record.header;
  const put = (addr: string, v: string) => {
    ws.getCell(addr).value = v === '' ? null : v;
  };
  put(spec.inputs.projectNumber, h.projectNumber);
  put(spec.inputs.projectName, h.projectName);
  put(spec.inputs.location, h.location);
  put(spec.inputs.evalBy, h.evalBy);
  put(spec.inputs.date, dateText(h.date));
  put(spec.inputs.confirmationNumber, h.confirmationNumber);
  if (!pit) return;
  put(spec.inputs.testPitLabel, pit.label);

  const t = spec.horizonTable;
  pit.horizons.forEach((hz, i) => {
    const row = ws.getRow(t.firstRow + i);
    const c = t.columns;
    row.getCell(c.designation).value = hz.designation || null;
    row.getCell(c.depth).value = depthText(hz) || null;
    row.getCell(c.color).value = hz.color || null;
    row.getCell(c.texture).value = hz.texture || null;
    row.getCell(c.structure).value = hz.structure || null;
    row.getCell(c.roots).value = hz.roots || null;
    row.getCell(c.mottling).value = hz.mottling || null;
    row.getCell(c.notes).value = hz.notes || null;
  });
}
