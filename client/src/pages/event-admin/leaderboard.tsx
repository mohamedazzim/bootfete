import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Trophy, Medal, Award, Clock, Printer } from 'lucide-react';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    totalScore: number;
    maxScore?: number;
    submittedAt: Date;
}

export default function EventAdminLeaderboardPage() {
    const { roundId, eventId } = useParams();
    const [, setLocation] = useLocation();

    const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
        queryKey: roundId ? ['/api/rounds', roundId, 'leaderboard'] : ['/api/events', eventId, 'leaderboard'],
        enabled: !!(roundId || eventId),
    });

    const handlePrint = () => {
        window.print();
    };

    if (isLoading) {
        return (
            <EventAdminLayout>
                <div className="p-4 md:p-8">
                    <div className="text-center py-12">Loading leaderboard...</div>
                </div>
            </EventAdminLayout>
        );
    }

    if (!leaderboard || leaderboard.length === 0) {
        return (
            <EventAdminLayout>
                <div className="p-4 md:p-8 max-w-6xl mx-auto">
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
                            <Trophy className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-600">No results available yet</p>
                            <p className="text-sm text-gray-500 mt-2">Results will appear here once participants submit their tests</p>
                        </CardContent>
                    </Card>
                </div>
            </EventAdminLayout>
        );
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="h-6 w-6 text-yellow-500" />;
        if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />;
        if (rank === 3) return <Award className="h-6 w-6 text-amber-600" />;
        return <span className="text-gray-600 font-medium w-6 text-center">{rank}</span>;
    };

    const getRankBadgeColor = (rank: number) => {
        if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        if (rank === 2) return 'bg-gray-100 text-gray-800 border-gray-300';
        if (rank === 3) return 'bg-amber-100 text-amber-800 border-amber-300';
        return 'bg-white text-gray-800 border-gray-200';
    };

    return (
        <EventAdminLayout>
            <div className="p-4 md:p-8 max-w-6xl mx-auto">
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
                        <Button
                            onClick={handlePrint}
                            variant="outline"
                            className="print:hidden"
                        >
                            <Printer className="mr-2 h-4 w-4" />
                            Print Leaderboard
                        </Button>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <Trophy className="h-8 w-8 text-yellow-500" />
                        <h1 className="text-3xl font-bold text-gray-900">
                            Event Leaderboard
                        </h1>
                    </div>
                    <p className="text-gray-600">
                        {roundId ? 'Round Rankings' : 'Event Rankings'} • {leaderboard.length} Participants
                    </p>
                </div>

                {/* Top 3 Podium */}
                {leaderboard.length >= 3 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {/* 2nd Place */}
                        <Card className="mt-0 md:mt-8 bg-gray-50 border-2 border-gray-300 order-2 md:order-1">
                            <CardHeader className="text-center pb-2">
                                <div className="flex justify-center mb-2">
                                    <Medal className="h-12 w-12 text-gray-400" />
                                </div>
                                <CardTitle className="text-lg">2nd Place</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="font-semibold text-gray-900 mb-1">{leaderboard[1].userName}</p>
                                <p className="text-2xl font-bold text-gray-700">
                                    {leaderboard[1].totalScore}
                                    {leaderboard[1].maxScore && <span className="text-sm text-gray-500"> / {leaderboard[1].maxScore}</span>}
                                </p>
                            </CardContent>
                        </Card>

                        {/* 1st Place */}
                        <Card className="bg-yellow-50 border-2 border-yellow-400 order-1 md:order-2">
                            <CardHeader className="text-center pb-2">
                                <div className="flex justify-center mb-2">
                                    <Trophy className="h-16 w-16 text-yellow-500" />
                                </div>
                                <CardTitle className="text-xl">1st Place</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="font-semibold text-gray-900 mb-1 text-lg">{leaderboard[0].userName}</p>
                                <p className="text-3xl font-bold text-yellow-600">
                                    {leaderboard[0].totalScore}
                                    {leaderboard[0].maxScore && <span className="text-sm text-gray-500"> / {leaderboard[0].maxScore}</span>}
                                </p>
                            </CardContent>
                        </Card>

                        {/* 3rd Place */}
                        <Card className="mt-0 md:mt-8 bg-amber-50 border-2 border-amber-400 order-3">
                            <CardHeader className="text-center pb-2">
                                <div className="flex justify-center mb-2">
                                    <Award className="h-12 w-12 text-amber-600" />
                                </div>
                                <CardTitle className="text-lg">3rd Place</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center">
                                <p className="font-semibold text-gray-900 mb-1">{leaderboard[2].userName}</p>
                                <p className="text-2xl font-bold text-amber-700">
                                    {leaderboard[2].totalScore}
                                    {leaderboard[2].maxScore && <span className="text-sm text-gray-500"> / {leaderboard[2].maxScore}</span>}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Full Leaderboard Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Complete Rankings</CardTitle>
                        <CardDescription>Ranked by score, then by submission time (earlier submissions rank higher)</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                                                        className={`${getRankBadgeColor(entry.rank)} flex items-center gap-1 px-3 py-1`}
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
                                                    {new Date(entry.submittedAt).toLocaleString()}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-6 flex justify-center gap-4 print:hidden">
                    <Button
                        onClick={() => setLocation('/event-admin/dashboard')}
                        variant="outline"
                        size="lg"
                    >
                        Back to Dashboard
                    </Button>
                    <Button
                        onClick={handlePrint}
                        size="lg"
                    >
                        <Printer className="mr-2 h-4 w-4" />
                        Print Leaderboard
                    </Button>
                </div>
            </div>

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
        </EventAdminLayout>
    );
}
