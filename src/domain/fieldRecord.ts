// Field record: everything captured on a site evaluation. Persisted as JSON on device
// and (later) in Dropbox, so the shape is versioned and migrated on load.

export const SCHEMA_VERSION = 2;

/** Header values are always text: `0999.001`, `SE 00001`, `3B` print exactly as entered. */
export interface Header {
  projectNumber: string;
  projectName: string;
  location: string;
  evalBy: string;
  /** ISO date `YYYY-MM-DD` as entered on the date picker (kept as text). */
  date: string;
  confirmationNumber: string;
}

export type YesNo = '' | 'Y' | 'N';

export interface Munsell {
  hue: string;
  value: string;
  chroma: string;
}

export interface HorizonColor extends Munsell {
  moisture: string;
  physicalState: string;
  /** Free text that replaces the structured color (legacy records, unusual colors). */
  other: string;
}

export interface Horizon {
  id: string;
  designation: string;
  /** Depths in inches below ground surface. */
  topIn: number | null;
  bottomIn: number | null;
  color: HorizonColor;
  /** USDA class (or free text) plus sand-size modifier for the sandy classes. */
  texture: { cls: string; sandSize: string };
  /** Rock fragments: percent by volume and size class (DEQ-4 §2.1.4.1.G, App. B). */
  rock: { pct: number | null; kind: string };
  /** Grade + size (optionally a range size..size2) + shape; or free text in `other`. */
  structure: { grade: string; size: string; size2: string; shape: string; other: string };
  roots: YesNo;
  mottling: { present: YesNo; quantity: string; size: string; contrast: string; color: Munsell };
  consistence: string;
  plasticity: string;
  notes: string;
}

export type ObservedWaterKind = '' | 'NONE' | 'SEEPAGE' | 'STANDING';
export type LimitingLayerType = '' | 'NONE' | 'BEDROCK' | 'IMPERVIOUS' | 'SHGW' | 'OTHER';

export interface TestPit {
  id: string;
  label: string;
  horizons: Horizon[];
  /** Inches; null = bottom of the last horizon. */
  totalDepthIn: number | null;
  /** Water seen in the open pit (DEQ-4 §2.1.4.1.D). kind NONE = no groundwater encountered. */
  observedWater: { kind: ObservedWaterKind; depthIn: number | null };
  /** Estimated seasonally high groundwater and its basis (§2.1.4.1.E). */
  shgw: { depthIn: number | null; deeperThan: boolean; basis: string };
  /** Limiting layer type and depth (§2.1.4.1.F). */
  limitingLayer: { type: LimitingLayerType; depthIn: number | null; other: string };
  /** Land slope (§2.1.8.1): percent, type, direction, method. */
  slope: { pct: number | null; shape: string; direction: string; method: string };
  notes: string;
}

export interface FieldRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  header: Header;
  testPits: TestPit[];
}

export const emptyHeader = (): Header => ({
  projectNumber: '',
  projectName: '',
  location: '',
  evalBy: '',
  date: '',
  confirmationNumber: '',
});

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function newSiteEvaluation(header: Partial<Header> = {}): FieldRecord {
  const t = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    createdAt: t,
    updatedAt: t,
    header: { ...emptyHeader(), ...header },
    testPits: [],
  };
}

const touch = (r: FieldRecord): FieldRecord => ({ ...r, updatedAt: now() });

export function updateHeader(r: FieldRecord, patch: Partial<Header>): FieldRecord {
  return touch({ ...r, header: { ...r.header, ...patch } });
}

export const emptyTestPit = (): Omit<TestPit, 'id' | 'label'> => ({
  horizons: [],
  totalDepthIn: null,
  observedWater: { kind: '', depthIn: null },
  shgw: { depthIn: null, deeperThan: false, basis: '' },
  limitingLayer: { type: '', depthIn: null, other: '' },
  slope: { pct: null, shape: '', direction: '', method: '' },
  notes: '',
});

export function addTestPit(r: FieldRecord, label: string): FieldRecord {
  return touch({ ...r, testPits: [...r.testPits, { id: newId(), label, ...emptyTestPit() }] });
}

export function updateTestPit(r: FieldRecord, pitId: string, patch: Partial<Omit<TestPit, 'id'>>): FieldRecord {
  return touch({ ...r, testPits: r.testPits.map((p) => (p.id === pitId ? { ...p, ...patch } : p)) });
}

export function removeTestPit(r: FieldRecord, pitId: string): FieldRecord {
  return touch({ ...r, testPits: r.testPits.filter((p) => p.id !== pitId) });
}

export const emptyMunsell = (): Munsell => ({ hue: '', value: '', chroma: '' });

export const emptyHorizon = (): Omit<Horizon, 'id'> => ({
  designation: '',
  topIn: null,
  bottomIn: null,
  color: { ...emptyMunsell(), moisture: 'MOIST', physicalState: 'RUBBED', other: '' },
  texture: { cls: '', sandSize: '' },
  rock: { pct: null, kind: 'ROCKS' },
  structure: { grade: '', size: '', size2: '', shape: '', other: '' },
  roots: '',
  mottling: { present: '', quantity: '', size: '', contrast: '', color: emptyMunsell() },
  consistence: '',
  plasticity: '',
  notes: '',
});

