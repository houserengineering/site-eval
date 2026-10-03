// The AI photo review queue (ticket 12): walls waiting for the office review service. The list is
// kept on this device, so a wall logged without signal is reviewed when signal returns (on the
// `online` event, at app start, and every 2 minutes). Nothing here ever blocks logging a pit.
import { useEffect, useState } from 'preact/hooks';
import { parseReview, reviewKey, reviewPhotos, reviewRequest, type AiReview, type ReviewImage } from '../domain/aiReview';
import type { FieldRecord } from '../domain/fieldRecord';
import type { RecordStore } from '../storage/db';

export interface ReviewState {
  state: 'queued' | 'running' | 'done' | 'failed';
  message?: string;
}

interface Pending {
  recordId: string;
  wallId: string;
}

export interface ReviewDeps {
  store: RecordStore;
  /** This device's token from `node service.mjs enroll`; '' = not set up. */
  token: () => string;
  /** The service's base URL, from `Review Service.json` in Dropbox; undefined if unknown. */
  serviceUrl: () => Promise<string | undefined>;
  fetch: typeof fetch;
  /** Stores the review on the wall; returns the record as saved. */
  save: (recordId: string, wallId: string, review: AiReview) => Promise<FieldRecord | undefined>;
  debounceMs?: number;
}

const KEY = 'aiReviewQueue';
const TIMEOUT_MS = 90_000;

const refused: Record<number, string> = {
  401: 'the review service does not know this device token. Check it in Settings.',
  403: 'the review service refused this app.',
  429: 'too many reviews this hour; it will try again.',
  503: 'the review service is not ready (no API key at the office yet).',
};

export class ReviewQueue {
  status: Record<string, ReviewState> = {};
  private pending: Pending[] = [];
  private loaded?: Promise<void>;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private again = false;

  constructor(private deps: ReviewDeps) {}

  load(): Promise<void> {
    return (this.loaded ??= this.deps.store.getSetting<Pending[]>(KEY).then((p) => void (this.pending = p ?? [])));
  }

  /** Loads the saved queue and retries it now, when signal returns, and every 2 minutes. */
  async start() {
    await this.load();
    addEventListener('online', () => this.kick(0));
    setInterval(() => this.kick(0), 120_000);
    this.kick(0);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  async pendingCount() {
    await this.load();
    return this.pending.length;
  }

  /** Queues a wall (once) and runs shortly, so a burst of edits sends one request. */
  async request(recordId: string, wallId: string) {
    await this.load();
    if (!this.pending.some((p) => p.wallId === wallId)) {
      this.pending.push({ recordId, wallId });
      await this.persist();
    }
    if (this.status[wallId]?.state !== 'running') this.setStatus(wallId, { state: 'queued' });
    this.kick(this.deps.debounceMs ?? 3000);
  }

  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.runOnce().finally(() => {
      this.running = undefined;
      if (this.again) {
        this.again = false;
        this.kick(1000);
      }
    });
    return this.running;
  }

  private kick(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async runOnce() {
    await this.load();
    for (const item of [...this.pending]) if (!(await this.review(item))) break;
  }

  /** Reviews one wall; false stops the run (no signal, no token, refused). */
  private async review(item: Pending): Promise<boolean> {
    const { store } = this.deps;
    const wall = (await store.get(item.recordId))?.testPits.find((p) => p.id === item.wallId);
    const key = wall && reviewKey(wall);
    if (!wall || !key || wall.aiReview?.key === key) {
      await this.drop(item);
      return true;
    }
    const token = this.deps.token();
    if (!token) return this.hold(item, 'queued', 'AI review waits for a device token in Settings.');
    const url = await this.deps.serviceUrl().catch(() => undefined);
    if (!url) return this.hold(item, 'queued', 'AI review waits for signal (review service not found yet).');

    const images: ReviewImage[] = [];
    for (const p of reviewPhotos(wall)) {
      const blob = await store.getPhoto(p.id);
      if (blob) images.push({ mediaType: blob.type || 'image/jpeg', data: await base64(blob) });
    }
    if (!images.length) {
      this.setStatus(item.wallId, { state: 'failed', message: 'AI review needs the photos on this device.' });
      await this.drop(item);
      return true;
    }

    this.setStatus(item.wallId, { state: 'running' });
    let res: Response;
    try {
      res = await this.deps.fetch(`${url.replace(/\/+$/, '')}/v1/review`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(reviewRequest(wall, images)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return this.hold(item, 'queued', 'AI review waits for signal; it runs when the phone is back online.');
    }
    if (!res.ok) return this.hold(item, 'failed', `AI review not done: ${refused[res.status] ?? `the review service answered ${res.status}.`}`);

    const text = String((await res.json().catch(() => ({})))?.text ?? '');
    const findings = parseReview(text, wall);
    const review: AiReview = { key, at: new Date().toISOString(), findings: findings ?? [], ...(findings ? {} : { unreadable: true }) };
    const saved = await this.deps.save(item.recordId, item.wallId, review);
    const now = saved?.testPits.find((p) => p.id === item.wallId);
    this.setStatus(item.wallId, { state: 'done' });
    // Edited while the review ran: keep it queued for the wall as it is now.
    if (!now || reviewKey(now) === key) await this.drop(item);
    else this.kick(this.deps.debounceMs ?? 3000);
    return true;
  }

  private hold(item: Pending, state: ReviewState['state'], message: string) {
    this.setStatus(item.wallId, { state, message });
    return false;
  }

  private async drop(item: Pending) {
    this.pending = this.pending.filter((p) => p.wallId !== item.wallId);
    await this.persist();
  }

  private persist() {
    return this.deps.store.setSetting(KEY, this.pending);
  }

  private setStatus(wallId: string, s: ReviewState) {
    this.status = { ...this.status, [wallId]: s };
    for (const fn of this.listeners) fn();
  }
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let queue: ReviewQueue | undefined;
export const setReviewQueue = (q: ReviewQueue) => (queue = q);
export const reviewQueue = () => queue;

export function useReviewStatus(wallId: string): ReviewState | undefined {
  const [s, setS] = useState(() => queue?.status[wallId]);
  useEffect(() => {
    if (!queue) return;
    setS(queue.status[wallId]);
    return queue.subscribe(() => setS(queue!.status[wallId]));
  }, [wallId]);
  return s;
}
