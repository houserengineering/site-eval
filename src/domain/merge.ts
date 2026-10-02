// Field-level last-writer-wins merge for two devices editing one site evaluation.
//
// A record is flattened to leaf paths (`/testPits/@<id>/horizons/@<id>/color/hue`). Arrays of
// id'd items (test pits, horizons, photos, perc tests, readings) become keyed elements plus an
// `#order` leaf, so two devices adding different pits both keep theirs. Each save stamps the
// paths it changed with who and when (`record.edits`); a path without a stamp inherits the
// nearest stamped ancestor. Merging takes, path by path, the side with the later stamp.
// Deleting an element stamps its marker, so a deletion made after the other side's edits wins.
import type { FieldRecord } from './fieldRecord';

export interface Stamp {
  by: string;
  at: string;
}

/** Arrays under these keys hold `{ id }` items and merge element by element. */
const ID_ARRAYS = new Set(['testPits', 'horizons', 'photos', 'percTests', 'readings']);
/** Bookkeeping, not evaluation data. */
const UNTRACKED = new Set(['schemaVersion', 'id', 'createdAt', 'updatedAt', 'edits']);

const OBJ = '\u0000obj';
const ELEM = '\u0000elem';
const ARR = '\u0000arr';
const ORDER = '#order';

const esc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');
const unesc = (k: string) => k.replace(/~1/g, '/').replace(/~0/g, '~');
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

type Flat = Map<string, unknown>;

function flattenInto(v: unknown, path: string, key: string, out: Flat) {
  if (ID_ARRAYS.has(key) && Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string')) {
    out.set(path, ARR);
    out.set(`${path}/${ORDER}`, v.map((x: any) => x.id));
    for (const x of v as Record<string, unknown>[]) {
      const p = `${path}/@${esc(x.id as string)}`;
      out.set(p, ELEM);
      for (const [k, c] of Object.entries(x)) if (k !== 'id') flattenInto(c, `${p}/${esc(k)}`, k, out);
    }
  } else if (isObj(v)) {
    out.set(path, OBJ);
    for (const [k, c] of Object.entries(v)) flattenInto(c, `${path}/${esc(k)}`, k, out);
  } else out.set(path, v);
}

export function flatten(r: FieldRecord): Flat {
  const out: Flat = new Map();
  for (const [k, v] of Object.entries(r)) if (!UNTRACKED.has(k)) flattenInto(v, `/${esc(k)}`, k, out);
  return out;
}

const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '' : path.slice(0, i);
}

/** The stamp that governs `path`: its own, else the nearest stamped ancestor's. */
export function stampOf(edits: Record<string, Stamp> | undefined, path: string): Stamp | undefined {
  for (let p = path; p; p = parentOf(p)) if (edits?.[p]) return edits[p];
  return undefined;
}

/**
 * Stamps every path that differs between `prev` and `next` with `who`/`at`. A new element is
 * stamped once at its marker (its fields inherit it); a removed one keeps a stamp at its marker.
 */
export function stampEdits(prev: FieldRecord, next: FieldRecord, by: string, at = new Date().toISOString()): FieldRecord {
  const a = flatten(prev);
  const b = flatten(next);
  const edits = { ...(next.edits ?? prev.edits ?? {}) };
  const stamp = { by, at };
  const covered = (p: string) => {
    for (let q = parentOf(p); q; q = parentOf(q)) if ((b.get(q) === ELEM && !a.has(q)) || (a.get(q) === ELEM && !b.has(q))) return true;
    return false;
  };
  let changed = false;
  for (const p of new Set([...a.keys(), ...b.keys()])) {
    if (same(a.get(p), b.get(p)) && a.has(p) === b.has(p)) continue;
    changed = true;
    if (covered(p)) {
      delete edits[p];
      continue;
    }
    edits[p] = stamp;
  }
  return changed ? { ...next, edits } : next;
}

const later = (x: Stamp | undefined, y: Stamp | undefined) => {
  if (!x) return false;
  if (!y) return true;
  return x.at > y.at || (x.at === y.at && x.by > y.by);
};

