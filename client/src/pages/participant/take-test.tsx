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
  // H-11: dedupe window so one user action (which can fire blur +
  // visibilitychange + keydown together) counts as a single violation.
  const lastViolationRef = useRef<{ type: string; at: number } | null>(null);

  const { data: attempt, isLoading } = useQuery<TestAttemptWithDetails>({
    queryKey: ['/api/attempts', attemptId],
    enabled: !!attemptId,
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
    refetchInterval: 5000,
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

      toast({
        title: 'Test submitted',
        description: 'Your test has been submitted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/attempts', attemptId] });
      setLocation(`/participant/results/${attemptId}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Submission failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Initialize answers from existing data
  useEffect(() => {
    if (attempt?.answers) {
      const answerMap: Record<string, string> = {};
      attempt.answers.forEach((ans) => {
        answerMap[ans.questionId] = ans.answer;
      });
      setAnswers(answerMap);
    }
  }, [attempt]);

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
    const isSubmitted = sessionStorage.getItem(`submitted_${attemptId}`);
    if (currentRound?.status === 'completed' && attempt?.status === 'in_progress' && !hasTriggeredSubmit.current && !isSubmitted) {
      hasTriggeredSubmit.current = true;
      sessionStorage.setItem(`submitted_${attemptId}`, 'true');
      toast({
        title: 'Round Ended',
        description: 'The admin has ended this round. Your test will be auto-submitted.',
        variant: 'destructive',
      });
      setTimeout(() => submitTestMutation.mutate(), 2000);
    }
  }, [currentRound?.status, attempt?.status, attemptId, submitTestMutation, toast]);

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

    const isSubmitted = sessionStorage.getItem(`submitted_${attemptId}`);
    if (timeRemaining <= 0 && attempt.status === 'in_progress' && !hasTriggeredSubmit.current && !isSubmitted) {
      hasTriggeredSubmit.current = true;
      sessionStorage.setItem(`submitted_${attemptId}`, 'true');
      submitTestMutation.mutate();
      return;
    }

    // Show 5 minute warning
    if (timeRemaining === 300 && !hasShown5MinWarning.current) {
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
    if (timeRemaining === 60 && !hasShown1MinWarning.current) {
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
  }, [timeRemaining, attempt, hasStarted, attemptId, submitTestMutation, toast]);

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

  const logViolation = useCallback((type: string) => {
    if (!attemptId) return;

    // H-11: coalesce duplicate detector firings. A single tab switch fires
    // both 'blur' and 'visibilitychange' (and Alt+Tab adds a keydown on top);
    // without this, one switch counted as 2-3 violations and wrongfully
    // eliminated mobile users on their first switch.
    const now = Date.now();
    const last = lastViolationRef.current;
    if (last && last.type === type && now - last.at < 3000) {
      return;
    }
    lastViolationRef.current = { type, at: now };

    apiRequest('POST', `/api/attempts/${attemptId}/violations`, { type }).catch(console.error);

    setViolationCount(prev => {
      const newCount = prev + 1;

      // Mobile: Stricter - 1st warning, 2nd eliminate (since no fullscreen)
      // Desktop: 1st warning, 2nd warning, 3rd eliminate
      const maxWarnings = isMobileDevice ? 1 : 2;
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
        setTimeout(() => submitTestMutation.mutate(), 2000);
      }

      return newCount;
    });
  }, [attemptId, disqualifyMutation, submitTestMutation, toast, isMobileDevice]);

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

      // Block developer tools and other shortcuts - ALWAYS enforce
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'p')) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.key === 'u')
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

  // Prevent refresh - ALWAYS enforce
  useEffect(() => {
    if (!hasStarted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      logViolation('refresh');
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasStarted, logViolation]);

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
  }, [attemptId]);

  // Re-queue a failed save for retry on the next flush (unless the user typed
  // a newer value meanwhile, which supersedes it).
  const requeueFailedSave = (questionId: string, answer: string) => {
    if (pendingAnswerSavesRef.current[questionId] === undefined) {
      pendingAnswerSavesRef.current[questionId] = answer;
    }
    setSaveError('Answer auto-save failed — check your connection. It will be retried on submit.');
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
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

    const answeredCount = Object.keys(answers).length;
    const totalQuestions = attempt.questions.length;

    if (answeredCount < totalQuestions) {
      setShowSubmitConfirm(true);
      return;
    }

    submitTestMutation.mutate();
  };

  const confirmSubmit = () => {
    setShowSubmitConfirm(false);
    submitTestMutation.mutate();
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
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle className="text-xl">Submit Test?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                You have answered {Object.keys(answers).length} out of {attempt?.questions.length} questions.
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
                  data-testid="button-confirm-submit"
                >
                  Submit Test
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
            {rules?.autoSubmitOnViolation && (
              <Badge variant="outline" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Violations: {violationCount}/3
              </Badge>
            )}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${timeRemaining < 300 ? 'bg-red-100' : 'bg-blue-100'
              }`}>
              <Clock className={`h-5 w-5 ${timeRemaining < 300 ? 'text-red-600' : 'text-blue-600'}`} />
              <span className={`font-mono text-lg font-bold ${timeRemaining < 300 ? 'text-red-900' : 'text-blue-900'
                }`} data-testid="text-timer">
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
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    className="min-h-[150px]"
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
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="min-h-[200px] font-mono"
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
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="max-w-lg text-base h-11"
                  data-testid="input-answer-fillup"
                  autoFocus
                />
              </div>
            )}

            {/* Image Text - Text input for image-based questions */}
            {currentQuestion.questionType === 'image_text' && (
              <Textarea
                placeholder="Type your answer here..."
                value={answers[currentQuestion.id] || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                className="min-h-[150px]"
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
                            onClick={() => handleAnswerChange(currentQuestion.id, imageUrl)}
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
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="min-h-[150px]"
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
              {attempt.questions.map((q, index) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`p-2 rounded text-sm font-medium transition-colors ${index === currentQuestionIndex
                    ? 'bg-blue-600 text-white'
                    : answers[q.id]
                      ? 'bg-green-100 text-green-900 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                  data-testid={`button-question-${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 rounded"></div>
                <span>Answered</span>
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
