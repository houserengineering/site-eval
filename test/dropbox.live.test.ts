// Real Dropbox round trip. Skipped unless DROPBOX_TOKEN_FILE names a file holding an access token
// (never commit one). Writes only under /Server/Office/Site Eval App/Live Test/.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addHorizon, addPercTest, addTestPit, newSiteEvaluation, updateTestPit } from '../src/domain/fieldRecord';
import { stampEdits } from '../src/domain/merge';
import { generate } from '../src/generator';
import { contentHash } from '../src/sync/adapter';
import { DropboxSync } from '../src/sync/dropbox';
import { fileDeliverables, syncRecord, type PhotoStore } from '../src/sync/engine';
import { fieldRecordPath } from '../src/sync/naming';
import { loadTemplatesFromDisk } from './templates';

const tokenFile = process.env.DROPBOX_TOKEN_FILE;
const photos = (): PhotoStore => {
  const m = new Map<string, Blob>();
  return { getPhoto: async (id) => m.get(id), putPhoto: async (id, _r, b) => void m.set(id, b) };
};

describe.skipIf(!tokenFile)('Dropbox live round trip', () => {
  const dropbox = new DropboxSync(async () => readFileSync(tokenFile!, 'utf8').trim());
  const folder = `/Server/Office/Site Eval App/Live Test/${new Date().toISOString().replace(/[:.]/g, '-')}`;

  it('content hash matches Dropbox for a multi-block file', async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 123).map((_, i) => (i * 7919) & 255);
    const w = await dropbox.write(`${folder}/hash-check.bin`, bytes, { ifRev: null });
    expect(w.hash).toBe(await contentHash(bytes));
    expect((await dropbox.read(`${folder}/hash-check.bin`))!.bytes.length).toBe(bytes.length);
  }, 120_000);

  it('two devices sync, merge and file real deliverables; foreign files are left alone', async () => {
    const A = { adapter: dropbox, photos: photos(), who: 'Nathan (live test)' };
    const B = { adapter: dropbox, photos: photos(), who: 'Justin (live test)' };
    let r = { ...newSiteEvaluation({ projectNumber: '0999.001', projectName: 'Live Test', evalBy: 'Test' }), deliverableFolder: folder };
    r = addPercTest(addTestPit(addTestPit(r, '1'), '2'), '1');
    let a = (await syncRecord(r, A)).record;
    let b = (await syncRecord(a, B)).record;
    a = stampEdits(a, addHorizon(a, a.testPits[0].id, { designation: 'A', bottomIn: 10 }), A.who);
    b = stampEdits(b, updateTestPit(b, b.testPits[1].id, { notes: 'FROM B' }), B.who);
    a = (await syncRecord(a, A)).record;
    b = (await syncRecord(b, B)).record;
    expect(b.testPits[0].horizons[0].designation).toBe('A');
    expect(b.testPits[1].notes).toBe('FROM B');
    expect((await dropbox.stat(fieldRecordPath(b)))!.path).toBe(fieldRecordPath(b));

    // Someone already saved a soil log here: the app must not touch it.
    const foreign = await dropbox.write(`${folder}/Soil Logs.pdf`, new TextEncoder().encode('office file'), { ifRev: null });
    const files = await generate(b, loadTemplatesFromDisk());
    const out = await fileDeliverables(b, files, B);
    expect(Object.fromEntries(out.results.map((x) => [x.path.slice(folder.length + 1), x.status]))).toEqual({
      'Soil Logs.xlsx': 'written',
      'Soil Logs (Site Eval App).pdf': 'renamed',
      'Percolation Tests.xlsx': 'written',
      'Percolation Tests.pdf': 'written',
      'Site Evaluation.pdf': 'written',
    });
    expect((await dropbox.stat(`${folder}/Soil Logs.pdf`))!.rev).toBe(foreign.rev);
    const listed = (await dropbox.list(folder)).map((e) => e.name);
    expect(listed).toEqual(expect.arrayContaining(['Site Eval App', 'Soil Logs.xlsx', 'Site Evaluation.pdf']));
    const back = await dropbox.read(`${folder}/Site Evaluation.pdf`);
    expect(back!.file.hash).toBe(await contentHash(files.find((f) => f.kind === 'site-evaluation-pdf')!.bytes));
    await syncRecord(out.record, B);
    console.log(`live round trip OK in ${folder}`);
  }, 180_000);
});
