// GPS capture for a test pit wall. It starts the moment the pit is added (demo spec decision 12) and
// keeps going if the user leaves the wall's screen; the fix is saved whether or not that screen is open.
import { useEffect, useState } from 'preact/hooks';
import type { GpsFix } from '../domain/fieldRecord';

/** County site evaluations locate each test pit within 10 ft. */
export const COUNTY_FT = 10;
export const FT_PER_M = 3.28084;
/** A fix still short of the county's accuracy is kept after this long rather than waiting on. */
const FIX_TIMEOUT_MS = 90_000;

export interface Capture {
  recordId: string;
  wallId: string;
  watching: boolean;
  best: GpsFix | null;
  error?: string;
}

/** Saves a fix on its wall: the open wall screen's own save, or a direct save when it is closed. */
type Saver = (fix: GpsFix) => void;

let current: Capture | null = null;
let watchId: number | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const savers = new Map<string, Saver>();
let fallback: ((recordId: string, wallId: string, fix: GpsFix) => void) | undefined;
const listeners = new Set<() => void>();

const set = (next: Capture | null) => {
  current = next;
  listeners.forEach((l) => l());
};

/** The save used when the wall's screen is not open (set once by the app). */
export function setFixFallback(save: (recordId: string, wallId: string, fix: GpsFix) => void) {
  fallback = save;
}

/** The open wall screen registers its save while it is mounted. */
export function registerSaver(wallId: string, save: Saver) {
  savers.set(wallId, save);
  return () => void (savers.get(wallId) === save && savers.delete(wallId));
}

function accept(recordId: string, wallId: string, fix: GpsFix) {
  stopFix();
  const save = savers.get(wallId);
  if (save) save(fix);
  else fallback?.(recordId, wallId, fix);
}

/** Stops the capture under way (any wall), keeping no fix. */
export function stopFix(wallId?: string) {
  if (wallId && current?.wallId !== wallId) return;
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  clearTimeout(timer);
  watchId = undefined;
  if (current) set(current.error ? { ...current, watching: false } : null);
}

/** Starts capturing a fix for a wall (one wall at a time; a new start replaces the old one). */
export function startFix(recordId: string, wallId: string) {
  stopFix();
  if (!('geolocation' in navigator)) return set({ recordId, wallId, watching: false, best: null, error: 'This browser has no GPS access.' });
  set({ recordId, wallId, watching: true, best: null });
  let top: GpsFix | null = null;
  timer = setTimeout(() => {
    if (top) accept(recordId, wallId, top);
    else {
      stopFix();
      set({ recordId, wallId, watching: false, best: null, error: 'No GPS fix yet. Try again in open sky.' });
    }
  }, FIX_TIMEOUT_MS);
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy, at: new Date(pos.timestamp).toISOString() };
      if (!top || fix.accuracyM <= top.accuracyM) top = fix;
      set({ recordId, wallId, watching: true, best: top });
      // Good enough for the county: keep it without another tap.
      if (top.accuracyM * FT_PER_M <= COUNTY_FT) accept(recordId, wallId, top);
    },
    (e) => {
      stopFix();
      set({
        recordId,
        wallId,
        watching: false,
        best: null,
        error: e.code === e.PERMISSION_DENIED ? 'Location permission is off for this site. Allow it in the browser settings, then try again.' : `No GPS fix: ${e.message}`,
      });
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 120_000 },
  );
}

/** Keeps the best fix so far now instead of waiting for a better one. */
export function keepBestFix(wallId: string) {
  if (current?.wallId === wallId && current.best) accept(current.recordId, wallId, current.best);
}

/** The capture for this wall, if one is running or just failed. */
export function useCapture(wallId: string): Capture | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return current?.wallId === wallId ? current : null;
}
