// Test pits and their walls: a soil log is one wall (`7A` north, `7B` south) of a numbered test
// pit, and both walls of a pit print on one page. See CONTEXT.md.
import type { LatLon, TestPit } from './fieldRecord';
import { pitStatus, type PitStatus } from './soilLogText';

/** `7A` → { pit: '7', wall: 'A' }; a label without a wall letter is its own pit. */
export function wallOf(label: string): { pit: string; wall: string } {
  const m = /^\s*(.*?\d)\s*([A-Z])\s*$/i.exec(label);
  return m ? { pit: m[1].toUpperCase(), wall: m[2].toUpperCase() } : { pit: label.trim().toUpperCase(), wall: '' };
}

/** Which side a wall is logged on (CONTEXT.md: A north, B south where the pit allows). */
export function wallSide(label: string): 'north' | 'south' | '' {
  const { wall } = wallOf(label);
  return wall === 'A' ? 'north' : wall === 'B' ? 'south' : '';
}

/** The number for the next test pit: one past the highest pit number so far. */
export function nextPitNumber(pits: TestPit[]): string {
  const nums = pits.map((p) => Number(wallOf(p.label).pit)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}

/** Walls grouped under their pit, pits in the order they were added, walls A before B. */
export function pitGroups(pits: TestPit[]): { pit: string; walls: TestPit[] }[] {
  const groups = new Map<string, TestPit[]>();
  for (const p of pits) {
    const key = wallOf(p.label).pit;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].map(([pit, walls]) => ({ pit, walls: [...walls].sort((a, b) => wallOf(a.label).wall.localeCompare(wallOf(b.label).wall)) }));
}

/** One status for a pit: complete when every wall is, not started when no wall is. */
export function groupStatus(walls: TestPit[]): PitStatus {
  const s = walls.map(pitStatus);
  return s.every((x) => x === 'complete') ? 'complete' : s.every((x) => x === 'not-started') ? 'not-started' : 'in-progress';
}

/** A new wall with no fix starts one when opened (Nate on 0271); a wall already begun waits for a tap. */
export const needsAutoFix = (wall: TestPit) => !wall.location && pitStatus(wall) === 'not-started';

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
