// Demo progress (kept on this device): which step, which demo evaluation, and whether this is a replay
// from Settings. The first run on a device is required and must be finished once (spec decisions 6, 8).
import { useEffect, useState } from 'preact/hooks';
import { newSiteEvaluation, type FieldRecord } from '../../domain/fieldRecord';
import type { RecordStore } from '../../storage/db';

const KEY = 'site-eval:demo';
const DONE_KEY = 'site-eval:demo-done';

export interface DemoState {
  step: number;
  recordId: string;
  /** Started from Settings › Replay the demo: Exit demo is allowed. */
  replay: boolean;
  /** The planted photo on wall B the user retakes (decision 11). */
  planted?: string;
}

let state: DemoState | null = read();
const listeners = new Set<() => void>();

function read(): DemoState | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return s && typeof s.step === 'number' ? s : null;
  } catch {
    return null;
  }
}

export const demoState = () => state;

export function setDemoState(next: DemoState | null) {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

/** True once this device has finished the demo; with no storage, the demo is not forced. */
export function demoDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markDemoDone() {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {}
}

/** A fresh demo evaluation (blank header: the user fills it) at step 1; earlier demo evaluations are removed. */
export async function startDemo(store: RecordStore, replay: boolean) {
  await removeDemoRecords(store);
  const r: FieldRecord = { ...newSiteEvaluation(), demo: true };
  await store.save(r);
  setDemoState({ step: 0, recordId: r.id, replay });
  location.hash = `#/se/${r.id}`;
}

export async function removeDemoRecords(store: RecordStore) {
  const { records } = await store.list();
  for (const r of records.filter((x) => x.demo)) await store.remove(r.id);
}

/** The demo evaluation as the open screen has it, with that screen's save. */
export interface Live {
  record: FieldRecord;
  save: (r: FieldRecord) => void;
}
let live: Live | undefined;

/** Called by the record screens on every render of a demo evaluation. */
export function publishLive(record: FieldRecord, save: (r: FieldRecord) => void) {
  if (live?.record === record) return;
  live = { record, save };
  queueMicrotask(() => listeners.forEach((l) => l()));
}
export const liveRecord = () => live;

export function useDemo(): { state: DemoState | null; live: Live | undefined } {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return { state, live: live && state && live.record.id === state.recordId ? live : undefined };
}
