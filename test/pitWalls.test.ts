import { describe, expect, it } from 'vitest';
import { addHorizon, addTestPit, emptyHorizon, newSiteEvaluation, type TestPit } from '../src/domain/fieldRecord';
import { fillGaps } from '../src/domain/fillGaps';
import { pitPages, wallLocation, wallOf } from '../src/domain/pitWalls';

function walls(labels: string[]): TestPit[] {
  let r = newSiteEvaluation();
  for (const l of labels) r = addTestPit(r, l);
  return r.testPits;
}

describe('pit walls', () => {
  it('reads the pit and wall from a label', () => {
    expect(wallOf('7A')).toEqual({ pit: '7', wall: 'A' });
    expect(wallOf('12 b')).toEqual({ pit: '12', wall: 'B' });
    expect(wallOf('LOT 19')).toEqual({ pit: 'LOT 19', wall: '' });
  });

  it('puts both walls of a pit on one page, pits in number order, A before B', () => {
    const pages = pitPages(walls(['7A', '8B', '10A', '7B', '8A', '2A']));
    expect(pages.map((p) => [p.pit, p.walls.map((w) => w.label)])).toEqual([
      ['2', ['2A']],
      ['7', ['7A', '7B']],
      ['8', ['8A', '8B']],
      ['10', ['10A']],
    ]);
  });

  it('locates a wall by its own fix, else the other wall of the same pit, else the planned location', () => {
    const [a, b, c] = walls(['5A', '5B', '6A']);
    const fix = { lat: 45.6, lon: -111.07, accuracyM: 3, at: '2026-10-02T17:00:00Z' };
    const all = [{ ...a, location: fix }, b, { ...c, planned: { lat: 45.61, lon: -111.06 } }];
    expect(wallLocation(all[0], all)).toMatchObject({ lat: 45.6, source: 'field' });
    expect(wallLocation(all[1], all)).toMatchObject({ lat: 45.6, source: 'other-wall' });
    expect(wallLocation(all[2], all)).toMatchObject({ lat: 45.61, source: 'planned' });
    expect(wallLocation(walls(['9A'])[0], [])).toBeNull();
  });
});

describe('gap fill', () => {
  it('fills from the other wall first, then the nearest pit, then the site pattern, then defaults, and says where each came from', () => {
    let r = newSiteEvaluation();
    const hz = (designation: string, extra: Partial<ReturnType<typeof emptyHorizon>> = {}) => ({ designation, ...extra });
    const clay = { texture: { cls: 'CLAY LOAM', sandSize: '' } };
    const silt = { texture: { cls: 'SILT LOAM', sandSize: '' } };
    for (const [label, lat, horizons] of [
      ['1A', 45.6, [hz('O', clay)]],
      ['1B', 45.6, [hz('O')]],
      ['2A', 45.601, [hz('O', silt)]],
      ['3A', 45.7, [hz('O')]],
    ] as const) {
      r = addTestPit(r, label);
      const id = r.testPits.at(-1)!.id;
      r = { ...r, testPits: r.testPits.map((p) => (p.id === id ? { ...p, planned: { lat, lon: -111 } } : p)) };
      for (const h of horizons) r = addHorizon(r, id, h);
    }
    const { pits, fills } = fillGaps(r.testPits);
    const tex = (label: string) => pits.find((p) => p.label === label)!.horizons[0].texture.cls;
    expect(tex('1B')).toBe('CLAY LOAM');
    expect(fills.find((f) => f.wall === '1B' && f.field === 'texture')!.source).toBe('other wall (1A)');
    // 3A is nearer 2A? No: 1A/1B sit at 45.6, 2A at 45.601; 3A at 45.7 is nearest 2A.
    expect(tex('3A')).toBe('SILT LOAM');
    expect(fills.find((f) => f.wall === '3A' && f.field === 'texture')!.source).toMatch(/^nearest pit with it \(2A/);
    expect(pits[0].horizons[0].roots).toBe('Y');
    expect(fills.find((f) => f.wall === '1A' && f.field === 'mottling')).toMatchObject({ value: 'N', source: 'default' });
  });

  it('takes structure from the area reference when no wall of the pit has it', () => {
    let r = newSiteEvaluation();
    r = addTestPit(r, '4A');
    r = addHorizon(r, r.testPits[0].id, { designation: 'B' });
    const { pits, fills } = fillGaps(r.testPits, () => ({ structure: 'MASSIVE', source: 'soil survey' }));
    expect(pits[0].horizons[0].structure.other).toBe('MASSIVE');
    expect(fills.find((f) => f.field === 'structure')!.source).toBe('soil survey');
  });
});
