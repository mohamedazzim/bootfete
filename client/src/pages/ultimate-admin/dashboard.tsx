// Ultimate-admin landing page (Phase 2 provisioning).
//
// Lists every symposium (name, locked slug, super_admin identity, event
// count, created date), creates a new symposium AND its super_admin
// atomically, and resets a symposium's super_admin password.
//
// Credential safety: the generated temporary password is shown ONCE in a
// prominent one-time panel with a copy button and an explicit "will never
// be shown again" warning. It is never persisted client-side beyond the
// in-memory state of this page.
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { successToast, errorToast } from '@/lib/toast';
import { Plus, Copy, Check, AlertTriangle, KeyRound, Loader2, Building2 } from 'lucide-react';

interface SymposiumOverview {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  eventCount: number;
  superAdmin: { id: string; fullName: string; email: string; username: string } | null;
}

interface CreatedResult {
  symposium: { id: string; name: string; slug: string };
  superAdmin: { id: string; username: string; email: string; fullName: string };
  tempPassword: string;
}

export default function UltimateAdminDashboard() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);
  const [resetResult, setResetResult] = useState<{ username: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [organizerName, setOrganizerName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4F46E5');
  const [supportEmail, setSupportEmail] = useState('');
  const [superAdminUsername, setSuperAdminUsername] = useState('');
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminFullName, setSuperAdminFullName] = useState('');

  const { data: symposiums = [], isLoading: loadingSyms } = useQuery<SymposiumOverview[]>({
    queryKey: ['/api/ultimate-admin/symposiums/overview'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ultimate-admin/symposiums/overview');
      if (!res.ok) throw new Error('Failed to load symposiums');
      return res.json();
    },
    enabled: !isLoading && user?.role === 'ultimate_admin',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ultimate-admin/symposiums', {
        name,
        organizerName: organizerName || undefined,
        primaryColor,
        supportEmail: supportEmail || undefined,
        superAdminUsername,
        superAdminEmail,
        superAdminFullName,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create symposium');
      }
      return res.json() as Promise<CreatedResult>;
    },
    onSuccess: (data) => {
      setCreated(data);
      queryClient.invalidateQueries({ queryKey: ['/api/ultimate-admin/symposiums/overview'] });
      successToast(toast, "Symposium created", `"${data.symposium.name}" is ready`);
    },
    onError: (err: any) => errorToast(toast, 'Operation failed', err.message),
  });

  const resetMutation = useMutation({
    mutationFn: async (symposiumId: string) => {
      const res = await apiRequest('PATCH', `/api/ultimate-admin/symposiums/${symposiumId}/superadmin/reset-password`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to reset password');
      }
      return res.json() as Promise<{ superAdmin: { username: string }; tempPassword: string }>;
    },
    onSuccess: (data) => {
      setResetResult({ username: data.superAdmin.username, tempPassword: data.tempPassword });
    },
    onError: (err: any) => errorToast(toast, 'Operation failed', err.message),
  });

  function copyPassword(pw: string) {
    navigator.clipboard.writeText(pw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function resetForm() {
    setName(''); setOrganizerName(''); setPrimaryColor('#4F46E5'); setSupportEmail('');
    setSuperAdminUsername(''); setSuperAdminEmail(''); setSuperAdminFullName('');
    setCreated(null);
  }

  if (isLoading || loadingSyms) {
    return <AdminLayout><div className="p-8">Loading…</div></AdminLayout>;
  }
  if (user?.role !== 'ultimate_admin') {
    setLocation('/login');
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" /> Symposiums
            </h1>
            <p className="text-muted-foreground mt-1">
              Each symposium is an isolated tenant with its own super_admin, events, and branding.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New symposium</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create symposium + super_admin</DialogTitle>
                <DialogDescription>
                  Creates the symposium and its super_admin account atomically.
                  The URL slug is derived from the name and locked forever.
                </DialogDescription>
              </DialogHeader>

              {created ? (
                <div className="space-y-4">
                  <Alert className="border-amber-500 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800">One-time password — save it now</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      This password will <strong>never be shown again</strong>. Copy it and
                      share it securely with {created.superAdmin.fullName}. They will be
                      forced to change it on first login.
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-lg border p-4 space-y-2 bg-slate-50">
                    <div className="text-sm text-muted-foreground">Symposium</div>
                    <div className="font-medium">{created.symposium.name}</div>
                    <div className="text-sm text-muted-foreground">Public URL</div>
                    <div className="font-mono text-sm">/s/{created.symposium.slug}</div>
                    <div className="text-sm text-muted-foreground">Super admin username</div>
                    <div className="font-mono text-sm">{created.superAdmin.username}</div>
                    <div className="text-sm text-muted-foreground">Temporary password</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-white border px-3 py-2 font-mono text-base select-all">
                        {created.tempPassword}
                      </code>
                      <Button variant="outline" size="sm" onClick={() => copyPassword(created.tempPassword)}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Done
                  </Button>
                </div>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="sym-name">Symposium name *</Label>
                    <Input id="sym-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="BootFete 2K27" />
                    <p className="text-xs text-muted-foreground">Immutable after creation. Slug auto-derived, e.g. "BootFete 2K27" → "bootfete-2k27".</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sym-org">Organizer name</Label>
                      <Input id="sym-org" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} placeholder="College name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sym-color">Primary color</Label>
                      <Input id="sym-color" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sym-email">Support email</Label>
                    <Input id="sym-email" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@example.edu" />
                  </div>
                  <div className="border-t pt-4 space-y-4">
                    <h3 className="font-medium">Super admin account</h3>
                    <div className="space-y-2">
                      <Label htmlFor="sa-name">Full name *</Label>
                      <Input id="sa-name" value={superAdminFullName} onChange={(e) => setSuperAdminFullName(e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sa-user">Username *</Label>
                        <Input id="sa-user" value={superAdminUsername} onChange={(e) => setSuperAdminUsername(e.target.value)} required pattern="[a-zA-Z0-9_-]{3,50}" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sa-email">Email *</Label>
                        <Input id="sa-email" type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} required />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">A strong random password is generated automatically — never predictable, never stored in plaintext.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create symposium + super admin'}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {resetResult && (
          <Alert className="border-amber-500 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">New temporary password for {resetResult.username} — one-time only</AlertTitle>
            <AlertDescription className="text-amber-700">
              <div className="flex items-center gap-2 mt-2">
                <code className="rounded bg-white border px-3 py-2 font-mono text-base select-all">{resetResult.tempPassword}</code>
                <Button variant="outline" size="sm" onClick={() => copyPassword(resetResult.tempPassword)}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetResult(null)}>Dismiss</Button>
              </div>
              <p className="mt-2">This will never be shown again. They must change it on next login.</p>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {symposiums.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-lg">{s.name}</CardTitle>
                <CardDescription className="font-mono text-xs">/s/{s.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Super admin</span>
                  <span className="font-medium">{s.superAdmin ? `${s.superAdmin.fullName} (${s.superAdmin.email})` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Events</span>
                  <span className="font-medium">{s.eventCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!s.superAdmin || resetMutation.isPending}
                    onClick={() => {
                      if (confirm(`Reset the password for ${s.superAdmin?.fullName}? They will be forced to change it on next login.`)) {
                        resetMutation.mutate(s.id);
                      }
                    }}
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    Reset super_admin password
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {symposiums.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No symposiums yet. Create the first one to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
