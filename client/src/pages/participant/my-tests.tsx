import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import ParticipantLayout from '@/components/layouts/ParticipantLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Trophy, PlayCircle, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import type { TestAttempt } from '@shared/schema';
import ScrollableTable from '@/components/ScrollableTable';

export default function MyTestsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // The certificate is a binary download, so fetch it directly with the
  // Bearer token and save it as a file — an anchor link would not carry
  // the auth header.
  //
  // Prefers the event's dynamic template certificate
  // (/api/rounds/:roundId/certificate/:attemptId); when the event has no
  // template configured (NO_TEMPLATE), falls back to the standard certificate.
  const downloadCertificate = async (attemptId: string, roundId: string) => {
    setDownloadingId(attemptId);
    const authHeaders = {
      ...(localStorage.getItem('token')
        ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
        : {}),
    };
    const saveBlob = async (res: Response, filename: string) => {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };
    const filenameFrom = (res: Response, fallback: string) => {
      const disp = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(disp);
      return m ? m[1] : fallback;
    };
    try {
      const tplRes = await fetch(`/api/rounds/${roundId}/certificate/${attemptId}`, {
        headers: authHeaders,
      });
      if (tplRes.ok) {
        await saveBlob(tplRes, filenameFrom(tplRes, `certificate-${attemptId}`));
        successToast(toast, 'Certificate downloaded', 'Your certificate of achievement is ready.');
        return;
      }
      const tplBody = await tplRes.json().catch(() => ({}));
      if (tplBody.code !== 'NO_TEMPLATE') {
        throw new Error(tplBody.message || `Download failed (${tplRes.status})`);
      }
      // No template for this event — fall back to the standard certificate.
      const res = await fetch(`/api/attempts/${attemptId}/certificate`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Download failed (${res.status})`);
      }
      await saveBlob(res, `certificate-${attemptId}.pdf`);
      successToast(toast, 'Certificate downloaded', 'Your certificate of achievement is ready.');
    } catch (error) {
      errorToast(toast, 'Failed to download certificate', (error as Error)?.message || 'Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const { data: attempts, isLoading, isError, refetch } = useQuery<(TestAttempt & {
    round: { name: string; event: { name: string } };
    canViewResults?: boolean;
  })[]>({
    queryKey: ['/api/participants/my-attempts'],
  });


  // In-progress attempts sort first so a live test is never buried
  // under history; the rest keep the API order.
  const sortedAttempts = (attempts ?? []).slice().sort((a, b) =>
    (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1)
  );
  const activeAttempt = sortedAttempts.find((a) => a.status === 'in_progress');
  // Phase 8: the empty state renders ONLY on a successful fetch that
  // returned zero attempts. A failed fetch must never masquerade as
  // "no tests" — that contradiction hid real in-progress attempts.
  const showEmptyState = !isLoading && !isError && (attempts?.length ?? 0) === 0;

  return (
    <ParticipantLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-my-tests">
            My Tests
          </h1>
          <p className="text-gray-600 mt-1">View your test history and results</p>
        </div>

        {/* In-progress precedence: surface the live test above the history.
            role="status" announces the live test to screen readers on arrival. */}
        {activeAttempt && (
          <Card className="mb-6 border-active/40 bg-indigo-50" data-testid="banner-active-test" role="status">
            <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <PlayCircle className="h-10 w-10 text-active shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">Test in progress</p>
                <p className="text-sm text-slate-600 truncate">
                  {activeAttempt.round?.event?.name || 'N/A'} — {activeAttempt.round?.name || 'N/A'}
                </p>
              </div>
              <Button
                onClick={() => setLocation(`/participant/test/${activeAttempt.id}`)}
                data-testid="button-resume-banner"
              >
                Resume Test
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-12" data-testid="loading-tests" role="status">
            Loading test history...
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <p className="text-lg font-medium text-slate-700" data-testid="tests-error" role="alert">
                  Couldn't load your tests
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Check your connection and try again — your attempts are safe.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => refetch()} data-testid="button-retry-tests">
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : showEmptyState ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-600" data-testid="no-tests">
                  No tests taken yet
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Your test attempts will appear here once you start taking tests
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Test History</CardTitle>
            </CardHeader>
            <CardContent>
                            <ScrollableTable>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAttempts.map((attempt) => (
                      <TableRow key={attempt.id} data-testid={`row-attempt-${attempt.id}`}>
                        <TableCell className="font-medium" data-testid={`text-event-${attempt.id}`}>
                          {attempt.round?.event?.name || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-round-${attempt.id}`}>
                          {attempt.round?.name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {attempt.totalScore !== null && attempt.totalScore !== undefined ? (
                            <span className="font-semibold text-blue-600" data-testid={`text-score-${attempt.id}`}>
                              {attempt.totalScore} points
                            </span>
                          ) : attempt.status === 'completed' ? (
                            <span className="text-gray-400">Awaiting results</span>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge domain="attempt" status={attempt.status} /></TableCell>
                        <TableCell data-testid={`text-completed-${attempt.id}`}>
                          {attempt.completedAt
                            ? new Date(attempt.completedAt).toLocaleString()
                            : attempt.status === 'in_progress'
                              ? 'In progress'
                              : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Round-2 M17: an in_progress attempt used to have
                              no action at all — a student who lost their tab
                              could not get back into the exam. */}
                          {attempt.status === 'in_progress' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setLocation(`/participant/test/${attempt.id}`)}
                              data-testid={`button-resume-${attempt.id}`}
                            >
                              Resume Test
                            </Button>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation(`/participant/results/${attempt.id}`)}
                                disabled={attempt.canViewResults === false}
                                data-testid={`button-results-${attempt.id}`}
                                title={attempt.canViewResults === false ? "Results will be available after admin publishes them" : "View your test results"}
                              >
                                <Trophy className="h-4 w-4 mr-1" />
                                View Results
                              </Button>
                              {/* Certificate of achievement: only for
                                  successfully completed attempts with a
                                  graded score. Streams the PDF server-side. */}
                              {attempt.status === 'completed' &&
                                attempt.totalScore !== null &&
                                attempt.totalScore !== undefined && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => downloadCertificate(attempt.id, attempt.roundId)}
                                    disabled={downloadingId === attempt.id}
                                    data-testid={`button-certificate-${attempt.id}`}
                                    aria-label={`Download certificate of achievement for ${attempt.round?.name || 'this test'}`}
                                  >
                                    <Award className="h-4 w-4 mr-1" aria-hidden />
                                    {downloadingId === attempt.id ? 'Preparing…' : 'Download Certificate'}
                                  </Button>
                                )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                            </ScrollableTable>
            </CardContent>
          </Card>
        )}
      </div>
    </ParticipantLayout>
  );
}
