// Perc test workbook: golden comparison against submitted Houser perc tests, plus the form fill.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { addPercTest, addReading, addTestPit, newSiteEvaluation, type FieldRecord, type PercReading } from '../src/domain/fieldRecord';
import { generate } from '../src/generator';
import { GOLDEN_PERC, type GoldenPercTest } from './golden/percJobs';
import { loadTemplatesFromDisk } from './templates';

const templates = loadTemplatesFromDisk();
const spec = templates.percTest.spec;
const t = spec.table;
const COLS = ['start', 'end', 'interval', 'initial', 'final', 'drop', 'rate'] as const;

const hhmmss = (s: string, pm = false) => {
  const [h, m, sec = 0] = s.split(':').map(Number);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h + (pm ? 12 : 0))}:${p(m)}:${p(sec)}`;
};
const dayFraction = (s: string, pm = false) => {
  const [h, m, sec] = hhmmss(s, pm).split(':').map(Number);
  return (h * 3600 + m * 60 + sec) / 86400;
};

function goldenRecord(job: GoldenPercTest): FieldRecord {
  let r = newSiteEvaluation({ projectNumber: '0000.000', projectName: `Golden perc ${job.id}`, date: job.date });
  r = addPercTest(r, '1', {
    mode: job.mode,
    holeDiameterIn: job.holeDiameterIn,
    referenceHeightIn: job.referenceHeightIn,
    intervalMin: job.intervalMin,
  });
  const id = r.percTests[0].id;
  for (const [s, e, , initialIn, finalIn] of job.historical) {
    const reading: Partial<PercReading> = {
      startAt: `${job.date}T${hhmmss(s, job.pm)}`,
      endAt: `${job.date}T${hhmmss(e, job.pm)}`,
      initialIn,
      finalIn,
    };
    r = addReading(r, id, reading);
  }
  return r;
}

async function sheets(r: FieldRecord) {
  const f = (await generate(r, templates)).find((x) => x.kind === 'perc-test-xlsx');
  if (!f) return null;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(f.bytes as any);
  return { file: f, wb };
}
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const valueOf = (c: ExcelJS.Cell) => {
  const v = c.value as any;
  const x = v && typeof v === 'object' && 'formula' in v ? v.result : v;
  // ExcelJS reads time-formatted numbers back as Dates on the 1899-12-30 epoch.
  return x instanceof Date && /h:mm/.test(c.numFmt) ? (x.getTime() - EXCEL_EPOCH) / 86_400_000 : x;
};
const formulaOf = (c: ExcelJS.Cell) => (c.value as any)?.formula as string | undefined;
const sheetText = (ws: ExcelJS.Worksheet) => {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => void (typeof c.value === 'string' && out.push(c.value))));
  return out.join('\n');
};

describe.each(GOLDEN_PERC)('golden perc test $id', (job) => {
  it('computes the submitted interval, drop and rate from the same readings, with live formulas', async () => {
    const { wb } = (await sheets(goldenRecord(job)))!;
    const ws = wb.worksheets[0];
    job.historical.forEach((hist, i) => {
      const row = t.firstRow + i;
      const cell = (k: (typeof COLS)[number]) => ws.getCell(`${t.columns[k]}${row}`);
      COLS.forEach((k, ci) => {
        const got = valueOf(cell(k));
        if (job.reasons[ci]) {
          // Explained difference: clock time printed with AM/PM, 12 h after the typed value.
          expect(got - dayFraction(hist[ci] as string), `row ${i + 1} ${k}`).toBeCloseTo(0.5, 6);
          return;
        }
        const want = ci < 2 ? dayFraction(hist[ci] as string, job.pm) : (hist[ci] as number);
        expect(got, `row ${i + 1} ${k}`).toBeCloseTo(want, ci === 6 ? 1 : 3);
      });
      expect(formulaOf(cell('drop'))).toBe(`${t.columns.final}${row}-${t.columns.initial}${row}`);
      expect(formulaOf(cell('rate'))).toContain(`${t.columns.interval}${row}/${t.columns.drop}${row}`);
      expect(formulaOf(cell('interval'))).toContain(`${t.columns.end}${row}-${t.columns.start}${row}`);
      if (i > 0) {
        // Start = previous end; initial = previous final when the water level carried over.
        expect(formulaOf(cell('start'))).toBe(`${t.columns.end}${row - 1}`);
        const carried = hist[3] === job.historical[i - 1][4];
        expect(formulaOf(cell('initial'))).toBe(carried ? `${t.columns.final}${row - 1}` : undefined);
      }
    });
    expect(sheetText(ws)).toContain(`Final percolation rate: ${job.finalRateMpi.toFixed(1)} mpi`);
  });
});

describe('perc test form', () => {
  const record = () => {
    let r = newSiteEvaluation({
      projectNumber: '0999.003',
      projectName: 'Example Subdivision',
      evalBy: 'Pat Example',
      date: '2026-10-02',
      confirmationNumber: 'SE 00001',
      ownerName: 'Example Owner',
    });
    r = addTestPit(r, '3B');
    r = addPercTest(r, '1', {
      testPitId: r.testPits[0].id,
      lot: '19',
      holeDiameterIn: 8,
      holeDepthIn: 24,
      referenceHeightIn: 22.625,
      fills: [
        { startAt: '2026-10-02T08:00:00', endAt: '2026-10-02T08:50:00' },
        { startAt: '2026-10-02T08:50:00', endAt: '2026-10-02T09:35:00' },
      ],
      mode: 'sandy',
      intervalMin: 10,
      notes: 'Hole lined with 4" perforated pipe and drain rock.',
    });
    const id = r.percTests[0].id;
    for (let i = 0; i < 7; i++) {
      const m = (k: number) => `2026-10-02T${String(9 + Math.floor((40 + k * 10) / 60)).padStart(2, '0')}:${String((40 + k * 10) % 60).padStart(2, '0')}:00`;
      r = addReading(r, id, { startAt: m(i), endAt: m(i + 1), initialIn: 16, finalIn: 18 });
    }
    return r;
  };

  it('fills the header, title, soak, and certification block (signature left for Certify)', async () => {
    const { wb } = (await sheets(record()))!;
    const ws = wb.worksheets[0];
    const at = (a: string) => valueOf(ws.getCell(a));
    const down = (a: string) => a.replace(/\d+$/, (n) => String(Number(n) + 2 + noteRows(ws)));
    expect(at(spec.inputs.ownerName)).toBe('Example Owner');
    expect(at(spec.inputs.projectName)).toBe('Example Subdivision');
    expect(at(spec.inputs.soakBegan)).toBe('10/2/2026 @ 8:00 AM');
    expect(at(spec.inputs.soakEnded)).toBe('10/2/2026 @ 9:35 AM');
    expect(at(spec.inputs.holeDiameter)).toBe('Test hole dia: 8"');
    expect(at(spec.inputs.referenceHeight)).toBe('Reference point elevation above hole bottom: 22-5/8"');
    expect(at(spec.inputs.confirmationNumber)).toBe('SE 00001');
    expect(at(spec.inputs.title)).toBe('Lot 19 Test #1');
    expect((at(spec.inputs.testDate) as Date).toISOString().slice(0, 10)).toBe('2026-10-02');
    expect(at(down(spec.signature.testerName))).toBe('Pat Example');
    expect(at(down(spec.signature.company))).toBe('Houser Engineering');
    expect(at(down(spec.signature.signature)) ?? null).toBeNull();
    expect((at(down(spec.signature.certDate)) as Date).toISOString().slice(0, 10)).toBe('2026-10-02');
    const text = sheetText(ws);
    expect(text).toContain('Hole depth: 24"');
    expect(text).toContain('Test pit 3B');
    expect(text).toContain('Soak: first 12" filling seeped away in 50 min, second in 45 min; sandy-soil test (DEQ-4 App. A).');
    expect(text).toContain('Final percolation rate: 5.0 mpi');
    expect(text).toContain(
      'I certify that this percolation test was done by a qualified site evaluator in accordance with DEQ-4 Section 1.2.68 and Appendix A.',
    );
    expect(text).toContain('Hole lined with 4" perforated pipe and drain rock.');
  });

  it('adds reading rows past the template five and keeps them inside the print area', async () => {
    const { wb } = (await sheets(record()))!;
    const ws = wb.worksheets[0];
    const last = t.firstRow + 6;
    expect(valueOf(ws.getCell(`${t.columns.rate}${last}`))).toBeCloseTo(5, 6);
    expect(ws.getCell(`${t.columns.initial}${last}`).isMerged).toBe(true);
    const printLast = Number(ws.pageSetup.printArea!.split(':')[1].replace(/\D/g, ''));
    const templateLast = Number(spec.printArea!.split(':')[1].replace(/\D/g, ''));
    expect(printLast).toBe(templateLast + 2 + noteRows(ws));
    expect(ws.pageSetup.fitToPage).toBe(true);
  });

  it('writes one sheet per perc test and nothing when there are none', async () => {
    let r = record();
    r = addPercTest(r, '2');
    const { wb, file } = (await sheets(r))!;
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Perc Test 1', 'Perc Test 2']);
    expect(file.path).toBe('Percolation Tests.xlsx');
    expect(await sheets(newSiteEvaluation())).toBeNull();
  });

  it('leaves perc tests out of the deliverables when the perc module is off, without touching the record', async () => {
    const r = addPercTest(record(), '2');
    const before = JSON.stringify(r);
    const files = await generate(r, templates, { percTests: false });
    expect(files.some((f) => f.kind.startsWith('perc-test'))).toBe(false);
    expect(files.map((f) => f.kind)).toContain('soil-log-pdf');
    const json = JSON.parse(new TextDecoder().decode(files.find((f) => f.kind === 'field-record-json')!.bytes));
    expect(json.percTests).toHaveLength(2);
    expect(JSON.stringify(r)).toBe(before);
  });
});

/** Note rows the generator inserted under the readings (text merged across the form). */
function noteRows(ws: ExcelJS.Worksheet) {
  let n = 0;
  for (let r = t.firstRow; r < 200; r++) {
    const c = ws.getCell(`B${r}`);
    if (typeof c.value === 'string' && c.isMerged && ws.getCell(`K${r}`).isMerged && c.master.address === `B${r}`) n++;
  }
  return n;
}
