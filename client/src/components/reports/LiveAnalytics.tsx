// Live analytics for the admin reports view — fetches the aggregated
// reporting-engine endpoints (overall / event-wise / college-wise) and
// renders them with JSON export. Display-only: no mutations, no payloads.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { errorToast, successToast } from '@/lib/toast';
import { Download, Loader2, ArrowRight, BarChart3 } from 'lucide-react';
import ScrollableTable from '@/components/ScrollableTable';
import { formatIST } from '@/lib/utils';

interface OverallReport {
  generatedAt: string;
  totals: {
    events: number;
    participants: { total: number; registered: number; completed: number; disqualified: number };
    attempts: { total: number; active: number; scored: number; disqualified: number };
  };
  averageScore: number | null;
}

interface EventWiseReport {
  generatedAt: string;
  event: { id: string; name: string };
  funnel: { registered: number; started: number; completed: number; disqualified: number; completionRate: number | null };
  averageScore: number | null;
  rounds: {
    roundId: string;
    roundName: string;
    roundNumber: number;
    status: string;
    attempts: number;
    uniqueUsers: number;
    averageScore: number | null;
    byStatus: Record<string, number>;
  }[];
}

interface CollegeWiseReport {
  generatedAt: string;
  colleges: {
    collegeName: string;
    participantCount: number;
    scoredParticipantCount: number;
    averageScore: number | null;
  }[];
}

interface EventOption {
  id: string;
  name: string;
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(n);
}

function MetricCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg border bg-card p-4" data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function LiveAnalytics() {
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const { data: overall, isLoading: overallLoading } = useQuery<OverallReport>({
    queryKey: ['/api/admin/reports/overall'],
  });

  const { data: eventOptions } = useQuery<EventOption[]>({
    queryKey: ['/api/events'],
  });

  const effectiveEventId = selectedEventId || eventOptions?.[0]?.id || '';
  const { data: eventReport, isLoading: eventLoading } = useQuery<EventWiseReport>({
    queryKey: ['/api/admin/reports/events', effectiveEventId],
    enabled: !!effectiveEventId,
  });

  const { data: collegeReport, isLoading: collegeLoading } = useQuery<CollegeWiseReport>({
    queryKey: ['/api/admin/reports/colleges'],
  });

  const downloadJson = async (endpoint: string, filename: string) => {
    try {
      const response = await apiRequest('GET', endpoint);
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      successToast(toast, 'Export Complete', `${filename} downloaded`);
    } catch (error) {
      errorToast(toast, 'Export Failed', error instanceof Error ? error.message : 'Failed to export');
    }
  };

  const funnel = eventReport?.funnel;

  return (
    <div className="mt-8" data-testid="live-analytics">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5" />
        <h2 className="text-2xl font-bold" data-testid="heading-live-analytics">Live Analytics</h2>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Aggregated live from the database. Disqualified attempts are excluded from scores and funnels.
      </p>

      {/* Overall symposium */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Symposium Overview</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson('/api/admin/reports/overall', 'symposium-overview.json')}
            data-testid="button-export-overall"
          >
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </CardHeader>
        <CardContent>
          {overallLoading ? (
            <div className="py-8 text-center" data-testid="loading-overall">Loading…</div>
          ) : overall ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="overall-metrics">
                <MetricCard label="Events" value={fmt(overall.totals.events)} testId="metric-events" />
                <MetricCard label="Participants" value={fmt(overall.totals.participants.total)} testId="metric-participants" />
                <MetricCard label="Active Attempts" value={fmt(overall.totals.attempts.active)} testId="metric-active-attempts" />
                <MetricCard label="Average Score" value={fmt(overall.averageScore)} testId="metric-avg-score" />
              </div>
              <div className="mt-4 text-xs text-muted-foreground" data-testid="text-overall-generated">
                Generated {formatIST(overall.generatedAt)} · Scored attempts: {overall.totals.attempts.scored} ·
                Disqualified: {overall.totals.attempts.disqualified} attempts / {overall.totals.participants.disqualified} participants
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>

      {/* Event-wise funnel */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Event Funnel</CardTitle>
          <div className="flex items-center gap-2">
            <label htmlFor="analytics-event-select" className="text-sm text-muted-foreground">Event</label>
            <select
              id="analytics-event-select"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={effectiveEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              data-testid="select-analytics-event"
            >
              {(eventOptions || []).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!effectiveEventId}
              onClick={() => downloadJson(`/api/admin/reports/events/${effectiveEventId}`, `event-report-${effectiveEventId}.json`)}
              data-testid="button-export-event"
            >
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {eventLoading ? (
            <div className="py-8 text-center" data-testid="loading-event">Loading…</div>
          ) : eventReport && funnel ? (
            <>
              <div className="flex flex-wrap items-center gap-2 md:gap-3" data-testid="event-funnel">
                {[
                  { label: 'Registered', value: funnel.registered, testId: 'funnel-registered' },
                  { label: 'Started', value: funnel.started, testId: 'funnel-started' },
                  { label: 'Completed', value: funnel.completed, testId: 'funnel-completed' },
                ].map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-2 md:gap-3">
                    {i > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    <div className="rounded-lg border bg-card px-4 py-3 text-center" data-testid={stage.testId}>
                      <div className="text-xl font-bold">{stage.value}</div>
                      <div className="text-xs text-muted-foreground">{stage.label}</div>
                    </div>
                  </div>
                ))}
                <div className="ml-1 rounded-lg border border-destructive/40 px-4 py-3 text-center" data-testid="funnel-disqualified">
                  <div className="text-xl font-bold text-destructive">{funnel.disqualified}</div>
                  <div className="text-xs text-muted-foreground">Disqualified</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground" data-testid="text-completion-rate">
                Completion rate: {funnel.completionRate === null ? '—' : `${Math.round(funnel.completionRate * 100)}%`} ·
                Average score: {fmt(eventReport.averageScore)}
              </div>
              {eventReport.rounds.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Score breakdown by round</h3>
                  <ScrollableTable>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Round</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Attempts</TableHead>
                          <TableHead className="text-right">Participants</TableHead>
                          <TableHead className="text-right">Avg Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eventReport.rounds.map((r) => (
                          <TableRow key={r.roundId} data-testid={`row-round-${r.roundId}`}>
                            <TableCell className="font-medium">{r.roundName}</TableCell>
                            <TableCell><Badge variant="secondary">{r.status.replace('_', ' ')}</Badge></TableCell>
                            <TableCell className="text-right">{r.attempts}</TableCell>
                            <TableCell className="text-right">{r.uniqueUsers}</TableCell>
                            <TableCell className="text-right">{fmt(r.averageScore)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollableTable>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Select an event to view its funnel</div>
          )}
        </CardContent>
      </Card>

      {/* College-wise */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>College-wise Participation & Performance</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson('/api/admin/reports/colleges', 'college-report.json')}
            data-testid="button-export-colleges"
          >
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
        </CardHeader>
        <CardContent>
          {collegeLoading ? (
            <div className="py-8 text-center" data-testid="loading-colleges">Loading…</div>
          ) : collegeReport && collegeReport.colleges.length > 0 ? (
            <ScrollableTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>College</TableHead>
                    <TableHead className="text-right">Participants</TableHead>
                    <TableHead className="text-right">Scored</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collegeReport.colleges.map((c) => (
                    <TableRow key={c.collegeName} data-testid={`row-college-${c.collegeName}`}>
                      <TableCell className="font-medium">{c.collegeName}</TableCell>
                      <TableCell className="text-right">{c.participantCount}</TableCell>
                      <TableCell className="text-right">{c.scoredParticipantCount}</TableCell>
                      <TableCell className="text-right">{fmt(c.averageScore)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTable>
          ) : (
            <div className="py-8 text-center text-muted-foreground" data-testid="no-colleges">
              {collegeLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : 'No college data available'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
