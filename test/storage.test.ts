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
});
