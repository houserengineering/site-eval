// Deterministic gap fill for soil log horizons: a blank field takes, in order, the same horizon on
// the other wall of the same pit, the same horizon on the nearest pit that has it, an area reference
// (soil survey data, for structure), the site-wide most common value, then a default. Every filled
// value records where it came from so it can be reviewed (and shown as a suggestion in the app).
import type { Horizon, TestPit } from './fieldRecord';
import { distanceFt } from './georef';
import { wallLocation, wallOf } from './pitWalls';

export type FillField = 'color' | 'texture' | 'rock' | 'structure' | 'roots' | 'mottling';

export interface Fill {
  wall: string;
  horizon: string;
  field: FillField;
  value: string;
  source: string;
}

/** Area reference for a horizon (e.g. soil survey structure at the pit); null = none. */
export type Reference = (wall: TestPit, h: Horizon, index: number) => { structure: string; source: string } | null;

const key = (h: Horizon) => h.designation.trim().toUpperCase();

const has: Record<FillField, (h: Horizon) => boolean> = {
  color: (h) => !!(h.color.hue && h.color.value && h.color.chroma) || !!h.color.other.trim(),
  texture: (h) => !!h.texture.cls.trim(),
  rock: (h) => h.rock.pct != null,
  structure: (h) => !!(h.structure.shape || h.structure.other.trim()),
  roots: (h) => !!h.roots,
  mottling: (h) => !!h.mottling.present,
};

const copy: Record<FillField, (to: Horizon, from: Horizon) => Horizon> = {
  color: (to, from) => ({ ...to, color: { ...from.color } }),
  texture: (to, from) => ({ ...to, texture: { ...from.texture } }),
  rock: (to, from) => ({ ...to, rock: { ...from.rock } }),
  structure: (to, from) => ({ ...to, structure: { ...from.structure } }),
  roots: (to, from) => ({ ...to, roots: from.roots }),
  mottling: (to, from) => ({ ...to, mottling: { ...from.mottling } }),
};

const show: Record<FillField, (h: Horizon) => string> = {
  color: (h) => h.color.other || `${h.color.hue} ${h.color.value}/${h.color.chroma}`,
  texture: (h) => h.texture.cls,
  rock: (h) => `${h.rock.pct}% ${h.rock.kind}`.trim(),
  structure: (h) => h.structure.other || [h.structure.grade, h.structure.size, h.structure.shape].filter(Boolean).join(' '),
  roots: (h) => h.roots,
  mottling: (h) => h.mottling.present,
};

/** Defaults when nothing on site says otherwise: roots in the top two horizons, no mottles. */
function fallback(field: FillField, h: Horizon, index: number): Horizon | null {
  if (field === 'roots') return { ...h, roots: index < 2 ? 'Y' : 'N' };
  if (field === 'mottling') return { ...h, mottling: { ...h.mottling, present: 'N' } };
  return null;
}

export function fillGaps(pits: TestPit[], reference?: Reference): { pits: TestPit[]; fills: Fill[] } {
  const observed = pits; // sources are the walls as recorded, never values filled in this pass
  const fills: Fill[] = [];
  const where = new Map(pits.map((p) => [p.id, wallLocation(p, pits)]));
  const out = pits.map((wall) => {
    const { pit } = wallOf(wall.label);
    const here = where.get(wall.id);
    const others = observed
      .filter((p) => p !== wall)
      .map((p) => {
        const there = where.get(p.id);
        const same = wallOf(p.label).pit === pit;
        return { p, same, d: same ? -1 : here && there ? distanceFt(here, there) : Infinity };
      })
      .sort((a, b) => a.d - b.d);
    const horizons = wall.horizons.map((h, i) => {
      let cur = h;
      for (const field of Object.keys(has) as FillField[]) {
        if (has[field](cur)) continue;
        const match = others.map((o) => ({ ...o, h: o.p.horizons.find((x) => key(x) === key(cur) && has[field](x)) })).find((o) => o.h);
        let next: Horizon | null = null;
        let source = '';
        if (match?.h && (field !== 'structure' || match.same || !reference)) {
          next = copy[field](cur, match.h);
          source = match.same ? `other wall (${match.p.label})` : `nearest pit with it (${match.p.label}, ${Math.round(match.d)} ft)`;
        } else if (field === 'structure' && reference) {
          const ref = reference(wall, cur, i);
          if (ref) {
            next = { ...cur, structure: { ...cur.structure, other: ref.structure } };
            source = ref.source;
          }
        }
        if (!next) {
          const pool = observed.flatMap((p) => p.horizons).filter((x) => key(x) === key(cur) && has[field](x));
          if (pool.length) {
            const counts = new Map<string, { n: number; h: Horizon }>();
            for (const x of pool) {
              const v = show[field](x);
              counts.set(v, { n: (counts.get(v)?.n ?? 0) + 1, h: x });
            }
            const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
            next = copy[field](cur, best.h);
            source = `site pattern (${best.n} of ${pool.length} ${key(cur)} horizons)`;
          }
        }
        if (!next) {
          next = fallback(field, cur, i);
          source = 'default';
        }
        if (next) {
          cur = next;
          fills.push({ wall: wall.label, horizon: `${cur.designation} ${cur.topIn}-${cur.bottomIn}`, field, value: show[field](cur), source });
        }
      }
      return cur;
    });
    return { ...wall, horizons };
  });
  return { pits: out, fills };
}
