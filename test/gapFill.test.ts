// Gap fill in the app (ticket 07): the generator's fill rule as suggestions, the area soils
// reference from the job file, and the review table filed with the deliverables.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { addHorizon, addPitWalls, emptyHorizon, migrate, newSiteEvaluation, type FieldRecord } from '../src/domain/fieldRecord';
import { acceptFill, areaReference, fillGaps, suggestions } from '../src/domain/fillGaps';
import { readJob } from '../src/domain/job';
import { generate } from '../src/generator';
import { loadTemplatesFromDisk } from './templates';

const templates = loadTemplatesFromDisk();
const clayLoam = { ...emptyHorizon().texture, cls: 'CLAY LOAM' };

/** Pit 1: wall A logged (B horizon, clay loam), wall B with the same horizon left blank. */
function site(): FieldRecord {
  let r = addPitWalls(newSiteEvaluation(), '1');
  const [a, b] = r.testPits;
  r = addHorizon(r, a.id, { designation: 'B', topIn: 0, bottomIn: 30, texture: clayLoam, roots: 'Y', mottling: { ...emptyHorizon().mottling, present: 'N' } });
  r = addHorizon(r, b.id, { designation: 'B', topIn: 0, bottomIn: 30 });
  return r;
}

describe('area soils reference', () => {
  const area = {
    '1': [
      { topIn: 0, bottomIn: 8, structure: 'WEAK FINE GRANULAR', source: 'NRCS soil survey 748A Hyalite A (0-8 in)' },
      { topIn: 8, bottomIn: 40, structure: 'MODERATE MEDIUM SUBANGULAR BLOCKY', source: 'NRCS soil survey 748A Hyalite Bt (8-40 in)' },
    ],
  };

  it("takes the reference horizon that overlaps the wall's horizon most, for the wall's pit", () => {
    const r = site();
    const ref = areaReference(area);
    expect(ref(r.testPits[1], r.testPits[1].horizons[0], 0)).toEqual({
      structure: 'MODERATE MEDIUM SUBANGULAR BLOCKY',
      source: 'NRCS soil survey 748A Hyalite Bt (8-40 in)',
    });
    const other = addPitWalls(newSiteEvaluation(), '2');
    const lone = addHorizon(other, other.testPits[0].id, { designation: 'B', topIn: 0, bottomIn: 30 }).testPits[0];
    expect(ref(lone, lone.horizons[0], 0)).toBeNull();
  });

  it('fills structure from the reference when no wall on site has it', () => {
    const { fills } = fillGaps(site().testPits, areaReference(area));
    expect(fills.filter((f) => f.field === 'structure').map((f) => [f.wall, f.value, f.source])).toEqual([
      ['1A', 'MODERATE MEDIUM SUBANGULAR BLOCKY', 'NRCS soil survey 748A Hyalite Bt (8-40 in)'],
      ['1B', 'MODERATE MEDIUM SUBANGULAR BLOCKY', 'NRCS soil survey 748A Hyalite Bt (8-40 in)'],
    ]);
  });

  it('comes from the job file, by pit number', () => {
    const job = { kind: 'site-eval-job', version: 1, header: {}, testPits: [{ label: '1', areaSoils: area['1'] }, { label: '2' }] };
    const { record } = readJob(JSON.stringify(job));
    expect(record.areaSoils).toEqual(area);
  });

  it('starts empty on records from before it existed', () => {
    const { areaSoils, ...v8 } = { ...newSiteEvaluation(), schemaVersion: 8 };
    expect(migrate(v8)).toMatchObject({ schemaVersion: 9, areaSoils: {} });
  });
});

describe('suggestions', () => {
  it('suggests each blank field of a wall with its source, and accepting one sets only that field', () => {
    const r = site();
    const b = r.testPits[1];
    const mine = suggestions(r).filter((s) => s.wallId === b.id);
    expect(mine.map((s) => [s.field, s.value, s.source])).toEqual([
      ['texture', 'CLAY LOAM', 'other wall (1A)'],
      ['roots', 'Y', 'other wall (1A)'],
      ['mottling', 'N', 'other wall (1A)'],
    ]);
    const tex = mine.find((s) => s.field === 'texture')!;
    expect(tex.horizonId).toBe(b.horizons[0].id);
    const next = acceptFill(r, tex);
    expect(next.testPits[1].horizons[0].texture.cls).toBe('CLAY LOAM');
    expect(next.testPits[1].horizons[0].roots).toBe('');
    expect(suggestions(next).filter((s) => s.wallId === b.id).map((s) => s.field)).toEqual(['roots', 'mottling']);
  });
});

describe('deliverables', () => {
  it('print the soil logs with the fills and file a review table of every fill', async () => {
    const files = await generate(site(), templates);
    const csv = new TextDecoder().decode(files.find((f) => f.kind === 'soil-log-fills-csv')!.bytes);
    const rows = csv.trim().split('\r\n');
    expect(rows[0]).toBe('Wall,Horizon,Field,Value,Source');
    expect(rows).toContain('1B,B 0-30,texture,CLAY LOAM,other wall (1A)');
    expect(files.find((f) => f.kind === 'soil-log-fills-csv')!.path).toBe('Soil Log Fills.csv');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files.find((f) => f.kind === 'soil-log-xlsx')!.bytes as any);
    let clay = 0;
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => void (String(c.value).includes('CLAY LOAM') && clay++))));
    expect(clay).toBe(2); // wall A as logged, wall B filled
  });

  it('use the area soils reference from the record and quote values with commas', async () => {
    const r = { ...site(), areaSoils: { '1': [{ topIn: 0, bottomIn: 96, structure: 'MASSIVE', source: 'NRCS soil survey 748A, Hyalite' }] } };
    const files = await generate(r, templates);
    const csv = new TextDecoder().decode(files.find((f) => f.kind === 'soil-log-fills-csv')!.bytes);
    expect(csv).toContain('1B,B 0-30,structure,MASSIVE,"NRCS soil survey 748A, Hyalite"\r\n');
  });
});
