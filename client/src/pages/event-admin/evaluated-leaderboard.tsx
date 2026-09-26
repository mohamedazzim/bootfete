import { useParams, useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trophy, Crown, Loader2, Save, Users, CheckCircle2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import ScrollableTable from '@/components/ScrollableTable';

interface LeaderboardEntry {
    attemptId: string;
    userId: string;
    name: string;
    email: string;
    college: string;
    department: string;
    rollNo: string;
    correctCount: number;
    wrongCount: number;
    pendingCount: number;
    totalScore: number;
    submittedAt: string | null;
    isFullyEvaluated: boolean;
    rank: number;

    teamMembers: { name: string; rollNo: string; email: string }[];
    isQualified: boolean;
}

export default function EvaluatedLeaderboardPage() {
    const { roundId } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [selectedQualifiers, setSelectedQualifiers] = useState<Set<string>>(new Set());
    const [hasInitialized, setHasInitialized] = useState(false);
    const [showFinalsDialog, setShowFinalsDialog] = useState(false);
    const [finalsTime, setFinalsTime] = useState('');
    const [congratsMessage, setCongratsMessage] = useState('');

    // Get round info
    const { data: round } = useQuery({
        queryKey: [`/api/rounds/${roundId}`],
        enabled: !!roundId,
    });

    // Get event info  
    const { data: event } = useQuery({
        queryKey: [`/api/events/${(round as any)?.eventId}`],
        enabled: !!(round as any)?.eventId,
    });

    // Get leaderboard data
    const { data: leaderboard, isLoading, error } = useQuery<LeaderboardEntry[]>({
        queryKey: [`/api/rounds/${roundId}/evaluated-leaderboard`],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/rounds/${roundId}/evaluated-leaderboard`);
            return res.json();
        },
        enabled: !!roundId,
        refetchInterval: 15000,
    });

    // Initialize selection from server data
    useEffect(() => {
        if (leaderboard && !hasInitialized) {
            const qualifiedIds = leaderboard
                .filter(e => e.isQualified)
                .map(e => e.attemptId);
            setSelectedQualifiers(new Set(qualifiedIds));
            setHasInitialized(true);
        }
    }, [leaderboard, hasInitialized]);

    // Save qualifiers mutation
    const saveQualifiersMutation = useMutation({
        mutationFn: async () => {
            const qualifiers = leaderboard?.filter(entry => selectedQualifiers.has(entry.attemptId)).map(entry => ({
                userId: entry.userId,
                name: entry.name,
                userName: entry.name,
                email: entry.email,
                college: entry.college,
                dept: entry.department,
                rollNo: entry.rollNo,
                score: entry.totalScore,
                teamMembers: entry.teamMembers
            })) || [];

            // Use the actual round number from the round object
            const roundNumber = (round as any)?.roundNumber || 1;
            const response = await apiRequest('POST', `/api/events/${(round as any)?.eventId}/rounds/${roundNumber}/results`, {
                qualifiers,
                finalsTime,
                congratsMessage
            });

            return response.json();
        },
        onSuccess: (data) => {
            toast({ title: 'Success', description: `${data.count} qualifier(s) saved and notified!` });
            setShowFinalsDialog(false);
            setHasInitialized(false); // Trigger re-sync with server state
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${roundId}/evaluated-leaderboard`] });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    });

    const toggleQualifier = (attemptId: string) => {
        setSelectedQualifiers(prev => {
            const next = new Set(prev);
            if (next.has(attemptId)) {
                next.delete(attemptId);
            } else {
                next.add(attemptId);
            }
            return next;
        });
    };

    const selectTopN = (n: number) => {
        if (!leaderboard) return;
        const topN = leaderboard.slice(0, n).map(e => e.attemptId);
        setSelectedQualifiers(new Set(topN));
    };

    const formatDate = (date: string | null) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const handleSaveQualifiers = () => {
        if (selectedQualifiers.size === 0) {
            toast({ title: 'Error', description: 'Please select at least one qualifier', variant: 'destructive' });
            return;
        }
        setShowFinalsDialog(true);
    };

    const handleConfirmSave = () => {
        if (!finalsTime) {
            toast({ title: 'Error', description: 'Please enter the finals time', variant: 'destructive' });
            return;
        }
        saveQualifiersMutation.mutate();
    };

    return (
        <EventAdminLayout>
            <div className="container mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation(`/event-admin/rounds/${roundId}/submissions`)}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Trophy className="h-6 w-6 text-yellow-500" />
                                Evaluated Leaderboard
                            </h1>
                            <p className="text-muted-foreground">{(round as any)?.name || 'Round'} • {(event as any)?.name || 'Event'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => selectTopN(5)}>
                            Top 5
                        </Button>
                        <Button variant="outline" onClick={() => selectTopN(10)}>
                            Top 10
                        </Button>
                        <Button
                            onClick={handleSaveQualifiers}
                            disabled={selectedQualifiers.size === 0}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <Crown className="mr-2 h-4 w-4" />
                            Save Qualifiers ({selectedQualifiers.size})
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <Users className="h-8 w-8 text-blue-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Participants</p>
                                    <p className="text-2xl font-bold">{leaderboard?.length || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Fully Evaluated</p>
                                    <p className="text-2xl font-bold">{leaderboard?.filter(e => e.isFullyEvaluated).length || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <Crown className="h-8 w-8 text-yellow-500" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Selected Qualifiers</p>
                                    <p className="text-2xl font-bold">{selectedQualifiers.size}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Leaderboard Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Rankings</CardTitle>
                        <CardDescription>
                            Sorted by correct answers (descending), then submission time (ascending)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="text-center py-12 text-red-500">
                                Failed to load leaderboard. Please try again.
                            </div>
                        ) : leaderboard?.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                No evaluated submissions yet.
                            </div>
                        ) : (
                                                        <ScrollableTable>

                              <Table>
                                                              <TableHeader>
                                                                  <TableRow>
                                                                      <TableHead className="w-12">Select</TableHead>
                                                                      <TableHead className="w-16">Rank</TableHead>
                                                                      <TableHead>Participant</TableHead>
                                                                      <TableHead>College</TableHead>
                                                                      <TableHead className="text-center">✓ Correct</TableHead>
                                                                      <TableHead className="text-center">✗ Wrong</TableHead>
                                                                      <TableHead className="text-center">Score</TableHead>
                                                                      <TableHead>Submitted</TableHead>
                                                                      <TableHead>Status</TableHead>
                                                                  </TableRow>
                                                              </TableHeader>
                                                              <TableBody>
                                                                  {leaderboard?.map((entry) => (
                                                                      <TableRow
                                                                          key={entry.attemptId}
                                                                          className={selectedQualifiers.has(entry.attemptId) ? 'bg-green-50 dark:bg-green-950/20' : ''}
                                                                      >
                                                                          <TableCell>
                                                                              <Checkbox
                                                                                  checked={selectedQualifiers.has(entry.attemptId)}
                                                                                  onCheckedChange={() => toggleQualifier(entry.attemptId)}
                                                                              />
                                                                          </TableCell>
                                                                          <TableCell>
                                                                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${entry.rank === 1 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                                                                  entry.rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                                                                                      entry.rank === 3 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                                                                                          'bg-muted text-muted-foreground'
                                                                                  }`}>
                                                                                  {entry.rank}
                                                                              </div>
                                                                          </TableCell>
                                                                          <TableCell>
                                                                              <div>
                                                                                  <p className="font-medium">{entry.name}</p>
                                                                                  <p className="text-sm text-muted-foreground">{entry.rollNo}</p>
                                                                              </div>
                                                                          </TableCell>
                                                                          <TableCell>
                                                                              <div>
                                                                                  <p>{entry.college || '-'}</p>
                                                                                  <p className="text-sm text-muted-foreground">{entry.department}</p>
                                                                              </div>
                                                                          </TableCell>
                                                                          <TableCell className="text-center">
                                                                              <span className="text-green-600 font-bold text-lg">{entry.correctCount}</span>
                                                                          </TableCell>
                                                                          <TableCell className="text-center">
                                                                              <span className="text-red-600 font-bold text-lg">{entry.wrongCount}</span>
                                                                          </TableCell>
                                                                          <TableCell className="text-center">
                                                                              <span className="font-bold text-lg">{entry.totalScore}</span>
                                                                          </TableCell>
                                                                          <TableCell className="text-sm">{formatDate(entry.submittedAt)}</TableCell>
                                                                          <TableCell>
                                                                              {entry.isFullyEvaluated ? (
                                                                                  <Badge className="bg-success text-success-foreground border-transparent">Evaluated</Badge>
                                                                              ) : entry.pendingCount > 0 ? (
                                                                                  <Badge variant="secondary">{entry.pendingCount} pending</Badge>
                                                                              ) : (
                                                                                  <Badge variant="outline">Pending</Badge>
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

                {/* Finals Details Dialog */}
                <Dialog open={showFinalsDialog} onOpenChange={setShowFinalsDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>🎉 Finals Round Details</DialogTitle>
                            <DialogDescription>
                                Enter the time for the finals. This will be sent to all {selectedQualifiers.size} selected qualifier(s).
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="finals-time">Finals Time *</Label>
                                <Input
                                    id="finals-time"
                                    type="time"
                                    value={finalsTime}
                                    onChange={(e) => setFinalsTime(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="congrats-msg">Congratulations Message (Optional)</Label>
                                <Textarea
                                    id="congrats-msg"
                                    value={congratsMessage}
                                    onChange={(e) => setCongratsMessage(e.target.value)}
                                    placeholder="Add a personal message to qualifiers..."
                                    className="min-h-[60px]"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowFinalsDialog(false)}>Cancel</Button>
                            <Button
                                onClick={handleConfirmSave}
                                disabled={saveQualifiersMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {saveQualifiersMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Send & Save Qualifiers
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </EventAdminLayout>
    );
}
