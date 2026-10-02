// Test pits and their walls: a soil log is one wall (`7A` north, `7B` south) of a numbered test
// pit, and both walls of a pit print on one page. See CONTEXT.md.
import type { LatLon, TestPit } from './fieldRecord';

/** `7A` → { pit: '7', wall: 'A' }; a label without a wall letter is its own pit. */
export function wallOf(label: string): { pit: string; wall: string } {
  const m = /^\s*(.*?\d)\s*([A-Z])\s*$/i.exec(label);
  return m ? { pit: m[1].toUpperCase(), wall: m[2].toUpperCase() } : { pit: label.trim().toUpperCase(), wall: '' };
}

export interface PitPage {
  pit: string;
  /** One or two walls, A before B. */
  walls: TestPit[];
}

/** Pages of the soil log: walls grouped by pit, pits in number order, at most two walls a page. */
export function pitPages(pits: TestPit[]): PitPage[] {
  const groups = new Map<string, TestPit[]>();
  for (const p of pits) {
    const key = wallOf(p.label).pit;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isNaN(n) ? Infinity : n;
  };
  const pages: PitPage[] = [];
  for (const [pit, walls] of [...groups].sort(([a], [b]) => num(a) - num(b) || a.localeCompare(b))) {
    const sorted = [...walls].sort((a, b) => wallOf(a.label).wall.localeCompare(wallOf(b.label).wall));
    for (let i = 0; i < sorted.length; i += 2) pages.push({ pit, walls: sorted.slice(i, i + 2) });
  }
  return pages;
}

export type LocationSource = 'field' | 'other-wall' | 'planned';

export interface WallLocation extends LatLon {
  source: LocationSource;
  /** Reported accuracy of a field fix, metres. */
  accuracyM?: number;
  at?: string;
}

/**
 * Where a wall is: its own GPS fix, else the other wall's fix (same hole), else the pit's
 * planned location from the job file (CAD/onX map pin).
 */
export function wallLocation(wall: TestPit, all: TestPit[]): WallLocation | null {
  if (wall.location) return { ...wall.location, source: 'field' };
  const { pit } = wallOf(wall.label);
  const others = all.filter((p) => p !== wall && wallOf(p.label).pit === pit);
  const fixed = others.find((p) => p.location);
  if (fixed?.location) return { ...fixed.location, source: 'other-wall' };
  const planned = wall.planned ?? others.find((p) => p.planned)?.planned;
  return planned ? { lat: planned.lat, lon: planned.lon, source: 'planned' } : null;
}
