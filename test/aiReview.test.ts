import { describe, expect, it } from 'vitest';
import { emptyHorizon, emptyTestPit, migrate, newSiteEvaluation, SCHEMA_VERSION, type FieldRecord, type Horizon, type PhotoRef, type TestPit } from '../src/domain/fieldRecord';
import { parseReview, reviewKey, reviewPhotos, reviewRequest, type AiReview } from '../src/domain/aiReview';
import { acceptFlag, openFlags, wallFlags } from '../src/domain/pitChecks';

let n = 0;
const hz = (designation: string, topIn: number, bottomIn: number, extra: Partial<Horizon> = {}): Horizon => {
  const e = emptyHorizon();
  return {
    ...e,
    id: `h${n++}`,
    designation,
    topIn,
    bottomIn,
    color: { ...e.color, hue: '10YR', value: '4', chroma: '3' },
    texture: { cls: 'LOAM', sandSize: '' },
    ...extra,
  };
};
const photo = (id: string, extra: Partial<PhotoRef> = {}): PhotoRef => ({ id, takenAt: '2026-10-02T15:00:00Z', width: 1200, height: 1600, ...extra });
const wall = (horizons: Horizon[], photos: PhotoRef[], extra: Partial<TestPit> = {}): TestPit => ({ id: 'w1A', label: '1A', ...emptyTestPit(), horizons, photos, ...extra });
const site = (w: TestPit): FieldRecord => ({ ...newSiteEvaluation(), testPits: [w] });
const reviewed = (w: TestPit, findings: AiReview['findings']): TestPit => ({ ...w, aiReview: { key: reviewKey(w)!, at: '2026-10-02T15:01:00Z', findings } });

const logged = () => [hz('A', 0, 12), hz('B', 12, 40, { rock: { pct: 20, kind: 'GRAVEL' } }), hz('C', 40, 96, { texture: { cls: 'SANDY LOAM', sandSize: '' } })];

