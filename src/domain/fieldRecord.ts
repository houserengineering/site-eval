// Field record: everything captured on a site evaluation. Persisted as JSON on device
// and (later) in Dropbox, so the shape is versioned and migrated on load.
import { wallOf } from './pitWalls';
import type { Georef } from './georef';
import type { Stamp } from './merge';
import type { ObservationWell } from '../groundwater/wells';
import type { Acceptance, PhotoQuality } from './pitChecks';
import type { PhotoColor } from './photoColor';
import type { AiReview } from './aiReview';

export const SCHEMA_VERSION = 12;

/** Header values are always text: `0999.001`, `SE 00001`, `3B` print exactly as entered. */
export interface Header {
  projectNumber: string;
  projectName: string;
  location: string;
  evalBy: string;
  /** ISO date `YYYY-MM-DD` as entered on the date picker (kept as text). */
  date: string;
  confirmationNumber: string;
  /** Owner name on the perc test form (DEQ-4 App. A form p126). */
  ownerName: string;
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
  /** A hue outside the site's pattern, kept on purpose (the hue check stays quiet). */
  keptHue?: string;
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
  rock: { pct: number | null; kind: string; /** Size range end ("GRAVEL TO COBBLES"); absent or '' = one size. */ kind2?: string };
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
  /** Basis for the groundwater call, printed in the summary. The SHGW depth estimate is no longer entered (2026-10-02); old records keep theirs. */
  shgw: { depthIn: number | null; deeperThan: boolean; basis: string };
  /** Limiting layer type and depth (§2.1.4.1.F). */
  limitingLayer: { type: LimitingLayerType; depthIn: number | null; other: string };
  /** Land slope (§2.1.8.1), always estimated. Shape, direction and method are no longer entered (2026-10-02); old records keep theirs. */
  slope: { pct: number | null; shape: string; direction: string; method: string };
  notes: string;
  /** Photos of the open pit; bytes live in the on-device photo store (and Dropbox), not in the record. First = soil log photo. */
  photos: PhotoRef[];
  /** GPS fix of the pit (county requires location within 10 ft). */
  location: GpsFix | null;
  /** Where the pit is planned (job file map pin, or dropped on the map); null = unplanned. */
  planned: LatLon | null;
  /** Pit checks accepted as they are (domain/pitChecks.ts), by flag id: who and when. */
  accepted: Record<string, Acceptance>;
  /** The latest AI photo review (domain/aiReview.ts); absent until the wall has been reviewed. */
  aiReview?: AiReview;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PhotoRef {
  id: string;
  takenAt: string;
  width: number;
  height: number;
  /** Sharpness and exposure, measured when taken; absent on photos from before v10. */
  quality?: PhotoQuality;
  /** Strip colors and white reference, measured when taken; absent on photos from before v11. */
  color?: PhotoColor;
  /** Square to the wall, surface at the top edge and log bottom at the bottom: the photo the color check reads. */
  face?: boolean;
  /** A white card or tape is in the wall-face photo: it calibrates value and chroma. */
  whiteInFrame?: boolean;
}

/** WGS84 position from the device; accuracy is the 68% radius the device reports. */
export interface GpsFix {
  lat: number;
  lon: number;
  accuracyM: number;
  at: string;
}

/**
 * A certifier's signature applied by an explicit Certify tap on the certifier's own device.
 * `hash` is the certified content; any later change voids the signature on deliverables.
 */
export interface Certification {
  name: string;
  company: string;
  at: string;
  hash: string;
  /** PNG of the drawn signature, as applied. */
  signaturePng: string;
}

/**
 * Times in perc tests are local wall-clock `YYYY-MM-DDTHH:MM:SS` strings (no zone): they print
 * as the evaluator read them, and timers count from them so they survive backgrounding/reload.
 * '' = not yet recorded.
 */
export type LocalDateTime = string;

/** standard = fixed interval, measure drop; sandy = App. A sandy-soil test (refill to 6", 1 h);
 * fixed-drop = time a fixed drop (Houser's fast-soil timing, research/01 §3.4). */
export type PercMode = 'standard' | 'sandy' | 'fixed-drop';

export interface PercReading {
  id: string;
  startAt: LocalDateTime;
  endAt: LocalDateTime;
  /** Distances below the reference point, inches (read to 1/16"). */
  initialIn: number | null;
  finalIn: number | null;
}

export interface PercTest {
  id: string;
  /** Test # as text (`1`, `3B`). */
  label: string;
  /** Linked test pit id ('' = none). */
  testPitId: string;
  lot: string;
  holeDiameterIn: number | null;
  holeDepthIn: number | null;
  /** Reference point height above the hole bottom. */
  referenceHeightIn: number | null;
  /** Soil at test depth is sandy clay loam or finer → 4-h presoak, no sandy branch (App. A). */
  soilFinerThanSCL: YesNo;
  /** 12-inch soak fillings (App. A soaking step 1–2). */
  fills: { startAt: LocalDateTime; endAt: LocalDateTime }[];
  /** ≥4-h presoak with ≥12 in. of water (App. A soaking step 3). */
  presoak: { startAt: LocalDateTime; endAt: LocalDateTime };
  mode: PercMode;
  /** Planned reading interval (standard/sandy) for the due alert. */
  intervalMin: number | null;
  /** Fixed drop timed in fixed-drop mode. */
  fixedDropIn: number | null;
  readings: PercReading[];
  /** Tester's printed name; blank = header Eval. by. */
  tester: string;
  notes: string;
}

/** Justin's test pit map: an image (bytes in the on-device blob store) aligned to real coordinates. */
export interface SiteMap {
  title: string;
  source: string;
  imageId: string;
  mimeType: string;
  width: number;
  height: number;
  /** Planned pit pins in map image pixels. */
  pins: { label: string; x: number; y: number }[];
  georef: Georef;
}

/** Which review applies: DEQ subdivision (ARM 17.36 sub. 3), county permit (sub. 9 + GCCHD HC-3); '' = both. */
export type Review = '' | 'SUB' | 'CTY';
export type SystemUse = '' | 'INDIVIDUAL' | 'SHARED' | 'MULTIPLE' | 'PUBLIC';
export type SystemType = '' | 'GRAVITY' | 'PRESSURE' | 'AT-GRADE' | 'MOUND' | 'ETA';

/** Proposed system as known on site; drives the rule checks only (never printed). */
export interface Design {
  review: Review;
  use: SystemUse;
  system: SystemType;
  /** Proposed infiltrative surface depth below ground, inches (null = standard trench 24"). */
  infiltrativeDepthIn: number | null;
  /** Drainfields served by this evaluation (each needs its own pit). */
  drainfields: number | null;
  /** Pressure-dosed zones (one pit per zone). */
  pressureZones: number | null;
}

export const emptyDesign = (): Design => ({ review: '', use: '', system: '', infiltrativeDepthIn: null, drainfields: null, pressureZones: null });

export interface FieldRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  header: Header;
  design: Design;
  testPits: TestPit[];
  percTests: PercTest[];
  /** Groundwater observation wells (separate module: src/groundwater). */
  wells: ObservationWell[];
  /** Certifications by perc test id. */
  certifications: Record<string, Certification>;
  /** Pre-filled header values to confirm on site, with why; marked on deliverables until confirmed. */
  unconfirmed: Partial<Record<keyof Header, string>>;
  siteMap: SiteMap | null;
  /** Dropbox folder the deliverables are filed to ('' = not chosen yet). */
  deliverableFolder: string;
  /** Automatic defaults follow project edits; explicit folder choices stay put. */
  deliverableFolderSource?: 'project' | 'chosen';
  /** Who changed each field and when (merge metadata; see domain/merge.ts). */
  edits: Record<string, Stamp>;
  /** Files this app wrote to Dropbox, by lower-case path: the only files it may overwrite. */
  filed: Record<string, FiledFile>;
  /** Area soils reference by pit number, from the job file (office: knowledge/soils); fills blank structure. */
  areaSoils: Record<string, AreaHorizon[]>;
  /** The in-app demo's sample job (app/Demo.tsx): never synced or filed. */
  demo?: boolean;
}

