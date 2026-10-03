// Device settings (kept on this device, never synced): which optional modules the app shows, and
// the AI photo review device token.
import { useEffect, useState } from 'preact/hooks';
import type { RecordStore } from '../storage/db';

export interface DeviceSettings {
  /** The perc test module. Off by default (Justin never runs perc tests); off hides it, records stay. */
  percTests: boolean;
  /** AI photo review device token (`node service.mjs enroll` on the office PC); '' = review off. */
  reviewToken: string;
}

const DEFAULTS: DeviceSettings = { percTests: false, reviewToken: '' };
const KEY = 'settings';

let current: DeviceSettings = DEFAULTS;
const listeners = new Set<(s: DeviceSettings) => void>();

/** Reads this device's settings; call once at start-up before rendering. */
export async function loadSettings(store: RecordStore): Promise<DeviceSettings> {
  set({ ...DEFAULTS, ...(await store.getSetting<Partial<DeviceSettings>>(KEY)) });
  return current;
}

export const settings = () => current;

export async function changeSettings(store: RecordStore, change: Partial<DeviceSettings>) {
  set({ ...current, ...change });
  await store.setSetting(KEY, current);
}

function set(next: DeviceSettings) {
  current = next;
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