export function addHorizon(r: FieldRecord, pitId: string, h: Partial<Omit<Horizon, 'id'>> = {}): FieldRecord {
  const pit = r.testPits.find((p) => p.id === pitId);
  const top = pit?.horizons.at(-1)?.bottomIn ?? (pit?.horizons.length ? null : 0);
  const horizon: Horizon = { id: newId(), ...emptyHorizon(), topIn: top, ...h };
  return updateTestPit(r, pitId, { horizons: [...(pit?.horizons ?? []), horizon] });
}

/** Depths stay continuous: each horizon's top is the bottom of the one above. */
function chainDepths(horizons: Horizon[]): Horizon[] {
  const out: Horizon[] = [];
  for (const [i, h] of horizons.entries()) {
    const top = i === 0 ? (h.topIn ?? 0) : out[i - 1].bottomIn;
    out.push(top === h.topIn ? h : { ...h, topIn: top });
  }
  return out;
}

export function updateHorizon(r: FieldRecord, pitId: string, horizonId: string, patch: Partial<Omit<Horizon, 'id'>>): FieldRecord {
  const pit = r.testPits.find((p) => p.id === pitId);
  if (!pit) return r;
  return updateTestPit(r, pitId, {
    horizons: chainDepths(pit.horizons.map((h) => (h.id === horizonId ? { ...h, ...patch } : h))),
  });
}

export function removeHorizon(r: FieldRecord, pitId: string, horizonId: string): FieldRecord {
  const pit = r.testPits.find((p) => p.id === pitId);
  if (!pit) return r;
  const horizons = pit.horizons.filter((h) => h.id !== horizonId);
  if (horizons[0] && pit.horizons[0].id === horizonId) horizons[0] = { ...horizons[0], topIn: 0 };
  return updateTestPit(r, pitId, { horizons: chainDepths(horizons) });
}

/** Starts a test pit from another pit's horizons (new ids; adjacent pits are often similar). */
export function copyHorizons(r: FieldRecord, fromPitId: string, toPitId: string): FieldRecord {
  const from = r.testPits.find((p) => p.id === fromPitId);
  if (!from) return r;
  return updateTestPit(r, toPitId, { horizons: chainDepths(structuredClone(from.horizons).map((h) => ({ ...h, id: newId() }))) });
}

/** Pit depth: the recorded total depth, else the bottom of the last horizon. */
export function pitDepth(pit: TestPit): number | null {
  return pit.totalDepthIn ?? pit.horizons.at(-1)?.bottomIn ?? null;
}

/** Depth as the office writes it: `0"-12"`; open-ended `72"+`. */
export function depthText(h: Pick<Horizon, 'topIn' | 'bottomIn'>): string {
  if (h.topIn == null && h.bottomIn == null) return '';
  if (h.bottomIn == null) return `${h.topIn}"+`;
  return `${h.topIn ?? ''}"-${h.bottomIn}"`;
}

/** `2026-10-02` → `10/2/2026` (how the office template prints DATE). Other text passes through. */
export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : iso;
}

// ---- schema migrations -------------------------------------------------------
// Each entry upgrades a record from version N to N+1. Add one per schema change;
// never edit a shipped migration.
const yesNo = (t: unknown): YesNo => {
  const s = String(t ?? '').trim();
  return /^(y|yes)$/i.test(s) ? 'Y' : /^(n|no)$/i.test(s) ? 'N' : '';
};

const migrations: Record<number, (r: any) => any> = {
  // v1 → v2: horizon text fields become structured; free text is kept in `other`/notes.
  1: (r) => ({
    ...r,
    schemaVersion: 2,
    testPits: (r.testPits ?? []).map((p: any) => ({
      ...emptyTestPit(),
      id: p.id,
      label: p.label ?? '',
      horizons: (p.horizons ?? []).map((h: any) => {
        const e = emptyHorizon();
        const notes = [
          h.roots && !yesNo(h.roots) ? `ROOTS: ${h.roots}` : '',
          h.mottling && !yesNo(h.mottling) ? `MOTTLING: ${h.mottling}` : '',
          h.notes ?? '',
        ].filter(Boolean);
        return {
          ...e,
          id: h.id,
          designation: h.designation ?? '',
          topIn: h.topIn ?? null,
          bottomIn: h.bottomIn ?? null,
          color: { ...e.color, other: h.color ?? '' },
          texture: { cls: h.texture ?? '', sandSize: '' },
          structure: { ...e.structure, other: h.structure ?? '' },
          roots: yesNo(h.roots),
          mottling: { ...e.mottling, present: yesNo(h.mottling) },
          notes: notes.join(', '),
        };
      }),
    })),
  }),
};

export function migrate(raw: unknown): FieldRecord {
  let r: any = raw;
  if (!r || typeof r !== 'object') throw new Error('Not a field record');
  let v = r.schemaVersion ?? 0;
  if (v > SCHEMA_VERSION) throw new Error(`Field record schema v${v} is newer than this app (v${SCHEMA_VERSION}); update the app.`);
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration from field record schema v${v}`);
    r = step(r);
    v = r.schemaVersion;
  }
  return r as FieldRecord;
}
