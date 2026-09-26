import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { ArrowLeft, Trophy, Medal, Award, Clock, Users, CheckCircle, PlayCircle, AlertCircle, Printer, ShieldX, RotateCcw } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { successToast, errorToast } from '@/lib/toast';
import type { Round } from '@shared/schema';
import ScrollableTable from '@/components/ScrollableTable';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    totalScore: number;
    maxScore?: number;
    submittedAt: string | null;
}

type LeaderboardApiResponse =
    | LeaderboardEntry[]
    | {
        scope: 'admin' | 'participant';
        answersVisible: boolean;
        canSelectParticipants?: boolean;
        leaderboard?: LeaderboardEntry[];
        participantResult?: any;
        message?: string;
    };

interface RoundStatistics {
    roundId: string;
    roundName: string;
    status: string;
    totalParticipants: number;
    activeParticipants: number;
    completedParticipants: number;
    disqualifiedParticipants: number;
    pendingParticipants: number;
    canShareResults: boolean;
    testDuration: number;
    startedAt?: string | null;
    endsAt?: string | null;
    showAnswers: boolean;
}

interface RoundAttempt {
    id: string;
    userId: string;
    userName: string;
    status: string;
    totalScore: number | null;
    startedAt: string | null;
    submittedAt: string | null;
    violationCount: number;
}

