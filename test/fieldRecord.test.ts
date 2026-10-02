import { describe, expect, it } from 'vitest';
import { addHorizon, addTestPit, copyHorizons, newSiteEvaluation, pitDepth, removeHorizon, updateHorizon, updateTestPit } from '../src/domain/fieldRecord';

function pitWith(bottoms: number[]) {
  let r = addTestPit(newSiteEvaluation(), '1');
  const pitId = r.testPits[0].id;
  for (const b of bottoms) r = addHorizon(r, pitId, { bottomIn: b });
  return { r, pitId, depths: (x = r) => x.testPits[0].horizons.map((h) => [h.topIn, h.bottomIn]) };
}

describe('horizon depths stay continuous', () => {
  it('starts each horizon at the previous bottom and follows edits', () => {
    const { r, pitId, depths } = pitWith([12, 60, 96]);
    expect(depths()).toEqual([[0, 12], [12, 60], [60, 96]]);
    const h1 = r.testPits[0].horizons[0].id;
    const r2 = updateHorizon(r, pitId, h1, { bottomIn: 10 });
    expect(depths(r2)).toEqual([[0, 10], [10, 60], [60, 96]]);
  });

  it('closes the gap when a horizon is removed', () => {
    const { r, pitId, depths } = pitWith([12, 60, 96]);
    const [first, middle] = r.testPits[0].horizons.map((h) => h.id);
    expect(depths(removeHorizon(r, pitId, middle))).toEqual([[0, 12], [12, 96]]);
    expect(depths(removeHorizon(r, pitId, first))).toEqual([[0, 60], [60, 96]]);
  });
});

describe('test pits', () => {
  it('copies the previous pit horizons with new ids', () => {
    let { r } = pitWith([12, 96]);
    r = addTestPit(r, '2');
    const [a, b] = r.testPits;
    r = copyHorizons(r, a.id, b.id);
    const copied = r.testPits[1].horizons;
    expect(copied.map((h) => h.bottomIn)).toEqual([12, 96]);
    expect(copied.map((h) => h.id)).not.toEqual(a.horizons.map((h) => h.id));
  });

  it('uses the recorded total depth, else the last horizon bottom', () => {
    const { r, pitId } = pitWith([12, 96]);
    expect(pitDepth(r.testPits[0])).toBe(96);
    expect(pitDepth(updateTestPit(r, pitId, { totalDepthIn: 100 }).testPits[0])).toBe(100);
  });
});
