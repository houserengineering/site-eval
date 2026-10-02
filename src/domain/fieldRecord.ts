// Field record: everything captured on a site evaluation. Persisted as JSON on device
// and (later) in Dropbox, so the shape is versioned and migrated on load.

export const SCHEMA_VERSION = 1;

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

export interface Horizon {
  id: string;
  designation: string;
  /** Depths in inches below ground surface. */
  topIn: number | null;
  bottomIn: number | null;
  color: string;
  texture: string;
  structure: string;
  roots: string;
  mottling: string;
  notes: string;
}

export interface TestPit {
  id: string;
  label: string;
  horizons: Horizon[];
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

export function addTestPit(r: FieldRecord, label: string): FieldRecord {
  return touch({ ...r, testPits: [...r.testPits, { id: newId(), label, horizons: [] }] });
}

export function updateTestPit(r: FieldRecord, pitId: string, patch: Partial<Omit<TestPit, 'id'>>): FieldRecord {
  return touch({ ...r, testPits: r.testPits.map((p) => (p.id === pitId ? { ...p, ...patch } : p)) });
}

export function removeTestPit(r: FieldRecord, pitId: string): FieldRecord {
  return touch({ ...r, testPits: r.testPits.filter((p) => p.id !== pitId) });
}

export const emptyHorizon = (): Omit<Horizon, 'id'> => ({
  designation: '',
  topIn: null,
  bottomIn: null,
  color: '',
  texture: '',
  structure: '',
  roots: '',
  mottling: '',
  notes: '',
});

export function addHorizon(r: FieldRecord, pitId: string, h: Partial<Omit<Horizon, 'id'>> = {}): FieldRecord {
  const pit = r.testPits.find((p) => p.id === pitId);
  const top = pit?.horizons.at(-1)?.bottomIn ?? (pit?.horizons.length ? null : 0);
  const horizon: Horizon = { id: newId(), ...emptyHorizon(), topIn: top, ...h };
  return updateTestPit(r, pitId, { horizons: [...(pit?.horizons ?? []), horizon] });
}

export function updateHorizon(r: FieldRecord, pitId: string, horizonId: string, patch: Partial<Omit<Horizon, 'id'>>): FieldRecord {
  const pit = r.testPits.find((p) => p.id === pitId);
  if (!pit) return r;
  return updateTestPit(r, pitId, {
    horizons: pit.horizons.map((h) => (h.id === horizonId ? { ...h, ...patch } : h)),
  });
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
const migrations: Record<number, (r: any) => any> = {};

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
