// Golden test: the generated soil log reproduces the office Soil Log Template layout
// (snapshot extracted from the template by tools/snapshot_soil_log.py) with the field record filled in.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/generator';
import { addHorizon, addTestPit, emptyHorizon, newSiteEvaluation, updateTestPit, type FieldRecord } from '../src/domain/fieldRecord';
import { loadTemplatesFromDisk } from './templates';

const templates = loadTemplatesFromDisk();
const spec = templates.soilLog.spec;

function sampleRecord(): FieldRecord {
  // Synthetic job: the public repo never holds client data.
  let r = newSiteEvaluation({
    projectNumber: '0999.001',
    projectName: 'Example Subdivision',
    location: '100 Example Road, Bozeman',
    evalBy: 'Test Evaluator',
    date: '2026-10-02',
    confirmationNumber: 'SE 00001',
  });
  r = addTestPit(r, '3B');
  const pit = r.testPits[0];
  r = addHorizon(r, pit.id, {
    designation: 'O',
    topIn: 0,
    bottomIn: 12,
    color: { hue: '10YR', value: '3', chroma: '2', moisture: 'MOIST', physicalState: 'RUBBED', other: '' },
    texture: { cls: 'SILT LOAM', sandSize: '' },
    rock: { pct: 0, kind: 'ROCKS' },
    structure: { grade: '', size: 'FINE', size2: '', shape: 'GRANULAR', other: '' },
    roots: 'Y',
    mottling: { ...emptyHorizon().mottling, present: 'N' },
  });
  return r;
}

async function soilLogWorkbook(record: FieldRecord) {
  const files = await generate(record, templates);
  const file = files.find((f) => f.kind === 'soil-log-xlsx');
  expect(file, 'soil log xlsx generated').toBeTruthy();
  expect(file!.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file!.bytes as any);
  return { wb, file: file! };
}

