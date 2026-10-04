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
  it('leaves the confirmation field off a site outside Gallatin County', async () => {
    const r = sampleRecord();
    const { wb } = await soilLogWorkbook({ ...r, header: { ...r.header, gallatin: 'N' } });
    const ws = wb.worksheets[0];
    const conf = spec.inputs.confirmationNumber;
    const rowNo = Number(conf.replace(/[A-Z]+/, ''));
    const row = ws.getRow(rowNo);
    for (let c = 1; c <= 8; c++) expect(String(row.getCell(c).value ?? ''), `column ${c}`).not.toMatch(/CONFIRMATION|SE 00001/);
    for (const col of ['F', 'G', 'H']) {
      expect(ws.getCell(`${col}${rowNo}`).border?.bottom, `${col} underline`).toBeUndefined();
    }
  });

  it('prints the confirmation number on a Gallatin County site', async () => {
    const r = sampleRecord();
    const { wb } = await soilLogWorkbook({ ...r, header: { ...r.header, gallatin: 'Y' } });
    expect(wb.worksheets[0].getCell(spec.inputs.confirmationNumber).value).toBe('SE 00001');
  });

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
    const location = spec.areas.location.range.split(':')[0];
    for (const [addr, cell] of Object.entries(spec.cells)) {
      // The form prints A:H; the location box's first cell holds the wall's coordinates.
      if (addr.replace(/\d+/, '') > 'H' || addr === location) continue;
      const got = ws.getCell(addr);
      if (cell.value !== undefined) expect(got.value, addr).toBe(cell.value);
      expect(got.font?.name, `${addr} font`).toBe(cell.font.name);
      expect(got.font?.size, `${addr} size`).toBe(cell.font.size);
      expect(!!got.font?.bold, `${addr} bold`).toBe(cell.font.bold);
      if (cell.numFmt !== 'General') expect(got.numFmt, `${addr} numFmt`).toBe(cell.numFmt);
      // Except the rule above the confirmation number, which comes off (Justin, 2026-10-03).
      const confirmation = addr.replace(/[A-Z]+/, '') === spec.inputs.confirmationNumber.replace(/[A-Z]+/, '') && addr >= spec.inputs.confirmationNumber;
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        expect(got.border?.[side]?.style, `${addr} border ${side}`).toBe(confirmation && side === 'top' ? undefined : cell.border?.[side]);
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
      if (col <= 'H') expect(ws.getColumn(col).width, `col ${col}`).toBeCloseTo(width, 3);
    }
    // Header rows are evened to 15 pt; photo/location rows grow to fill the page; the rest keep the template's.
    const areaRows = (k: number) => {
      const [a, z] = spec.areas.photo.range.split(':').map((x) => Number(x.replace(/\D/g, '')) + k * spec.wallOffset);
      return Array.from({ length: z - a + 1 }, (_, i) => a + i);
    };
    const changed = new Set([spec.horizonTable.headerRow, spec.horizonTable.headerRow + spec.wallOffset, ...areaRows(0), ...areaRows(1)]);
    for (const [row, height] of Object.entries(spec.rows)) {
      if (!changed.has(Number(row)) && Number(row) !== spec.horizonTable.firstRow) expect(ws.getRow(Number(row)).height, `row ${row}`).toBe(height);
    }
    expect(ws.getRow(spec.horizonTable.headerRow).height).toBe(15);
    for (const r of areaRows(0)) expect(ws.getRow(r).height!, `area row ${r}`).toBeGreaterThan(12.75);
    const ps = ws.pageSetup;
    expect(ps.paperSize).toBe(spec.pageSetup.paperSize);
    expect(ps.orientation).toBe('portrait');
    expect(ps.fitToPage).toBe(true);
    expect(ps.fitToWidth).toBe(1);
    expect(ps.fitToHeight).toBe(1);
    expect(ps.margins).toMatchObject({ left: 0.5, right: 0.5, top: 0.5, bottom: 0.5 });
    expect(ps.printArea).toBe(`A1:H${Number(spec.areas.photo.range.split(':')[1].replace(/\D/g, '')) + spec.wallOffset}`);
    const images = ws.getImages();
    expect(images).toHaveLength(1);
    const img = images[0];
    expect(img.range.tl.nativeCol).toBe(spec.images[0].from.col);
    expect(img.range.tl.nativeRow).toBe(spec.images[0].from.row);
    const media = wb.getImage(Number(img.imageId));
    expect(Buffer.from(media.buffer as ArrayBuffer).equals(Buffer.from(templates.soilLog.logo))).toBe(true);
  });

  it('writes one sheet per test pit: wall A in the first block, wall B in the second', async () => {
    let r = sampleRecord();
    r = addTestPit(r, 'LOT 19');
    r = addTestPit(r, '3A');
    const { wb } = await soilLogWorkbook(r);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['TP 3A 3B', 'TP LOT 19']);
    const ws = wb.worksheets[0];
    const labelRow = Number(spec.inputs.testPitLabel.replace(/\D/g, ''));
    expect(ws.getCell(spec.inputs.testPitLabel).value).toBe('3A');
    expect(ws.getCell(`B${labelRow + spec.wallOffset}`).value).toBe('3B');
    expect(ws.getRow(spec.horizonTable.firstRow + spec.wallOffset).getCell('A').value).toBe('O');
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
    expect(extra.height).toBeGreaterThanOrEqual(27);
    expect(extra.getCell(c.notes).border?.right?.style).toBe('double');
    expect(extra.getCell(c.designation).border?.bottom?.style).toBe('thin');
    const label = spec.areas.photo.label;
    const moved = `${label.replace(/\d+/, '')}${Number(label.replace(/\D/g, '')) + 2}`;
    expect(ws.getCell(moved).value).toBe('PHOTO OF TEST PIT');
    // The pit summary row now sits where the label was.
    expect(String(ws.getCell(label).value)).toMatch(/^NO GROUNDWATER OBSERVED/);
    expect(ws.pageSetup.printArea).toBe(`A1:H${Number(spec.areas.photo.range.split(':')[1].replace(/\D/g, '')) + spec.wallOffset + 2}`);
  });

  it('prints the pit summary as the last row of the horizon table, across all columns', async () => {
    let r = sampleRecord();
    const pitId = r.testPits[0].id;
    r = updateTestPit(r, pitId, {
      observedWater: { kind: 'NONE', depthIn: null },
      limitingLayer: { type: 'NONE', depthIn: null, other: '' },
      shgw: { depthIn: null, deeperThan: false, basis: 'NO REDOXIMORPHIC FEATURES TO PIT DEPTH' },
      slope: { pct: 2, shape: '', direction: '', method: 'ESTIMATED' },
    });
    const { wb } = await soilLogWorkbook(r);
    const ws = wb.worksheets[0];
    const row = spec.horizonTable.firstRow + spec.horizonTable.rows;
    expect(ws.getCell(`A${row}`).value).toBe(
      'NO GROUNDWATER OBSERVED. NO REDOXIMORPHIC FEATURES TO TEST PIT DEPTH. NO LIMITING LAYER WITHIN TEST PIT. SLOPE 2% (ESTIMATED).',
    );
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
  // The second wall's block repeats the first's input cells.
  inputCells.push(...inputCells.filter((a) => Number(a.replace(/\D/g, '')) >= t.firstRow - 2).map((a) => a.replace(/\d+/, (n) => String(Number(n) + spec.wallOffset))));
  for (const addr of inputCells) expect(spec.cells[addr]?.value, addr).toBeUndefined();
  for (const [addr, c] of Object.entries(spec.cells)) if (c.fill) expect(c.value, addr).toBeUndefined();
});
