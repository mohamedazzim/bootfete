import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ParticipantLayout from '@/components/layouts/ParticipantLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { createSaveQueue } from '@/lib/saveQueue';
import { Clock, AlertTriangle, Send, ChevronLeft, ChevronRight, Pause } from 'lucide-react';
import type { TestAttempt, Question, Answer, Round, RoundRules, Participant } from '@shared/schema';

interface TestAttemptWithDetails extends TestAttempt {
  round: Round;
  questions: (Question & { questionText: string })[];
  answers: Answer[];
}

// Seeded shuffle function for consistent randomization per attempt
function shuffleWithSeed(array: string[], seed: string): string[] {
  const shuffled = [...array];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const seededRandom = () => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return (hash % 1000) / 1000;
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function TakeTestPage() {
  const { attemptId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [showFullscreenModal, setShowFullscreenModal] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [timeWarningMessage, setTimeWarningMessage] = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Mobile device detection - iOS Safari doesn't support Fullscreen API for non-video elements
  const isMobileDevice = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const supportsFullscreen = !!(document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);
  const canUseFullscreen = supportsFullscreen && !isIOS;

  // Ref to track test status for event handlers
  const testStatusRef = useRef<string>('in_progress');
  const hasShown5MinWarning = useRef(false);
  const hasShown1MinWarning = useRef(false);
  const hasTriggeredSubmit = useRef(false);
  // Round-2 H10: dedupe window keyed on TIME ALONE. One physical action can
  // fire detectors of different types (Alt+Tab -> 'alt_tab' keydown +
  // 'tab_switch' visibilitychange; F11 -> 'f11_fullscreen' + 'fullscreen_exit'),
  // and keying on type+time counted a single action as 2 of 3 strikes.
  const lastViolationRef = useRef<{ at: number } | null>(null);
  // Round-2 M9: mirror of violationCount for use outside setState updaters
  // (side effects must not run inside the updater — React may invoke it twice).
  const violationCountRef = useRef(0);
  // Round-2 M15/H16: per-question save status drives the navigator colors and
  // the Saving.../Saved indicator.
  const [saveStatus, setSaveStatus] = useState<Record<string, 'pending' | 'saved' | 'failed'>>({});
  // Round-2 H15: submit failed and is retryable (guards were reset).
  const [submitFailed, setSubmitFailed] = useState(false);
  // Round-2 H16: mirror of the answers map for the pagehide keepalive flush
  // (state captured in beforeunload/pagehide handlers would go stale).
  const answersRef = useRef<Record<string, string>>({});
  // Round-2 H16: question ids whose latest answer the server hasn't confirmed.
  const unsavedRef = useRef<Set<string>>(new Set());

  // Round-2 H13: capture the query error so a 401 (session expired) renders a
  // re-login path instead of the generic "not available" dead end.
  const { data: attempt, isLoading, isError: attemptIsError, error: attemptError } = useQuery<TestAttemptWithDetails>({
    queryKey: ['/api/attempts', attemptId],
    enabled: !!attemptId,
    // Don't waste retries on a 401 (session is gone); do retry transient errors.
    retry: (failureCount, error: any) =>
      String(error?.message || '').startsWith('401') ? false : failureCount < 2,
  });

  // Update ref when attempt status changes
  useEffect(() => {
    if (attempt?.status) {
      testStatusRef.current = attempt.status;
    }
  }, [attempt?.status]);

  const { data: rules } = useQuery<RoundRules>({
    queryKey: ['/api/rounds', attempt?.roundId, 'rules'],
    enabled: !!attempt?.roundId,
  });

  const { data: currentRound } = useQuery<Round>({
    queryKey: ['/api/rounds', attempt?.roundId],
    queryFn: async () => {
      if (!attempt?.roundId) return null;
      const response = await fetch(`/api/rounds/${attempt.roundId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      return response.json();
    },
    enabled: !!attempt?.roundId && hasStarted,
    // Round-2 C4: no polling. The socket pushes `roundStatus` to
    // participant:{userId} rooms and WebSocketContext refetches this query on
    // every roundStatus event; the 5s poll was ~100 req/s of pure waste at 500
    // students. Socket-down fallback is covered by the reconnect resync
    // (refetch on `connect`).
    refetchInterval: false,
  });

  const { data: participant } = useQuery<Participant | null>({
    queryKey: ['/api/participants/my-registrations', attempt?.userId, attempt?.round?.eventId],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/participants/my-registrations');
      const participants: Participant[] = await response.json();
      const targetEventId = attempt?.round?.eventId || (attempt as any)?.eventId;
      return participants.find((p: Participant) => (!targetEventId || p.eventId === targetEventId)) || participants[0] || null;
    },
    enabled: !!attempt,
  });

  // Mutations defined early to avoid TDZ issues
  const disqualifyMutation = useMutation({
    mutationFn: async () => {
      let targetId = participant?.id;
      if (!targetId) {
        const response = await apiRequest('GET', '/api/participants/my-registrations');
        const participants: Participant[] = await response.json();
        const targetEventId = attempt?.round?.eventId || (attempt as any)?.eventId;
        const found = participants.find((p: Participant) => (!targetEventId || p.eventId === targetEventId)) || participants[0];
        targetId = found?.id;
      }
      if (!targetId) throw new Error('Participant not found');
      return apiRequest('PATCH', `/api/participants/${targetId}/disqualify`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/participants'] });
    },
    // Round-2 M25: a failed disqualify PATCH used to be silent — the student
    // saw "ELIMINATED" while the attempt graded normally. Retry once, then
    // surface loudly so an invigilator can act.
    onError: (error: any) => {
      setTimeout(() => disqualifyMutation.mutate(), 3000);
      toast({
        title: 'Elimination not recorded',
        description: 'Network error while recording the elimination — retrying. Please contact an invigilator.',
        variant: 'destructive',
      });
      console.error('Disqualify failed:', error);
    },
  });

  const submitTestMutation = useMutation({
    mutationFn: async () => {
      // H-12: flush pending debounced answer saves first — otherwise answers
      // typed in the final seconds are silently dropped from grading.
      await flushPendingAnswerSaves();
      return apiRequest('POST', `/api/attempts/${attemptId}/submit`, {});
    },
    onSuccess: () => {
      // Update test status to prevent fullscreen cleanup
      testStatusRef.current = 'completed';
      // Round-2 H15: the submitted flag is set ONLY here, on actual success.
      sessionStorage.setItem(`submitted_${attemptId}`, 'true');
      setSubmitFailed(false);

      toast({
        title: 'Test submitted',
        description: 'Your test has been submitted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/attempts', attemptId] });
      setLocation(`/participant/results/${attemptId}`);
    },
    onError: (error: any) => {
      const msg = String(error?.message || 'Unknown error');
      // The server submit is idempotent now (CAS): if a concurrent submit
      // already flipped the attempt, treat it as success and move on.
      if (msg.includes('already submitted')) {
        sessionStorage.setItem(`submitted_${attemptId}`, 'true');
        testStatusRef.current = 'completed';
        setLocation(`/participant/results/${attemptId}`);
        return;
      }
      // Round-2 H15: reset the guard so the student CAN retry. The failure
      // banner (with a Retry button) stays visible until a submit succeeds.
      hasTriggeredSubmit.current = false;
      setSubmitFailed(true);
      toast({
        title: 'Submission failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  // Round-2 M18: focus trap for the submit-confirm modal. A keyboard-only
  // student must not be able to Tab out behind the overlay, and Escape
  // cancels. Focus lands on Cancel (the safe default).
  const submitDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showSubmitConfirm) return;
    const dialog = submitDialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
    const items = focusable();
    (items[0] || dialog).focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSubmitConfirm(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [showSubmitConfirm]);

  // Round-2 C3/H15/M10: every submit path (manual button, timer expiry,
  // round-end, elimination) goes through this one guarded trigger. The guard
  // prevents double-fire; onError resets it so a failed submit is retryable.
  const triggerSubmit = useCallback(() => {
    if (!attemptId) return;
    if (hasTriggeredSubmit.current) return;
    if (sessionStorage.getItem(`submitted_${attemptId}`)) {
      hasTriggeredSubmit.current = true;
      return;
    }
    hasTriggeredSubmit.current = true;
    setSubmitFailed(false);
    submitTestMutation.mutate();
  }, [attemptId, submitTestMutation]);

  // Initialize answers from existing data
  useEffect(() => {
    if (attempt?.answers) {
      const answerMap: Record<string, string> = {};
      attempt.answers.forEach((ans) => {
        answerMap[ans.questionId] = ans.answer;
      });
      // Round-2 H13: restore answers stashed when the session expired.
      // Server-confirmed answers win; stashed values fill the gaps.
      try {
        const stashed = JSON.parse(localStorage.getItem(`unsent_answers_${attemptId}`) || '{}');
        for (const [qid, val] of Object.entries(stashed)) {
          if (typeof val === 'string' && !(qid in answerMap)) answerMap[qid] = val;
        }
        localStorage.removeItem(`unsent_answers_${attemptId}`);
      } catch { /* corrupted stash — ignore */ }
      setAnswers(answerMap);
      answersRef.current = answerMap; // Round-2 H16: seed the pagehide mirror
    }
  }, [attempt, attemptId]);

  // Initialize timer
  useEffect(() => {
    if (attempt?.round && attempt.startedAt) {
      const duration = attempt.round.duration * 60; // Convert to seconds
      const startTime = new Date(attempt.startedAt).getTime();
      const isPaused = currentRound?.status === 'paused';
      const effectiveNow = isPaused && currentRound?.updatedAt ? new Date(currentRound.updatedAt).getTime() : Date.now();
      const elapsed = Math.floor((effectiveNow - startTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setTimeRemaining(remaining);
    }
  }, [attempt, currentRound?.status, currentRound?.updatedAt]);

  // Auto-submit  // Check if round ended or paused
  useEffect(() => {
    if (currentRound?.status === 'completed' && attempt?.status === 'in_progress') {
      // Round-2 C3: single guarded trigger (was: flags set before mutate with
      // no retry on failure).
      triggerSubmit();
      toast({
        title: 'Round Ended',
        description: 'The admin has ended this round. Your test will be auto-submitted.',
        variant: 'destructive',
      });
    }
  }, [currentRound?.status, attempt?.status, triggerSubmit, toast]);

  // Countdown interval - created once per active test, NOT on every tick.
  // (Previously this effect depended on `timeRemaining`, tearing down and
  // recreating the interval every second.)
  useEffect(() => {
    if (!attempt || !hasStarted) return;
    if (attempt.status !== 'in_progress') return;

    const timer = setInterval(() => {
      if (currentRound?.status === 'paused') return;
      setTimeRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, hasStarted, currentRound?.status]);

  // Auto-submit + time warnings react to timeRemaining changes
  useEffect(() => {
    if (!attempt || !hasStarted) return;

    if (timeRemaining <= 0 && attempt.status === 'in_progress') {
      // Round-2 C3: single guarded trigger — the submitted flags are set in
      // onSuccess only, and onError resets the guard so a failed auto-submit
      // (e.g. flush threw on a network blip) is retried, not stranded.
      triggerSubmit();
      return;
    }

    // Show 5 minute warning (Round-2 M28: <= with the shown-flags — exact
    // equality never fires when a throttled interval jumps 301 -> 299)
    if (timeRemaining <= 300 && !hasShown5MinWarning.current) {
      hasShown5MinWarning.current = true;
      setTimeWarningMessage('5 minutes remaining!');
      setShowTimeWarning(true);
      toast({
        title: 'Time Warning',
        description: '5 minutes remaining in your test',
        variant: 'default',
      });
      setTimeout(() => setShowTimeWarning(false), 5000);
    }

    // Show 1 minute warning
    if (timeRemaining <= 60 && !hasShown1MinWarning.current) {
      hasShown1MinWarning.current = true;
      setTimeWarningMessage('1 minute remaining!');
      setShowTimeWarning(true);
      toast({
        title: 'Time Warning',
        description: '1 minute remaining in your test',
        variant: 'destructive',
      });
      setTimeout(() => setShowTimeWarning(false), 5000);
    }
  }, [timeRemaining, attempt, hasStarted, attemptId, triggerSubmit, toast]);

  // Handle fullscreen start - Skip on mobile devices that don't support it
  const handleBeginTest = async () => {
    // On mobile/iOS devices, skip fullscreen requirement but still start test
    if (!canUseFullscreen) {
      console.log('Mobile device detected - skipping fullscreen, starting test directly');
      toast({
        title: 'Test Starting',
        description: 'Stay on this screen and don\'t switch apps',
      });
      setHasStarted(true);
      return;
    }

    // Desktop: Try to enter fullscreen
    try {
      await document.documentElement.requestFullscreen();
      setHasStarted(true);
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
      // If fullscreen fails on desktop, still allow starting (graceful degradation)
      toast({
        title: 'Fullscreen not available',
        description: 'Test will start without fullscreen. Stay on this screen.',
        variant: 'default',
      });
      setHasStarted(true);
    }
  };

  // Handle re-entering fullscreen (desktop only)
  const handleReenterFullscreen = async () => {
    // On mobile, just close the modal since fullscreen isn't supported
    if (!canUseFullscreen) {
      setShowFullscreenModal(false);
      return;
    }

    try {
      await document.documentElement.requestFullscreen();
      setShowFullscreenModal(false);
    } catch (err) {
      console.error('Failed to re-enter fullscreen:', err);
      // If re-entering fails, just close modal and continue
      setShowFullscreenModal(false);
      toast({
        title: 'Fullscreen unavailable',
        description: 'Continue your test carefully',
        variant: 'default',
      });
    }
  };

  // Round-2 M9: violation side effects (warnings, elimination) live OUTSIDE
  // setState. The old code ran toasts, timeouts, disqualify + auto-submit
  // inside the setViolationCount updater, which React may invoke more than
  // once in concurrent rendering — double-firing elimination.
  const applyViolationEffects = useCallback((type: string) => {
    const newCount = violationCountRef.current + 1;
    violationCountRef.current = newCount;
    setViolationCount(newCount);

    // Mobile: Stricter - 1st warning, 2nd eliminate (since no fullscreen)
    // Desktop: 1st warning, 2nd warning, 3rd eliminate
    const eliminationThreshold = isMobileDevice ? 2 : 3;

    if (newCount === 1) {
      // First violation - Show warning
      setViolationMessage('⚠️ You are not allowed to switch apps or leave the test screen. ' +
        (isMobileDevice ? 'One more switch will eliminate you!' : 'Further attempts will eliminate you.'));
      setShowViolationWarning(true);
      toast({
        title: '⚠️ Warning #1',
        description: isMobileDevice
          ? 'One more app/tab switch will eliminate you!'
          : 'Do not leave the test screen. Further attempts will eliminate you.',
        variant: 'destructive',
      });
      setTimeout(() => setShowViolationWarning(false), 5000);
    } else if (newCount === 2 && !isMobileDevice) {
      // Second violation (desktop only) - Final warning
      setViolationMessage('⚠️ Final warning! Another attempt will eliminate you.');
      setShowViolationWarning(true);
      toast({
        title: '⚠️ Warning #2 - FINAL WARNING',
        description: 'Another attempt will eliminate you from this event.',
        variant: 'destructive',
      });
      setTimeout(() => setShowViolationWarning(false), 5000);
    } else if (newCount >= eliminationThreshold) {
      // Eliminate (2nd for mobile, 3rd for desktop)
      setViolationMessage('❌ You have been eliminated for violating event rules.');
      setShowViolationWarning(true);
      toast({
        title: '❌ ELIMINATED',
        description: 'You have been eliminated for violating event rules. Your test will be auto-submitted.',
        variant: 'destructive',
      });

      disqualifyMutation.mutate();
      // Round-2 C3/M10: elimination submit goes through the single guarded
      // trigger — if the timer already fired inside this window, the second
      // call is a no-op instead of a racing duplicate POST.
      setTimeout(() => triggerSubmit(), 2000);
    }
  }, [disqualifyMutation, triggerSubmit, toast, isMobileDevice]);

  const logViolation = useCallback((type: string) => {
    if (!attemptId) return;

    // Round-2 H10: dedupe keyed on time alone (see lastViolationRef) — one
    // physical action must never burn two strikes.
    const now = Date.now();
    if (lastViolationRef.current && now - lastViolationRef.current.at < 3000) {
      return;
    }
    lastViolationRef.current = { at: now };

    // Round-2 M20: the strike counts only once the server has recorded it.
    // On failure we retry once; if the network is down the strike is
    // deferred and surfaced, not silently counted locally.
    const post = (t: string): Promise<void> =>
      apiRequest('POST', `/api/attempts/${attemptId}/violations`, { type: t }).then(() => undefined);
    post(type)
      .then(() => applyViolationEffects(type))
      .catch(() => {
        setTimeout(() => {
          post(type)
            .then(() => applyViolationEffects(type))
            .catch(() => {
              toast({
                title: 'Violation not recorded',
                description: 'Network error — stay on this tab and contact an invigilator.',
                variant: 'destructive',
              });
            });
        }, 2000);
      });
  }, [attemptId, applyViolationEffects, toast]);

  // Fullscreen enforcement after test started - Skip on mobile devices
  useEffect(() => {
    if (!hasStarted || !canUseFullscreen) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && testStatusRef.current === 'in_progress') {
        logViolation('fullscreen_exit');
        // Don't allow re-entering if already eliminated (3+ violations)
        if (violationCount < 3) {
          setShowFullscreenModal(true);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [hasStarted, logViolation, violationCount, canUseFullscreen]);

  // Cleanup fullscreen only on unmount
  useEffect(() => {
    return () => {
      if (document.fullscreenElement && testStatusRef.current !== 'in_progress') {
        document.exitFullscreen().catch(console.error);
      }
    };
  }, []);

  // Back button prevention
  useEffect(() => {
    if (!hasStarted) return;

    // Push a state to history to prevent back navigation
    window.history.pushState(null, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      toast({
        title: 'Navigation blocked',
        description: 'You cannot use the back button during the test',
        variant: 'destructive',
      });
      logViolation('back_button');
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasStarted, toast, logViolation]);

  // Tab switch detection with visibilitychange - ALWAYS monitor
  useEffect(() => {
    if (!hasStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden && attempt?.status === 'in_progress') {
        logViolation('tab_switch');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [attempt?.status, hasStarted, logViolation]);

  // H-11: the blur-based tab-switch detector was removed. A single tab switch
  // fires both 'blur' and 'visibilitychange', which double/triple-counted
  // violations. 'visibilitychange' below is the single canonical detector
  // for tab/app switches (switching to another app hides the document too).

  // Enhanced keyboard shortcuts blocking
  useEffect(() => {
    if (!hasStarted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Block refresh shortcuts (F5, Ctrl+R, Cmd+R)
      if (
        e.key === 'F5' ||
        (e.ctrlKey && e.key === 'r') ||
        (e.metaKey && e.key === 'r')
      ) {
        e.preventDefault();
        toast({
          title: 'Action blocked',
          description: 'Refresh is disabled during the test',
          variant: 'destructive',
        });
        logViolation('refresh_attempt');
        return;
      }

      // Block close window/tab shortcuts (Alt+F4, Cmd+Q, Ctrl+W, Cmd+W)
      if (
        (e.altKey && e.key === 'F4') ||
        (e.metaKey && e.key === 'q') ||
        (e.ctrlKey && e.key === 'w') ||
        (e.metaKey && e.key === 'w')
      ) {
        e.preventDefault();
        toast({
          title: 'Action blocked',
          description: 'You cannot close the window during the test',
          variant: 'destructive',
        });
        return;
      }

      // Block backspace outside input fields (back navigation)
      if (e.key === 'Backspace' && !isInputField) {
        e.preventDefault();
        toast({
          title: 'Action blocked',
          description: 'Backspace navigation is disabled during the test',
          variant: 'destructive',
        });
        return;
      }

      // Block Alt+Tab (triggers violation)
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        logViolation('alt_tab');
        return;
      }

      // Block F11 fullscreen toggle (triggers violation)
      if (e.key === 'F11') {
        e.preventDefault();
        logViolation('f11_fullscreen');
        return;
      }

      // Block Ctrl+T new tab (triggers violation)
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        logViolation('ctrl_t');
        return;
      }

      // Block developer tools and other shortcuts - ALWAYS enforce.
      // Round-2 M13/H5: never block (or count as a violation) clipboard
      // shortcuts while the student is typing IN an answer field — they must
      // be able to paste into coding/short-answer inputs, and copying their
      // own text must not burn a strike. Devtools shortcuts stay blocked.
      if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        logViolation('restricted_shortcut');
      } else if (
        !isInputField &&
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'p'))
      ) {
        e.preventDefault();
        logViolation('restricted_shortcut');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, toast, logViolation]);

  // Block right-click context menu (copy/paste/inspect is a proctoring concern)
  useEffect(() => {
    if (!hasStarted) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolation('context_menu');
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [hasStarted, logViolation]);

  // Round-2 H16/M26: on tab close, best-effort flush of unsaved answers with a
  // keepalive fetch (navigator.sendBeacon can't carry the Bearer auth
  // header). Only answers the server hasn't confirmed are sent; the bulk
  // endpoint upserts idempotently. No 'refresh' violation is logged once the
  // test is no longer in_progress — the effect stays mounted during the
  // submit round-trip, which used to produce phantom strikes.
  useEffect(() => {
    if (!hasStarted) return;

    const flushUnsaved = () => {
      const pending = Array.from(unsavedRef.current);
      if (pending.length === 0 || !attemptId) return;
      const payload = pending.map((qid) => ({
        questionId: qid,
        answer: answersRef.current[qid] ?? '',
      }));
      const token = localStorage.getItem('token');
      fetch(`/api/attempts/${attemptId}/answers/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ answers: payload }),
        keepalive: true,
      }).catch(() => {});
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushUnsaved();
      if (testStatusRef.current !== 'in_progress') return;
      e.preventDefault();
      e.returnValue = '';
      logViolation('refresh');
      return '';
    };
    const handlePageHide = () => flushUnsaved();

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [hasStarted, attemptId, logViolation]);

  // Round-2 M19: setInterval is throttled to ~1/min in backgrounded tabs, so
  // the displayed countdown can drift minutes off. On return, recompute from
  // the cached attempt.startedAt — no network needed. (While paused the
  // pause overlay owns the timer, so we skip then.)
  useEffect(() => {
    if (!hasStarted) return;
    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (!attempt?.startedAt || !attempt?.round) return;
      if (currentRound?.status === 'paused') return;
      const duration = attempt.round.duration * 60;
      const elapsed = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
      setTimeRemaining(Math.max(0, duration - elapsed));
    };
    document.addEventListener('visibilitychange', resync);
    return () => document.removeEventListener('visibilitychange', resync);
  }, [hasStarted, attempt, currentRound?.status]);

  // H-12: debounced, serialized answer saving. Typing used to fire one POST per
  // keystroke with no ordering, so an earlier keystroke could overwrite a
  // later one server-side, and final-seconds answers never landed before
  // grading. Now the latest value per question is saved 1.5s after the user
  // stops typing; per-question ordering/in-flight tracking lives in the
  // unit-tested saveQueue (client/src/lib/saveQueue.ts), and flush throws on
  // failure so submit does NOT proceed with unsaved answers.
  const pendingAnswerSavesRef = useRef<Record<string, string>>({});
  const answerSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveQueueRef = useRef(createSaveQueue());
  const [saveError, setSaveError] = useState<string | null>(null);

  const doSaveAnswer = useCallback(async (questionId: string, answer: string) => {
    if (!attemptId) return;
    await apiRequest('POST', `/api/attempts/${attemptId}/answers`, { questionId, answer });
    setSaveError(null);
    // Round-2 M15/H16: server confirmed this answer.
    unsavedRef.current.delete(questionId);
    setSaveStatus(prev => ({ ...prev, [questionId]: 'saved' }));
  }, [attemptId]);

  // Re-queue a failed save for retry on the next flush (unless the user typed
  // a newer value meanwhile, which supersedes it).
  const requeueFailedSave = (questionId: string, answer: string) => {
    if (pendingAnswerSavesRef.current[questionId] === undefined) {
      pendingAnswerSavesRef.current[questionId] = answer;
    }
    setSaveStatus(prev => ({ ...prev, [questionId]: 'failed' }));
    setSaveError('Answer auto-save failed — check your connection. It will be retried on submit.');
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
    answersRef.current[questionId] = answer; // Round-2 H16: pagehide mirror
    unsavedRef.current.add(questionId);      // Round-2 H16: not yet confirmed
    setSaveStatus(prev => ({ ...prev, [questionId]: 'pending' })); // M15
    pendingAnswerSavesRef.current[questionId] = answer;
    const existing = answerSaveTimersRef.current[questionId];
    if (existing) clearTimeout(existing);
    answerSaveTimersRef.current[questionId] = setTimeout(() => {
      delete answerSaveTimersRef.current[questionId];
      const latest = pendingAnswerSavesRef.current[questionId];
      delete pendingAnswerSavesRef.current[questionId];
      if (latest !== undefined) {
        saveQueueRef.current.enqueue(questionId, () => doSaveAnswer(questionId, latest))
          .catch(() => requeueFailedSave(questionId, latest));
      }
    }, 1500);
  };

  // Round-2 M12: debounce timers must not survive unmount (e.g. navigating to
  // results after submit) — a late timer would POST to a submitted attempt
  // and setState on an unmounted tree.
  useEffect(() => {
    const timersRef = answerSaveTimersRef;
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  // Flush every pending debounced save AND every in-flight save, then throw
  // if any failed — submit must not proceed with unsaved answers.
  const flushPendingAnswerSaves = useCallback(async () => {
    const timers = Object.values(answerSaveTimersRef.current);
    answerSaveTimersRef.current = {};
    timers.forEach(clearTimeout);
    const pending = { ...pendingAnswerSavesRef.current };
    pendingAnswerSavesRef.current = {};
    for (const [qid, ans] of Object.entries(pending)) {
      saveQueueRef.current.enqueue(qid, () => doSaveAnswer(qid, ans))
        .catch(() => requeueFailedSave(qid, ans));
    }
    const { failed } = await saveQueueRef.current.flush();
    if (failed.length > 0) {
      setSaveError('Some answers failed to save — check your connection and try submitting again.');
      throw new Error(`${failed.length} answer save(s) failed; submission blocked until they persist`);
    }
  }, [doSaveAnswer]);

  const handleSubmit = () => {
    if (!attempt?.questions) return;

    // Round-2 M28: an answer the student typed then deleted is NOT answered —
    // count only non-blank values so the "unanswered" confirm isn't skipped.
    const answeredCount = attempt.questions.filter(q => (answers[q.id] || '').trim() !== '').length;
    const totalQuestions = attempt.questions.length;

    if (answeredCount < totalQuestions) {
      setShowSubmitConfirm(true);
      return;
    }

    // Round-2 C3: single guarded trigger.
    triggerSubmit();
  };

  const confirmSubmit = () => {
    setShowSubmitConfirm(false);
    triggerSubmit();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <ParticipantLayout>
        <div className="p-8">
          <div className="text-center py-12" data-testid="loading-test">Loading test...</div>
        </div>
      </ParticipantLayout>
    );
  }

  // Round-2 H13: session expired mid-exam. The in-memory answers are stashed
  // to localStorage (keyed by attempt) before offering re-login, so nothing
  // the student typed is stranded on the dead-end screen.
  if (attemptIsError && String((attemptError as any)?.message || '').startsWith('401')) {
    try {
      localStorage.setItem(`unsent_answers_${attemptId}`, JSON.stringify(answersRef.current));
    } catch { /* storage full/blocked — answers remain in memory for this tab */ }
    return (
      <ParticipantLayout>
        <div className="p-8">
          <Card className="max-w-xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Session expired</CardTitle>
              <CardDescription className="text-base mt-2">
                Your login session expired during the test. Answers you typed are preserved on this device — log in again to resume.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => setLocation('/login')} data-testid="button-relogin">
                Log in again to resume
              </Button>
            </CardContent>
          </Card>
        </div>
      </ParticipantLayout>
    );
  }

  if (!attempt || attempt.status !== 'in_progress') {
    return (
      <ParticipantLayout>
        <div className="p-8">
          <div className="text-center py-12">Test not available or already completed</div>
          <div className="text-center mt-4">
            <Button onClick={() => setLocation('/participant/dashboard')} data-testid="button-back-dashboard">
              Back to Dashboard
            </Button>
          </div>
        </div>
      </ParticipantLayout>
    );
  }

  // Check if there are no questions in the test
  if (!attempt.questions || attempt.questions.length === 0) {
    return (
      <ParticipantLayout>
        <div className="p-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
              <CardTitle className="text-2xl">No Questions Available</CardTitle>
              <CardDescription className="text-base mt-2">
                This test does not have any questions yet
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                The event organizer has not added questions to this test yet.
                Please contact the event administrators or try again later.
              </p>
              <div className="text-center">
                <Button onClick={() => setLocation('/participant/dashboard')} data-testid="button-back-dashboard">
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ParticipantLayout>
    );
  }

  const currentQuestion = attempt.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / attempt.questions.length) * 100;

  // Round-2 H16/M15: derived save-indicator state.
  const savePendingCount = Object.values(saveStatus).filter(s => s === 'pending').length;
  const saveFailedCount = Object.values(saveStatus).filter(s => s === 'failed').length;
  // Round-2 M11: all answer inputs go inert while a submit is in flight — a
  // keystroke in that window would start a debounce AFTER flush() snapshotted
  // the queue, landing post-grading (or 400ing) with no error shown.
  const inputsDisabled = submitTestMutation.isPending;
  // Round-2 M14: the elimination threshold differs on mobile (2) vs desktop (3).
  const violationLimit = isMobileDevice ? 2 : 3;

  // Show begin test screen
  if (!hasStarted) {
    return (
      <ParticipantLayout>
        <div className="p-4 md:p-8 max-w-3xl mx-auto">
          {/* Mobile device notice */}
          {isMobileDevice && (
            <Alert className="mb-4 bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">
                📱 You're on a mobile device. The test will work without fullscreen mode.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Ready to Start Test?</CardTitle>
              <CardDescription className="text-base mt-2">
                {attempt.round.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Important Instructions:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>You have {attempt.round.duration} minutes to complete this test</li>
                    <li>Answer all {attempt.questions.length} questions</li>
                    {canUseFullscreen && (
                      <li className="text-red-600 font-medium">You MUST stay in fullscreen mode</li>
                    )}
                    <li className="text-red-600 font-medium">Do NOT switch tabs or apps</li>
                    <li className="text-red-600 font-medium">Do NOT refresh the page</li>
                    {!isMobileDevice && (
                      <li className="text-red-600 font-medium">All shortcuts (Alt+Tab, Ctrl+R, F5, etc.) are disabled</li>
                    )}
                    <li className="text-red-600 font-bold">
                      ⚠️ WARNING: {isMobileDevice ? '2' : '3'} violations will auto-eliminate you from the event
                    </li>
                  </ul>
                </AlertDescription>
              </Alert>

              {rules?.additionalRules && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="font-medium mb-2">Additional Rules:</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {rules.additionalRules}
                  </div>
                </div>
              )}

              <div className="text-center pt-4">
                <Button
                  onClick={handleBeginTest}
                  size="lg"
                  className="px-8"
                  data-testid="button-begin-test"
                >
                  {canUseFullscreen ? 'Begin Test in Fullscreen' : 'Begin Test'}
                </Button>
                <p className="text-sm text-gray-500 mt-3">
                  Click the button above to start your test
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ParticipantLayout>
    );
  }

  return (
    <ParticipantLayout>
      {/* Paused Overlay - Blocking */}
      {currentRound?.status === 'paused' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4 shadow-xl border-yellow-200 bg-yellow-50">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center animate-pulse">
                <Pause className="h-8 w-8 text-yellow-600" />
              </div>
              <CardTitle className="text-2xl text-yellow-900">Test Paused</CardTitle>
              <CardDescription className="text-yellow-700 text-lg">
                The admin has paused the test.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-yellow-800 text-center font-medium">
                Please wait patiently. The test will resume shortly.
                <br />
                Do not close this window.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fullscreen Violation Modal - Blocking */}
      {showFullscreenModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-xl">Fullscreen Required</CardTitle>
              <CardDescription>
                You must stay in fullscreen mode during the test
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                A violation has been logged. Click the button below to return to fullscreen mode and continue your test.
              </p>
              <Button
                onClick={handleReenterFullscreen}
                className="w-full"
                size="lg"
                data-testid="button-reenter-fullscreen"
              >
                Return to Fullscreen
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submit Confirmation Modal - In Fullscreen */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <Card
            className="max-w-md"
            ref={submitDialogRef as any}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-confirm-title"
            tabIndex={-1}
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle className="text-xl" id="submit-confirm-title">Submit Test?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                You have answered {attempt?.questions.filter(q => (answers[q.id] || '').trim() !== '').length} out of {attempt?.questions.length} questions.
                Are you sure you want to submit?
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowSubmitConfirm(false)}
                  variant="outline"
                  className="flex-1"
                  data-testid="button-cancel-submit"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmSubmit}
                  className="flex-1"
                  disabled={submitTestMutation.isPending}
                  data-testid="button-confirm-submit"
                >
                  {submitTestMutation.isPending ? 'Submitting…' : 'Submit Test'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        {/* Header with timer and progress */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="heading-test-name">
              {attempt.round.name}
            </h1>
            <p className="text-gray-600">
              Question {currentQuestionIndex + 1} of {attempt.questions.length}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Round-2 M14: always visible, denominator follows the real
                elimination threshold (mobile eliminates at 2, desktop at 3).
                Previously the badge was hidden unless autoSubmitOnViolation
                was set while elimination fired unconditionally. */}
            <Badge variant="outline" className="flex items-center gap-2" aria-label={`Violations: ${violationCount} of ${violationLimit}`}>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Violations: {violationCount}/{violationLimit}
            </Badge>
            {/* Round-2 H16: students must see Saved vs Saving vs failed. */}
            <span
              className={`text-xs font-medium ${saveFailedCount > 0 ? 'text-red-600' : savePendingCount > 0 ? 'text-amber-600' : 'text-green-600'}`}
              aria-live="polite"
              data-testid="text-save-status"
            >
              {saveFailedCount > 0 ? 'Save failed — will retry' : savePendingCount > 0 ? `Saving… (${savePendingCount})` : 'Saved ✓'}
            </span>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${timeRemaining < 300 ? 'bg-red-100' : 'bg-blue-100'
              }`}>
              <Clock className={`h-5 w-5 ${timeRemaining < 300 ? 'text-red-600' : 'text-blue-600'}`} />
              {/* Round-2 M28: screen-reader users need to hear time warnings. */}
              <span className={`font-mono text-lg font-bold ${timeRemaining < 300 ? 'text-red-900' : 'text-blue-900'
                }`} data-testid="text-timer" aria-live="polite" aria-label={`Time remaining: ${formatTime(timeRemaining)}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>
        </div>

        {/* Time Warning */}
        {showTimeWarning && (
          <Alert className="mb-6 bg-orange-50 border-orange-200">
            <Clock className="h-4 w-4 text-orange-600" />
            <AlertDescription>
              <strong>Time Alert:</strong> {timeWarningMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* H-12: answer auto-save failure notice */}
        {saveError && (
          <Alert className="mb-6 bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Round-2 H15: a failed submit is retryable — the guard was reset in
            onError, so this CTA is the student's way back in. */}
        {submitFailed && (
          <Alert className="mb-6 bg-red-50 border-red-300" data-testid="alert-submit-failed">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 flex flex-wrap items-center justify-between gap-3">
              <span><strong>Submission failed.</strong> Your answers are safe — nothing was lost.</span>
              <Button
                onClick={triggerSubmit}
                disabled={submitTestMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-retry-submit"
              >
                {submitTestMutation.isPending ? 'Retrying…' : 'Retry submit'}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Violation Warning */}
        {showViolationWarning && (
          <Alert className="mb-6 bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              <strong>Warning:</strong> {violationMessage || 'Violation detected.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        <div className="mb-6">
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question Card */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl" data-testid="heading-question">
                  Question {currentQuestion.questionNumber}
                </CardTitle>
                <Badge variant="secondary" className="mt-2">
                  {currentQuestion.points} {currentQuestion.points === 1 ? 'point' : 'points'}
                </Badge>
              </div>
              <Badge>
                {currentQuestion.questionType.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question Content */}
            <div className="text-lg font-medium" data-testid="text-question">
              {currentQuestion.questionText && (currentQuestion.questionText.includes('/uploads/') || currentQuestion.questionText.includes('uploads/')) ? (
                <div className="space-y-4">
                  {!(currentQuestion.questionText.trim().startsWith('/uploads/') || currentQuestion.questionText.trim().startsWith('uploads/')) && (
                    <p className="text-lg font-medium whitespace-pre-wrap">{currentQuestion.questionText.replace(/(\/uploads\/[^\s]+|uploads\/[^\s]+)/g, '').trim()}</p>
                  )}
                  <p className="text-sm text-muted-foreground font-normal">
                    {currentQuestion.questionType === 'image_mcq' ? 'Refer to the question image and choose an option below:' : 'View the image below and provide your answer:'}
                  </p>
                  <img
                    src={(() => {
                      const match = currentQuestion.questionText.match(/(\/uploads\/[^\s"'>]+|uploads\/[^\s"'>]+)/);
                      const imgPath = match ? match[0] : currentQuestion.questionText;
                      return imgPath.startsWith('/') ? imgPath : `/${imgPath}`;
                    })()}
                    alt={`Question ${currentQuestion.questionNumber}`}
                    className="max-h-[400px] rounded-lg shadow-md mx-auto border object-contain bg-white"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).insertAdjacentHTML('afterend', '<p class="text-red-500 text-center text-sm py-2">Image failed to load</p>');
                    }}
                  />
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{String(currentQuestion.questionText || '')}</p>
              )}
            </div>


            {/* MCQ Handler - inclusive of 'mcq' legacy type */}
            {(currentQuestion.questionType === 'multiple_choice' || currentQuestion.questionType === 'mcq') && (
              (Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0) ? (
                <RadioGroup
                  value={answers[currentQuestion.id] || ''}
                  onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                  disabled={inputsDisabled}
                  aria-label={`Answer options for question ${currentQuestion.questionNumber}`}
                >
                  {(currentQuestion.options as string[]).map((option: string, index: number) => (
                    <div key={index} className="flex items-center space-x-2 p-3 rounded border hover:bg-gray-50">
                      <RadioGroupItem value={String(option)} id={`option-${index}`} data-testid={`radio-option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                        {String(option)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200">
                    <p className="font-medium flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Please type your answer below:
                    </p>
                  </div>
                  <Textarea
                    placeholder="Type your answer here..."
                    aria-label={`Answer for question ${currentQuestion.questionNumber}`}
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    className="min-h-[150px]"
                    disabled={inputsDisabled}
                    data-testid="input-answer-mcq-fallback"
                  />
                </div>
              )
            )}

            {/* True/False */}
            {currentQuestion.questionType === 'true_false' && (
              <RadioGroup
                value={answers[currentQuestion.id] || ''}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                disabled={inputsDisabled}
                aria-label={`True or false answer for question ${currentQuestion.questionNumber}`}
              >
                <div className="flex items-center space-x-2 p-3 rounded border hover:bg-gray-50">
                  <RadioGroupItem value="true" id="true" data-testid="radio-true" />
                  <Label htmlFor="true" className="flex-1 cursor-pointer">True</Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded border hover:bg-gray-50">
                  <RadioGroupItem value="false" id="false" data-testid="radio-false" />
                  <Label htmlFor="false" className="flex-1 cursor-pointer">False</Label>
                </div>
              </RadioGroup>
            )}

            {/* Short Answer or Coding */}
            {(currentQuestion.questionType === 'short_answer' || currentQuestion.questionType === 'coding') && (
              <Textarea
                placeholder={
                  currentQuestion.questionType === 'coding'
                    ? 'Write your code here...'
                    : 'Type your answer here...'
                }
                aria-label={`Answer for question ${currentQuestion.questionNumber}`}
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="min-h-[200px] font-mono"
                disabled={inputsDisabled}
                data-testid="input-answer"
              />
            )}

            {/* Fill-in-the-blanks / Fill-up */}
            {(currentQuestion.questionType === 'fill_blank' ||
              currentQuestion.questionType === 'fill_in_the_blank' ||
              currentQuestion.questionType === 'fill_in_blank' ||
              currentQuestion.questionType === 'fill_up' ||
              currentQuestion.questionType === 'fill') && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Type your answer in the box below:</p>
                <Input
                  placeholder="Enter your answer..."
                  aria-label={`Answer for question ${currentQuestion.questionNumber}`}
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="max-w-lg text-base h-11"
                  disabled={inputsDisabled}
                  data-testid="input-answer-fillup"
                />
              </div>
            )}

            {/* Image Text - Text input for image-based questions */}
            {currentQuestion.questionType === 'image_text' && (
              <Textarea
                placeholder="Type your answer here..."
                aria-label={`Answer for question ${currentQuestion.questionNumber}`}
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="min-h-[150px]"
                disabled={inputsDisabled}
                data-testid="input-answer-image"
              />
            )}

            {/* Image MCQ - Shuffled image options */}
            {currentQuestion.questionType === 'image_mcq' && Array.isArray(currentQuestion.options) && (
              (() => {
                const shuffledOptions = shuffleWithSeed(currentQuestion.options as string[], attemptId || '');
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Select one image as your answer:</p>
                    <div className="grid grid-cols-2 gap-4">
                      {shuffledOptions.map((imageUrl, index) => {
                        const isSelected = answers[currentQuestion.id] === imageUrl;
                        return (
                          <button
                            key={index}
                            type="button"
                            disabled={inputsDisabled}
                            onClick={() => handleAnswerChange(currentQuestion.id, imageUrl)}
                            aria-label={`Option ${index + 1} for question ${currentQuestion.questionNumber}${isSelected ? ', selected' : ''}`}
                            className={`relative p-2 border-2 rounded-lg transition-all ${isSelected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-400'
                              }`}
                            data-testid={`image-option-${index}`}
                          >
                            <img
                              src={imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`}
                              alt={`Option ${index + 1}`}
                              className="w-full h-40 object-contain rounded bg-gray-50"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/placeholder-image.png';
                              }}
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            <div className="mt-2 text-center text-sm font-medium">
                              Option {index + 1}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                 );
               })()
             )}
            {/* Fallback for any other custom or unhandled question type */}
            {!['multiple_choice', 'mcq', 'true_false', 'short_answer', 'coding', 'image_text', 'image_mcq', 'fill_blank', 'fill_in_the_blank', 'fill_in_blank', 'fill_up', 'fill'].includes(currentQuestion.questionType) && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Type your answer below:</p>
                <Textarea
                  placeholder="Type your answer here..."
                  aria-label={`Answer for question ${currentQuestion.questionNumber}`}
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="min-h-[150px]"
                  disabled={inputsDisabled}
                  data-testid="input-answer-fallback"
                />
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
                data-testid="button-previous"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              <div className="flex gap-2">
                {currentQuestionIndex < attempt.questions.length - 1 ? (
                  <Button
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                    data-testid="button-next"
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={submitTestMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-submit-test"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {submitTestMutation.isPending ? 'Submitting...' : 'Submit Test'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Question Navigator */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Question Navigator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-10 gap-2">
              {/* Round-2 M15/M28: navigator color reflects SERVER-confirmed save
                  status, not just local typing — a failed save no longer glows
                  green. Every button carries an aria-label (color is never the
                  only signal). */}
              {attempt.questions.map((q, index) => {
                const st = saveStatus[q.id];
                const answered = (answers[q.id] || '').trim() !== '';
                const tone = index === currentQuestionIndex
                  ? 'bg-blue-600 text-white'
                  : st === 'failed'
                    ? 'bg-red-100 text-red-900 hover:bg-red-200 ring-1 ring-red-400'
                    : st === 'pending'
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      : answered
                        ? 'bg-green-100 text-green-900 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200';
                const stateLabel = index === currentQuestionIndex ? 'current'
                  : st === 'failed' ? 'answered, save failed'
                  : st === 'pending' ? 'answered, saving'
                  : answered ? 'answered, saved' : 'not answered';
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`p-2 rounded text-sm font-medium transition-colors ${tone}`}
                    aria-label={`Question ${index + 1}, ${stateLabel}`}
                    data-testid={`button-question-${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 rounded"></div>
                <span>Answered &amp; saved</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-100 rounded"></div>
                <span>Saving…</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-100 rounded ring-1 ring-red-400"></div>
                <span>Save failed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-100 rounded"></div>
                <span>Not Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <span>Current</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ParticipantLayout>
  );
}
