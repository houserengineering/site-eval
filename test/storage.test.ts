import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addTestPit, newSiteEvaluation, SCHEMA_VERSION } from '../src/domain/fieldRecord';
import { openDB } from 'idb';
import { openStore } from '../src/storage/db';

describe('on-device storage', () => {
  it('saves and reloads a field record with header values as text', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    const r = addTestPit(newSiteEvaluation({ projectNumber: '0999.001', confirmationNumber: 'SE 00001' }), '3B');
    await store.save(r);
    const back = await store.get(r.id);
    expect(back).toEqual(r);
    expect(back!.header.projectNumber).toBe('0999.001');
    expect((await store.list()).records.map((x) => x.id)).toEqual([r.id]);
  });

  it('lists newest first and deletes', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    const a = { ...newSiteEvaluation(), updatedAt: '2026-10-01T00:00:00.000Z' };
    const b = { ...newSiteEvaluation(), updatedAt: '2026-10-02T00:00:00.000Z' };
    await store.save(a);
    await store.save(b);
    expect((await store.list()).records.map((x) => x.id)).toEqual([b.id, a.id]);
    await store.remove(b.id);
    expect((await store.list()).records.map((x) => x.id)).toEqual([a.id]);
  });

  it('refuses a record from a newer schema instead of corrupting it', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    const r = { ...newSiteEvaluation(), schemaVersion: SCHEMA_VERSION + 1 } as any;
    await store.saveRaw(r);
    await expect(store.get(r.id)).rejects.toThrow(/newer than this app/);
    const ok = newSiteEvaluation();
    await store.save(ok);
    const { records, unreadable } = await store.list();
    expect(records.map((x) => x.id)).toEqual([ok.id]);
    expect(unreadable).toEqual([{ id: r.id, error: expect.stringMatching(/newer than this app/) }]);
  });

  it('upgrades a v1 record (plain-text horizons) without losing what was typed', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    const v1 = {
      schemaVersion: 1, id: 'old', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
      header: { projectNumber: '0999.001', projectName: '', location: '', evalBy: '', date: '', confirmationNumber: '' },
      testPits: [{ id: 'p1', label: '3B', horizons: [{
        id: 'h1', designation: 'O', topIn: 0, bottomIn: 12, color: '10YR 3/2, VERY DARK GRAYISH BROWN',
        texture: 'SILT LOAM', structure: 'FINE GRANULAR', roots: 'yes', mottling: 'some at 10"', notes: 'NO ROCKS',
      }] }],
    };
    await store.saveRaw(v1);
    const r = (await store.get('old'))!;
    expect(r.schemaVersion).toBe(SCHEMA_VERSION);
    const h = r.testPits[0].horizons[0];
    expect(h.color.other).toBe('10YR 3/2, VERY DARK GRAYISH BROWN');
    expect(h.texture.cls).toBe('SILT LOAM');
    expect(h.structure.other).toBe('FINE GRANULAR');
    expect(h.roots).toBe('Y');
    expect(h.mottling.present).toBe('');
    expect(h.notes).toBe('MOTTLING: some at 10", NO ROCKS');
    expect(r.testPits[0].observedWater.kind).toBe('');
  });

  it('keeps pit photos on the device and deletes them with their site evaluation', async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    const r = newSiteEvaluation();
    await store.save(r);
    await store.putPhoto('p1', r.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const back = await store.getPhoto('p1');
    expect(back!.type).toBe('image/jpeg');
    expect([...new Uint8Array(await back!.arrayBuffer())]).toEqual([1, 2, 3]);
    await store.remove(r.id);
    expect(await store.getPhoto('p1')).toBeUndefined();
  });

  it("keeps the certifier's signature on this device only, outside every field record", async () => {
    const store = await openStore(`t-${crypto.randomUUID()}`);
    expect(await store.getCertifier()).toBeUndefined();
    const p = { name: 'Justin Houser, PE', company: 'Houser Engineering', signaturePng: 'data:image/png;base64,AA==' };
    await store.setCertifier(p);
    expect(await store.getCertifier()).toEqual(p);
    await store.setCertifier(undefined);
    expect(await store.getCertifier()).toBeUndefined();
  });

  it('upgrades a database made by the first app version without losing records', async () => {
    const name = `t-${crypto.randomUUID()}`;
    const old = await openDB(name, 1, { upgrade: (db) => void db.createObjectStore('fieldRecords', { keyPath: 'id' }) });
    const r = newSiteEvaluation({ projectNumber: '0999.001' });
    await old.put('fieldRecords', r);
    old.close();
    const store = await openStore(name);
    expect((await store.get(r.id))!.header.projectNumber).toBe('0999.001');
  });
});