/** A reference horizon at a pit: the soil survey or past logs in its map unit, with where it came from. */
export interface AreaHorizon {
  topIn: number;
  bottomIn: number;
  structure: string;
  source: string;
}

export interface FiledFile {
  /** Path as written (original case). */
  path: string;
  /** Dropbox content hash of the bytes the app wrote; a different hash means someone else changed the file. */
  hash: string;
  at: string;
}

export const emptyHeader = (): Header => ({
  projectNumber: '',
  projectName: '',
  location: '',
  evalBy: '',
  date: '',
  confirmationNumber: '',
  ownerName: '',
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
    design: emptyDesign(),
    testPits: [],
    percTests: [],
    wells: [],
    certifications: {},
    unconfirmed: {},
    siteMap: null,
    deliverableFolder: '',
    edits: {},
    filed: {},
    areaSoils: {},
  };
}

const touch = (r: FieldRecord): FieldRecord => ({ ...r, updatedAt: now() });

/** Typing a header value is the evaluator's own entry, so it also confirms that field. */
export function updateHeader(r: FieldRecord, patch: Partial<Header>): FieldRecord {
  const unconfirmed = { ...r.unconfirmed };
  for (const k of Object.keys(patch) as (keyof Header)[]) if (patch[k] !== r.header[k]) delete unconfirmed[k];
  return touch({ ...r, header: { ...r.header, ...patch }, unconfirmed });
}

