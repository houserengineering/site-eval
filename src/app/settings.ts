// Device settings (kept on this device, never synced): which optional modules the app shows, and
// the AI photo review device token.
import { useEffect, useState } from 'preact/hooks';
import type { RecordStore } from '../storage/db';
import { FEATURES } from './features';

export interface DeviceSettings {
  /** The perc test module. Off by default (Justin never runs perc tests); off hides it, records stay. */
  percTests: boolean;
  /** AI photo review device token (`node service.mjs enroll` on the office PC); '' = review off. */
  reviewToken: string;
  /** Animations (the demo's gliding highlight and Show me): follow the device's reduced-motion setting, or on/off. */
  motion: 'device' | 'on' | 'off';
}

const DEFAULTS: DeviceSettings = { percTests: false, reviewToken: '', motion: 'device' };
const KEY = 'settings';

/** As stored on this device; `current` is what the app uses. */
let stored: DeviceSettings = DEFAULTS;
let current: DeviceSettings = DEFAULTS;
const listeners = new Set<(s: DeviceSettings) => void>();

/** Reads this device's settings; call once at start-up before rendering. */
export async function loadSettings(store: RecordStore): Promise<DeviceSettings> {
  set({ ...DEFAULTS, ...(await store.getSetting<Partial<DeviceSettings>>(KEY)) });
  return current;
}

export const settings = () => current;

export async function changeSettings(store: RecordStore, change: Partial<DeviceSettings>) {
  set({ ...stored, ...change });
  await store.setSetting(KEY, stored);
}

function set(next: DeviceSettings) {
  stored = next;
  // With the perc module off (features.ts) a stored "on" is kept but never shows perc tests.
  current = FEATURES.PERC ? next : { ...next, percTests: false };
  for (const l of listeners) l(current);
}

export function useSettings(): DeviceSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    setS(current);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** Whether to animate: this device's Motion setting, or the system's reduced-motion preference. */
export function useAnimate(): boolean {
  const { motion } = useSettings();
  return motion === 'on' || (motion === 'device' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
}
