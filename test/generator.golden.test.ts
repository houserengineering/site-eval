// Golden comparison: historical Houser soil logs re-entered in the app must generate the
// submitted cell text, or differ only where a documented improvement says why.
// GOLDEN_REPORT=<file.md> writes the side-by-side diff report.
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { addHorizon, addTestPit, newSiteEvaluation } from '../src/domain/fieldRecord';
import { generate } from '../src/generator';
import { GOLDEN_JOBS, type GoldenJob } from './golden/jobs';
import { loadTemplatesFromDisk } from './templates';

const templates = loadTemplatesFromDisk();
const t = templates.soilLog.spec.horizonTable;
const COLS = ['designation', 'depth', 'color', 'texture', 'structure', 'roots', 'mottling', 'notes'] as const;
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();
const report: string[] = [];

async function generatedRows(job: GoldenJob) {
  let r = newSiteEvaluation({ projectNumber: '0000.000', projectName: `Golden job ${job.id}` });
  for (const p of job.pits) {
    r = addTestPit(r, p.label);
    const pitId = r.testPits.at(-1)!.id;
    for (const h of p.horizons) r = addHorizon(r, pitId, h);
  }
  const file = (await generate(r, templates)).find((f) => f.kind === 'soil-log-xlsx')!;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.bytes as any);
  return job.pits.map((p, i) =>
    p.horizons.map((_, row) => COLS.map((c) => String(wb.worksheets[i].getRow(t.firstRow + row).getCell(t.columns[c]).value ?? ''))),
  );
}

describe.each(GOLDEN_JOBS)('golden job $id', (job) => {
  it('generates the expected cells, and every difference from the submitted log is explained', async () => {
    const got = await generatedRows(job);
    report.push(`## Job ${job.id}\n\n${job.description}\n`);
    job.pits.forEach((p, i) => {
      expect(got[i], `pit ${p.label}`).toEqual(p.expected);
      report.push(`### Test pit ${p.label}\n\n| Row | Column | Submitted | Generated | Why |\n|---|---|---|---|---|`);
      let same = 0;
      p.expected.forEach((row, ri) =>
        row.forEach((cell, ci) => {
          const key = `${ri},${ci}`;
          const differs = norm(cell) !== norm(p.historical[ri][ci]);
          if (differs) {
            expect(p.reasons[key], `pit ${p.label} ${key} differs without a reason: "${p.historical[ri][ci]}" → "${cell}"`).toBeTruthy();
            report.push(`| ${ri + 1} | ${COLS[ci].toUpperCase()} | ${p.historical[ri][ci] || '(blank)'} | ${cell || '(blank)'} | ${p.reasons[key]} |`);
          } else {
            expect(p.reasons[key], `pit ${p.label} ${key} has a reason but matches`).toBeUndefined();
            same++;
          }
        }),
      );
      report.push(`\n${same} of ${p.expected.length * COLS.length} cells identical to the submitted log (ignoring case and spacing).\n`);
    });
  });
});

afterAll(() => {
  if (process.env.GOLDEN_REPORT) writeFileSync(process.env.GOLDEN_REPORT, `# Golden soil log comparison\n\n${report.join('\n')}\n`);
});
