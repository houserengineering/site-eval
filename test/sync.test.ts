import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addHorizon, addTestPit, newSiteEvaluation, updateTestPit, type FieldRecord } from '../src/domain/fieldRecord';
import { stampEdits } from '../src/domain/merge';
import type { GeneratedFile } from '../src/generator';
import { contentHash, FakeSync, OfflineError } from '../src/sync/adapter';
import { fileDeliverables, sendToPrintQueue, syncRecord, type PhotoStore } from '../src/sync/engine';
import { alternatePath, dropboxFolder, fieldRecordPath, printQueuePath } from '../src/sync/naming';

const FOLDER = '0999\\Engineering\\Permitting\\DEQ Application\\supporting documents\\site evaluation\\';
const DBX = '/Server/0999/Engineering/Permitting/DEQ Application/supporting documents/site evaluation';

const photoStore = (): PhotoStore & { blobs: Map<string, Blob> } => {
  const blobs = new Map<string, Blob>();
  return { blobs, getPhoto: async (id) => blobs.get(id), putPhoto: async (id, _r, b) => void blobs.set(id, b) };
};
const record = () => {
  let r = { ...newSiteEvaluation({ projectNumber: '0999.001' }), deliverableFolder: FOLDER };
  for (const l of ['1', '2']) r = addTestPit(r, l);
  return r;
};
const file = (kind: GeneratedFile['kind'], text: string): GeneratedFile => ({ kind, path: '', bytes: new TextEncoder().encode(text), mimeType: '' });
const pit = (r: FieldRecord, label: string) => r.testPits.find((p) => p.label === label)!;

