import { readFileSync } from 'node:fs';
import type { SoilLogSnapshot, TemplateSet } from '../src/templates/types';

export function loadTemplatesFromDisk(): TemplateSet {
  const dir = new URL('../src/templates/soil-log/', import.meta.url);
  const spec = JSON.parse(readFileSync(new URL('snapshot.json', dir), 'utf8')) as SoilLogSnapshot;
  return { soilLog: { spec, logo: new Uint8Array(readFileSync(new URL(spec.images[0].file, dir))) } };
}
