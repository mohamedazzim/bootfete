import { useParams, useLocation } from 'wouter';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Check, X, Loader2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface QuestionAnswer {
    questionId: string;
    questionNumber: number;
    questionType: string;
    questionText: string;
    expectedAnswer: string | null;
    points: number;
    answer: {
        id: string;
        text: string;
        isCorrect: boolean | null;
        pointsAwarded: number | null;
    } | null;
}

interface AttemptDetails {
    attemptId: string;
    roundId: string;
    roundName: string;
    userId: string;
    userName: string;
    userEmail: string;
    college: string;
    department: string;
    rollNo: string;
    submittedAt: string;
    status: string;
    questionAnswers: QuestionAnswer[];
}

interface Evaluation {
    answerId: string;
    isCorrect: boolean;
    pointsAwarded: number;
}

export default function EvaluateSubmissionPage() {
    const { attemptId } = useParams();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    // Track evaluations
    const [evaluations, setEvaluations] = useState<Map<string, { isCorrect: boolean; points: number }>>(new Map());

    // Get attempt details
    const { data: attempt, isLoading, error } = useQuery<AttemptDetails>({
        queryKey: [`/api/attempts/${attemptId}/details`],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/attempts/${attemptId}/details`);
            return res.json();
        },
        enabled: !!attemptId,
    });

    // Get all submissions for navigation
    const { data: allSubmissions } = useQuery<any[]>({
        queryKey: [`/api/rounds/${attempt?.roundId}/submissions`],
        queryFn: async () => {
            const res = await apiRequest('GET', `/api/rounds/${attempt?.roundId}/submissions`);
            return res.json();
        },
        enabled: !!attempt?.roundId,
    });

    // Batch evaluate mutation
    const evaluateMutation = useMutation({
        mutationFn: async () => {
            const evalArray: Evaluation[] = [];

            attempt?.questionAnswers.forEach(qa => {
                if (qa.answer) {
                    const evalData = evaluations.get(qa.answer.id);
                    if (evalData) {
                        evalArray.push({
                            answerId: qa.answer.id,
                            isCorrect: evalData.isCorrect,
                            pointsAwarded: evalData.isCorrect ? evalData.points : 0
                        });
                    }
                }
            });

            if (evalArray.length === 0) {
                throw new Error('No evaluations to save');
            }

            const token = localStorage.getItem('token');
            const response = await fetch(`/api/attempts/${attemptId}/evaluate`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ evaluations: evalArray })
            });

            if (!response.ok) {
                throw new Error('Failed to save evaluations');
            }

            return response.json();
        },
        onSuccess: () => {
            toast({ title: 'Success', description: 'Evaluations saved successfully!' });
            queryClient.invalidateQueries({ queryKey: [`/api/attempts/${attemptId}/details`] });
            queryClient.invalidateQueries({ queryKey: [`/api/rounds/${attempt?.roundId}/submissions`] });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
    });

    // Handle marking an answer
    const handleMark = (answerId: string, isCorrect: boolean, maxPoints: number) => {
        setEvaluations(prev => {
            const next = new Map(prev);
            next.set(answerId, { isCorrect, points: maxPoints });
            return next;
        });
    };

    // Handle custom points
    const handlePointsChange = (answerId: string, points: number, maxPoints: number) => {
        setEvaluations(prev => {
            const current = prev.get(answerId);
            if (current) {
                const next = new Map(prev);
                next.set(answerId, { ...current, points: Math.min(points, maxPoints) });
                return next;
            }
            return prev;
        });
    };

    // Get current index in submissions list
    const currentIndex = allSubmissions?.findIndex(s => s.attemptId === attemptId) ?? -1;
    const prevSubmission = currentIndex > 0 ? allSubmissions?.[currentIndex - 1] : null;
    const nextSubmission = currentIndex >= 0 && currentIndex < (allSubmissions?.length ?? 0) - 1 ? allSubmissions?.[currentIndex + 1] : null;

    // Get display state for an answer
    const getAnswerState = (qa: QuestionAnswer) => {
        if (!qa.answer) return 'not_answered';

        const localEval = evaluations.get(qa.answer.id);
        if (localEval) {
            return localEval.isCorrect ? 'correct' : 'wrong';
        }

        if (qa.answer.isCorrect === true) return 'correct';
        if (qa.answer.isCorrect === false) return 'wrong';
        return 'pending';
    };

    if (isLoading) {
        return (
            <EventAdminLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </EventAdminLayout>
        );
    }

    if (error || !attempt) {
        return (
            <EventAdminLayout>
                <div className="text-center py-12 text-red-500">
                    Failed to load submission. Please try again.
                </div>
            </EventAdminLayout>
        );
    }

    return (
        <EventAdminLayout>
            <div className="container mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-background z-10 py-4 border-b">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation(`/event-admin/rounds/${attempt.roundId}/submissions`)}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">{attempt.userName}</h1>
                            <p className="text-muted-foreground">
                                {attempt.rollNo} • {attempt.college || attempt.department}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!prevSubmission}
                            onClick={() => prevSubmission && setLocation(`/event-admin/attempts/${prevSubmission.attemptId}/evaluate`)}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Prev
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {currentIndex + 1} / {allSubmissions?.length || 0}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!nextSubmission}
                            onClick={() => nextSubmission && setLocation(`/event-admin/attempts/${nextSubmission.attemptId}/evaluate`)}
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                        <Button
                            onClick={() => evaluateMutation.mutate()}
                            disabled={evaluations.size === 0 || evaluateMutation.isPending}
                            className="ml-4"
                        >
                            {evaluateMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Save All
                        </Button>
                    </div>
                </div>

                {/* Questions and Answers */}
                <div className="space-y-6">
                    {attempt.questionAnswers.map((qa, index) => {
                        const state = getAnswerState(qa);
                        const localEval = qa.answer ? evaluations.get(qa.answer.id) : null;

                        return (
                            <Card
                                key={qa.questionId}
                                className={`transition-all ${state === 'correct' ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' :
                                    state === 'wrong' ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' :
                                        ''
                                    }`}
                            >
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Question {qa.questionNumber}</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">{qa.points} pts</Badge>
                                            {state === 'correct' && <Badge className="bg-green-500">✓ Correct</Badge>}
                                            {state === 'wrong' && <Badge className="bg-red-500">✗ Wrong</Badge>}
                                            {state === 'pending' && <Badge variant="secondary">Pending</Badge>}
                                            {state === 'not_answered' && <Badge variant="destructive">No Answer</Badge>}
                                        </div>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {/* Question: Image or Text */}
                                    <div className="p-4 bg-muted rounded-lg">
                                        <p className="text-sm text-muted-foreground mb-2">Question:</p>
                                        {qa.questionType === 'image_text' && qa.questionText.startsWith('/uploads') ? (
                                            <img
                                                src={qa.questionText}
                                                alt={`Question ${qa.questionNumber}`}
                                                className="max-h-64 rounded-lg"
                                            />
                                        ) : (
                                            <p className="font-medium">{qa.questionText}</p>
                                        )}
                                    </div>

                                    {/* Expected Answer (Admin Reference) */}
                                    {qa.expectedAnswer && (
                                        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <p className="text-sm text-blue-600 dark:text-blue-400 mb-1 font-medium">Expected Answer (Reference):</p>
                                            <p className="text-blue-800 dark:text-blue-200">{qa.expectedAnswer}</p>
                                        </div>
                                    )}

                                    {/* Participant's Answer */}
                                    <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
                                        <p className="text-sm text-muted-foreground mb-2">Participant's Answer:</p>
                                        {qa.answer ? (
                                            <p className="font-medium text-lg">{qa.answer.text || '(empty)'}</p>
                                        ) : (
                                            <p className="text-muted-foreground italic">No answer submitted</p>
                                        )}
                                    </div>

                                    {/* Evaluation Controls */}
                                    {qa.answer && (
                                        <div className="flex items-center gap-4 pt-4 border-t">
                                            <Button
                                                variant={state === 'correct' ? 'default' : 'outline'}
                                                className={state === 'correct' ? 'bg-green-500 hover:bg-green-600' : ''}
                                                onClick={() => handleMark(qa.answer!.id, true, qa.points)}
                                            >
                                                <Check className="mr-2 h-4 w-4" />
                                                Correct
                                            </Button>
                                            <Button
                                                variant={state === 'wrong' ? 'default' : 'outline'}
                                                className={state === 'wrong' ? 'bg-red-500 hover:bg-red-600' : ''}
                                                onClick={() => handleMark(qa.answer!.id, false, 0)}
                                            >
                                                <X className="mr-2 h-4 w-4" />
                                                Wrong
                                            </Button>

                                            {/* Partial Points */}
                                            <div className="flex items-center gap-2 ml-auto">
                                                <span className="text-sm text-muted-foreground">Points:</span>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max={qa.points}
                                                    value={localEval?.points ?? qa.answer.pointsAwarded ?? ''}
                                                    onChange={(e) => handlePointsChange(qa.answer!.id, parseInt(e.target.value) || 0, qa.points)}
                                                    className="w-20"
                                                    disabled={!localEval}
                                                />
                                                <span className="text-sm text-muted-foreground">/ {qa.points}</span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Bottom Save Button */}
                <div className="sticky bottom-4 flex justify-center mt-8">
                    <Button
                        size="lg"
                        onClick={() => evaluateMutation.mutate()}
                        disabled={evaluations.size === 0 || evaluateMutation.isPending}
                        className="shadow-lg"
                    >
                        {evaluateMutation.isPending ? (
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-5 w-5" />
                        )}
                        Save All Evaluations ({evaluations.size} changed)
                    </Button>
                </div>
            </div>
        </EventAdminLayout>
    );
}
