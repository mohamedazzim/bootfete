import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Users, FileText, Settings, FormInput, Utensils, Mail, RefreshCw, ClipboardCheck } from 'lucide-react';
import AdminLayout from '@/components/layouts/AdminLayout';
import type { Event } from '@shared/schema';
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
    enabled: !!user && user.role === 'super_admin',
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
    enabled: !!user && user.role === 'super_admin',
  });

  const { data: emailProviderStats, isLoading: emailStatsLoading, refetch: refetchEmailStats } = useQuery<EmailProviderStatus>({
    queryKey: ['/api/email-provider'],
    enabled: !!user && user.role === 'super_admin',
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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
    if (!isLoading && (!user || user.role !== 'super_admin')) {
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/events')} data-testid="card-events">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Manage</div>
              <p className="text-xs text-muted-foreground">Create and manage symposium events</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/event-admins')} data-testid="card-event-admins">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Event Admins</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Assign</div>
              <p className="text-xs text-muted-foreground">Manage event admin assignments</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/reports')} data-testid="card-reports">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">View</div>
              <p className="text-xs text-muted-foreground">Generate and download reports</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/registration-forms')} data-testid="card-registration-forms">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registration Forms</CardTitle>
              <FormInput className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Manage</div>
              <p className="text-xs text-muted-foreground">Create and manage registration forms</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/registrations')} data-testid="card-registrations">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registrations</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">View</div>
              <p className="text-xs text-muted-foreground">View all participant registrations</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/tests')} data-testid="card-test-manager">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Test Manager</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Manage</div>
              <p className="text-xs text-muted-foreground">Control rounds and tests across all events</p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setLocation('/admin/settings')} data-testid="card-settings">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Settings</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Configure</div>
              <p className="text-xs text-muted-foreground">System settings and preferences</p>
            </CardContent>
          </Card>
        </div>


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
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">🥬 {stats?.vegCount || 0}</div>
                <div className="text-sm text-muted-foreground mt-1">Vegetarian</div>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/30 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">🍗 {stats?.nonVegCount || 0}</div>
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
