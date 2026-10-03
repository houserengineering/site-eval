import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyHorizon, newSiteEvaluation, addTestPit, updateTestPit, type FieldRecord } from '../src/domain/fieldRecord';
import { reviewKey, type AiReview } from '../src/domain/aiReview';
import { openStore, type RecordStore } from '../src/storage/db';
import { ReviewQueue } from '../src/app/reviewQueue';

async function setup(fetcher: typeof fetch, token = 'tok') {
  const store = await openStore(`t-${crypto.randomUUID()}`);
  let r = addTestPit(newSiteEvaluation(), '1A');
  const wall = r.testPits[0];
  r = updateTestPit(r, wall.id, {
    horizons: [{ ...emptyHorizon(), id: 'h1', designation: 'A', topIn: 0, bottomIn: 96 }],
    photos: [{ id: 'p1', takenAt: 't', width: 1200, height: 1600 }],
  });
  await store.save(r);
  await store.putPhoto('p1', r.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
  const sent: any[] = [];
  const queue = new ReviewQueue({
    store,
    token: () => token,
    serviceUrl: async () => 'https://review.test',
    fetch: (async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers, body: JSON.parse(init.body as string) });
      return fetcher(url, init);
    }) as typeof fetch,
    save: async (recordId: string, wallId: string, review: AiReview) => {
      const cur = (await store.get(recordId))!;
      const next = updateTestPit(cur, wallId, { aiReview: review });
      await store.save(next);
      return next;
    },
    debounceMs: 0,
  });
  return { store, r, wallId: wall.id, queue, sent };
}

const answer = (text: string) => async () => new Response(JSON.stringify({ text }), { status: 200 });
const wallOf = async (store: RecordStore, r: FieldRecord) => (await store.get(r.id))!.testPits[0];

describe('AI review queue (ticket 12)', () => {
  it('sends the wall photo and log with the device token and stores the review', async () => {
    const { store, r, wallId, queue, sent } = await setup(answer('{"flags":[{"check":"rock","horizon":1,"say":"Far more rock than logged."}]}'));
    await queue.request(r.id, wallId);
    await queue.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://review.test/v1/review');
    expect(sent[0].headers.authorization).toBe('Bearer tok');
    expect(sent[0].body.images).toEqual([{ mediaType: 'image/jpeg', data: 'AQID' }]);
    const w = await wallOf(store, r);
    expect(w.aiReview).toMatchObject({ key: reviewKey(w), findings: [{ check: 'rock', horizonId: 'h1', message: 'Far more rock than logged.' }] });
    expect(queue.status[wallId].state).toBe('done');
    expect(await queue.pendingCount()).toBe(0);
  });

  it('without signal the review stays queued, survives a restart, and runs when signal returns', async () => {
    let online = false;
    const { store, r, wallId, queue } = await setup(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ text: '{"flags":[]}' }), { status: 200 });
    });
    await queue.request(r.id, wallId);
    await queue.run();
    expect(queue.status[wallId]).toMatchObject({ state: 'queued', message: expect.stringMatching(/signal/) });
    expect((await wallOf(store, r)).aiReview).toBeUndefined();

    // A new queue on the same device (app restart) picks it up.
    online = true;
    const again = new ReviewQueue({ ...(queue as any).deps });
    await again.load();
    expect(await again.pendingCount()).toBe(1);
    await again.run();
    expect((await wallOf(store, r)).aiReview?.findings).toEqual([]);
    expect(await again.pendingCount()).toBe(0);
  });

  it('a refused request stays queued and says why; an unreadable answer is stored as no flags', async () => {
    const { r, wallId, queue } = await setup(async () => new Response('{"error":"key not configured"}', { status: 503 }));
    await queue.request(r.id, wallId);
    await queue.run();
    expect(queue.status[wallId]).toMatchObject({ state: 'failed', message: expect.stringMatching(/not ready/) });
    expect(await queue.pendingCount()).toBe(1);

    const b = await setup(answer('Looks fine to me.'));
    await b.queue.request(b.r.id, b.wallId);
    await b.queue.run();
    expect((await wallOf(b.store, b.r)).aiReview).toMatchObject({ findings: [], unreadable: true });
  });

  it('with no device token nothing is sent and the wall waits', async () => {
    const { r, wallId, queue, sent } = await setup(answer('{"flags":[]}'), '');
    await queue.request(r.id, wallId);
    await queue.run();
    expect(sent).toEqual([]);
    expect(queue.status[wallId]).toMatchObject({ state: 'queued', message: expect.stringMatching(/token/) });
    expect(await queue.pendingCount()).toBe(1);
  });
});
