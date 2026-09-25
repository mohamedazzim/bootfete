import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Trophy, Medal, Award, Clock, Users, CheckCircle, PlayCircle, AlertCircle, Printer } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useEffect } from 'react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { Round } from '@shared/schema';

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
    pendingParticipants: number;
    canShareResults: boolean;
    testDuration: number;
    startedAt?: string | null;
    endsAt?: string | null;
    showAnswers: boolean;
}

export default function RoundMonitorPage() {
    const { roundId } = useParams();
    const [, setLocation] = useLocation();
    const { isConnected } = useWebSocket();

    // Fetch round statistics
    const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<RoundStatistics>({
        queryKey: [`/api/rounds/${roundId}/statistics`],
        enabled: !!roundId,
        refetchInterval: isConnected ? false : 5000,
    });

    // Fetch leaderboard
    const { data: leaderboardResponse, isLoading: leaderboardLoading } = useQuery<LeaderboardApiResponse>({
        queryKey: [`/api/rounds/${roundId}/leaderboard`],
        enabled: !!roundId,
        refetchInterval: isConnected ? false : 5000,
    });

    const leaderboard: LeaderboardEntry[] | undefined = Array.isArray(leaderboardResponse)
        ? leaderboardResponse
        : leaderboardResponse?.leaderboard;

    // Fetch round details for eventId
    const { data: round } = useQuery<Round>({
        queryKey: [`/api/rounds/${roundId}`],
        enabled: !!roundId,
    });

    // When WebSocket is disconnected, keep the monitor fresh with polling.
    useEffect(() => {
        if (isConnected) return;

        const interval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/statistics`] });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/leaderboard`] });
        }, 10000);

        return () => clearInterval(interval);
    }, [roundId, isConnected]);

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
                                <Badge variant="outline" className={
                                    stats.status === 'in_progress' ? 'bg-green-50 text-green-700 border-green-300' :
                                        stats.status === 'completed' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                                            'bg-gray-50 text-gray-700 border-gray-300'
                                }>
                                    {stats.status === 'in_progress' ? 'In Progress' :
                                        stats.status === 'completed' ? 'Completed' :
                                            'Not Started'}
                                </Badge>
                                <span className="text-sm text-gray-600">
                                    <Clock className="inline h-4 w-4 mr-1" />
                                    Duration: {stats.testDuration} min
                                </span>
                                {!isConnected && (
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                                        Offline Mode (Auto-refresh every 5s)
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Participant Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Total Participants
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-gray-900">{stats.totalParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-orange-200 bg-orange-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
                                <PlayCircle className="h-4 w-4" />
                                Active (Taking Test)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-orange-600">{stats.activeParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-green-200 bg-green-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                Completed
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-green-600">{stats.completedParticipants}</p>
                        </CardContent>
                    </Card>

                    <Card className="border-gray-200 bg-gray-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                Pending
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-gray-600">{stats.pendingParticipants}</p>
                        </CardContent>
                    </Card>
                </div>

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
                            <div className="overflow-x-auto">
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
                                                        {entry.submittedAt ? new Date(entry.submittedAt).toLocaleTimeString() : '—'}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Progress Info */}
                {stats.status === 'in_progress' && (
                    <Card className="mt-6 border-blue-200 bg-blue-50">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-blue-800">
                                    <PlayCircle className="h-5 w-5" />
                                    <span className="font-medium">
                                        Test in progress • {stats.completedParticipants} of {stats.totalParticipants} completed
                                    </span>
                                </div>
                                <div className="text-sm text-blue-600">
                                    {Math.round((stats.completedParticipants / stats.totalParticipants) * 100)}% Complete
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Completion Message */}
                {stats.status === 'completed' && (
                    <Card className="mt-6 border-green-200 bg-green-50">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-green-800">
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
            </div>
        </EventAdminLayout>
    );
}
