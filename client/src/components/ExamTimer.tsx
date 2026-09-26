import { memo, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface ExamTimerProps {
  /** Round duration in seconds. */
  durationSeconds: number;
  /** ISO timestamp of attempt.startedAt. */
  startedAt: string | Date | null | undefined;
  /** Round status — 'paused' freezes the countdown. */
  roundStatus: string | null | undefined;
  /** ISO timestamp of round.updatedAt (pause anchor). */
  roundUpdatedAt: string | Date | null | undefined;
  /** Whether the test has begun (fullscreen acquired). */
  hasStarted: boolean;
  /** Whether the attempt is still in_progress (stops ticking after submit). */
  attemptInProgress: boolean;
  /** Called when the countdown reaches zero (parent auto-submits). */
  onExpire: () => void;
  /** Called once when the countdown crosses the 5-min / 1-min marks. */
  onWarning: (kind: 'five' | 'one') => void;
}

function computeRemaining(
  durationSeconds: number,
  startedAt: string | Date | null | undefined,
  roundStatus: string | null | undefined,
  roundUpdatedAt: string | Date | null | undefined,
): number {
  if (!startedAt) return 0;
  const startTime = new Date(startedAt).getTime();
  const isPaused = roundStatus === 'paused';
  const effectiveNow = isPaused && roundUpdatedAt ? new Date(roundUpdatedAt).getTime() : Date.now();
  const elapsed = Math.floor((effectiveNow - startTime) / 1000);
  return Math.max(0, durationSeconds - elapsed);
}

// Track-4: the 1s ticking timer used to live in take-test.tsx page state,
// re-rendering the entire exam page every second. It now owns its own
// state and is memoized, so ticks re-render only this badge. All timing
// semantics (init from startedAt, pause freeze, visibility resync,
// 5/1-min warnings, expiry) are preserved verbatim from the original.
const ExamTimer = memo(function ExamTimer({
  durationSeconds,
  startedAt,
  roundStatus,
  roundUpdatedAt,
  hasStarted,
  attemptInProgress,
  onExpire,
  onWarning,
}: ExamTimerProps) {
  // Initialize synchronously during render (lazy useState), NOT in an
  // effect. The timer mounts inside the active exam UI — i.e. with
  // hasStarted=true on its very first render (the begin screen returns
  // early) — so an effect-based init would leave timeRemaining at its 0
  // initial value for the mount commit, and the expiry effect below (which
  // runs in that same commit) would fire an immediate auto-submit.
  // Computing the initial value during render closes that race by
  // construction.
  const [timeRemaining, setTimeRemaining] = useState(() =>
    computeRemaining(durationSeconds, startedAt, roundStatus, roundUpdatedAt),
  );
  // Guard for the pathological case where startedAt arrives after mount:
  // never auto-submit a timer that hasn't been initialized from a real
  // startedAt.
  const initializedRef = useRef(startedAt != null);

  // Re-sync from the attempt + round (mirrors the original init effect:
  // pause anchors to round.updatedAt).
  useEffect(() => {
    if (startedAt) {
      initializedRef.current = true;
      setTimeRemaining(computeRemaining(durationSeconds, startedAt, roundStatus, roundUpdatedAt));
    }
  }, [durationSeconds, startedAt, roundStatus, roundUpdatedAt]);

  // Countdown interval — created once per active test, not on every tick.
  useEffect(() => {
    if (!hasStarted || !attemptInProgress) return;
    const timer = setInterval(() => {
      if (roundStatus === 'paused') return;
      setTimeRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasStarted, attemptInProgress, roundStatus]);

  // Round-2 M19: setInterval is throttled to ~1/min in backgrounded tabs, so
  // the displayed countdown can drift minutes off. On return, recompute from
  // attempt.startedAt — no network needed. (While paused the pause overlay
  // owns the timer, so we skip then.)
  useEffect(() => {
    if (!hasStarted) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (!startedAt) return;
      if (roundStatus === 'paused') return;
      setTimeRemaining(computeRemaining(durationSeconds, startedAt, roundStatus, roundUpdatedAt));
    };
    document.addEventListener('visibilitychange', resync);
    return () => document.removeEventListener('visibilitychange', resync);
  }, [hasStarted, durationSeconds, startedAt, roundStatus, roundUpdatedAt]);

  // Warnings + expiry. Callbacks are read through refs so this effect never
  // re-subscribes on parent re-renders. Expiry intentionally has no
  // once-guard: the parent's submit trigger owns the C3 idempotency guard
  // and retries a failed auto-submit on the next tick.
  const warned5 = useRef(false);
  const warned1 = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;

  useEffect(() => {
    if (!hasStarted || !attemptInProgress) return;
    // Never auto-submit a timer that hasn't been initialized from a real
    // startedAt (see the lazy useState initializer above).
    if (!initializedRef.current) return;
    if (timeRemaining <= 0) {
      onExpireRef.current();
      return;
    }
    // Round-2 M28: <= with the shown-flags — exact equality never fires
    // when a throttled interval jumps 301 -> 299.
    if (timeRemaining <= 300 && !warned5.current) {
      warned5.current = true;
      onWarningRef.current('five');
    }
    if (timeRemaining <= 60 && !warned1.current) {
      warned1.current = true;
      onWarningRef.current('one');
    }
  }, [timeRemaining, hasStarted, attemptInProgress]);

  const danger = timeRemaining < 300;
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${danger ? 'bg-red-100' : 'bg-blue-100'}`}>
      <Clock className={`h-5 w-5 ${danger ? 'text-red-600' : 'text-blue-600'}`} />
      {/* Round-2 M28: screen-reader users need to hear time warnings. */}
      <span
        className={`font-mono text-lg font-bold ${danger ? 'text-red-900' : 'text-blue-900'}`}
        data-testid="text-timer"
        aria-live="polite"
        aria-label={`Time remaining: ${formatTime(timeRemaining)}`}
      >
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
});

export default ExamTimer;
