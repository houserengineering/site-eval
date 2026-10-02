import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addTestPit, newSiteEvaluation, SCHEMA_VERSION } from '../src/domain/fieldRecord';
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
});