describe('naming', () => {
  it('turns pasted server paths into Dropbox paths', () => {
    expect(dropboxFolder(FOLDER)).toBe(DBX);
    expect(dropboxFolder('S:\\0999\\Engineering\\Permitting\\DEQ Application\\supporting documents\\site evaluation')).toBe(DBX);
    expect(dropboxFolder('C:\\Users\\HouserEngineering\\Dropbox\\Server\\0999\\Engineering\\Permitting\\DEQ Application\\supporting documents\\site evaluation\\')).toBe(DBX);
    expect(dropboxFolder(`${DBX}/`)).toBe(DBX);
    expect(dropboxFolder('  ')).toBe('');
  });

  it('names the synced record by id, alternates and print jobs predictably', () => {
    const r = record();
    expect(fieldRecordPath(r)).toBe(`${DBX}/Site Eval App/Field Record ${r.id.slice(0, 8)}.json`);
    expect(alternatePath(`${DBX}/Soil Logs.xlsx`)).toBe(`${DBX}/Soil Logs (Site Eval App).xlsx`);
    expect(printQueuePath(r, 'site-evaluation-pdf', new Date(2026, 9, 2, 14, 5, 9))).toBe('/Server/Office/Site Eval App/Print Queue/0999.001 Site Evaluation 2026-10-02 140509.pdf');
  });

  it('computes the Dropbox content hash (published test vector: empty file)', async () => {
    expect(await contentHash(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('two devices syncing one site evaluation', () => {
  it('merges edits to different pits and the same pit through Dropbox', async () => {
    const dropbox = new FakeSync();
    const phoneA = { adapter: dropbox, photos: photoStore(), who: 'Nathan' };
    const phoneB = { adapter: dropbox, photos: photoStore(), who: 'Justin' };

    // A uploads; B opens it from Dropbox.
    let a = (await syncRecord(record(), phoneA)).record;
    let b = (await syncRecord(a, phoneB)).record;

    // Offline edits on both phones: different pits, and the same pit's notes (B later).
    a = stampEdits(a, addHorizon(a, pit(a, '1').id, { designation: 'A', bottomIn: 12 }), 'Nathan', '2026-10-02T15:00:00Z');
    a = stampEdits(a, updateTestPit(a, pit(a, '2').id, { notes: 'A NOTE' }), 'Nathan', '2026-10-02T15:01:00Z');
    b = stampEdits(b, updateTestPit(b, pit(b, '2').id, { notes: 'B NOTE', totalDepthIn: 96 }), 'Justin', '2026-10-02T15:02:00Z');

    a = (await syncRecord(a, phoneA)).record;
    const bSync = await syncRecord(b, phoneB);
    expect(bSync.pulled).toBe(true);
    b = bSync.record;
    a = (await syncRecord(a, phoneA)).record;

    for (const r of [a, b]) {
      expect(pit(r, '1').horizons.map((h) => h.designation)).toEqual(['A']);
      expect(pit(r, '2').notes).toBe('B NOTE');
      expect(pit(r, '2').totalDepthIn).toBe(96);
    }
    expect((await syncRecord(a, phoneA)).pulled).toBe(false);
  });

  it('two devices that both edited settle: no endless rewrites', async () => {
    const dropbox = new FakeSync();
    const A = { adapter: dropbox, photos: photoStore(), who: 'Nathan' };
    const B = { adapter: dropbox, photos: photoStore(), who: 'Justin' };
    let a = (await syncRecord(record(), A)).record;
    let b = (await syncRecord(a, B)).record;
    a = stampEdits(a, updateTestPit(a, pit(a, '1').id, { notes: 'a' }), 'Nathan', '2026-10-02T15:00:00Z');
    a = stampEdits(a, updateTestPit(a, pit(a, '2').id, { notes: 'a2' }), 'Nathan', '2026-10-02T15:00:01Z');
    b = stampEdits(b, updateTestPit(b, pit(b, '2').id, { totalDepthIn: 90 }), 'Justin', '2026-10-02T15:00:02Z');
    b = stampEdits(b, updateTestPit(b, pit(b, '1').id, { totalDepthIn: 80 }), 'Justin', '2026-10-02T15:00:03Z');
    for (let i = 0; i < 2; i++) {
      a = (await syncRecord(a, A)).record;
      b = (await syncRecord(b, B)).record;
    }
    const before = dropbox.writes.length;
    a = (await syncRecord(a, A)).record;
    b = (await syncRecord(b, B)).record;
    expect(dropbox.writes.length).toBe(before);
  });

  it('mirrors pit photos and the map image to the other device', async () => {
    const dropbox = new FakeSync();
    const A = { adapter: dropbox, photos: photoStore(), who: 'Nathan' };
    const B = { adapter: dropbox, photos: photoStore(), who: 'Justin' };
    let r = record();
    r = updateTestPit(r, pit(r, '1').id, { photos: [{ id: 'p1', takenAt: '', width: 1, height: 1 }] });
    await A.photos.putPhoto('p1', r.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    await syncRecord(r, A);
    expect(dropbox.files.has(`${DBX}/Site Eval App/Photos/p1.jpg`.toLowerCase())).toBe(true);
    await syncRecord(r, B);
    expect(new Uint8Array(await (await B.photos.getPhoto('p1'))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('retries when the other device writes between read and write', async () => {
    const dropbox = new FakeSync();
    const A = { adapter: dropbox, photos: photoStore(), who: 'Nathan' };
    const base = (await syncRecord(record(), A)).record;
    const other = stampEdits(base, updateTestPit(base, pit(base, '1').id, { notes: 'B' }), 'Justin', '2026-10-02T15:00:00Z');
    const mine = stampEdits(base, updateTestPit(base, pit(base, '2').id, { notes: 'A' }), 'Nathan', '2026-10-02T15:00:01Z');
    // Interleave: B's write lands right after A reads.
    const read = dropbox.read.bind(dropbox);
    let once = true;
    dropbox.read = async (p) => {
      const got = await read(p);
      if (once) {
        once = false;
        await syncRecord(other, { adapter: new Proxy(dropbox, {}) as FakeSync, photos: photoStore(), who: 'Justin' });
      }
      return got;
    };
    const merged = (await syncRecord(mine, A)).record;
    expect([pit(merged, '1').notes, pit(merged, '2').notes]).toEqual(['B', 'A']);
  });

  it('offline: the sync fails with OfflineError and nothing is lost', async () => {
    const dropbox = new FakeSync();
    dropbox.offline = true;
    await expect(syncRecord(record(), { adapter: dropbox, photos: photoStore(), who: 'N' })).rejects.toBeInstanceOf(OfflineError);
  });

  it('refuses to sync before a folder is chosen', async () => {
    await expect(syncRecord(newSiteEvaluation(), { adapter: new FakeSync(), photos: photoStore(), who: 'N' })).rejects.toThrow(/Choose the Dropbox folder/);
  });
});

describe('filing deliverables', () => {
  const ctx = (dropbox = new FakeSync()) => ({ adapter: dropbox, photos: photoStore(), who: 'Nathan' });

  it('writes the conventional names, then replaces only its own unchanged files', async () => {
    const c = ctx();
    const r = record();
    let out = await fileDeliverables(r, [file('soil-log-xlsx', 'v1'), file('soil-log-pdf', 'v1'), file('field-record-json', '{}')], c);
    expect(out.results).toEqual([
      { kind: 'soil-log-xlsx', path: `${DBX}/Soil Logs.xlsx`, status: 'written' },
      { kind: 'soil-log-pdf', path: `${DBX}/Soil Logs.pdf`, status: 'written' },
    ]);
    out = await fileDeliverables(out.record, [file('soil-log-xlsx', 'v1'), file('soil-log-pdf', 'v2')], c);
    expect(out.results.map((x) => x.status)).toEqual(['unchanged', 'written']);
    expect(new TextDecoder().decode((await c.adapter.read(`${DBX}/Soil Logs.pdf`))!.bytes)).toBe('v2');
  });

  it('never overwrites a file it did not write: files beside it instead', async () => {
    const c = ctx();
    await c.adapter.write(`${DBX}/Soil Logs.xlsx`, new TextEncoder().encode("Justin's"));
    const out = await fileDeliverables(record(), [file('soil-log-xlsx', 'app')], c);
    expect(out.results).toEqual([{ kind: 'soil-log-xlsx', path: `${DBX}/Soil Logs (Site Eval App).xlsx`, status: 'renamed' }]);
    expect(new TextDecoder().decode((await c.adapter.read(`${DBX}/Soil Logs.xlsx`))!.bytes)).toBe("Justin's");
    // Later filings keep using the alternate name.
    const again = await fileDeliverables(out.record, [file('soil-log-xlsx', 'app 2')], c);
    expect(again.results[0]).toMatchObject({ path: `${DBX}/Soil Logs (Site Eval App).xlsx`, status: 'renamed' });
    expect(new TextDecoder().decode((await c.adapter.read(`${DBX}/Soil Logs (Site Eval App).xlsx`))!.bytes)).toBe('app 2');
  });

  it('stops replacing its own file once someone in the office edits it', async () => {
    const c = ctx();
    const first = await fileDeliverables(record(), [file('perc-test-xlsx', 'app')], c);
    await c.adapter.write(`${DBX}/Percolation Tests.xlsx`, new TextEncoder().encode('edited in Excel'));
    const out = await fileDeliverables(first.record, [file('perc-test-xlsx', 'app 2')], c);
    expect(out.results[0]).toMatchObject({ path: `${DBX}/Percolation Tests (Site Eval App).xlsx`, status: 'renamed' });
    expect(new TextDecoder().decode((await c.adapter.read(`${DBX}/Percolation Tests.xlsx`))!.bytes)).toBe('edited in Excel');
  });

  it('reports a deliverable it cannot file without touching anyone else’s files', async () => {
    const c = ctx();
    await c.adapter.write(`${DBX}/Soil Logs.pdf`, new TextEncoder().encode('x'));
    await c.adapter.write(`${DBX}/Soil Logs (Site Eval App).pdf`, new TextEncoder().encode('y'));
    const out = await fileDeliverables(record(), [file('soil-log-pdf', 'app')], c);
    expect(out.results[0].status).toBe('blocked');
    expect(c.adapter.writes).toEqual([`${DBX}/Soil Logs.pdf`, `${DBX}/Soil Logs (Site Eval App).pdf`]);
  });

  it('a second device recognises files the first one filed, once the record syncs', async () => {
    const dropbox = new FakeSync();
    const A = ctx(dropbox);
    const B = { ...ctx(dropbox), who: 'Justin' };
    const r = (await syncRecord(record(), A)).record;
    const filedA = (await fileDeliverables(r, [file('soil-log-pdf', 'A')], A)).record;
    await syncRecord(filedA, A);
    const b = (await syncRecord(r, B)).record;
    const out = await fileDeliverables(b, [file('soil-log-pdf', 'B')], B);
    expect(out.results[0]).toMatchObject({ path: `${DBX}/Soil Logs.pdf`, status: 'written' });
  });

  it('print at office drops time-stamped PDFs in the print queue', async () => {
    const c = ctx();
    const sent = await sendToPrintQueue(record(), [file('site-evaluation-pdf', 'pdf'), file('soil-log-pdf', 'x')], ['site-evaluation-pdf'], c, new Date(2026, 9, 2, 9, 30, 0));
    expect(sent).toEqual(['/Server/Office/Site Eval App/Print Queue/0999.001 Site Evaluation 2026-10-02 093000.pdf']);
  });
});
