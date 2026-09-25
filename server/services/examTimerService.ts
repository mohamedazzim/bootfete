/**
 * QA-601: Canonical server-side exam timer enforcement.
 *
 * Single source of truth for attempt expiration. All time-sensitive
 * attempt mutations MUST call `assertAttemptNotExpired()` before writing.
 *
 * Rules:
 * - Deadline = attempt.startedAt + round.duration (minutes)
 * - Uses server time (Date.now()), never client timestamps
 * - Paused rounds: pause time is not counted (startedAt is shifted on resume)
 * - Exact boundary: NOW > deadline => expired (strictly greater)
 * - Expired attempts transition to "expired" status atomically
 */

import { storage } from "../storage.js";

export interface ExpiryCheck {
  expired: boolean;
  deadline: Date | null;
  now: Date;
  remainingMs: number;
}

/**
 * Calculate whether an attempt has expired, using server time.
 * Does NOT mutate state — use `assertAttemptNotExpired` for enforcement.
 */
export async function checkAttemptExpiry(attemptId: string): Promise<ExpiryCheck> {
  const now = new Date();
  const attempt = await storage.getTestAttempt(attemptId);

  if (!attempt || !attempt.startedAt) {
    return { expired: false, deadline: null, now, remainingMs: Infinity };
  }

  // Terminal states are not subject to timer checks
  if (attempt.status !== "in_progress") {
    return { expired: true, deadline: null, now, remainingMs: 0 };
  }

  const round = await storage.getRound(attempt.roundId);
  if (!round || !round.duration) {
    return { expired: false, deadline: null, now, remainingMs: Infinity };
  }

  const deadline = new Date(
    new Date(attempt.startedAt).getTime() + round.duration * 60 * 1000
  );
  const remainingMs = deadline.getTime() - now.getTime();

  return {
    expired: remainingMs < 0,
    deadline,
    now,
    remainingMs: Math.max(0, remainingMs),
  };
}

/**
 * Enforce timer before any attempt mutation.
 * If expired, atomically transitions attempt to "expired" status
 * and throws an error that routes should convert to HTTP 403.
 *
 * @throws {AttemptExpiredError} when the attempt deadline has passed
 */
export async function assertAttemptNotExpired(attemptId: string): Promise<void> {
  const check = await checkAttemptExpiry(attemptId);

  if (check.expired && check.deadline) {
    // Atomically transition to expired (idempotent — only from in_progress)
    await storage.updateTestAttempt(attemptId, {
      status: "expired",
      submittedAt: new Date(),
      completedAt: new Date(),
    } as any);
    throw new AttemptExpiredError(check.deadline);
  }

  if (check.expired) {
    // Already in terminal state
    throw new AttemptExpiredError(null);
  }
}

export class AttemptExpiredError extends Error {
  deadline: Date | null;
  statusCode = 403;

  constructor(deadline: Date | null) {
    super(
      deadline
        ? `Time expired. The test ended at ${deadline.toISOString()}.`
        : `This attempt is no longer in progress.`
    );
    this.name = "AttemptExpiredError";
    this.deadline = deadline;
  }
}