describe('AI photo review (ticket 12)', () => {
  it('reviews a wall only once it has horizons and a photo', () => {
    expect(reviewKey(wall([], [photo('p1')]))).toBeNull();
    expect(reviewKey(wall(logged(), []))).toBeNull();
    expect(reviewKey(wall(logged(), [photo('p1')]))).toMatch(/^[0-9a-f]{8}$/);
  });

  it('sends at most 4 photos, the wall-face photo first', () => {
    const ps = [photo('p1'), photo('p2'), photo('p3'), photo('p4', { face: true }), photo('p5')];
    expect(reviewPhotos(wall(logged(), ps)).map((p) => p.id)).toEqual(['p4', 'p1', 'p2', 'p3']);
  });

  it('the key changes when what was judged changes: a horizon, the water, or the photos', () => {
    const hs = logged();
    const w = wall(hs, [photo('p1')]);
    const key = reviewKey(w);
    expect(reviewKey(wall(logged().map((h, i) => ({ ...h, id: hs[i].id })), [photo('p1')]))).toBe(key);
    expect(reviewKey({ ...w, horizons: [hs[0], { ...hs[1], bottomIn: 44 }, { ...hs[2], topIn: 44 }] })).not.toBe(key);
    expect(reviewKey({ ...w, horizons: [hs[0], { ...hs[1], rock: { pct: 40, kind: 'GRAVEL' } }, hs[2]] })).not.toBe(key);
    expect(reviewKey({ ...w, observedWater: { kind: 'SEEPAGE', depthIn: 80 } })).not.toBe(key);
    expect(reviewKey({ ...w, photos: [photo('p2')] })).not.toBe(key);
    // Accepting a check or taking a GPS fix is not something the review judged.
    expect(reviewKey({ ...w, accepted: { x: { by: 'Nate', at: 'now' } }, location: { lat: 1, lon: 2, accuracyM: 3, at: 'now' } })).toBe(key);
  });

  it('asks for strict JSON flags on the log against the photos, with the horizons numbered', () => {
    const req = reviewRequest(wall(logged(), [photo('p1')]), [{ mediaType: 'image/jpeg', data: 'AAAA' }]);
    expect(req.images).toEqual([{ mediaType: 'image/jpeg', data: 'AAAA' }]);
    expect(req.system).toMatch(/JSON/);
    expect(req.prompt).toContain('Wall 1A');
    expect(req.prompt).toContain('1. A 0-12"');
    expect(req.prompt).toContain('2. B 12-40"');
    expect(req.prompt).toContain('20% GRAVEL');
    expect(req.prompt).toContain('3. C 40-96"');
    expect(req.prompt).toContain('SANDY LOAM');
    for (const check of ['horizons', 'rock', 'water', 'mottling', 'photo']) expect(req.prompt).toContain(`"${check}"`);
  });

  it('parses flags defensively: fences and prose around the JSON are fine; anything unreadable is no flag', () => {
    const w = wall(logged(), [photo('p1')]);
    const text = 'Here is my review:\n```json\n{"flags":[{"check":"rock","horizon":2,"say":"The photo shows far more than 20% rock."},{"check":"photo","horizon":null,"say":"Photo 2 shows the backdirt pile, not the pit."},{"check":"weather","say":"Nice day."},{"check":"water","horizon":9,"say":"Seepage near the bottom."},{"check":"mottling","say":""}]}\n```';
    expect(parseReview(text, w)).toEqual([
      { check: 'rock', horizonId: w.horizons[1].id, message: 'The photo shows far more than 20% rock.' },
      { check: 'photo', message: 'Photo 2 shows the backdirt pile, not the pit.' },
      { check: 'water', message: 'Seepage near the bottom.' },
    ]);
    expect(parseReview('{"flags":[]}', w)).toEqual([]);
    expect(parseReview('I cannot tell from these photos.', w)).toBeNull();
    expect(parseReview('{"flags": "none"}', w)).toBeNull();
    expect(parseReview('{"flags":[{"check":"rock"', w)).toBeNull();
  });

  it('a current review shows its findings as pit checks that hold the soil log until accepted', () => {
    const w = wall(logged(), [photo('p1')]);
    const r = site(reviewed(w, [{ check: 'rock', horizonId: w.horizons[1].id, message: 'The photo shows far more than 20% rock.' }, { check: 'water', message: 'Seepage near the bottom.' }]));
    const flags = wallFlags(r, r.testPits[0]);
    expect(flags.map((f) => [f.kind, f.message])).toEqual([
      ['ai', 'AI review: Horizon B: the photo shows far more than 20% rock.'],
      ['ai', 'AI review: seepage near the bottom.'],
    ]);
    expect(flags[0].horizonId).toBe(w.horizons[1].id);
    expect(openFlags(r)).toHaveLength(2);
    const ok = acceptFlag(acceptFlag(r, w.id, flags[0].id, 'Nate', 't'), w.id, flags[1].id, 'Nate', 't');
    expect(openFlags(ok)).toEqual([]);
  });

  it('an edit to what was judged retires the old findings (the wall is reviewed again), so an acceptance covers only that review', () => {
    const w = wall(logged(), [photo('p1')]);
    const r = site(reviewed(w, [{ check: 'rock', horizonId: w.horizons[1].id, message: 'Too little rock.' }]));
    const id = wallFlags(r, r.testPits[0])[0].id;
    expect(id).toContain(reviewKey(w)!);
    const edited = { ...r.testPits[0], horizons: [w.horizons[0], { ...w.horizons[1], rock: { pct: 45, kind: 'GRAVEL' } }, w.horizons[2]] };
    expect(wallFlags(site(edited), edited).filter((f) => f.kind === 'ai')).toEqual([]);
  });

  it('schema v12 migrates older records unchanged (no review yet)', () => {
    const v11 = { ...newSiteEvaluation(), schemaVersion: 11, testPits: [wall(logged(), [photo('p1')])] } as any;
    const r = migrate(v11);
    expect(r.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(12);
    expect(r.testPits[0].aiReview).toBeUndefined();
  });
});
