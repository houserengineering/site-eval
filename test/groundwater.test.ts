// Groundwater observation wells: A − B, dry readings per DEQ-4 App. C, schedule checks, and the
// results form compared with Houser's submitted Cottonwood results (0105.003, well # 1).
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { migrate, newSiteEvaluation, type FieldRecord } from '../src/domain/fieldRecord';
import { mergeRecords, stampEdits } from '../src/domain/merge';
import { generate } from '../src/generator';
import { text } from '../src/generator/sheetPage';
import { deliverablePath } from '../src/sync/naming';
import { groundwaterWorkbook, ROWS_PER_SHEET } from '../src/groundwater/resultsWorkbook';
import {
  addWell,
  addWellReading,
  depthText,
  newReading,
  newWell,
  nextWellLabel,
  notesText,
  removeWell,
  updateWellReading,
  wellWarnings,
  type WellReading,
} from '../src/groundwater/wells';
import { loadTemplatesFromDisk } from './templates';

/** `11 Groundwater Observation Results _ Cottonwood.pdf`, well # 1, first rows: date, time, A, B, A−B, notes. */
const COTTONWOOD: [string, string, number, number, string, string][] = [
  ['2019-04-16', '11:15', 137, 24, '113', 'No groundwater'],
  ['2019-04-19', '13:10', 127, 24, '103', ''],
  ['2019-04-26', '12:30', 127, 24, '103', ''],
  ['2019-05-03', '10:30', 133, 24, '109', ''],
  ['2019-05-10', '09:00', 137, 24, '113', 'No groundwater'],
  ['2019-05-17', '10:50', 137, 24, '113', 'No groundwater'],
  ['2019-05-24', '16:30', 122, 24, '98', ''],
];

function cottonwood(): FieldRecord {
  let r = addWell(newSiteEvaluation({ projectNumber: '0105.003', projectName: 'Cottonwood' }), '1', {
    monitoredBy: 'Justin Houser',
    location: 'Cottonwood Road',
    str: 'S12 T2S R5E',
    lot: '3',
  });
  const id = r.wells[0].id;
  for (const [date, time, a, b, , note] of COTTONWOOD) r = addWellReading(r, id, undefined, { date, time, aIn: a, bIn: b, dry: note === 'No groundwater' });
  return r;
}

const reading = (p: Partial<WellReading>): WellReading => ({ ...newReading(newWell('1')), ...p });

describe('observation well readings (DEQ-4 App. C p140–141)', () => {
  it('A − B is the depth of water below natural ground', () => {
    expect(depthText(reading({ aIn: 127, bIn: 24 }))).toBe('103');
  });

  it('a dry pipe records the total depth measured and gives only "deeper than"', () => {
    const x = reading({ aIn: 137, bIn: 24, dry: true });
    expect(depthText(x)).toBe('>113');
    expect(notesText(x)).toBe('No groundwater (pipe dry)');
    expect(notesText({ ...x, notes: 'cap off' })).toBe('No groundwater (pipe dry). cap off');
  });

  it('a new reading carries B from the last reading, else the stick-up as installed', () => {
    let r = addWell(newSiteEvaluation(), '1', { stickUpIn: 26 });
    const id = r.wells[0].id;
    r = addWellReading(r, id, new Date(2027, 3, 16, 9, 5));
    expect(r.wells[0].readings[0]).toMatchObject({ date: '2027-04-16', time: '09:05', bIn: 26, aIn: null, dry: false });
    r = updateWellReading(r, id, r.wells[0].readings[0].id, { bIn: 24 });
    r = addWellReading(r, id);
    expect(r.wells[0].readings[1].bIn).toBe(24);
  });

  it('a second well starts with the first well\'s monitor, location and stick-up', () => {
    let r = addWell(newSiteEvaluation(), '1', { monitoredBy: 'Nathan Hart', location: 'Lot 3', str: 'S12 T2S R5E', lot: '3', stickUpIn: 24 });
    r = addWell(r, '2');
    expect(r.wells[1]).toMatchObject({ label: '2', monitoredBy: 'Nathan Hart', location: 'Lot 3', str: 'S12 T2S R5E', lot: '', stickUpIn: 24 });
  });
});

