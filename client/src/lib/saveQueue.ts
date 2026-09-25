/**
 * H-12: per-key serialized async save queue.
 *
 * Problem it solves: the exam client used to fire one POST per keystroke with
 * no ordering, so an older keystroke could overwrite a newer answer
 * server-side (last-write-wins), and answers typed in the final seconds were
 * never flushed before grading.
 *
 * Guarantees:
 *  - Tasks for the same key run strictly in order (a newer save never loses
 *    to an older in-flight one).
 *  - Tasks for different keys run concurrently.
 *  - One task's failure does not poison later tasks for the same key (the
 *    sequencing gate swallows the previous rejection), but the returned
 *    promise still rejects so the caller observes the failure.
 *  - `flush()` waits for everything enqueued so far and reports per-key
 *    failures, so a submit flow can refuse to proceed with unsaved data.
 *
 * Pure TypeScript, no React — unit-tested in tests/unit/saveQueue.test.ts.
 */
export interface SaveQueue {
  /** Run `task` after any in-flight task for `key` settles. Rejects if `task` fails. */
  enqueue(key: string, task: () => Promise<void>): Promise<void>;
  /**
   * Wait for every task enqueued so far. Tasks enqueued while flush is
   * awaiting are NOT covered — enqueue everything first, then flush.
   */
  flush(): Promise<{ failed: Array<{ key: string; error: unknown }> }>;
  /** Keys with a task currently in flight (debugging/introspection). */
  readonly inflightKeys: string[];
}

export function createSaveQueue(): SaveQueue {
  const inflight = new Map<string, Promise<void>>();

  function enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const prev = inflight.get(key) ?? Promise.resolve();
    // Sequencing gate: never rejects, so a failed save can't block later
    // saves for the same key. `next` still rejects so the caller sees it.
    const next = prev.catch(() => {}).then(task);
    const cleanup = () => {
      if (inflight.get(key) === next) inflight.delete(key);
    };
    next.then(cleanup, cleanup);
    inflight.set(key, next);
    return next;
  }

  async function flush(): Promise<{ failed: Array<{ key: string; error: unknown }> }> {
    const entries = Array.from(inflight.entries());
    const results = await Promise.allSettled(entries.map(([, p]) => p));
    const failed = results.flatMap((r, i) =>
      r.status === 'rejected' ? [{ key: entries[i][0], error: r.reason }] : []
    );
    return { failed };
  }

  return {
    enqueue,
    flush,
    get inflightKeys() {
      return Array.from(inflight.keys());
    },
  };
}
