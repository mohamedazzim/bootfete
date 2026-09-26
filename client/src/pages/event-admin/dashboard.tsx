import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Settings, Play, Users, Calendar, Trophy, AlertTriangle, Activity, ArrowRight, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import type { Event, Round } from '@shared/schema';

interface MyEventResponse {
  event: Event;
  participantCount: number;
}

interface RoundStatistics {
  roundId: string;
  roundName: string;
  status: string;
  totalParticipants: number;
  activeParticipants: number;
  completedParticipants: number;
  disqualifiedParticipants: number;
  pendingParticipants: number;
}


export default function EventAdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { isConnected } = useWebSocket();

  const { data, isLoading } = useQuery<MyEventResponse>({
    queryKey: ['/api/event-admin/my-event'],
    // Round-2 M22: socket events (registrationUpdate, roundStatus, ...)
    // refetch these queries live. Poll only while the socket is down.
    refetchInterval: isConnected ? false : 3000,
  });

  const { data: stats } = useQuery<{
    totalTeams: number;
    teamsPerEvent: { eventId: string; eventName: string; count: number }[];
    teamsPerCollege: { college: string; count: number }[];
  }>({
    queryKey: ['/api/event-admin/stats'],
    refetchInterval: isConnected ? false : 3000,
  });

  const eventId = data?.event?.id;

  // Rounds for this event. Array-form key matches the socket
  // refetchEventQueries() keys so roundStatus events refresh this live.
  const { data: rounds = [], isLoading: roundsLoading } = useQuery<Round[]>({
    queryKey: ['/api/events', eventId, 'rounds'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/events/${eventId}/rounds`);
      return res.json();
    },
    enabled: !!eventId,
    refetchInterval: isConnected ? false : 10000,
  });

  // Phase 5: registration funnel. "Started"/"Completed" aggregate the
  // canonical per-round statistics (same endpoint the monitor uses), so the
  // dashboard can never contradict the monitor. "Registered" uses the same
  // denominator (participants enrolled in the event, from the statistics
  // snapshot) — NOT the team-level registration count from /api/my-event,
  // which would let "Started" exceed "Registered". There is no check-in
  // state in the data model, so the funnel is Registered → Started →
  // Completed. Falls back to the my-event count when no rounds exist yet.
  const { data: funnel, isLoading: funnelLoading } = useQuery({
    queryKey: ['/api/events', eventId, 'round-stats'],
    queryFn: async () => {
      const results = await Promise.all(
        rounds.map(async (r) => {
          const res = await apiRequest('GET', `/api/rounds/${r.id}/statistics`);
          return (await res.json()) as RoundStatistics;
        })
      );
      return {
        registered: results.length > 0 ? results[0].totalParticipants : participantCount,
        // STATE SEPARATION: disqualified attempts started the test, so they
        // count toward "started", but they are never folded into "completed".
        started: results.reduce((s, r) => s + r.activeParticipants + r.completedParticipants + (r.disqualifiedParticipants ?? 0), 0),
        completed: results.reduce((s, r) => s + r.completedParticipants, 0),
        live: results.reduce((s, r) => s + r.activeParticipants, 0),
      };
    },
    enabled: !!eventId && rounds.length > 0,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <EventAdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" role="status" aria-label="Loading event dashboard" />
            <p className="text-gray-600">Loading your event...</p>
          </div>
        </div>
      </EventAdminLayout>
    );
  }

  if (!data || !data.event) {
    return (
      <EventAdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Event Assigned</h2>
            <p className="text-gray-600">You have not been assigned to any event yet.</p>
            <p className="text-gray-600 mt-1">Please contact your administrator.</p>
          </div>
        </div>
      </EventAdminLayout>
    );
  }

  const { event, participantCount } = data;
  const inProgressRounds = rounds.filter(r => r.status === 'in_progress');
  const stuckRounds = rounds.filter(r => r.status === 'in_progress' && r.endTime && new Date(r.endTime) < new Date());
  const recentRounds = [...rounds]
    .sort((a, b) => new Date(b.startedAt || b.createdAt).getTime() - new Date(a.startedAt || a.createdAt).getTime())
    .slice(0, 5);

  const funnelStages = [
    { label: 'Registered', value: funnel?.registered ?? participantCount, icon: Users, tone: 'text-slate-900', testid: 'funnel-registered' },
    { label: 'Started', value: funnel?.started ?? 0, icon: Play, tone: 'text-active', testid: 'funnel-started' },
    { label: 'Completed', value: funnel?.completed ?? 0, icon: Trophy, tone: 'text-success', testid: 'funnel-completed' },
  ];

  return (
    <EventAdminLayout>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900" data-testid="text-event-name">{event.name}</h1>
          <p className="text-slate-600 mt-1">{event.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge domain="event" status={event.status} />
            {funnel && funnel.live > 0 && (
              <Badge className="bg-active text-active-foreground border-transparent" role="status">
                <Radio className="h-3 w-3 mr-1 animate-pulse" aria-hidden="true" />
                {funnel.live} testing now
              </Badge>
            )}
          </div>
        </div>

        {/* Registration funnel — replaces the static participant count */}
        <Card className="mb-6" data-testid="card-funnel">
          <CardHeader>
            <CardTitle>Registration Funnel</CardTitle>
            <CardDescription>Enrolled participants → Started → Completed, from live round statistics (same source as the monitor)</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelLoading && rounds.length > 0 ? (
              <p className="text-sm text-slate-500" role="status">Loading funnel…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {funnelStages.map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4 text-center" data-testid={stage.testid}>
                      <stage.icon className={`h-5 w-5 mx-auto mb-1 ${stage.tone}`} aria-hidden="true" />
                      <div className={`text-3xl font-bold ${stage.tone}`} role="status" aria-label={`${stage.value} ${stage.label.toLowerCase()}`}>
                        {stage.value}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">{stage.label}</div>
                    </div>
                    {i < funnelStages.length - 1 && (
                      <ArrowRight className="h-5 w-5 text-slate-300 shrink-0 hidden sm:block" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            )}
            {rounds.length === 0 && !roundsLoading && (
              <p className="text-sm text-slate-500 mt-2">No rounds yet — funnel stages will populate once rounds run.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Current round status */}
          <Card data-testid="card-round-status">
            <CardHeader>
              <CardTitle>Current Round Status</CardTitle>
              <CardDescription>{inProgressRounds.length > 0 ? `${inProgressRounds.length} round${inProgressRounds.length > 1 ? 's' : ''} live now` : 'No rounds in progress'}</CardDescription>
            </CardHeader>
            <CardContent>
              {roundsLoading ? (
                <p className="text-sm text-slate-500" role="status">Loading rounds…</p>
              ) : rounds.length === 0 ? (
                <p className="text-sm text-slate-500">No rounds created yet.</p>
              ) : (
                <div className="space-y-2">
                  {rounds.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.conductMedium === 'online' ? 'Online test' : 'Physical'} • {r.duration} min</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge domain="round" status={r.status} />
                        {r.status === 'in_progress' && r.conductMedium === 'online' && (
                          <Button size="sm" variant="outline" onClick={() => setLocation(`/event-admin/rounds/${r.id}/monitor`)}>
                            Monitor
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active alerts */}
          <Card data-testid="card-alerts">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
                Active Alerts
              </CardTitle>
              <CardDescription>Anomalies needing attention</CardDescription>
            </CardHeader>
            <CardContent>
              {stuckRounds.length === 0 ? (
                <p className="text-sm text-slate-500" role="status">No active alerts. All rounds are on schedule.</p>
              ) : (
                <div className="space-y-2">
                  {stuckRounds.map(r => (
                    <div key={r.id} className="flex items-start gap-2 bg-amber-50 border border-warning/40 rounded-lg p-3" role="alert">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
                      <div className="text-sm">
                        <span className="font-medium">{r.name}</span> is still in progress past its end time
                        {r.endTime && <span className="text-slate-600"> ({new Date(r.endTime).toLocaleString()})</span>}.
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isConnected && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mt-2" role="alert">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm">Realtime connection lost — counters refresh every few seconds until it recovers.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card className="mb-6" data-testid="card-recent-activity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" aria-hidden="true" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest round events</CardDescription>
          </CardHeader>
          <CardContent>
            {roundsLoading ? (
              <p className="text-sm text-slate-500" role="status">Loading activity…</p>
            ) : recentRounds.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {recentRounds.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-slate-500">
                        {r.startedAt ? `Started ${new Date(r.startedAt).toLocaleString()}` : `Created ${new Date(r.createdAt).toLocaleString()}`}
                      </p>
                    </div>
                    <StatusBadge domain="round" status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Secondary navigation — compact quick actions */}
        <nav className="flex flex-wrap gap-2 mb-8" aria-label="Event quick actions">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/event-admin/events/${event.id}`)} data-testid="action-manage-settings">
            <Settings className="h-4 w-4 mr-2" aria-hidden="true" /> Manage Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation(`/event-admin/events/${event.id}/rounds`)} data-testid="action-test-control">
            <Play className="h-4 w-4 mr-2" aria-hidden="true" /> Test Control
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocation(`/event-admin/events/${event.id}/results`)} data-testid="action-results">
            <Trophy className="h-4 w-4 mr-2" aria-hidden="true" /> Results
          </Button>
        </nav>

        {/* Event Analytics (existing widgets, kept) */}
        <h2 className="text-xl font-bold mb-4">Event Analytics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Teams Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.teamsPerEvent && stats.teamsPerEvent.length > 0 ? (
                <div className="space-y-2">
                  {stats.teamsPerEvent.map((stat) => (
                    <div key={stat.eventId} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="font-medium">{stat.eventName}</span>
                      <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between items-center border-t mt-2">
                    <span className="font-bold">Total Teams</span>
                    <span className="font-bold text-lg">{stats.totalTeams}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No registrations found.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">College Distribution</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[300px] overflow-y-auto">
              {stats?.teamsPerCollege && stats.teamsPerCollege.length > 0 ? (
                <div className="space-y-2">
                  {stats.teamsPerCollege.map((stat, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="truncate max-w-[70%] text-sm" title={stat.college}>{stat.college}</span>
                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No college data available.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </EventAdminLayout>
  );
}
