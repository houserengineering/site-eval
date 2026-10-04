import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { addHorizon, addTestPit, confirmHeaderField, migrate, newSiteEvaluation, SCHEMA_VERSION, updateHeader, updateTestPit } from '../src/domain/fieldRecord';
import { pitStatus } from '../src/domain/soilLogText';
import { lonLatToPx, pxToLonLat, type Georef } from '../src/domain/georef';
import { readJob } from '../src/domain/job';
import { generate } from '../src/generator';
import { locationPanel } from '../src/generator/locationPanel';
import { loadTemplatesFromDisk } from './templates';
import { FEATURES } from '../src/app/features';

const templates = loadTemplatesFromDisk();

// Synthetic map: 1000×800 px, north up, ~0.25 m/px near 45.6° N (the public repo holds no client data).
const georef: Georef = {
  pxToLonLat: [3.2e-6, 0, -111.1, 0, -2.25e-6, 45.62],
  method: 'synthetic',
  controlPoints: 12,
  rmsFt: 1.2,
  p95Ft: 2.3,
  maxFt: 2.5,
};

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function job() {
  return {
    kind: 'site-eval-job',
    version: 1,
    header: { projectNumber: '0999.001', projectName: 'Example Subdivision', location: '100 Example Road', evalBy: 'Test Evaluator', date: '2026-10-02', confirmationNumber: 'SE 00001', ownerName: 'Example LLC' },
    unconfirmed: { confirmationNumber: 'Not found in any county document.' },
    deliverableFolder: '0999\\site evaluation\\',
    testPits: [
      { label: '1', planned: { lat: 45.619, lon: -111.099 } },
      { label: '2', planned: { lat: 45.6185, lon: -111.0985 } },
    ],
    map: {
      title: 'Test Pit Map',
      source: 'example.pdf',
      mimeType: 'image/png',
      width: 1000,
      height: 800,
      image: PNG_1PX,
      pins: [
        { label: '1', x: 312.5, y: 444.4 },
        { label: '2', x: 468.8, y: 666.7 },
      ],
      georef,
    },
  };
}

describe('georeference', () => {
  it('maps map pixels to lon/lat and back', () => {
    const [lon, lat] = pxToLonLat(georef, 500, 400);
    expect(lon).toBeCloseTo(-111.0984, 6);
    expect(lat).toBeCloseTo(45.6191, 6);
    const [x, y] = lonLatToPx(georef, lon, lat);
    expect(x).toBeCloseTo(500, 6);
    expect(y).toBeCloseTo(400, 6);
  });
});

describe('job file', () => {
  it('becomes a site evaluation with planned pits, the map and confirm-on-site flags', () => {
    const { record, mapImage } = readJob(JSON.stringify(job()));
    expect(record.header.projectNumber).toBe('0999.001');
    expect(record.header.confirmationNumber).toBe('SE 00001');
    expect(record.unconfirmed).toEqual({ confirmationNumber: 'Not found in any county document.' });
    // Job pits are pit numbers; each becomes walls A and B with the planned location (ticket 04).
    expect(record.testPits.map((p) => [p.label, p.planned])).toEqual([
      ['1A', { lat: 45.619, lon: -111.099 }],
      ['1B', { lat: 45.619, lon: -111.099 }],
      ['2A', { lat: 45.6185, lon: -111.0985 }],
      ['2B', { lat: 45.6185, lon: -111.0985 }],
    ]);
    expect(record.testPits.every((p) => p.horizons.length === 0 && p.location === null)).toBe(true);
    expect(record.siteMap).toMatchObject({ title: 'Test Pit Map', width: 1000, height: 800, imageId: mapImage!.id, georef });
    expect(record.siteMap!.pins).toHaveLength(2);
    expect(record.deliverableFolder).toBe('0999\\site evaluation\\');
    expect(mapImage!.blob.type).toBe('image/png');
    expect(mapImage!.blob.size).toBeGreaterThan(50);
  });

  it('labels this wall on the location map by its exact name (TP1A, not TP 1)', () => {
    const { record } = readJob(JSON.stringify(job()));
    const measure = (text: string, _font: string, size: number) => text.length * size * 0.55;
    const box = { x: 0, y: 0, w: 280, h: 200 };
    const labels = (label: string, bytes?: Uint8Array) =>
      locationPanel(box, record.testPits.find((p) => p.label === label)!, record, bytes, measure)
        .filter((o: any) => o.k === 'text' && /^TP/.test(o.text))
        .map((o: any) => o.text);
    const png = new Uint8Array(Buffer.from(PNG_1PX, 'base64'));
    expect(labels('1A', png)).toEqual(['TP1A']);
    expect(labels('2B', png)).toEqual(['TP2B']);
    // No map image: the to-scale plan names this wall the same way.
    expect(labels('1B')).toContain('TP1B');
  });

  it('rejects files that are not job files', () => {
    expect(() => readJob('{"kind":"something-else"}')).toThrow(/not a site evaluation job file/i);
    expect(() => readJob('not json')).toThrow(/not a site evaluation job file/i);
    expect(() => readJob(JSON.stringify({ ...job(), version: 99 }))).toThrow(/newer/);
  });
});

