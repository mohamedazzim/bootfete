import { useAuth, hasSuperAdminAccess } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Save, Mail, Bell, Shield, Database } from 'lucide-react';
import AdminLayout from '@/components/layouts/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SystemSettings {
  email: {
    provider: string;
    configured: boolean;
    host: string | null;
    user: string | null;
    from: string | null;
  };
  notifications?: {
    emailNotifications: boolean;
    registrationNotifications: boolean;
    eventUpdates: boolean;
    systemAlerts: boolean;
  };
}

export default function AdminSettings() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [emailNotifications, setEmailNotifications] = useState(true);
  const [registrationNotifications, setRegistrationNotifications] = useState(true);
  const [eventUpdates, setEventUpdates] = useState(true);
  const [systemAlerts, setSystemAlerts] = useState(true);

  const { data: systemSettings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/admin/system-settings'],
    enabled: !!user && hasSuperAdminAccess(user.role),
  });

  useEffect(() => {
    if (!isLoading && (!user || !hasSuperAdminAccess(user.role))) {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  const queryClient = useQueryClient();

  // QA-1102: Real save mutation. Toast only appears AFTER backend success.
  const saveMutation = useMutation({
    mutationFn: async (notifications: any) => {
      const res = await apiRequest('PATCH', '/api/admin/system-settings', { notifications });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save settings');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/system-settings'] });
      toast({
        title: "Settings saved",
        description: "Your system settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "An error occurred while saving settings.",
        variant: "destructive",
      });
    },
  });

  // Initialize state from loaded settings
  useEffect(() => {
    if (systemSettings?.notifications) {
      const n = systemSettings.notifications;
      setEmailNotifications(n.emailNotifications ?? true);
      setRegistrationNotifications(n.registrationNotifications ?? true);
      setEventUpdates(n.eventUpdates ?? true);
      setSystemAlerts(n.systemAlerts ?? true);
    }
  }, [systemSettings]);

  const handleSaveSettings = () => {
    // QA-1102: Actually call the API. Success toast only on backend 200.
    saveMutation.mutate({
      emailNotifications,
      registrationNotifications,
      eventUpdates,
      systemAlerts,
    });
  };

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
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
          <p className="text-gray-600 mt-2">Configure system-wide preferences and settings</p>
        </div>

        <div className="space-y-6 max-w-4xl">
          <Card data-testid="card-email-settings">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <CardTitle>Email Configuration</CardTitle>
              </div>
              <CardDescription>Configure email server and sending preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="text-sm text-gray-500">Loading settings...</div>
              ) : systemSettings?.email?.configured ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-provider">Email Provider</Label>
                      <Input
                        id="email-provider"
                        value={systemSettings.email.provider?.toUpperCase() || "RESEND"}
                        disabled
                        data-testid="input-email-provider"
                      />
                      <p className="text-xs text-green-600">✓ Configured</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-host">SMTP Host</Label>
                      <Input
                        id="email-host"
                        value={systemSettings.email.host || ""}
                        disabled
                        data-testid="input-email-host"
                      />
                      <p className="text-xs text-green-600">✓ Configured</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-from">From Address</Label>
                    <Input
                      id="email-from"
                      value={systemSettings.email.from || "Not configured — set SENDER_EMAIL"}
                      disabled
                      data-testid="input-email-from"
                    />
                    {systemSettings.email.from ? (
                      <p className="text-xs text-green-600">✓ Configured</p>
                    ) : (
                      <p className="text-xs text-amber-600">Set the SENDER_EMAIL environment variable</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                    <p className="text-sm text-yellow-800">
                      ⚠️ SMTP is not configured. Emails will be logged but not sent.
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      To enable email sending, configure SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-provider">Email Provider</Label>
                      <Input
                        id="email-provider"
                        placeholder="SMTP"
                        disabled
                        data-testid="input-email-provider"
                      />
                      <p className="text-xs text-gray-500">Not configured</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-host">SMTP Host</Label>
                      <Input
                        id="email-host"
                        placeholder="smtp.titan.email"
                        disabled
                        data-testid="input-email-host"
                      />
                      <p className="text-xs text-gray-500">Not configured</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-from">From Address</Label>
                    <Input
                      id="smtp-from"
                      placeholder="Not configured — set SENDER_EMAIL"
                      disabled
                      data-testid="input-smtp-from"
                    />
                    <p className="text-xs text-gray-500">Not configured</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-notification-settings">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <CardTitle>Notification Preferences</CardTitle>
              </div>
              <CardDescription>Manage email notifications for different events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive email notifications for system events</p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                  data-testid="switch-email-notifications"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="registration-notifications">Registration Notifications</Label>
                  <p className="text-sm text-gray-500">Get notified when new participants register</p>
                </div>
                <Switch
                  id="registration-notifications"
                  checked={registrationNotifications}
                  onCheckedChange={setRegistrationNotifications}
                  data-testid="switch-registration-notifications"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="event-updates">Event Updates</Label>
                  <p className="text-sm text-gray-500">Receive notifications about event changes</p>
                </div>
                <Switch
                  id="event-updates"
                  checked={eventUpdates}
                  onCheckedChange={setEventUpdates}
                  data-testid="switch-event-updates"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="system-alerts">System Alerts</Label>
                  <p className="text-sm text-gray-500">Critical system alerts and warnings</p>
                </div>
                <Switch
                  id="system-alerts"
                  checked={systemAlerts}
                  onCheckedChange={setSystemAlerts}
                  data-testid="switch-system-alerts"
                />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-security-settings">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <CardTitle>Security Settings</CardTitle>
              </div>
              <CardDescription>Manage authentication and security preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Session Timeout</Label>
                <Input
                  type="number"
                  defaultValue={30}
                  placeholder="Minutes"
                  data-testid="input-session-timeout"
                />
                <p className="text-xs text-gray-500">Automatically log out users after inactivity (minutes)</p>
              </div>
              <div className="space-y-2">
                <Label>Password Policy</Label>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Minimum 8 characters</p>
                  <p>• At least one uppercase letter</p>
                  <p>• At least one number</p>
                  <p>• At least one special character</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-database-info">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-600" />
                <CardTitle>Database Information</CardTitle>
              </div>
              <CardDescription>Current database connection status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database Type</span>
                <span className="text-sm font-medium">PostgreSQL</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Connection Status</span>
                <span className="text-sm font-medium text-green-600">Connected</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Host</span>
                <span className="text-sm font-medium">{import.meta.env.VITE_PGHOST || "Configured via backend"}</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLocation('/admin/dashboard')} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={saveMutation.isPending}
              data-testid="button-save-settings"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