export function updateDesign(r: FieldRecord, patch: Partial<Design>): FieldRecord {
  return touch({ ...r, design: { ...r.design, ...patch } });
}

export function confirmHeaderField(r: FieldRecord, key: keyof Header): FieldRecord {
  const { [key]: _, ...unconfirmed } = r.unconfirmed;
  return touch({ ...r, unconfirmed });
}

/** A test pit with nothing recorded. Migrations use this, so old records never gain the new defaults. */
const blankTestPit = (): Omit<TestPit, 'id' | 'label'> => ({
  horizons: [],
  totalDepthIn: null,
  observedWater: { kind: '', depthIn: null },
  shgw: { depthIn: null, deeperThan: false, basis: '' },
  limitingLayer: { type: '', depthIn: null, other: '' },
  slope: { pct: null, shape: '', direction: '', method: '' },
  notes: '',
  photos: [],
  location: null,
  planned: null,
  accepted: {},
});

/** A new pit reads as a normal one (spec 2026-10-02): no groundwater, no redox features, no limiting layer, 2% slope (estimated). */
export const emptyTestPit = (): Omit<TestPit, 'id' | 'label'> => ({
  ...blankTestPit(),
  observedWater: { kind: 'NONE', depthIn: null },
  shgw: { depthIn: null, deeperThan: false, basis: 'NO REDOXIMORPHIC FEATURES TO TEST PIT DEPTH' },
  limitingLayer: { type: 'NONE', depthIn: null, other: '' },
  slope: { pct: 2, shape: '', direction: '', method: '' },
});

export function addTestPit(r: FieldRecord, label: string, p: Partial<Omit<TestPit, 'id' | 'label'>> = {}): FieldRecord {
  return touch({ ...r, testPits: [...r.testPits, { id: newId(), label, ...emptyTestPit(), ...p }] });
}

/**
 * Adds test pit `label` as its two walls, `7A` (north) and `7B` (south); a label that already
 * names a wall (`3B`) adds just that wall. Both walls share the planned location (same hole); a
 * GPS fix taken while adding belongs to wall A.
 */
export function addPitWalls(r: FieldRecord, label: string, p: Partial<Omit<TestPit, 'id' | 'label'>> = {}): FieldRecord {
  const l = label.trim();
  if (wallOf(l).wall) return addTestPit(r, l.toUpperCase(), p);
  return addTestPit(addTestPit(r, `${l}A`, p), `${l}B`, { ...p, location: null });
}

export function updateTestPit(r: FieldRecord, pitId: string, patch: Partial<Omit<TestPit, 'id'>>): FieldRecord {
  return touch({ ...r, testPits: r.testPits.map((p) => (p.id === pitId ? { ...p, ...patch } : p)) });
}

export function removeTestPit(r: FieldRecord, pitId: string): FieldRecord {
  return touch({ ...r, testPits: r.testPits.filter((p) => p.id !== pitId) });
}

export const emptyPercTest = (): Omit<PercTest, 'id' | 'label'> => ({
  testPitId: '',
  lot: '',
  holeDiameterIn: 6,
  holeDepthIn: null,
  referenceHeightIn: null,
  soilFinerThanSCL: '',
  fills: [],
  presoak: { startAt: '', endAt: '' },
  mode: 'standard',
  intervalMin: 30,
  fixedDropIn: 0.5,
  readings: [],
  tester: '',
  notes: '',
});

