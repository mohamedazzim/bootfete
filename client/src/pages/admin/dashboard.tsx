import { useAuth, hasSuperAdminAccess } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Utensils, Mail, RefreshCw, Salad, Drumstick, Clock, UserCheck, TrendingUp } from 'lucide-react';
import AdminLayout from '@/components/layouts/AdminLayout';
import type { Event, Registration, Round } from '@shared/schema';
import { Progress } from '@/components/ui/progress';

type EmailProvider = 'brevo' | 'resend';

interface ProviderStats {
  provider: EmailProvider;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}

interface EmailProviderStatus {
  activeProvider: EmailProvider;
  preferredProvider: EmailProvider;
  providers: {
    brevo: ProviderStats;
    resend: ProviderStats;
  };
  totalUsed: number;
  totalLimit: number;
  resetTime: string;
  autoSwitchEnabled: boolean;
}

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: ['/api/events'],
    enabled: !!user && hasSuperAdminAccess(user.role),
  });

  const { data: stats } = useQuery<{
    totalTeams: number;
    teamsPerEvent: { eventId: string; eventName: string; count: number }[];
    teamsPerCollege: { college: string; count: number }[];
    totalParticipants: number;
    vegCount: number;
    nonVegCount: number;
  }>({
    queryKey: ['/api/admin/stats'],
    enabled: !!user && hasSuperAdminAccess(user.role),
  });

  const { data: emailProviderStats, isLoading: emailStatsLoading, refetch: refetchEmailStats } = useQuery<EmailProviderStatus>({
    queryKey: ['/api/email-provider'],
    enabled: !!user && hasSuperAdminAccess(user.role),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Phase 5: operational metrics from existing APIs only (no invented backends).
  const { data: allRounds = [], isLoading: roundsLoading } = useQuery<(Round & { eventName: string })[]>({
    queryKey: ['/api/super-admin/all-rounds'],
    enabled: !!user && hasSuperAdminAccess(user.role),
    refetchInterval: 30000,
  });

  // Registrations drive the pending-approvals counter and the 7-day trend.
  // The list endpoint is paginated (max 200/page); the trend is computed
  // from the most recent 200 registrations and labelled as such.
  const { data: recentRegistrations = [], isLoading: registrationsLoading } = useQuery<Registration[]>({
    queryKey: ['/api/registrations', { page: 1, pageSize: 200 }],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/registrations?page=1&pageSize=200');
      return res.json();
    },
    enabled: !!user && hasSuperAdminAccess(user.role),
    refetchInterval: 30000,
  });

  const activeRounds = allRounds.filter(r => r.status === 'in_progress');
  const pendingApprovals = recentRegistrations.filter(r => r.status === 'pending').length;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7Days = recentRegistrations.filter(r => new Date(r.createdAt).getTime() >= sevenDaysAgo);
  // Per-day buckets for the last 7 days (oldest → today)
  const trendBuckets: { label: string; count: number }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toDateString();
    const count = last7Days.filter(r => new Date(r.createdAt).toDateString() === key).length;
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), count };
  });
  const trendMax = Math.max(1, ...trendBuckets.map(b => b.count));

  const switchProviderMutation = useMutation({
    mutationFn: async (provider: EmailProvider) => {
      const res = await apiRequest('POST', '/api/email-provider', { provider });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-provider'] });
      setSwitching(false);
    },
    onError: (error: Error) => {
      alert(error.message);
      setSwitching(false);
    }
  });

  useEffect(() => {
    if (!isLoading && (!user || !hasSuperAdminAccess(user.role))) {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Welcome back, {user.fullName}</p>
        </div>

        {/* Phase 5: operational metrics first — navigation is secondary. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/events')} data-testid="metric-events">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" role="status" aria-label={`${events.length} total events`}>{events.length}</div>
              <p className="text-xs text-muted-foreground">{events.filter(e => e.status === 'active').length} active</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/tests')} data-testid="metric-active-rounds">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Rounds</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {roundsLoading ? (
                <div className="h-8 w-16 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading active rounds" />
              ) : (
                <div className="text-2xl font-bold text-active" role="status" aria-label={`${activeRounds.length} rounds currently in progress`}>{activeRounds.length}</div>
              )}
              <p className="text-xs text-muted-foreground">rounds in progress now</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/registrations')} data-testid="metric-pending-approvals">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {registrationsLoading ? (
                <div className="h-8 w-16 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading pending approvals" />
              ) : (
                <div className="text-2xl font-bold text-pending" role="status" aria-label={`${pendingApprovals} registrations awaiting approval`}>{pendingApprovals}</div>
              )}
              <p className="text-xs text-muted-foreground">registrations awaiting review</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/registrations')} data-testid="metric-registrations-7d">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registrations · 7d</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {registrationsLoading ? (
                <div className="h-8 w-16 animate-pulse rounded-md bg-muted" role="status" aria-label="Loading registration trend" />
              ) : (
                <>
                  <div className="text-2xl font-bold" role="status" aria-label={`${last7Days.length} registrations in the last 7 days`}>{last7Days.length}</div>
                  <div className="flex items-end gap-1 mt-2 h-8" aria-hidden="true">
                    {trendBuckets.map((b, i) => (
                      <div key={i} className="flex-1 bg-indigo-200 rounded-sm" style={{ height: `${Math.max(8, (b.count / trendMax) * 100)}%` }} title={`${b.label}: ${b.count}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">per-day trend, most recent 200</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Secondary navigation — compact quick actions, not the hero. */}
        <nav className="flex flex-wrap gap-2 mb-8" aria-label="Quick actions">
          {[
            { label: 'Events', href: '/admin/events', testid: 'action-events' },
            { label: 'Event Admins', href: '/admin/event-admins', testid: 'action-event-admins' },
            { label: 'Reports', href: '/admin/reports', testid: 'action-reports' },
            { label: 'Registration Forms', href: '/admin/registration-forms', testid: 'action-registration-forms' },
            { label: 'Registrations', href: '/admin/registrations', testid: 'action-registrations' },
            { label: 'Test Manager', href: '/admin/tests', testid: 'action-test-manager' },
            { label: 'Settings', href: '/admin/settings', testid: 'action-settings' },
          ].map(a => (
            <Button key={a.href} variant="outline" size="sm" onClick={() => setLocation(a.href)} data-testid={a.testid}>
              {a.label}
            </Button>
          ))}
        </nav>
      </div>
      <div className="mt-8 px-4 md:px-8">
        <h2 className="text-xl font-bold mb-4">Registration Analytics</h2>

        {/* Food Preference Stats Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5" />
              Food Preference Summary
            </CardTitle>
            <CardDescription>Total registered participants and their food preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-primary/10 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-primary">{stats?.totalParticipants || 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Participants</div>
              </div>
              <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-4 text-center">
                {/* Phase 5: emoji glyphs (🥬/🍗) rendered as tofu on systems
                    without an emoji font — use vector lucide icons instead. */}
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 flex items-center justify-center gap-2" role="status" aria-label={`${stats?.vegCount || 0} vegetarian participants`}>
                  <Salad className="h-7 w-7" aria-hidden="true" /> {stats?.vegCount || 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Vegetarian</div>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/30 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 flex items-center justify-center gap-2" role="status" aria-label={`${stats?.nonVegCount || 0} non-vegetarian participants`}>
                  <Drumstick className="h-7 w-7" aria-hidden="true" /> {stats?.nonVegCount || 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Non-Vegetarian</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Provider Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Provider
                </CardTitle>
                <CardDescription>
                  Switch between email providers to manage daily limits
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchEmailStats()}
                disabled={emailStatsLoading}
              >
                <RefreshCw className={`h-4 w-4 ${emailStatsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {emailStatsLoading ? (
              <div className="text-center text-muted-foreground py-4">Loading...</div>
            ) : emailProviderStats ? (
              <div className="space-y-4">
                {/* Current Provider Indicator */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Active Provider:</span>
                  <span className="font-semibold px-2 py-1 bg-primary/10 text-primary rounded capitalize">
                    {emailProviderStats.activeProvider}
                  </span>
                  {emailProviderStats.autoSwitchEnabled && (
                    <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                      Auto-switch enabled
                    </span>
                  )}
                </div>

                {/* Provider Usage Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Brevo */}
                  <div className={`border rounded-lg p-4 ${emailProviderStats.activeProvider === 'brevo' ? 'border-primary bg-primary/5' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Brevo</span>
                      <span className="text-sm text-muted-foreground">
                        {emailProviderStats.providers.brevo.used} / {emailProviderStats.providers.brevo.limit}
                      </span>
                    </div>
                    <Progress
                      value={emailProviderStats.providers.brevo.percentUsed}
                      className="h-2 mb-2"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        {emailProviderStats.providers.brevo.remaining} remaining
                      </span>
                      <Button
                        size="sm"
                        variant={emailProviderStats.activeProvider === 'brevo' ? 'secondary' : 'outline'}
                        disabled={emailProviderStats.activeProvider === 'brevo' || switching || switchProviderMutation.isPending}
                        onClick={() => {
                          setSwitching(true);
                          switchProviderMutation.mutate('brevo');
                        }}
                      >
                        {emailProviderStats.activeProvider === 'brevo' ? 'Active' : 'Switch'}
                      </Button>
                    </div>
                  </div>

                  {/* Resend */}
                  <div className={`border rounded-lg p-4 ${emailProviderStats.activeProvider === 'resend' ? 'border-primary bg-primary/5' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Resend</span>
                      <span className="text-sm text-muted-foreground">
                        {emailProviderStats.providers.resend.used} / {emailProviderStats.providers.resend.limit}
                      </span>
                    </div>
                    <Progress
                      value={emailProviderStats.providers.resend.percentUsed}
                      className="h-2 mb-2"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        {emailProviderStats.providers.resend.remaining} remaining
                      </span>
                      <Button
                        size="sm"
                        variant={emailProviderStats.activeProvider === 'resend' ? 'secondary' : 'outline'}
                        disabled={emailProviderStats.activeProvider === 'resend' || switching || switchProviderMutation.isPending}
                        onClick={() => {
                          setSwitching(true);
                          switchProviderMutation.mutate('resend');
                        }}
                      >
                        {emailProviderStats.activeProvider === 'resend' ? 'Active' : 'Switch'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Total Usage */}
                <div className="text-center text-sm text-muted-foreground pt-2 border-t">
                  Total: {emailProviderStats.totalUsed} / {emailProviderStats.totalLimit} emails used today
                  <br />
                  <span className="text-xs">
                    Resets at 6:00 AM IST ({new Date(emailProviderStats.resetTime).toLocaleTimeString()})
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                Unable to load email provider status
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Teams per Event</CardTitle>
              <CardDescription>Number of confirmed teams/participants per event</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.teamsPerEvent && stats.teamsPerEvent.length > 0 ? (
                <div className="space-y-2">
                  {stats.teamsPerEvent.map((stat) => (
                    <div key={stat.eventId} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="font-medium">{stat.eventName}</span>
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                    </div>
                  ))}
                  <div className="pt-2 flex justify-between items-center border-t mt-2">
                    <span className="font-bold">Total Teams</span>
                    <span className="font-bold text-lg">{stats.totalTeams}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No registrations yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teams per College</CardTitle>
              <CardDescription>Distribution of confirmed teams by college</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[300px] overflow-y-auto">
              {stats?.teamsPerCollege && stats.teamsPerCollege.length > 0 ? (
                <div className="space-y-2">
                  {stats.teamsPerCollege.map((stat, idx) => (
                    <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <span className="truncate max-w-[70%] text-sm" title={stat.college}>{stat.college}</span>
                      <span className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-sm font-bold">{stat.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No college data available.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout >
  );
}