describe('confirm-on-site flags', () => {
  const soilLogCell = async (r: ReturnType<typeof newSiteEvaluation>) => {
    const files = await generate(r, templates);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files.find((f) => f.kind === 'soil-log-xlsx')!.bytes as any);
    return wb.worksheets[0].getCell(templates.soilLog.spec.inputs.confirmationNumber).value;
  };

  it('preserves the entire entered confirmation field in backups and every soil-log sheet', async () => {
    let { record } = readJob(JSON.stringify(job()));
    record = updateHeader(record, { confirmationNumber: 'SE CONFIRM 00001' });
    const files = await generate(record, templates);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files.find((f) => f.kind === 'soil-log-xlsx')!.bytes as any);
    for (const sheet of wb.worksheets) expect(sheet.getCell(templates.soilLog.spec.inputs.confirmationNumber).value).toBe('SE CONFIRM 00001');
    const json = files.find((f) => f.kind === 'field-record-json')!;
    expect(JSON.parse(new TextDecoder().decode(json.bytes)).header.confirmationNumber).toBe('SE CONFIRM 00001');
  });

  // Off on live main (src/app/features.ts); runs on the beta branch.
  it.skipIf(!FEATURES.UNCONFIRMED_MARKS)('marks an unconfirmed value on deliverables until it is confirmed, and blocks nothing', async () => {
    let { record } = readJob(JSON.stringify(job()));
    record = addHorizon(record, record.testPits[0].id, { designation: 'A', bottomIn: 12 });
    expect(await soilLogCell(record)).toBe('SE 00001 (UNCONFIRMED)');
    const json = (await generate(record, templates)).find((f) => f.kind === 'field-record-json')!;
    expect(JSON.parse(new TextDecoder().decode(json.bytes)).header.confirmationNumber).toBe('SE 00001');
    const confirmed = confirmHeaderField(record, 'confirmationNumber');
    expect(confirmed.unconfirmed).toEqual({});
    expect(await soilLogCell(confirmed)).toBe('SE 00001');
  });

  it.skipIf(FEATURES.UNCONFIRMED_MARKS)('prints office-prefilled values plainly while the marks are off', async () => {
    let { record } = readJob(JSON.stringify(job()));
    record = addHorizon(record, record.testPits[0].id, { designation: 'A', bottomIn: 12 });
    expect(Object.keys(record.unconfirmed)).toContain('confirmationNumber');
    expect(await soilLogCell(record)).toBe('SE 00001');
  });

  it('keeps an unconfirmed date a date on the forms (the on-screen notice still flags it)', async () => {
    let { record } = readJob(JSON.stringify(job()));
    record = { ...record, unconfirmed: { date: 'pre-filled' } };
    const files = await generate(record, templates);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files.find((f) => f.kind === 'soil-log-xlsx')!.bytes as any);
    expect(wb.worksheets[0].getCell(templates.soilLog.spec.inputs.date).value).toBe('10/2/2026');
  });

  it('treats typing a new value as confirming it', () => {
    const { record } = readJob(JSON.stringify(job()));
    expect(updateHeader(record, { confirmationNumber: 'SE 00002' }).unconfirmed).toEqual({});
    expect(updateHeader(record, { location: 'x' }).unconfirmed).toEqual(record.unconfirmed);
  });
});

describe('test pit status', () => {
  it('is not started, in progress, or complete when nothing DEQ-4 asks for is missing', () => {
    let r = addTestPit(newSiteEvaluation(), '1');
    const id = r.testPits[0].id;
    expect(pitStatus(r.testPits[0])).toBe('not-started');
    r = addHorizon(r, id, { designation: 'A', bottomIn: 120 });
    expect(pitStatus(r.testPits[0])).toBe('in-progress');
    r = updateTestPit(r, id, {
      horizons: r.testPits[0].horizons.map((h) => ({
        ...h,
        color: { ...h.color, hue: '10YR', value: '3', chroma: '2' },
        texture: { cls: 'SILT LOAM', sandSize: '' },
        rock: { pct: 0, kind: 'ROCKS' },
        structure: { ...h.structure, grade: 'WEAK', size: 'FINE', shape: 'GRANULAR' },
        consistence: 'FRIABLE',
        plasticity: 'NONPLASTIC',
        roots: 'Y',
        mottling: { ...h.mottling, present: 'N' },
      })),
      observedWater: { kind: 'NONE', depthIn: null },
      shgw: { depthIn: 120, deeperThan: true, basis: 'No redox features' },
      limitingLayer: { type: 'NONE', depthIn: null, other: '' },
      slope: { pct: 2, shape: 'LINEAR', direction: 'N', method: 'ESTIMATED' },
      location: { lat: 45.6, lon: -111.1, accuracyM: 2, at: '2026-10-02T15:00:00Z' },
    });
    expect(pitStatus(r.testPits[0])).toBe('complete');
  });
});

describe('schema v5', () => {
  it('migrates v4 records with no map, no flags and no planned locations', () => {
    const v4 = { ...newSiteEvaluation(), schemaVersion: 4, testPits: [{ id: 'a', label: '1', horizons: [], photos: [], location: null }] } as any;
    delete v4.unconfirmed;
    delete v4.siteMap;
    delete v4.deliverableFolder;
    const r = migrate(v4);
    expect(r.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.unconfirmed).toEqual({});
    expect(r.siteMap).toBeNull();
    expect(r.deliverableFolder).toBe('');
    expect(r.testPits[0].planned).toBeNull();
  });
});

describe('walking to a pin', () => {
  it('gives distance in feet and compass direction', async () => {
    const { distanceFt, bearingText } = await import('../src/domain/georef');
    const here = { lat: 45.6, lon: -111.1 };
    const north100 = { lat: 45.6 + 100 / 3.28084 / 110_574, lon: -111.1 };
    expect(distanceFt(here, north100)).toBeCloseTo(100, 3);
    expect(bearingText(here, north100)).toBe('N');
    expect(bearingText(here, { lat: 45.5999, lon: -111.0999 })).toBe('SE');
  });
});
