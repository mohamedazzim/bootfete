import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import ParticipantLayout from '@/components/layouts/ParticipantLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Clock } from 'lucide-react';
import ScrollableTable from '@/components/ScrollableTable';

interface ParticipantAnswer {
  id: string;
  questionId: string;
  questionText: string | null;
  answer: string;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  answeredAt: string;
}

interface ParticipantRoundResult {
  roundId: string;
  roundName: string;
  totalScore: number;
  maxScore?: number;
  submittedAt: string | null;
  answers: ParticipantAnswer[];
}

interface ParticipantResultPayload {
  rank: number | null;
  userId: string;
  userName: string;
  totalScore: number;
  maxScore?: number;
  submittedAt: string | null;
  answers?: ParticipantAnswer[];
  rounds?: ParticipantRoundResult[];
}

type LeaderboardApiResponse = {
  scope: 'participant' | 'admin';
  answersVisible: boolean;
  participantResult: ParticipantResultPayload | null;
  message?: string;
};

export default function LeaderboardPage() {
  const { roundId, eventId } = useParams();
  const [, setLocation] = useLocation();

  const leaderboardKey = roundId
    ? `/api/rounds/${roundId}/leaderboard`
    : `/api/events/${eventId}/leaderboard`;

  const { data, isLoading } = useQuery<LeaderboardApiResponse>({
    queryKey: [leaderboardKey],
    enabled: !!(roundId || eventId),
  });

  if (isLoading) {
    return (
      <ParticipantLayout>
        <div className="p-4 md:p-8">
          <div className="text-center py-12" data-testid="loading-leaderboard">Loading leaderboard...</div>
        </div>
      </ParticipantLayout>
    );
  }

  if (!data || !data.answersVisible || !data.participantResult) {
    return (
      <ParticipantLayout>
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-gray-600">{data?.message || 'Results are not yet published'}</p>
            </CardContent>
          </Card>
        </div>
      </ParticipantLayout>
    );
  }

  const participantResult = data.participantResult;
  const perRound = participantResult.rounds || [];
  const singleRoundAnswers = participantResult.answers || [];
  const answersToRender = roundId ? singleRoundAnswers : [];

  return (
    <ParticipantLayout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-leaderboard">
              Your Result
            </h1>
          </div>
          <p className="text-gray-600">
            {roundId ? 'Round Result' : 'Event Result'}
          </p>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Your score and submission time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {participantResult.totalScore}
                  {participantResult.maxScore ? <span className="text-sm text-gray-500"> / {participantResult.maxScore}</span> : null}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Submitted</p>
                <p className="text-sm text-gray-700">
                  {participantResult.submittedAt ? new Date(participantResult.submittedAt).toLocaleString() : <span className="text-slate-500">Not submitted</span>}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Rank</p>
                <p className="text-sm text-gray-700">{participantResult.rank ?? <span className="text-slate-500">Unranked</span>}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Answers */}
        {roundId && answersToRender.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Your Answers</CardTitle>
              <CardDescription>Only your submitted responses are visible</CardDescription>
            </CardHeader>
            <CardContent>
                            <ScrollableTable>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Your Answer</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-right">Answered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {answersToRender.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.questionText || entry.questionId}</TableCell>
                        <TableCell>{entry.answer}</TableCell>
                        <TableCell className="text-right">{entry.pointsAwarded ?? 0}</TableCell>
                        <TableCell className="text-right text-sm text-gray-600">
                          <div className="flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(entry.answeredAt).toLocaleString()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                            </ScrollableTable>
            </CardContent>
          </Card>
        )}

        {!roundId && perRound.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Round Breakdown</CardTitle>
              <CardDescription>Your performance per round</CardDescription>
            </CardHeader>
            <CardContent>
                            <ScrollableTable>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Round</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perRound.map((roundResult) => (
                      <TableRow key={roundResult.roundId}>
                        <TableCell className="font-medium">{roundResult.roundName}</TableCell>
                        <TableCell className="text-right">
                          {roundResult.totalScore}
                          {roundResult.maxScore ? <span className="text-sm text-gray-500"> / {roundResult.maxScore}</span> : null}
                        </TableCell>
                        <TableCell className="text-right text-sm text-gray-600">
                          {roundResult.submittedAt ? new Date(roundResult.submittedAt).toLocaleString() : <span className="text-slate-500">Not submitted</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                            </ScrollableTable>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => setLocation('/participant/dashboard')}
            size="lg"
            data-testid="button-dashboard"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    </ParticipantLayout>
  );
}