describe('well numbers', () => {
  it('a blank well # takes the next number not already used', () => {
    let r = newSiteEvaluation();
    for (const l of ['1', '2', '3']) r = addWell(r, l);
    r = removeWell(r, r.wells[1].id);
    expect(nextWellLabel(r)).toBe('4');
    expect(nextWellLabel(addWell(newSiteEvaluation(), 'SE #1'))).toBe('1');
  });
});

describe('monitoring checks (DEQ-4 App. C p139)', () => {
  const weekly = (depths: (number | 'dry')[], start = Date.UTC(2027, 3, 1), step = 7) => {
    let w = newWell('1');
    w = {
      ...w,
      readings: depths.map((d, i) =>
        reading({ date: new Date(start + i * step * 86_400_000).toISOString().slice(0, 10), aIn: d === 'dry' ? 120 : d + 24, bIn: 24, dry: d === 'dry' }),
      ),
    };
    return w;
  };
  const ids = (w: ReturnType<typeof weekly>) => wellWarnings(w).map((x) => x.rule.id);

  it('is quiet for weekly readings with two weeks either side of the peak', () => {
    expect(wellWarnings(weekly(['dry', 110, 96, 90, 95, 100, 'dry']))).toEqual([]);
  });

  it('warns when readings are more than 7 days apart', () => {
    const w = weekly([110, 100, 90, 100, 110], Date.UTC(2027, 3, 1), 10);
    expect(wellWarnings(w).find((x) => x.rule.id === 'gw-schedule')?.message).toMatch(/10 days between readings 4\/1\/2027 and 4\/11\/2027/);
  });

  it('warns until the peak has two weeks of readings after it', () => {
    const msgs = wellWarnings(weekly([110, 100, 90])).map((x) => x.message);
    expect(msgs.some((m) => /Highest water so far 90" on 4\/15\/2027: 14 days of readings before it and 0 after/.test(m))).toBe(true);
  });

  it('flags water within 6 ft and a short stick-up, citing the rule', () => {
    const w = weekly([110, 100, 60, 100, 110]);
    expect(ids(w)).toContain('gw-well');
    expect(wellWarnings(w)[0]).toMatchObject({ subject: { kind: 'well', name: 'Well # 1' } });
    const short = { ...w, readings: w.readings.map((x) => ({ ...x, bIn: 12 })) };
    expect(wellWarnings(short).some((x) => /Stick-up B is 12"/.test(x.message))).toBe(true);
  });
});

describe('Ground Water Observation Results form (Cottonwood layout)', () => {
  it('prints one landscape sheet per well with Houser\'s columns and the p141 header fields', () => {
    const wb = groundwaterWorkbook(cottonwood());
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['Well # 1']);
    const ws = wb.worksheets[0];
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(text(ws.getCell('A1'))).toBe('Well # 1 Results');
    const labels = Array.from({ length: 7 }, (_, i) => text(ws.getCell(`A${i + 2}`)));
    expect(labels).toEqual(['Project:', 'Monitored by:', 'Location:', 'Section, township, range:', 'Lot #:', 'Observation well #:', 'Other location info:']);
    expect(text(ws.getCell('C2'))).toBe('0105.003 Cottonwood');
    expect(text(ws.getCell('C5'))).toBe('S12 T2S R5E');
    const head = 10;
    expect([1, 2, 3, 4, 5, 6].map((c) => text(ws.getRow(head).getCell(c)))).toEqual(['Date', 'Time', 'A (inches)', 'B (inches)', 'A-B (inches)', 'Notes']);
  });

  it('matches the submitted Cottonwood values row for row, with A − B as a live formula', () => {
    const ws = groundwaterWorkbook(cottonwood()).worksheets[0];
    COTTONWOOD.forEach(([date, , a, b, ab, note], i) => {
      const row = ws.getRow(11 + i);
      const [y, m, d] = date.split('-').map(Number);
      expect(text(row.getCell(1))).toBe(`${m}/${d}/${y}`);
      // Dry: the total depth with "dry" in the A column (p141 note); Cottonwood wrote "No groundwater".
      expect(text(row.getCell(3))).toBe(note ? `${a} dry` : String(a));
      expect(row.getCell(3).value).toBe(a);
      expect(text(row.getCell(4))).toBe(String(b));
      expect(text(row.getCell(5))).toBe(note ? `>${ab}` : ab);
      expect((row.getCell(5).value as any).formula).toBe(note ? `">"&(C${11 + i}-D${11 + i})` : `C${11 + i}-D${11 + i}`);
      expect(text(row.getCell(6))).toMatch(note ? /^No groundwater/ : /^$/);
    });
    expect(text(ws.getRow(11).getCell(2))).toBe('11:15 AM');
    expect(text(ws.getRow(12).getCell(2))).toBe('1:10 PM');
  });

  it('continues a long season on further sheets', () => {
    let r = addWell(newSiteEvaluation(), '2');
    const id = r.wells[0].id;
    for (let i = 0; i < ROWS_PER_SHEET + 2; i++)
      r = addWellReading(r, id, undefined, { date: new Date(Date.UTC(2027, 2, 1) + i * 7 * 86_400_000).toISOString().slice(0, 10), aIn: 100, bIn: 24 });
    const wb = groundwaterWorkbook(r);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['Well # 2', 'Well # 2 (2)']);
    expect(text(wb.worksheets[1].getCell('A1'))).toBe('Well # 2 Results (page 2 of 2)');
  });

  it('grows rows to fit long notes and location info, so wrapped text never overprints', () => {
    let r = cottonwood();
    r = { ...r, wells: [{ ...r.wells[0], otherInfo: 'x '.repeat(120) }] };
    r = updateWellReading(r, r.wells[0].id, r.wells[0].readings[0].id, { notes: 'Cap was off; water poured in from the surface, reading not representative of groundwater' });
    const ws = groundwaterWorkbook(r).worksheets[0];
    expect(ws.getRow(8).height).toBeGreaterThanOrEqual(45);
    expect(ws.getRow(11).height).toBeGreaterThanOrEqual(30);
    expect(ws.getRow(12).height).toBe(15);
  });

  it('prints blank rows for a well with no readings yet (paper fallback)', () => {
    const ws = groundwaterWorkbook(addWell(newSiteEvaluation(), '1')).worksheets[0];
    expect(ws.getRow(25).getCell(1).border?.top?.style).toBe('thin');
  });
});

describe('groundwater deliverables', () => {
  const templates = loadTemplatesFromDisk();

  it('are generated only when there are wells, named per the 0105.003 results', async () => {
    expect((await generate(newSiteEvaluation(), templates)).some((f) => f.kind.startsWith('groundwater'))).toBe(false);
    let r = addWell(cottonwood(), '2');
    r = { ...r, deliverableFolder: '0105\\Engineering\\Deliverables' };
    const files = await generate(r, templates);
    const xlsx = files.find((f) => f.kind === 'groundwater-xlsx')!;
    const pdf = files.find((f) => f.kind === 'groundwater-pdf')!;
    expect(xlsx.path).toBe('Groundwater Observation Results.xlsx');
    expect(deliverablePath(r, 'groundwater-pdf')).toBe('/Server/0105/Engineering/Deliverables/Groundwater Observation Results.pdf');
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(xlsx.bytes as any);
    expect(back.worksheets.map((w) => w.name)).toEqual(['Well # 1', 'Well # 2']);
    // Not part of the site evaluation packet.
    const sitePdf = await PDFDocument.load(files.find((f) => f.kind === 'site-evaluation-pdf')!.bytes);
    expect(sitePdf.getPages().every((p) => p.getSize().width === 612)).toBe(true);
  });
});

describe('field record', () => {
  it('migrates a v7 record to v8 with no wells', () => {
    const { wells, ...v7 } = { ...newSiteEvaluation(), schemaVersion: 7 };
    expect(migrate(v7)).toMatchObject({ schemaVersion: 8, wells: [] });
  });

  it('keeps readings two people added to the same well', () => {
    const base = addWell(newSiteEvaluation(), '1');
    const id = base.wells[0].id;
    const a = stampEdits(base, addWellReading(base, id, undefined, { date: '2027-04-16', aIn: 120, bIn: 24 }), 'Nathan', '2027-04-16T15:00:00Z');
    const b = stampEdits(base, addWellReading(base, id, undefined, { date: '2027-04-23', aIn: 110, bIn: 24 }), 'Justin', '2027-04-23T15:00:00Z');
    for (const m of [mergeRecords(a, b), mergeRecords(b, a)]) expect(m.wells[0].readings.map((x) => x.date).sort()).toEqual(['2027-04-16', '2027-04-23']);
  });
});
