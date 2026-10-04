import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_KEY, FIELD_GUIDE, placeholderFor } from '../src/app/fieldGuide';

const appDir = join(__dirname, '..', 'src', 'app');
const sources = readdirSync(appDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => readFileSync(join(appDir, f), 'utf8'));

/** Every label passed to a text, number or tape field, including both arms of a conditional label. */
function fieldLabels(): string[] {
  const out = new Set<string>();
  for (const src of sources)
    for (const m of src.matchAll(/<(?:TextField|NumberField|TapeField)\b[\s\S]*?label=(\{[^}]*\}|"[^"]*")/g))
      for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.add(s[1]);
  return [...out];
}

describe('field guide (demo spec decision 4)', () => {
  it('has a grey example for every text and number field in the app', () => {
    const missing = fieldLabels().filter((l) => !FIELD_GUIDE[l]?.example);
    expect(missing).toEqual([]);
  });

  it('shows 0279.001 as the project number example and the demo uses 0999.001', () => {
    expect(placeholderFor('Project #')).toBe('0279.001');
    expect(DEMO_KEY.header.projectNumber).toBe('0999.001');
  });

  it('keeps the demo answer key valid for the soil log', () => {
    const [a, b] = DEMO_KEY.horizons;
    expect(a).toMatchObject({ designation: 'A', topIn: 0, bottomIn: 12, color: { hue: '10YR', value: '3', chroma: '2' }, texture: 'LOAM' });
    expect(b.bottomIn).toBeGreaterThan(a.bottomIn);
  });
});