function unflatten(flat: Flat): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const paths = [...flat.keys()].sort((x, y) => x.split('/').length - y.split('/').length);
  const nodes = new Map<string, any>([['', root]]);
  const orders = new Map<string, string[]>();
  for (const p of paths) {
    const parent = nodes.get(parentOf(p));
    if (parent === undefined) continue; // the container was deleted or replaced by a value
    const seg = p.slice(parentOf(p).length + 1);
    const v = flat.get(p);
    if (seg === ORDER) {
      orders.set(parentOf(p), v as string[]);
      continue;
    }
    if (seg.startsWith('@')) {
      if (v !== ELEM || !(parent instanceof Map)) continue;
      const el = { id: unesc(seg.slice(1)) };
      parent.set(el.id, el);
      nodes.set(p, el);
      continue;
    }
    const key = unesc(seg);
    if (v === ARR) {
      const m = new Map<string, any>();
      nodes.set(p, m);
      parent[key] = m;
    } else if (v === OBJ) {
      const o = {};
      nodes.set(p, o);
      parent[key] = o;
    } else if (v !== ELEM) parent[key] = structuredClone(v);
  }
  // Element maps back to arrays (deepest first) in the merged order; elements missing from it go last.
  for (const [p, m] of [...nodes.entries()].filter(([, n]) => n instanceof Map).reverse()) {
    const order = orders.get(p) ?? [];
    const ids = [...order.filter((id) => m.has(id)), ...[...m.keys()].filter((id) => !order.includes(id))];
    const arr = ids.map((id) => m.get(id));
    const parent = nodes.get(parentOf(p));
    parent[unesc(p.slice(parentOf(p).length + 1))] = arr;
  }
  return root;
}

/**
 * Merges two copies of one record. For each path the copy with the later stamp wins; where
 * neither copy has a stamp, the copy saved later wins. Stamps merge too, so merging is
 * repeatable and order-independent.
 */
export function mergeRecords(local: FieldRecord, remote: FieldRecord): FieldRecord {
  if (local.id !== remote.id) throw new Error('Cannot merge two different site evaluations.');
  const a = flatten(local);
  const b = flatten(remote);
  const remoteNewer = remote.updatedAt > local.updatedAt;
  const out: Flat = new Map();
  for (const p of new Set([...a.keys(), ...b.keys()])) {
    const sa = stampOf(local.edits, p);
    const sb = stampOf(remote.edits, p);
    const useB = later(sb, sa) || (!later(sa, sb) && remoteNewer);
    const side = useB ? b : a;
    if (side.has(p)) out.set(p, side.get(p));
  }
  const edits: Record<string, Stamp> = { ...(local.edits ?? {}) };
  for (const [p, s] of Object.entries(remote.edits ?? {})) if (later(s, edits[p])) edits[p] = s;
  const body = unflatten(out);
  return {
    ...(body as any),
    schemaVersion: local.schemaVersion,
    id: local.id,
    createdAt: local.createdAt < remote.createdAt ? local.createdAt : remote.createdAt,
    updatedAt: local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt,
    edits,
  } as FieldRecord;
}

/** Same evaluation data (ignores bookkeeping such as `updatedAt`, key order and stamps). */
export function sameRecord(a: FieldRecord, b: FieldRecord): boolean {
  const fa = flatten(a);
  const fb = flatten(b);
  return fa.size === fb.size && [...fa].every(([p, v]) => fb.has(p) && same(v, fb.get(p)));
}

/** Who last changed anything at or under `path` (e.g. a test pit), for "edited by" notes. */
export function lastEdit(r: FieldRecord, path: string): Stamp | undefined {
  let best = stampOf(r.edits, path);
  for (const [p, s] of Object.entries(r.edits ?? {})) if (p.startsWith(`${path}/`) && later(s, best)) best = s;
  return best;
}

export const pitPath = (pitId: string) => `/testPits/@${esc(pitId)}`;
export const percPath = (testId: string) => `/percTests/@${esc(testId)}`;
