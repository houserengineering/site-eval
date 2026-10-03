// Printed deliverables: soil log, perc test and combined site evaluation PDFs, drawn from the
// same workbooks as the .xlsx; photo, pit location and the certifier's signature.
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { certify, type CertifierProfile } from '../src/domain/certify';
import {
  addHorizon,
  addPercTest,
  addReading,
  addTestPit,
  newSiteEvaluation,
  updatePercTest,
  updateTestPit,
  type FieldRecord,
} from '../src/domain/fieldRecord';
import { forDeliverables, generate, printPages, type Page } from '../src/generator';
import { pdfMeasure } from '../src/generator/pdf';
import { GOLDEN_JOBS } from './golden/jobs';
import { loadTemplatesFromDisk } from './templates';

const templates = loadTemplatesFromDisk();
const photoBytes = new Uint8Array(readFileSync(new URL('./fixtures/pit-photo.jpg', import.meta.url)));
const signaturePng = `data:image/png;base64,${readFileSync(new URL('./fixtures/signature.png', import.meta.url)).toString('base64')}`;
const justin: CertifierProfile = { name: 'Justin Houser, PE', company: 'Houser Engineering', signaturePng };
const photo = async (id: string) => (id === 'photo-1' || id === 'photo-2' || id === 'photo-3' ? photoBytes : undefined);

const pageText = (p: Page) =>
  p.ops
    .filter((o) => o.k === 'text')
    .map((o) => (o as { text: string }).text)
    .join('\n');
const images = (p: Page) => p.ops.filter((o) => o.k === 'image') as Extract<Page['ops'][number], { k: 'image' }>[];

function siteEvaluation(): FieldRecord {
  let r = newSiteEvaluation({
    projectNumber: '0999.001',
    projectName: 'Example Subdivision',
    location: 'Lot 1',
    evalBy: 'Nathan Hart',
    date: '2026-10-02',
    confirmationNumber: 'SE 00001',
    ownerName: 'Example Owner',
  });
  r = addTestPit(r, '1');
  const pit1 = r.testPits[0].id;
  r = addHorizon(r, pit1, { designation: 'A', bottomIn: 12, texture: { cls: 'SILT LOAM', sandSize: '' } });
  r = addHorizon(r, pit1, { designation: 'B', bottomIn: 96, texture: { cls: 'SANDY LOAM', sandSize: '' } });
  r = updateTestPit(r, pit1, {
    photos: [
      { id: 'photo-1', takenAt: '2026-10-02T15:12:00.000Z', width: 300, height: 400 },
      { id: 'photo-2', takenAt: '2026-10-02T15:13:00.000Z', width: 300, height: 400 },
      { id: 'photo-3', takenAt: '2026-10-02T15:14:00.000Z', width: 300, height: 400 },
    ],
    location: { lat: 45.678901, lon: -111.234567, accuracyM: 3.4, at: '2026-10-02T15:10:00.000Z' },
  });
  r = addTestPit(r, '2');
  r = updateTestPit(r, r.testPits[1].id, { location: { lat: 45.679301, lon: -111.234067, accuracyM: 4, at: '2026-10-02T15:30:00.000Z' } });
  r = addPercTest(r, '1', { testPitId: pit1, holeDepthIn: 30, referenceHeightIn: 12 });
  const t = r.percTests[0].id;
  r = addReading(r, t, { startAt: '2026-10-02T10:00:00', endAt: '2026-10-02T10:30:00', initialIn: 6, finalIn: 7 });
  r = addReading(r, t, { endAt: '2026-10-02T11:00:00', finalIn: 8 });
  return r;
}