describe('soil log xlsx', () => {
  it('fills header and horizon cells as text in the template positions', async () => {
    const { wb } = await soilLogWorkbook(sampleRecord());
    expect(wb.worksheets).toHaveLength(1);
    const ws = wb.worksheets[0];
    const at = (k: keyof typeof spec.inputs) => ws.getCell(spec.inputs[k]).value;
    expect(at('projectNumber')).toBe('0999.001');
    expect(at('projectName')).toBe('Example Subdivision');
    expect(at('location')).toBe('100 Example Road, Bozeman');
    expect(at('evalBy')).toBe('Test Evaluator');
    expect(at('date')).toBe('10/2/2026');
    expect(at('testPitLabel')).toBe('3B');
    expect(at('confirmationNumber')).toBe('SE 00001');
    const row = ws.getRow(spec.horizonTable.firstRow);
    const c = spec.horizonTable.columns;
    expect(row.getCell(c.designation).value).toBe('O');
    expect(row.getCell(c.depth).value).toBe('0"-12"');
    expect(row.getCell(c.color).value).toBe('10YR 3/2, VERY DARK GRAYISH BROWN, MOIST, RUBBED');
    expect(row.getCell(c.texture).value).toBe('SILT LOAM');
    expect(row.getCell(c.structure).value).toBe('FINE GRANULAR');
    expect(row.getCell(c.roots).value).toBe('Y');
    expect(row.getCell(c.mottling).value).toBe('N');
    expect(row.getCell(c.notes).value).toBe('NO ROCKS');
    // Unused template horizon rows stay blank but keep their borders.
    const blank = ws.getRow(spec.horizonTable.firstRow + 1).getCell(c.notes);
    expect(blank.value ?? null).toBeNull();
    expect(blank.border?.right?.style).toBe('double');
  });

  it('reproduces every template cell: labels, fonts, number formats, alignment, borders', async () => {
    const { wb } = await soilLogWorkbook(sampleRecord());
    const ws = wb.worksheets[0];
    for (const [addr, cell] of Object.entries(spec.cells)) {
      const got = ws.getCell(addr);
      if (cell.value !== undefined) expect(got.value, addr).toBe(cell.value);
      expect(got.font?.name, `${addr} font`).toBe(cell.font.name);
      expect(got.font?.size, `${addr} size`).toBe(cell.font.size);
      expect(!!got.font?.bold, `${addr} bold`).toBe(cell.font.bold);
      if (cell.numFmt !== 'General') expect(got.numFmt, `${addr} numFmt`).toBe(cell.numFmt);
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        expect(got.border?.[side]?.style, `${addr} border ${side}`).toBe(cell.border?.[side]);
      }
      expect(got.alignment?.horizontal, `${addr} align`).toBe(cell.alignment?.horizontal);
      expect(got.alignment?.vertical?.replace('middle', 'center'), `${addr} valign`).toBe(cell.alignment?.vertical);
      expect(!!got.alignment?.wrapText, `${addr} wrap`).toBe(!!cell.alignment?.wrapText);
      if (cell.comment) expect(got.note, `${addr} comment`).toBeUndefined();
    }
  });

  it('keeps column widths, row heights, page setup, print area and logo', async () => {
    const { wb } = await soilLogWorkbook(sampleRecord());
    const ws = wb.worksheets[0];
    for (const [col, width] of Object.entries(spec.columns)) {
      expect(ws.getColumn(col).width, `col ${col}`).toBeCloseTo(width, 3);
    }
    for (const [row, height] of Object.entries(spec.rows)) {
      expect(ws.getRow(Number(row)).height, `row ${row}`).toBe(height);
    }
    const ps = ws.pageSetup;
    expect(ps.paperSize).toBe(spec.pageSetup.paperSize);
    expect(ps.orientation).toBe('portrait');
    expect(ps.fitToPage).toBe(true);
    expect(ps.fitToWidth).toBe(1);
    expect(ps.fitToHeight).toBe(1);
    expect(ps.margins).toMatchObject(spec.pageSetup.margins);
    expect(ps.printArea).toBe(`A1:H${Number(spec.areas.photo.range.split(':')[1].replace(/\D/g, ''))}`);
    const images = ws.getImages();
    expect(images).toHaveLength(1);
    const img = images[0];
    expect(img.range.tl.nativeCol).toBe(spec.images[0].from.col);
    expect(img.range.tl.nativeRow).toBe(spec.images[0].from.row);
    const media = wb.getImage(Number(img.imageId));
    expect(Buffer.from(media.buffer as ArrayBuffer).equals(Buffer.from(templates.soilLog.logo))).toBe(true);
  });

  it('writes one sheet per test pit, named for the pit', async () => {
    let r = sampleRecord();
    r = addTestPit(r, 'LOT 19');
    const { wb } = await soilLogWorkbook(r);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['TP 3B', 'TP LOT 19']);
    expect(wb.worksheets[1].getCell(spec.inputs.testPitLabel).value).toBe('LOT 19');
    expect(wb.worksheets[1].getCell(spec.inputs.projectNumber).value).toBe('0999.001');
  });

  it('adds rows for more horizons than the template prints and moves the photo boxes down', async () => {
    let r = sampleRecord();
    const pitId = r.testPits[0].id;
    for (const [d, b] of [['A', 30], ['B', 60], ['BC', 96], ['C', 120]] as const) r = addHorizon(r, pitId, { designation: d, bottomIn: b });
    const { wb } = await soilLogWorkbook(r);
    const ws = wb.worksheets[0];
    const t = spec.horizonTable;
    const c = t.columns;
    expect([0, 1, 2, 3, 4].map((i) => ws.getRow(t.firstRow + i).getCell(c.designation).value)).toEqual(['O', 'A', 'B', 'BC', 'C']);
    expect(ws.getRow(t.firstRow + 4).getCell(c.depth).value).toBe('96"-120"');
    const extra = ws.getRow(t.firstRow + 4);
    expect(extra.height).toBe(t.rowHeight);
    expect(extra.getCell(c.notes).border?.right?.style).toBe('double');
    expect(extra.getCell(c.designation).border?.bottom?.style).toBe('thin');
    const label = spec.areas.photo.label;
    const moved = `${label.replace(/\d+/, '')}${Number(label.replace(/\D/g, '')) + 2}`;
    expect(ws.getCell(moved).value).toBe('PHOTO OF TEST PIT');
    expect(ws.getCell(label).value ?? null).toBeNull();
    expect(ws.pageSetup.printArea).toBe('A1:H31');
  });

  it('prints pit-level DEQ-4 items as footnote rows under the horizon table', async () => {
    let r = sampleRecord();
    const pitId = r.testPits[0].id;
    r = updateTestPit(r, pitId, {
      observedWater: { kind: 'NONE', depthIn: null },
      limitingLayer: { type: 'NONE', depthIn: null, other: '' },
      shgw: { depthIn: 12, deeperThan: true, basis: 'NO REDOXIMORPHIC FEATURES TO PIT DEPTH' },
    });
    const { wb } = await soilLogWorkbook(r);
    const ws = wb.worksheets[0];
    const row = spec.horizonTable.firstRow + spec.horizonTable.rows;
    expect(ws.getCell(`A${row}`).value).toBe('*NO EVIDENCE OF GROUNDWATER, BEDROCK OR LIMITING LAYER');
    expect(ws.getCell(`A${row + 1}`).value).toBe('TOTAL DEPTH 12". EST. SEASONAL HIGH GROUNDWATER >12" (NO REDOXIMORPHIC FEATURES TO PIT DEPTH)');
    expect(ws.getCell(`H${row}`).isMerged).toBe(true);
    expect(ws.getCell(spec.areas.photo.label).value).toBe('PHOTO OF TEST PIT');
  });

  it('keeps sheet names within the 31-character limit for many duplicate labels', async () => {
    let r = sampleRecord();
    for (let i = 0; i < 11; i++) r = addTestPit(r, 'A VERY LONG TEST PIT LABEL NAME XX');
    const { wb } = await soilLogWorkbook(r);
    const names = wb.worksheets.map((w) => w.name);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31);
  });

  it('does not print the template yellow input highlight on the deliverable', async () => {
    const { wb } = await soilLogWorkbook(sampleRecord());
    const ws = wb.worksheets[0];
    for (const addr of [spec.inputs.projectNumber, `A${spec.horizonTable.firstRow}`, 'A20']) {
      const fill = ws.getCell(addr).fill as ExcelJS.FillPattern | undefined;
      expect(fill?.fgColor?.argb, addr).not.toBe('FFFFFF00');
    }
  });
});

it('template snapshot carries its source hash and no sample job values', () => {
  expect(spec.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  const t = spec.horizonTable;
  const inputCells = [
    ...Object.values(spec.inputs),
    ...Array.from({ length: t.rows }, (_, i) => Object.values(t.columns).map((c) => `${c}${t.firstRow + i}`)).flat(),
  ];
  for (const addr of inputCells) expect(spec.cells[addr]?.value, addr).toBeUndefined();
  for (const [addr, c] of Object.entries(spec.cells)) if (c.fill) expect(c.value, addr).toBeUndefined();
});