export default function RoundMonitorPage() {
    const { roundId } = useParams();
    const [, setLocation] = useLocation();
    const { isConnected } = useWebSocket();
    const { toast } = useToast();
    const [resetTarget, setResetTarget] = useState<RoundAttempt | null>(null);
    const [resetting, setResetting] = useState(false);

    // Fetch round statistics
    // Phase 5 (data trust): the Active/Pending/Completed counters are the
    // canonical backend derivation (GET /api/rounds/:id/statistics:
    // active = attempts with startedAt set and submittedAt null,
    // pending = totalParticipants - completed - active). The frontend never
    // recomputes them. The "Active 0 / Pending 1 during a live attempt"
    // contradiction was a STALE SNAPSHOT: with the socket connected this
    // query relied solely on socket events to refresh, so any missed event
    // (reconnect gap, async room-join race) froze the counters. Polling
    // unconditionally guarantees convergence to the backend numbers;
    // socket events still provide instant updates on top.
    const { data: stats, isLoading: statsLoading, error: statsError, dataUpdatedAt: statsUpdatedAt } = useQuery<RoundStatistics>({
        queryKey: [`/api/rounds/${roundId}/statistics`],
        enabled: !!roundId,
        refetchInterval: 5000,
    });

    // Fetch leaderboard
    const { data: leaderboardResponse, isLoading: leaderboardLoading } = useQuery<LeaderboardApiResponse>({
        queryKey: [`/api/rounds/${roundId}/leaderboard`],
        enabled: !!roundId,
        refetchInterval: 5000,
    });

    const leaderboard: LeaderboardEntry[] | undefined = Array.isArray(leaderboardResponse)
        ? leaderboardResponse
        : leaderboardResponse?.leaderboard;

    // Fetch round details for eventId
    const { data: round } = useQuery<Round>({
        queryKey: [`/api/rounds/${roundId}`],
        enabled: !!roundId,
    });

    // Fetch per-participant attempt statuses (includes disqualified attempts
    // that the leaderboard intentionally excludes). Powers the participant
    // table and the Clear Disqualification action.
    const { data: attempts } = useQuery<RoundAttempt[]>({
        queryKey: [`/api/event-admin/rounds/${roundId}/attempts`],
        enabled: !!roundId,
        refetchInterval: 5000,
    });

    const handleClearDisqualification = async () => {
        if (!resetTarget) return;
        setResetting(true);
        try {
            await apiRequest('POST', `/api/event-admin/attempts/${resetTarget.id}/reset`, {});
            successToast(toast, 'Disqualification cleared', `${resetTarget.userName} can now resume the test.`);
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/statistics`] });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/leaderboard`] });
            queryClient.invalidateQueries({ queryKey: [`/api/event-admin/rounds/${roundId}/attempts`] });
        } catch (error) {
            errorToast(toast, 'Failed to clear disqualification', (error as Error)?.message || 'Please try again.');
        } finally {
            setResetting(false);
            setResetTarget(null);
        }
    };

    // Phase 5: unconditional polling above already keeps the monitor fresh
    // with or without the socket, so the manual disconnect-only invalidation
    // loop is no longer needed (it would double-fetch alongside polling).

    const handlePrint = () => {
        window.print();
    };

    const showAnswers = async () => {
        if (!stats) return;
        if (stats.showAnswers) return;
        if (!stats.canShareResults) return;
        try {
            await apiRequest('POST', `/api/rounds/${roundId}/toggle-answers`, { show: true });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/statistics`] });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/leaderboard`] });
        } catch (error) {
            console.error("Failed to show answers", error);
        }
    };

    if (statsLoading || leaderboardLoading) {
        return (
            <EventAdminLayout>
                <div className="p-4 md:p-8">
                    <div className="text-center py-12">Loading round monitor...</div>
                </div>
            </EventAdminLayout>
        );
    }

    if (statsError || !stats) {
        return (
            <EventAdminLayout>
                <div className="p-4 md:p-8 max-w-7xl mx-auto">
                    <Button
                        variant="ghost"
                        onClick={() => setLocation('/event-admin/dashboard')}
                        className="mb-4"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Button>
                    <Card>
                        <CardContent className="text-center py-12">
                            <AlertCircle className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">Unable to load monitor</h3>
                            <p className="text-gray-600 mt-2">
                                {(statsError as Error)?.message || "Round not found or no data available"}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </EventAdminLayout>
        );
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
        if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
        if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
        return <span className="text-gray-600 font-medium w-5 text-center text-sm">{rank}</span>;
    };

    const getRankBadgeColor = (rank: number) => {
        if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        if (rank === 2) return 'bg-gray-100 text-gray-800 border-gray-300';
        if (rank === 3) return 'bg-amber-100 text-amber-800 border-amber-300';
        return 'bg-white text-gray-800 border-gray-200';
    };

    return (
        <EventAdminLayout>
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <Button
                            variant="ghost"
                            onClick={() => setLocation('/event-admin/dashboard')}
                            className="print:hidden"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                        <div className="flex gap-2 print:hidden">
                            <Button onClick={handlePrint} variant="outline" size="sm">
                                <Printer className="mr-2 h-4 w-4" />
                                Print
                            </Button>

                            {/* Toggle Show Answers Button */}
                            <Button
                                onClick={showAnswers}
                                size="sm"
                                variant={stats.showAnswers ? "outline" : "default"}
                                disabled={!stats.canShareResults || stats.showAnswers}
                                title={!stats.canShareResults
                                    ? 'Waiting for all participants to submit'
                                    : stats.showAnswers
                                        ? 'Answers are already visible'
                                        : undefined
                                }
                            >
                                {stats.showAnswers ? "Answers Visible" : "Show Answers"}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                        <Trophy className="h-8 w-8 text-yellow-500" />
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{stats.roundName || 'Round Monitor'}</h1>
                            <div className="flex items-center gap-4 mt-1">
                                <StatusBadge domain="round" status={stats.status} />
                                <span className="text-sm text-gray-600">
                                    <Clock className="inline h-4 w-4 mr-1" />
                                    Duration: {stats.testDuration} min
                                </span>
                                {!isConnected && (
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300" role="status">
                                        Reconnecting — auto-refresh every 5s
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Participant Statistics Cards — semantic status tokens (Phase 1).
                    Counters render the canonical backend snapshot verbatim;
                    each is a live region so screen readers announce changes.
                    Disqualified is a distinct terminal bucket — it is never
                    folded into Submitted. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Total Participants
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-slate-900" role="status" aria-label={`${stats.totalParticipants} total participants`}>{stats.totalParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-active/40 bg-indigo-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-active flex items-center gap-2">
                                <PlayCircle className="h-4 w-4" />
                                In progress
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-active" role="status" aria-label={`${stats.activeParticipants} participants in progress`}>{stats.activeParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-success/40 bg-emerald-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-success flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                Submitted
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-success" role="status" aria-label={`${stats.completedParticipants} participants submitted`}>{stats.completedParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-destructive/40 bg-red-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                                <ShieldX className="h-4 w-4" />
                                Disqualified
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-destructive" role="status" aria-label={`${stats.disqualifiedParticipants ?? 0} participants disqualified`}>{stats.disqualifiedParticipants ?? 0}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-pending/40 bg-amber-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-pending flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                Pending
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-pending" role="status" aria-label={`${stats.pendingParticipants} participants pending`}>{stats.pendingParticipants}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Freshness indicator — the counters are only as trustworthy
                    as their last successful fetch. */}
                <p className="text-xs text-slate-500 mb-6" data-testid="monitor-last-updated" aria-live="off">
                    Last updated {statsUpdatedAt ? new Date(statsUpdatedAt).toLocaleTimeString() : 'not yet updated'}
                    {isConnected ? ' • Live' : ' • Reconnecting'}
                </p>

                {/* Live Leaderboard */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Trophy className="h-5 w-5 text-yellow-500" />
                                    Live Leaderboard
                                </CardTitle>
                                <CardDescription>
                                    Updates automatically as participants complete the test
                                    {isConnected && <span className="ml-2 text-green-600">● Live</span>}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {!leaderboard || leaderboard.length === 0 ? (
                            <div className="text-center py-12">
                                <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                                <p className="text-gray-600">No submissions yet</p>
                                <p className="text-sm text-gray-500 mt-2">
                                    The leaderboard will update live as participants submit their tests
                                </p>
                            </div>
                        ) : (
                                                        <ScrollableTable>

                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-20">Rank</TableHead>
                                            <TableHead>Participant</TableHead>
                                            <TableHead className="text-right">Score</TableHead>
                                            <TableHead className="text-right">Submitted</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {leaderboard.map((entry) => (
                                            <TableRow
                                                key={entry.userId}
                                                className={entry.rank <= 3 ? 'bg-gray-50' : ''}
                                            >
                                                <TableCell>
                                                    <div className="flex items-center justify-center">
                                                        <Badge
                                                            variant="outline"
                                                            className={`${getRankBadgeColor(entry.rank)} flex items-center gap-1 px-2 py-1`}
                                                        >
                                                            {getRankIcon(entry.rank)}
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {entry.userName}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    {entry.totalScore}
                                                    {entry.maxScore && <span className="text-gray-500 text-sm font-normal"> / {entry.maxScore}</span>}
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-gray-600">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {entry.submittedAt ? new Date(entry.submittedAt).toLocaleTimeString() : <span className="text-slate-500">Not submitted</span>}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                                        </ScrollableTable>
                        )}
                    </CardContent>
                </Card>

                {/* Participant Status — per-participant attempt states, including
                    disqualified attempts that the leaderboard intentionally
                    excludes. Disqualified rows offer the "Clear
                    Disqualification" recovery action. */}
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-slate-500" />
                            Participant Status
                        </CardTitle>
                        <CardDescription>
                            Live attempt state for every participant in this round
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!attempts || attempts.length === 0 ? (
                            <p className="text-center text-slate-500 py-8">No attempts yet</p>
                        ) : (
                            <ScrollableTable>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Participant</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Violations</TableHead>
                                            <TableHead className="text-right">Started</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {attempts.map((attempt) => (
                                            <TableRow key={attempt.id}>
                                                <TableCell className="font-medium">{attempt.userName}</TableCell>
                                                <TableCell>
                                                    <StatusBadge domain="attempt" status={attempt.status} />
                                                </TableCell>
                                                <TableCell className="text-right">{attempt.violationCount}</TableCell>
                                                <TableCell className="text-right text-sm text-slate-600">
                                                    {attempt.startedAt ? new Date(attempt.startedAt).toLocaleTimeString() : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {attempt.status === 'disqualified' ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            data-testid={`button-clear-disqualification-${attempt.id}`}
                                                            onClick={() => setResetTarget(attempt)}
                                                        >
                                                            <RotateCcw className="mr-2 h-4 w-4" />
                                                            Clear Disqualification
                                                        </Button>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">—</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollableTable>
                        )}
                    </CardContent>
                </Card>

                {/* Progress Info */}
                {stats.status === 'in_progress' && (
                    <Card className="mt-6 border-active/40 bg-indigo-50">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-active">
                                    <PlayCircle className="h-5 w-5" />
                                    <span className="font-medium" role="status">
                                        Test in progress • {stats.completedParticipants} of {stats.totalParticipants} submitted
                                        {(stats.disqualifiedParticipants ?? 0) > 0 && (
                                            <span className="text-destructive"> • {stats.disqualifiedParticipants} disqualified</span>
                                        )}
                                    </span>
                                </div>
                                <div className="text-sm text-active">
                                    {stats.totalParticipants > 0 ? Math.round((stats.completedParticipants / stats.totalParticipants) * 100) : 0}% Complete
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Completion Message */}
                {stats.status === 'completed' && (
                    <Card className="mt-6 border-success/40 bg-emerald-50">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-success">
                                    <CheckCircle className="h-5 w-5" />
                                    <span className="font-medium">
                                        Round completed! All participants have finished.
                                    </span>
                                </div>
                                {round?.eventId && (
                                    <Button
                                        size="sm"
                                        className="bg-green-700 hover:bg-green-800 text-white"
                                        onClick={() => setLocation(`/event-admin/events/${round.eventId}/results`)}
                                    >
                                        <Trophy className="mr-2 h-4 w-4" />
                                        Process Results
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Print Styles */}
                <style>{`
          @media print {
            .print\\:hidden {
              display: none !important;
            }
            @page {
              margin: 1cm;
            }
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        `}</style>

                {/* Clear Disqualification confirmation */}
                <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Clear disqualification?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to clear this disqualification and allow the participant to resume?
                                {resetTarget && (
                                    <>
                                        {' '}<strong>{resetTarget.userName}</strong> will be moved back to
                                        "In progress" with {resetTarget.violationCount} archived violation
                                        {resetTarget.violationCount === 1 ? '' : 's'} cleared. This action is
                                        recorded in the audit log.
                                    </>
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleClearDisqualification}
                                disabled={resetting}
                                data-testid="button-confirm-clear-disqualification"
                            >
                                {resetting ? 'Clearing…' : 'Clear Disqualification'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </EventAdminLayout>
    );
}
