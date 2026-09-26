// Proctoring timeline for event admins: flattens per-attempt violation logs
// into one chronological feed for a round, with strike progression and a
// direct "Clear Disqualification & Retry" recovery action for eliminated
// attempts. Display + the existing reset workflow; no new mutations.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { ShieldAlert, RotateCcw, Loader2 } from 'lucide-react';

interface TimelineViolation {
  attemptId: string;
  userId: string;
  userName: string;
  attemptStatus: string;
  startedAt: string | null;
  type: string;
  timestamp: string;
  strikeNumber: number;
  isEliminatingStrike: boolean;
}

interface TimelineResponse {
  roundId: string;
  threshold: number;
  violations: TimelineViolation[];
}

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab switch',
  refresh_attempt: 'Refresh attempt',
  fullscreen_exit: 'Fullscreen exit',
  back_button: 'Back button',
  alt_tab: 'Alt+Tab',
  f11_fullscreen: 'F11 fullscreen',
  ctrl_t: 'Ctrl+T',
  restricted_shortcut: 'Restricted shortcut',
  context_menu: 'Context menu',
};

function violationLabel(type: string): string {
  return VIOLATION_LABELS[type] || type.replace(/_/g, ' ');
}

/** Relative timestamp from test start, e.g. "+14m 32s". */
function relativeFromStart(startedAt: string | null, timestamp: string): string {
  if (!startedAt) return new Date(timestamp).toLocaleTimeString();
  const ms = Math.max(0, new Date(timestamp).getTime() - new Date(startedAt).getTime());
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `+${m}m ${s}s`;
}

export default function ProctoringTimeline({ roundId }: { roundId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<TimelineViolation | null>(null);
  const [resetting, setResetting] = useState(false);

  const violationsKey = ['/api/event-admin/rounds', roundId, 'violations'];
  const { data, isLoading } = useQuery<TimelineResponse>({
    queryKey: violationsKey,
    enabled: !!roundId,
    refetchInterval: 5000,
  });

  const handleClearDisqualification = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await apiRequest('POST', `/api/event-admin/attempts/${resetTarget.attemptId}/reset`, {});
      successToast(toast, 'Disqualification cleared', `${resetTarget.userName} can now retry the test.`);
      // Refresh the timeline plus every monitor surface that shows attempts.
      queryClient.invalidateQueries({ queryKey: violationsKey });
      queryClient.invalidateQueries({ queryKey: [`/api/event-admin/rounds/${roundId}/attempts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/statistics`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/leaderboard`] });
    } catch (error) {
      errorToast(toast, 'Failed to clear disqualification', (error as Error)?.message || 'Please try again.');
    } finally {
      setResetting(false);
      setResetTarget(null);
    }
  };

  const violations = data?.violations ?? [];
  const threshold = data?.threshold ?? 3;

  return (
    <Card className="mt-6" data-testid="proctoring-timeline">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" aria-hidden />
          Proctoring Timeline
          {violations.length > 0 && (
            <Badge variant="secondary" data-testid="timeline-count">{violations.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground" data-testid="timeline-loading">
            <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-hidden />
            <span className="sr-only">Loading violation timeline</span>
          </div>
        ) : violations.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground" data-testid="timeline-empty">
            No violations recorded for this round.
          </div>
        ) : (
          <ol aria-label="Proctoring violation timeline, oldest first" className="relative ml-2 border-l border-border pl-0">
            {violations.map((v) => {
              const itemLabel = `${violationLabel(v.type)} by ${v.userName}, strike ${v.strikeNumber} of ${threshold}, at ${relativeFromStart(v.startedAt, v.timestamp)} after test start${v.isEliminatingStrike ? ', eliminating strike' : ''}${v.attemptStatus === 'disqualified' ? ', attempt disqualified' : ''}`;
              return (
                <li
                  key={`${v.attemptId}-${v.strikeNumber}`}
                  aria-label={itemLabel}
                  data-testid={`timeline-event-${v.attemptId}-${v.strikeNumber}`}
                  className="relative pb-6 pl-6 last:pb-0"
                >
                  <span
                    aria-hidden
                    className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${v.isEliminatingStrike ? 'bg-destructive' : 'bg-amber-500'}`}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground" data-testid={`timeline-time-${v.attemptId}-${v.strikeNumber}`}>
                      {relativeFromStart(v.startedAt, v.timestamp)}
                    </span>
                    <Badge variant={v.isEliminatingStrike ? 'destructive' : 'secondary'}>
                      {violationLabel(v.type)}
                    </Badge>
                    <span className="text-xs font-medium" role="status" aria-label={`Strike ${v.strikeNumber} of ${threshold}`}>
                      Strike {v.strikeNumber}/{threshold}
                    </span>
                    {v.isEliminatingStrike && (
                      <Badge variant="outline" className="border-destructive/50 text-destructive">
                        Eliminating strike
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{v.userName}</span>
                    {v.attemptStatus === 'disqualified' && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-timeline-retry-${v.attemptId}`}
                        aria-label={`Clear disqualification and allow ${v.userName} to retry the test`}
                        onClick={() => setResetTarget(v)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                        Clear Disqualification & Retry
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear disqualification?</AlertDialogTitle>
              <AlertDialogDescription>
                {resetTarget?.userName}'s attempt will be reset and they can retry the test.
                Their violation history is archived.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearDisqualification}
                disabled={resetting}
                data-testid="button-confirm-timeline-retry"
              >
                {resetting ? 'Clearing…' : 'Clear & Allow Retry'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
