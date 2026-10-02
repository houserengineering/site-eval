// Browser loader for the office template snapshots (precached by the service worker).
import spec from '../templates/soil-log/snapshot.json';
import logoUrl from '../templates/soil-log/logo.jpeg?url';
import type { SoilLogSnapshot, TemplateSet } from '../templates/types';

let cached: Promise<TemplateSet> | undefined;

export function loadTemplates(): Promise<TemplateSet> {
  cached ??= fetch(logoUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`Template logo failed to load (${r.status})`);
      return r.arrayBuffer();
    })
    .then((buf) => ({ soilLog: { spec: spec as SoilLogSnapshot, logo: new Uint8Array(buf) } }));
  cached.catch(() => (cached = undefined));
  return cached;
}
