import { describe, expect, it } from 'vitest';
import {
  addHorizon,
  addTestPit,
  newSiteEvaluation,
  removeTestPit,
  updateHeader,
  updateHorizon,
  updateTestPit,
  type FieldRecord,
} from '../src/domain/fieldRecord';
import { lastEdit, mergeRecords, pitPath, stampEdits } from '../src/domain/merge';

// Two devices start from the same synced record, each saving through stampEdits as the app does.
function twoDevices() {
  let base = updateHeader(newSiteEvaluation(), { projectNumber: '0999.001' });
  for (const l of ['1', '2', '3']) base = addTestPit(base, l);
  return { base, pit: (r: FieldRecord, label: string) => r.testPits.find((p) => p.label === label)! };
}
const edit = (prev: FieldRecord, change: (r: FieldRecord) => FieldRecord, by: string, at: string) => stampEdits(prev, change(prev), by, at);

describe('field-level last-writer-wins merge', () => {
  it('keeps edits two people made to different pits', () => {
    const { base, pit } = twoDevices();
    const nathan = edit(base, (r) => addHorizon(r, pit(r, '1').id, { designation: 'A', bottomIn: 12 }), 'Nathan', '2026-10-02T15:10:00Z');
    const justin = edit(base, (r) => updateTestPit(r, pit(r, '2').id, { notes: 'COBBLES AT 60"' }), 'Justin', '2026-10-02T15:11:00Z');

    for (const m of [mergeRecords(nathan, justin), mergeRecords(justin, nathan)]) {
      expect(pit(m, '1').horizons.map((h) => h.designation)).toEqual(['A']);
      expect(pit(m, '2').notes).toBe('COBBLES AT 60"');
      expect(m.testPits.map((p) => p.label)).toEqual(['1', '2', '3']);
      expect(lastEdit(m, pitPath(pit(m, '1').id))?.by).toBe('Nathan');
      expect(lastEdit(m, pitPath(pit(m, '2').id))?.by).toBe('Justin');
    }
  });

  it('on the same pit, each field goes to whoever changed it last', () => {
    const { base, pit } = twoDevices();
    const withHorizon = edit(base, (r) => addHorizon(r, pit(r, '3').id, { designation: 'A', bottomIn: 10 }), 'Nathan', '2026-10-02T15:00:00Z');
    const hid = pit(withHorizon, '3').horizons[0].id;
    const nathan = edit(withHorizon, (r) => updateHorizon(r, pit(r, '3').id, hid, { texture: { cls: 'LOAM', sandSize: '' }, notes: 'N' }), 'Nathan', '2026-10-02T15:20:00Z');
    const justin = edit(withHorizon, (r) => updateHorizon(r, pit(r, '3').id, hid, { texture: { cls: 'SILT LOAM', sandSize: '' }, consistence: 'FRIABLE' }), 'Justin', '2026-10-02T15:05:00Z');

    for (const m of [mergeRecords(nathan, justin), mergeRecords(justin, nathan)]) {
      const h = pit(m, '3').horizons[0];
      expect(h.texture.cls).toBe('LOAM'); // Nathan's later change
      expect(h.consistence).toBe('FRIABLE'); // only Justin touched it
      expect(h.notes).toBe('N');
      expect(h.bottomIn).toBe(10);
    }
  });

  it('keeps pits both people added, and is repeatable', () => {
    const { base } = twoDevices();
    const a = edit(base, (r) => addTestPit(r, '21'), 'Nathan', '2026-10-02T15:00:00Z');
    const b = edit(base, (r) => addTestPit(r, '22'), 'Justin', '2026-10-02T15:01:00Z');
    const m = mergeRecords(a, b);
    expect(m.testPits.map((p) => p.label).sort()).toEqual(['1', '2', '21', '22', '3']);
    expect(mergeRecords(m, b)).toEqual(m);
    expect(mergeRecords(m, a).testPits.length).toBe(5);
    // The merged pit is a whole test pit, not a partial one.
    expect(m.testPits.find((p) => p.label === '21')).toMatchObject({ horizons: [], observedWater: { kind: 'NONE', depthIn: null }, photos: [] });
  });

  it('a later delete removes the pit everywhere; an untouched record does not resurrect it', () => {
    const { base, pit } = twoDevices();
    const a = edit(base, (r) => removeTestPit(r, pit(r, '2').id), 'Nathan', '2026-10-02T16:00:00Z');
    const b = edit(base, (r) => updateTestPit(r, pit(r, '1').id, { notes: 'x' }), 'Justin', '2026-10-02T15:00:00Z');
    for (const m of [mergeRecords(a, b), mergeRecords(b, a), mergeRecords(a, base)]) expect(m.testPits.map((p) => p.label)).toEqual(['1', '3']);
  });

  it('header fields merge by field', () => {
    const { base } = twoDevices();
    const a = edit(base, (r) => updateHeader(r, { confirmationNumber: 'SE 00278' }), 'Nathan', '2026-10-02T15:00:00Z');
    const b = edit(base, (r) => updateHeader(r, { ownerName: 'BC Bigelow LLC' }), 'Justin', '2026-10-02T15:01:00Z');
    expect(mergeRecords(a, b).header).toMatchObject({ projectNumber: '0999.001', confirmationNumber: 'SE 00278', ownerName: 'BC Bigelow LLC' });
  });

  it('a save that changes nothing adds no stamps', () => {
    const { base } = twoDevices();
    expect(stampEdits(base, base, 'Nathan')).toBe(base);
  });

  it('refuses to merge different site evaluations', () => {
    expect(() => mergeRecords(newSiteEvaluation(), newSiteEvaluation())).toThrow(/different site evaluations/);
  });
});
