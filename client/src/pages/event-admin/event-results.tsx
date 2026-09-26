import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    Select as UiSelect,
    SelectContent as UiSelectContent,
    SelectItem as UiSelectItem,
    SelectTrigger as UiSelectTrigger,
    SelectValue as UiSelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Trophy, Medal, Award, Save, Loader2, Crown, Check, ChevronsUpDown, Search, User, Filter, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Round } from '@shared/schema';
import ScrollableTable from '@/components/ScrollableTable';

// Helper to determine if a round is "completed" or capable of having results
// For this UI, we assume any round can have results processed.

interface Participant {
    userId: string | null;
    name: string;
    rollNo: string | null;
    college: string | null;
    dept: string | null;
    email: string | null;
    teamMembers?: { name: string; email: string; rollNo?: string }[];
    score?: number;
    rank?: number;
}

interface EventWinner {
    id: string;
    position: number;
    participantName: string;
    participantCollege: string;
    finalScore: number;
    winningRound: string;
}

export default function EventResultsPage() {
    const { eventId } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<string>('');
    const initialTabSet = useRef(false);

    // Selection states
    const [selectedQualifiers, setSelectedQualifiers] = useState<Participant[]>([]);
    // Finals details dialog state
    const [showFinalsDetailsDialog, setShowFinalsDetailsDialog] = useState(false);
    // Winner/Runner selection for finals
    const [selectedWinner, setSelectedWinner] = useState<Participant | null>(null);
    const [selectedRunner, setSelectedRunner] = useState<Participant | null>(null);

    // Top X filter
    const [topXFilter, setTopXFilter] = useState<string>('');

    // Finals room/time state (for future use or to avoid undefined errors)
    const [finalsRoom, setFinalsRoom] = useState('');
    const [finalsTime, setFinalsTime] = useState('');

    // Fetch Event Details
    const { data: event } = useQuery<{ id: string; name: string }>({
        queryKey: [`/api/events/${eventId}`],
        enabled: !!eventId,
    });

    // Fetch All Rounds
    const { data: rounds, isLoading: loadingRounds } = useQuery<Round[]>({
        queryKey: [`/api/events/${eventId}/rounds`],
        enabled: !!eventId,
    });

    const sortedRounds = useMemo(() => {
        if (!rounds) return [];
        return [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    }, [rounds]);

    // Set initial active tab or sync with navigation/URL
    useEffect(() => {
        if (sortedRounds.length > 0 && !initialTabSet.current) {
            // If a roundId is present in the URL (e.g., via monitor button), use it
            const url = window.location.href;
            const match = url.match(/rounds?\/([a-zA-Z0-9\-]+)/);
            let roundIdFromUrl = null;
            if (match && match[1]) {
                // Try to find a round with this id or round number
                roundIdFromUrl = sortedRounds.find(r => r.id === match[1] || r.roundNumber === Number(match[1]))?.id;
            }
            if (roundIdFromUrl) {
                setActiveTab(roundIdFromUrl);
            } else {
                setActiveTab(sortedRounds[0].id);
            }
            initialTabSet.current = true;
        }
    }, [sortedRounds]);

    const currentRound = useMemo(() =>
        sortedRounds.find(r => r.id === activeTab),
        [sortedRounds, activeTab]);

    // Determine if this is the last round
    const isLastRound = useMemo(() => {
        if (!currentRound || sortedRounds.length === 0) return false;
        return currentRound.roundNumber === sortedRounds[sortedRounds.length - 1].roundNumber;
    }, [currentRound, sortedRounds]);

    // Fetch Pool for Current Round
    const { data: selectionPool, isLoading: loadingPool } = useQuery<Participant[]>({
        queryKey: [`/api/events/${eventId}/rounds/${currentRound?.roundNumber || 0}/selection-pool`],
        enabled: !!eventId && !!currentRound && currentRound.roundNumber > 0,
        retry: false,
        staleTime: 10000
    });

    // Fetch Existing Winners (only relevant for Final Round tab)
    const { data: eventWinners, isLoading: loadingWinners } = useQuery<EventWinner[]>({
        queryKey: [`/api/events/${eventId}/winners`],
        enabled: !!eventId && isLastRound,
    });

    // Mutation for Saving Results (Qualifiers OR Winners)
    const saveResultsMutation = useMutation({
        mutationFn: async ({ selections, finalsDetails, isFinal }: { selections: any[], finalsDetails?: { room?: string; time?: string }, isFinal?: boolean }) => {
            if (!currentRound) throw new Error("No round selected");
            const res = await apiRequest('POST', `/api/events/${eventId}/rounds/${currentRound.roundNumber}/results`, {
                qualifiers: selections.map(s => ({
                    ...s,
                    userName: s.name,
                    score: Number(s.score) || 0
                })),
                finalsRoom: finalsDetails?.room,
                finalsTime: finalsDetails?.time,
                isFinal: isFinal
            });
            return res.json();
        },
        onSuccess: (data, variables) => {
            if (data.failedEmails && data.failedEmails.length > 0) {
                toast({
                    title: "Results Saved with Warnings",
                    description: `${data.failedEmails.length} emails failed to send. Please check logs.`,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: variables.isFinal ? 'Winners Declared' : 'Qualifiers Saved',
                    description: variables.isFinal ? 'Event winners have been published.' : 'Qualifiers have been saved and promoted to the next round.'
                });
            }

            // Invalidate next round's pool
            if (currentRound) {
                const nextRoundNum = currentRound.roundNumber + 1;
                queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/rounds/${nextRoundNum}/selection-pool`] });
            }
            queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/winners`] });
            queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/rounds`] }); // Force refetch rounds for resultsPublished

            setShowFinalsDetailsDialog(false);
            setFinalsRoom('');
            setFinalsTime('');
            setSelectedQualifiers([]);
            setTopXFilter('');

            // If not final, maybe switch to next tab?
            if (!variables.isFinal && sortedRounds) {
                const nextRound = sortedRounds.find(r => r.roundNumber === (currentRound?.roundNumber || 0) + 1);
                if (nextRound) {
                    setActiveTab(nextRound.id);
                }
            }
        },
        onError: (error) => toast({ title: 'Error', description: error.message || 'Failed to save results', variant: 'destructive' })
    });

    // Handlers
    const handleToggleQualifier = (participant: Participant) => {
        const exists = selectedQualifiers.find(p => p.name === participant.name && p.rollNo === participant.rollNo);
        if (exists) {
            setSelectedQualifiers(selectedQualifiers.filter(p => p !== exists));
        } else {
            setSelectedQualifiers([...selectedQualifiers, participant]);
        }
    };

    const handleSelectAllQualifiers = () => {
        if (!selectionPool) return;

        // If sorting filter applies, we might want to select visible ones? 
        // Logic: Select All means Select All AVAILABLE in the pool.

        if (selectedQualifiers.length === selectionPool.length) {
            setSelectedQualifiers([]);
        } else {
            setSelectedQualifiers(selectionPool);
        }
    };

    // Select Top X Helper
    const handleSelectTopX = (val: string) => {
        setTopXFilter(val);
        if (!selectionPool || !val) return;

        const count = parseInt(val);
        if (isNaN(count)) return;

        // Sort pool by Rank (if available) or Score (desc)
        // Usually backend returns generic order?
        // Let's assume pool logic returns generic. We sort by rank/score here if present.

        const sorted = [...selectionPool].sort((a, b) => {
            if (a.rank && b.rank) return a.rank - b.rank;
            if (a.score !== undefined && b.score !== undefined) return b.score - a.score;
            return 0;
        });

        const top = sorted.slice(0, count);
        setSelectedQualifiers(top);

        toast({
            title: `Selected Top ${count}`,
            description: `Automatically selected the top ${count} participants based on rank/score.`
        });
    };

    const handleSaveQualifiers = () => {
        if (selectedQualifiers.length === 0) {
            toast({ title: 'No Selection', description: 'Please select at least one participant.', variant: 'destructive' });
            return;
        }
        setShowFinalsDetailsDialog(true);
        // Reset winner/runner selection when dialog opens
        setSelectedWinner(null);
        setSelectedRunner(null);
    };

    const handleConfirmSaveWithDetails = () => {
        if (isLastRound) {
            if (!selectedWinner) {
                toast({ title: 'Missing Selection', description: 'Please select a winner.', variant: 'destructive' });
                return;
            }
            let finalsQualifiers = [];
            if (selectedQualifiers.length === 1) {
                finalsQualifiers = [{ ...selectedWinner, position: 1 }];
            } else {
                if (!selectedRunner) {
                    toast({ title: 'Missing Selection', description: 'Please select a runner-up.', variant: 'destructive' });
                    return;
                }
                const rest = selectedQualifiers.filter(p => p.userId !== selectedWinner.userId && p.userId !== selectedRunner.userId);
                finalsQualifiers = [
                    { ...selectedWinner, position: 1 },
                    { ...selectedRunner, position: 2 },
                    ...rest.map((p, idx) => ({ ...p, position: idx + 3 }))
                ];
            }
            saveResultsMutation.mutate({
                selections: finalsQualifiers,
                isFinal: true,
                finalsDetails: { room: finalsRoom, time: finalsTime ? new Date(finalsTime).toISOString() : undefined }
            });
        } else {
            // For prelims, send finalsTime as now (or allow admin to set)
            saveResultsMutation.mutate({
                selections: selectedQualifiers,
                isFinal: false,
                finalsDetails: { room: finalsRoom, time: new Date().toISOString() }
            });
        }
    };



    const getPositionIcon = (position: number) => {
        if (position === 1) return <Crown className="h-6 w-6 text-yellow-500" />;
        if (position === 2) return <Medal className="h-6 w-6 text-gray-400" />;
        if (position === 3) return <Award className="h-6 w-6 text-amber-600" />;
        return <Trophy className="h-5 w-5 text-blue-500" />;
    };

    if (loadingRounds) return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

    return (
        <EventAdminLayout>
            <div className="p-4 md:p-8 max-w-6xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <Button
                            variant="ghost"
                            onClick={() => setLocation('/event-admin/dashboard')}
                            className="mb-2 pl-0 hover:pl-2 transition-all"
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Dashboard
                        </Button>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                            Event Results
                        </h1>
                        <p className="text-gray-500 mt-1">{event?.name || 'Loading...'}</p>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="w-full flex justify-start overflow-x-auto">
                        {sortedRounds.map((round) => (
                            <TabsTrigger key={round.id} value={round.id} className="min-w-[120px]">
                                Round {round.roundNumber} ({round.name})
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {currentRound && (
                        <TabsContent value={currentRound.id} className="space-y-6">
                            {/* QUALIFIERS SELECTION SECTION (For All Rounds) */}
                            <Card>
                                <CardHeader>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div>
                                            <CardTitle>{isLastRound ? "Select Final Winners / Qualifiers" : "Select Qualifiers"}</CardTitle>
                                            <CardDescription>
                                                {isLastRound
                                                    ? "Select the participants who have won or qualified in this final round."
                                                    : "Select participants to promote to the next round."}
                                            </CardDescription>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isLastRound && currentRound?.resultsPublished ? (
                                                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-md border border-green-200">
                                                    <CheckCircle2 className="h-5 w-5" />
                                                    <span className="font-medium">Results Published</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    {/* Top X Selector */}
                                                    <UiSelect onValueChange={handleSelectTopX} value={topXFilter}>
                                                        <UiSelectTrigger className="w-[180px]">
                                                            <UiSelectValue placeholder="Select Qualifiers..." />
                                                        </UiSelectTrigger>
                                                        <UiSelectContent>
                                                            <UiSelectItem value="5">Select Top 5</UiSelectItem>
                                                            <UiSelectItem value="10">Select Top 10</UiSelectItem>
                                                            <UiSelectItem value="20">Select Top 20</UiSelectItem>
                                                            <UiSelectItem value="50">Select Top 50</UiSelectItem>
                                                        </UiSelectContent>
                                                    </UiSelect>

                                                    <Button onClick={handleSaveQualifiers} disabled={saveResultsMutation.isPending || selectedQualifiers.length === 0 || (isLastRound && currentRound?.resultsPublished)}>
                                                        {saveResultsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                        {isLastRound ? "Publish Winners" : "Save & Promote"} ({selectedQualifiers.length})
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {loadingPool ? (
                                        <div className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
                                    ) : !selectionPool || selectionPool.length === 0 ? (
                                        <div className="text-center py-10 text-muted-foreground">No participants found in the pool for this round.</div>
                                    ) : (
                                                                                <ScrollableTable>

                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-12">
                                                            <Checkbox
                                                                checked={selectionPool.length > 0 && selectedQualifiers.length === selectionPool.length}
                                                                onCheckedChange={handleSelectAllQualifiers}
                                                            />
                                                        </TableHead>
                                                        <TableHead>Rank</TableHead>
                                                        <TableHead>Score</TableHead>
                                                        <TableHead>Participant</TableHead>
                                                        <TableHead>Roll No</TableHead>
                                                        <TableHead>College</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectionPool.map((p, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell>
                                                                <Checkbox
                                                                    checked={selectedQualifiers.some(sq => sq.name === p.name && sq.rollNo === p.rollNo)}
                                                                    onCheckedChange={() => handleToggleQualifier(p)}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                {p.rank ? <Badge variant="outline">#{p.rank}</Badge> : '-'}
                                                            </TableCell>
                                                            <TableCell className="font-bold">
                                                                {p.score !== undefined ? p.score : '-'}
                                                            </TableCell>
                                                            <TableCell className="font-medium">{p.name}</TableCell>
                                                            <TableCell>{p.rollNo || '-'}</TableCell>
                                                            <TableCell>{p.college || '-'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                                                                </ScrollableTable>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>

                {/* Finals Details Dialog (Winner/Runner selection for finals) */}
                <Dialog open={showFinalsDetailsDialog} onOpenChange={setShowFinalsDetailsDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{isLastRound ? "Select Winner & Runner-up" : "Next Round Details"}</DialogTitle>
                            <DialogDescription>
                                {isLastRound
                                    ? `Choose the winner and runner-up from the selected finalists. This will send the correct emails to each.`
                                    : `Select participants to promote to the next round.`}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {isLastRound ? (
                                selectedQualifiers.length === 0 ? (
                                    <div className="text-red-600 text-sm font-semibold">Please select at least one qualifier to choose a winner.</div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Winner *</Label>
                                            <select
                                                className="w-full border rounded px-2 py-2"
                                                value={selectedWinner?.userId || ''}
                                                onChange={e => {
                                                    const winner = selectedQualifiers.find(p => p.userId === e.target.value);
                                                    setSelectedWinner(winner || null);
                                                }}
                                            >
                                                <option value="">Select Winner</option>
                                                {selectedQualifiers.map(p => (
                                                    <option key={p.userId || p.name} value={p.userId || ''}>{p.name} ({p.college})</option>
                                                ))}
                                            </select>
                                        </div>
                                        {selectedQualifiers.length > 1 && (
                                            <div className="space-y-2">
                                                <Label>Runner-up *</Label>
                                                <select
                                                    className="w-full border rounded px-2 py-2"
                                                    value={selectedRunner?.userId || ''}
                                                    onChange={e => {
                                                        const runner = selectedQualifiers.find(p => p.userId === e.target.value);
                                                        setSelectedRunner(runner || null);
                                                    }}
                                                >
                                                    <option value="">Select Runner-up</option>
                                                    {selectedQualifiers.map(p => (
                                                        <option key={p.userId || p.name} value={p.userId || ''}>{p.name} ({p.college})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )
                            ) : null}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowFinalsDetailsDialog(false)}>Cancel</Button>
                            <Button onClick={handleConfirmSaveWithDetails} disabled={saveResultsMutation.isPending || (isLastRound && (selectedQualifiers.length === 0 || !selectedWinner || (selectedQualifiers.length > 1 && !selectedRunner)))}>
                                {saveResultsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isLastRound ? "Publish Winners" : "Send & Promote"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </EventAdminLayout >
    );
}