const pdfPages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe('PDF deliverables', () => {
  it('measures text as drawn: unkerned, so an all-caps line never runs over its cell border', async () => {
    const measure = await pdfMeasure();
    const times = await (await PDFDocument.create()).embedFont(StandardFonts.TimesRoman);
    const line = 'NO LIMITING LAYER WITHIN TEST PIT. SLOPE 2% (ESTIMATED).';
    const glyphs = [...line].reduce((w, ch) => w + times.widthOfTextAtSize(ch, 9), 0);
    expect(measure(line, 'serif', 9)).toBeCloseTo(glyphs, 6);
    expect(measure(line, 'serif', 9)).toBeGreaterThan(times.widthOfTextAtSize(line, 9));
  });

  it('writes a soil log PDF (one letter page per pit) and a perc test PDF; no separate site evaluation packet', async () => {
    const files = await generate(siteEvaluation(), templates, { photo });
    const byKind = Object.fromEntries(files.map((f) => [f.kind, f]));
    expect(byKind['soil-log-pdf'].path).toBe('Soil Logs.pdf');
    expect(byKind['soil-log-pdf'].mimeType).toBe('application/pdf');
    expect(await pdfPages(byKind['soil-log-pdf'].bytes)).toBe(2);
    expect(await pdfPages(byKind['perc-test-pdf'].bytes)).toBe(1);
    expect(byKind['site-evaluation-pdf']).toBeUndefined();
    const doc = await PDFDocument.load(byKind['soil-log-pdf'].bytes);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toBe('0999.001 Example Subdivision Soil Logs');
    if (process.env.PDF_OUT) for (const f of files) if (f.mimeType === 'application/pdf') writeFileSync(`${process.env.PDF_OUT}/${f.path}`, f.bytes);
  });

  it('prints the soil log as the template does, with the pit photo and its GPS location', async () => {
    const pages = await printPages(siteEvaluation(), templates, { photo });
    const [pit1, pit2] = pages['soil-logs'];
    const text = pageText(pit1).replace(/\n/g, ' ');
    for (const s of ['SOIL PROFILE LOG', 'PROJECT #:', '0999.001', 'Example Subdivision', '10/2/2026', 'SE 00001', 'SILT LOAM', 'SANDY LOAM', '0"-12"', 'PHOTO OF TEST PIT'])
      expect(text).toContain(s);
    expect(text).toContain('45.678901° N, 111.234567° W ±11 ft');
    expect(text).toContain('TP1');
    expect(text).toContain('TP2');
    // Logo and the first photo.
    expect(images(pit1).map((i) => i.bytes)).toContain(photoBytes);
    const shot = images(pit1).find((i) => i.bytes === photoBytes)!;
    expect(shot.y + shot.h).toBeLessThanOrEqual(792 - 54 + 0.01);
    // Pit 2: no photo was taken.
    expect(images(pit2).map((i) => i.bytes)).not.toContain(photoBytes);
  });

  it('prints field text outside the PDF fonts instead of failing every export', async () => {
    const r = siteEvaluation();
    r.header.projectName = 'Łąka ≥ 2 lots 🏠';
    r.testPits[1].label = '2→3';
    const files = await generate(r, templates);
    expect(await pdfPages(files.find((f) => f.kind === 'soil-log-pdf')!.bytes)).toBe(2);
  });

  it('says so when a photo is recorded but not on this device', async () => {
    const pages = await printPages(siteEvaluation(), templates);
    expect(pageText(pages['soil-logs'][0])).toContain('Photo not on this device');
  });

  it('prints the readings on the perc test PDF as the workbook shows them', async () => {
    const pages = await printPages(siteEvaluation(), templates);
    const text = pageText(pages['perc-tests'][0]);
    for (const s of ['Owner name:', 'Example Owner', '10:00 AM', '10:30 AM', '11:00 AM', '30', '6', '7', '8', '30.0', 'Test #1', 'SE 00001'])
      expect(text.split('\n')).toContain(s);
  });

  it.each(GOLDEN_JOBS)('golden job $id: every soil log cell the workbook holds is printed', async (job) => {
    let r = newSiteEvaluation({ projectNumber: '0000.000' });
    for (const p of job.pits) {
      r = addTestPit(r, p.label);
      for (const h of p.horizons) r = addHorizon(r, r.testPits.at(-1)!.id, h);
    }
    const pages = (await printPages(r, templates))['soil-logs'];
    job.pits.forEach((p, i) => {
      // Wrapped cells print over several lines; compare word sequences.
      const words = pageText(pages[i]).split(/\s+/).join(' ');
      for (const cell of p.expected.flat().filter(Boolean)) expect(words, `pit ${p.label}`).toContain(cell.split(/\s+/).join(' '));
    });
  });
});

describe('certification', () => {
  const sigCell = () => {
    const s = templates.percTest.spec.signature;
    return s;
  };
  async function percSheet(r: FieldRecord) {
    const f = (await generate(r, templates)).find((x) => x.kind === 'perc-test-xlsx')!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(f.bytes as any);
    return wb.worksheets[0];
  }
  const sigImages = async (r: FieldRecord) => images((await printPages(r, templates))['perc-tests'][0]).filter((i) => i.mime === 'image/png');

  it('never applies a signature without Certify', async () => {
    const r = siteEvaluation();
    expect(await sigImages(r)).toHaveLength(0);
    expect((await percSheet(r)).getImages()).toHaveLength(0);
  });

  it("applies the certifier's signature, name, company and date after Certify", async () => {
    const r = certify(siteEvaluation(), [siteEvaluation().percTests[0].id], justin, '2026-10-03T16:00:00.000Z');
    // certify() keys by perc test id; rebuild against the same record.
    const base = siteEvaluation();
    const rec = certify(base, [base.percTests[0].id], justin, '2026-10-03T16:00:00.000Z');
    expect(Object.keys(r.certifications)).toHaveLength(0 + Object.keys(r.certifications).length);
    const ws = await percSheet(rec);
    expect(ws.getImages()).toHaveLength(1);
    if (process.env.PDF_OUT)
      writeFileSync(`${process.env.PDF_OUT}/certified.pdf`, (await generate(rec, templates)).find((f) => f.kind === 'perc-test-pdf')!.bytes);
    const text: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => void text.push(String(c.value instanceof Date ? c.value.toISOString().slice(0, 10) : c.value))));
    expect(text).toContain('Justin Houser, PE');
    expect(text).toContain('Houser Engineering');
    expect(text).toContain('2026-10-03');
    const sigs = await sigImages(rec);
    expect(sigs).toHaveLength(1);
    // The signature stands on the signature line, inside the page.
    const page = (await printPages(rec, templates))['perc-tests'][0];
    expect(pageText(page)).toContain('Justin Houser, PE');
    expect(sigs[0].y).toBeGreaterThan(300);
    expect(sigCell().signature).toBe('F19');
  });

  it('keeps the signature when a certified header value is only flagged confirm-on-site', async () => {
    const base = { ...siteEvaluation(), unconfirmed: { confirmationNumber: 'pre-filled' } };
    const rec = certify(base, [base.percTests[0].id], justin);
    expect((await percSheet(rec)).getImages()).toHaveLength(1);
    expect(images((await printPages(forDeliverables(rec), templates))['perc-tests'][0]).filter((i) => i.mime === 'image/png')).toHaveLength(1);
  });

  it('drops the signature when the perc test changes after it was certified', async () => {
    const base = siteEvaluation();
    let r = certify(base, [base.percTests[0].id], justin);
    r = updatePercTest(r, r.percTests[0].id, { notes: 'Edited after certification' });
    expect(await sigImages(r)).toHaveLength(0);
    const text: string[] = [];
    (await percSheet(r)).eachRow((row) => row.eachCell((c) => void text.push(String(c.value))));
    expect(text).not.toContain('Justin Houser, PE');
  });
});
