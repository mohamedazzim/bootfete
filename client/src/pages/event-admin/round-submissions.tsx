import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Users, CheckCircle, XCircle, Clock, BarChart3, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import ScrollableTable from '@/components/ScrollableTable';

interface Submission {
    attemptId: string;
    userId: string;
    userName: string;
    userEmail: string;
    college: string;
    department: string;
    rollNo: string;
    submittedAt: string | null;
    status: string;
    totalQuestions: number;
    evaluatedQuestions: number;
    correctCount: number;
    wrongCount: number;
    isFullyEvaluated: boolean;
    totalScore: number;
}

export default function RoundSubmissionsPage() {
    const { roundId } = useParams();
    const [, setLocation] = useLocation();

    // Get round info
    const { data: round } = useQuery({
        queryKey: [`/api/rounds/${roundId}`],
        enabled: !!roundId,
    });

    // Get submissions
    const { data: submissions, isLoading, error } = useQuery<Submission[]>({
        queryKey: [`/api/rounds/${roundId}/submissions`],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/rounds/${roundId}/submissions`);
            return res.json();
        },
        enabled: !!roundId,
        refetchInterval: 10000, // Auto-refresh every 10 seconds
    });

    const formatDate = (date: string | null) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const getStatusBadge = (submission: Submission) => {
        // Phase 8: canonical vocabulary ("Evaluated") on semantic tokens —
        // no hardcoded palette colors.
        if (submission.isFullyEvaluated) {
            return <Badge className="bg-success text-success-foreground border-transparent">Evaluated</Badge>;
        }
        if (submission.evaluatedQuestions > 0) {
            return <Badge className="bg-active text-active-foreground border-transparent">Partial ({submission.evaluatedQuestions}/{submission.totalQuestions})</Badge>;
        }
        return <Badge className="bg-pending text-pending-foreground border-transparent">Pending</Badge>;
    };

    return (
        <EventAdminLayout>
            <div className="container mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">Submissions</h1>
                            <p className="text-muted-foreground">{(round as any)?.name || 'Round'}</p>
                        </div>
                    </div>
                    <Button onClick={() => setLocation(`/event-admin/rounds/${roundId}/evaluated-leaderboard`)}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        View Leaderboard
                    </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <Users className="h-8 w-8 text-blue-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Submissions</p>
                                    <p className="text-2xl font-bold">{submissions?.length || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <CheckCircle className="h-8 w-8 text-green-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Fully Evaluated</p>
                                    <p className="text-2xl font-bold">{submissions?.filter(s => s.isFullyEvaluated).length || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <Clock className="h-8 w-8 text-yellow-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending Evaluation</p>
                                    <p className="text-2xl font-bold">{submissions?.filter(s => !s.isFullyEvaluated).length || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <BarChart3 className="h-8 w-8 text-purple-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg. Score</p>
                                    <p className="text-2xl font-bold">
                                        {submissions?.length ? Math.round(submissions.reduce((acc, s) => acc + s.totalScore, 0) / submissions.length) : 0}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Submissions Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>All Submissions</CardTitle>
                        <CardDescription>
                            Click on a submission to evaluate answers
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-12 text-red-500">
                                Failed to load submissions. Please try again.
                            </div>
                        ) : submissions?.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No submissions yet. Participants will appear here once they submit their tests.
                            </div>
                        ) : (
                                                        <ScrollableTable>

                              <Table>
                                                              <TableHeader>
                                                                  <TableRow>
                                                                      <TableHead>Participant</TableHead>
                                                                      <TableHead>College</TableHead>
                                                                      <TableHead>Submitted At</TableHead>
                                                                      <TableHead className="text-center">✓ / ✗</TableHead>
                                                                      <TableHead className="text-center">Score</TableHead>
                                                                      <TableHead>Status</TableHead>
                                                                      <TableHead></TableHead>
                                                                  </TableRow>
                                                              </TableHeader>
                                                              <TableBody>
                                                                  {submissions?.map((submission) => (
                                                                      <TableRow
                                                                          key={submission.attemptId}
                                                                          className="cursor-pointer hover:bg-muted/50"
                                                                          onClick={() => setLocation(`/event-admin/attempts/${submission.attemptId}/evaluate`)}
                                                                      >
                                                                          <TableCell>
                                                                              <div>
                                                                                  <p className="font-medium">{submission.userName}</p>
                                                                                  <p className="text-sm text-muted-foreground">{submission.rollNo}</p>
                                                                              </div>
                                                                          </TableCell>
                                                                          <TableCell>
                                                                              <div>
                                                                                  <p>{submission.college || '-'}</p>
                                                                                  <p className="text-sm text-muted-foreground">{submission.department}</p>
                                                                              </div>
                                                                          </TableCell>
                                                                          <TableCell>{formatDate(submission.submittedAt)}</TableCell>
                                                                          <TableCell className="text-center">
                                                                              <span className="text-green-600 font-medium">{submission.correctCount}</span>
                                                                              {' / '}
                                                                              <span className="text-red-600 font-medium">{submission.wrongCount}</span>
                                                                          </TableCell>
                                                                          <TableCell className="text-center font-bold">
                                                                              {submission.totalScore}
                                                                          </TableCell>
                                                                          <TableCell>{getStatusBadge(submission)}</TableCell>
                                                                          <TableCell>
                                                                              <Button variant="ghost" size="sm">
                                                                                  Evaluate →
                                                                              </Button>
                                                                          </TableCell>
                                                                      </TableRow>
                                                                  ))}
                                                              </TableBody>
                                                          </Table>
                                                        </ScrollableTable>
                        )}
                    </CardContent>
                </Card>
            </div>
        </EventAdminLayout>
    );
}