export function addPercTest(r: FieldRecord, label: string, p: Partial<Omit<PercTest, 'id' | 'label'>> = {}): FieldRecord {
  return touch({ ...r, percTests: [...r.percTests, { id: newId(), label, ...emptyPercTest(), ...p }] });
}

export function updatePercTest(r: FieldRecord, testId: string, patch: Partial<Omit<PercTest, 'id'>>): FieldRecord {
  return touch({ ...r, percTests: r.percTests.map((t) => (t.id === testId ? { ...t, ...patch } : t)) });
}

export function removePercTest(r: FieldRecord, testId: string): FieldRecord {
  return touch({ ...r, percTests: r.percTests.filter((t) => t.id !== testId) });
}

/** Adds a reading; it starts when the previous one ended and at its final distance unless given. */
export function addReading(r: FieldRecord, testId: string, p: Partial<Omit<PercReading, 'id'>> = {}): FieldRecord {
  const t = r.percTests.find((x) => x.id === testId);
  if (!t) return r;
  const prev = t.readings.at(-1);
  const reading: PercReading = { id: newId(), startAt: prev?.endAt ?? '', endAt: '', initialIn: prev?.finalIn ?? null, finalIn: null, ...p };
  return updatePercTest(r, testId, { readings: [...t.readings, reading] });
}

export function updateReading(r: FieldRecord, testId: string, readingId: string, patch: Partial<Omit<PercReading, 'id'>>): FieldRecord {
  const t = r.percTests.find((x) => x.id === testId);
  if (!t) return r;
  return updatePercTest(r, testId, { readings: t.readings.map((x) => (x.id === readingId ? { ...x, ...patch } : x)) });
}

export function removeReading(r: FieldRecord, testId: string, readingId: string): FieldRecord {
  const t = r.percTests.find((x) => x.id === testId);
  if (!t) return r;
  return updatePercTest(r, testId, { readings: t.readings.filter((x) => x.id !== readingId) });
}

/** Device clock as a LocalDateTime. */
export function localNow(d = new Date()): LocalDateTime {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
  // Horizon notes describe that wall only (0271: a driveway note from 7A was copied onto 29 walls).
  return updateTestPit(r, toPitId, { horizons: chainDepths(structuredClone(from.horizons).map((h) => ({ ...h, id: newId(), notes: '' }))) });
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
      ...blankTestPit(),
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
  // v2 → v3: perc tests and the owner name.
  2: (r) => ({ ...r, schemaVersion: 3, header: { ...emptyHeader(), ...r.header }, percTests: [] }),
  // v3 → v4: test pit photos and GPS fix, perc test certifications.
  3: (r) => ({
    ...r,
    schemaVersion: 4,
    testPits: (r.testPits ?? []).map((p: any) => ({ photos: [], location: null, ...p })),
    certifications: {},
  }),
  // v4 → v5: confirm-on-site flags, site map, planned pit locations, deliverable folder.
  4: (r) => ({
    ...r,
    schemaVersion: 5,
    testPits: (r.testPits ?? []).map((p: any) => ({ planned: null, ...p })),
    unconfirmed: {},
    siteMap: null,
    deliverableFolder: '',
  }),
  // v5 → v6: field edit stamps for merging, files the app filed to Dropbox.
  5: (r) => ({ ...r, schemaVersion: 6, edits: {}, filed: {} }),
  // v6 → v7: proposed system inputs for the rule checks.
  6: (r) => ({ ...r, schemaVersion: 7, design: emptyDesign() }),
  // v7 → v8: groundwater observation wells.
  7: (r) => ({ ...r, schemaVersion: 8, wells: [] }),
  // v8 → v9: area soils reference from the job file.
  8: (r) => ({ ...r, schemaVersion: 9, areaSoils: {} }),
  // v9 → v10: pit checks accepted on each wall.
  9: (r) => ({ ...r, schemaVersion: 10, testPits: (r.testPits ?? []).map((p: any) => ({ ...p, accepted: p.accepted ?? {} })) }),
  // v10 → v11: photo colors and the wall-face photo (optional fields).
  10: (r) => ({ ...r, schemaVersion: 11 }),
  // v11 → v12: the AI photo review on each wall (optional).
  11: (r) => ({ ...r, schemaVersion: 12 }),
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
