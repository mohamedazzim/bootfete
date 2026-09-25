import { describe, test, expect } from '@jest/globals';
import { createSaveQueue } from '../../client/src/lib/saveQueue.js';

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

describe('saveQueue (H-12)', () => {
  test('serializes tasks for the same key: a newer save never loses to an older in-flight one', async () => {
    const q = createSaveQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => { releaseFirst = r; });

    const p1 = q.enqueue('q1', async () => { order.push('first-start'); await firstGate; order.push('first-end'); });
    const p2 = q.enqueue('q1', async () => { order.push('second'); });
    // p2 must not start while p1 is still in flight
    await tick(20);
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  test('tasks for different keys run concurrently', async () => {
    const q = createSaveQueue();
    const order: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => { releaseA = r; });

    const pA = q.enqueue('a', async () => { order.push('a-start'); await gateA; order.push('a-end'); });
    const pB = q.enqueue('b', async () => { order.push('b'); });
    await tick(20);
    // b did not wait for a
    expect(order).toEqual(['a-start', 'b']);
    releaseA();
    await Promise.all([pA, pB]);
    expect(order).toEqual(['a-start', 'b', 'a-end']);
  });

  test('a failed task does not poison later tasks for the same key, but the caller sees the failure', async () => {
    const q = createSaveQueue();
    const ran: string[] = [];
    const boom = new Error('network down');

    const p1 = q.enqueue('q1', async () => { ran.push('first'); throw boom; });
    const p2 = q.enqueue('q1', async () => { ran.push('second'); });

    await expect(p1).rejects.toThrow('network down');
    await p2; // second still ran despite the first failing
    expect(ran).toEqual(['first', 'second']);
  });

  test('flush waits for in-flight tasks enqueued before it', async () => {
    const q = createSaveQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let done = false;

    const p = q.enqueue('q1', async () => { await gate; done = true; });
    const flushP = q.flush();
    await tick(20);
    expect(done).toBe(false); // flush hasn't resolved early
    release();
    const { failed } = await flushP;
    await p;
    expect(done).toBe(true);
    expect(failed).toEqual([]);
  });

  test('flush reports per-key failures and the key stays usable afterwards', async () => {
    const q = createSaveQueue();
    const boom = new Error('save failed');
    // Attach a no-op catch: the enqueue contract says the caller observes
    // failures; here flush is the observer.
    q.enqueue('q1', async () => { throw boom; }).catch(() => {});
    q.enqueue('q2', async () => { /* ok */ }).catch(() => {});

    const { failed } = await q.flush();
    expect(failed).toHaveLength(1);
    expect(failed[0].key).toBe('q1');
    expect(failed[0].error).toBe(boom);

    // Chain not poisoned: a later save for q1 still runs.
    let ran = false;
    await q.enqueue('q1', async () => { ran = true; });
    expect(ran).toBe(true);
  });

  test('flush on an empty queue resolves with no failures', async () => {
    const q = createSaveQueue();
    const { failed } = await q.flush();
    expect(failed).toEqual([]);
  });
});
