// Every path through the Thien (1979) texture-by-feel flowchart, as printed in the office copy
// (Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\texture-by-feel.pdf).
import { describe, expect, it } from 'vitest';
import { START, TEXTURE_STEPS, walk } from '../src/domain/textureByFeel';
import { TEXTURES } from '../src/domain/vocabulary';

describe('texture by feel (Thien flowchart)', () => {
  it.each([
    [['no', 'no', 'no'], 'SAND'],
    [['yes', 'no'], 'LOAMY SAND'],
    [['yes', 'yes', 'weak', 'gritty'], 'SANDY LOAM'],
    [['yes', 'yes', 'weak', 'smooth'], 'SILT LOAM'],
    [['yes', 'yes', 'weak', 'neither'], 'LOAM'],
    [['yes', 'yes', 'medium', 'gritty'], 'SANDY CLAY LOAM'],
    [['yes', 'yes', 'medium', 'smooth'], 'SILTY CLAY LOAM'],
    [['yes', 'yes', 'medium', 'neither'], 'CLAY LOAM'],
    [['yes', 'yes', 'strong', 'gritty'], 'SANDY CLAY'],
    [['yes', 'yes', 'strong', 'smooth'], 'SILTY CLAY'],
    [['yes', 'yes', 'strong', 'neither'], 'CLAY'],
  ])('%j → %s', (answers, cls) => {
    expect(walk(answers)).toEqual({ result: cls });
  });

  it('loops back to moistening when the soil is too dry or too wet', () => {
    expect(walk(['no', 'yes'])).toEqual({ at: START });
    expect(walk(['no', 'no', 'yes'])).toEqual({ at: START });
    expect(walk(['no', 'yes', 'yes', 'no'])).toEqual({ result: 'LOAMY SAND' });
  });

  it('reaches exactly the 11 flowchart classes, all in the app vocabulary', () => {
    const results = new Set<string>();
    for (const step of Object.values(TEXTURE_STEPS))
      for (const a of step.answers) if ('result' in a) results.add(a.result);
    expect(results.size).toBe(11);
    for (const r of results) expect(TEXTURES as readonly string[]).toContain(r);
  });

  it('every answer leads to a defined step or a class', () => {
    for (const step of Object.values(TEXTURE_STEPS))
      for (const a of step.answers) if ('next' in a) expect(TEXTURE_STEPS[a.next]).toBeDefined();
  });

  it('rejects an answer the current step does not offer', () => {
    expect(() => walk(['maybe'])).toThrow();
  });
});
