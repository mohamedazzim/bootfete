// Ultimate-admin branding settings (Phase 1 multi-tenancy).
//
// Strict ultimate_admin-only surface: edits one symposium's brand
// (organizer_name, logo, primary_color). Symposium names are IMMUTABLE —
// there is no rename control; the name is shown read-only. The inline
// warning states the historical-integrity contract: renames apply to NEW
// events and pages going forward; past events, certificates, and reports
// keep the brand they were created under (their per-event snapshot).
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useBranding } from '@/lib/branding';
import AdminLayout from '@/components/layouts/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { successToast, errorToast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle, Save, Upload, X, GraduationCap, Loader2 } from 'lucide-react';

interface SymposiumOption {
  id: string;
  name: string;
  organizerName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

export default function UltimateAdminBrandingSettings() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Symposium picker — branding is edited per symposium (Phase 1).
  const { data: symposiums = [] } = useQuery<SymposiumOption[]>({
    queryKey: ['/api/ultimate-admin/symposiums'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ultimate-admin/symposiums');
      if (!res.ok) throw new Error('Failed to load symposiums');
      return res.json();
    },
    enabled: !isLoading && user?.role === 'ultimate_admin',
  });
  const [symposiumId, setSymposiumId] = useState<string | null>(null);
  const selectedSymposium = symposiums.find((s) => s.id === symposiumId) ?? null;

  // Default to the first symposium once loaded.
  useEffect(() => {
    if (!symposiumId && symposiums.length > 0) {
      setSymposiumId(symposiums[0].id);
    }
  }, [symposiums, symposiumId]);

  // Live values seed the form; the form state drives the preview.
  // (Global chrome brand; the per-symposium form below overrides on select.)
  const live = useBranding();
  const [organizerName, setOrganizerName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4F46E5');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ultimate_admin') {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  // Seed the form from the selected symposium's brand.
  useEffect(() => {
    if (selectedSymposium && seededFor !== selectedSymposium.id) {
      setOrganizerName(selectedSymposium.organizerName ?? '');
      setPrimaryColor(selectedSymposium.primaryColor ?? '#4F46E5');
      setLogoUrl(selectedSymposium.logoUrl);
      setSeededFor(selectedSymposium.id);
    }
  }, [selectedSymposium, seededFor]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!symposiumId) throw new Error('Select a symposium first');
      const res = await apiRequest('PUT', '/api/admin/settings/branding', {
        symposiumId,
        organizerName: organizerName.trim() || null,
        primaryColor: primaryColor.trim(),
        logoUrl,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to save branding');
      }
      return res.json();
    },
    onSuccess: () => {
      // Push the new brand into every useBranding() consumer immediately.
      queryClient.invalidateQueries({ queryKey: ['/api/settings/branding'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ultimate-admin/symposiums'] });
      successToast(toast, 'Branding saved', 'New events and pages will use the updated brand.');
    },
    onError: (e: any) => {
      errorToast(toast, 'Save failed', e.message || 'Could not save branding.');
    },
  });

  const [uploading, setUploading] = useState(false);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('logo', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/settings/branding/logo', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Logo upload failed');
      }
      const data = await res.json();
      setLogoUrl(data.logoUrl);
      successToast(toast, 'Logo uploaded', 'Preview updated. Save to apply.');
    } catch (e: any) {
      errorToast(toast, 'Upload failed', e.message || 'Could not upload logo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (isLoading || user?.role !== 'ultimate_admin') {
    return (
      <AdminLayout>
        <div className="p-8 text-slate-500">Loading…</div>
      </AdminLayout>
    );
  }

  const previewName = selectedSymposium?.name ?? live.appName;
  const previewOrg = organizerName.trim() || live.organizerName;
  const previewColor = /^#[0-9a-fA-F]{6}$/.test(primaryColor.trim()) ? primaryColor.trim() : live.primaryColor;

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" data-testid="heading-branding-settings">
            Branding Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            The organizer, logo, and accent color for each symposium's site chrome. Ultimate admin only.
          </p>
        </div>

        <Alert className="border-amber-200 bg-amber-50" role="note">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            This changes branding for all NEW events and pages going forward. Past events,
            certificates, and reports keep the name they were created under. Symposium names
            are permanent and cannot be changed here.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Editor */}
          <Card>
            <CardHeader>
              <CardTitle>Brand identity</CardTitle>
              <CardDescription>Edit the live brand. Nothing changes until you save.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="brand-symposium">Symposium</Label>
                <select
                  id="brand-symposium"
                  value={symposiumId ?? ''}
                  onChange={(e) => setSymposiumId(e.target.value || null)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  data-testid="select-symposium"
                >
                  {symposiums.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">Symposium names are immutable.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-organizer">Organizer name</Label>
                <Input
                  id="brand-organizer"
                  value={organizerName}
                  maxLength={120}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  placeholder="MCA Dept, Bishop Heber College"
                  data-testid="input-organizer-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-color">Primary color</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="brand-color"
                    type="color"
                    value={previewColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-14 rounded border border-slate-200 cursor-pointer bg-white"
                    data-testid="input-primary-color"
                  />
                  <Input
                    value={primaryColor}
                    maxLength={7}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#4F46E5"
                    className="font-mono"
                    aria-label="Primary color hex"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo</Label>
                {logoUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={logoUrl} alt="Brand logo preview" className="h-12 w-12 rounded-lg object-contain bg-slate-100 border border-slate-200" />
                    <Button variant="outline" size="sm" onClick={() => setLogoUrl(null)} data-testid="button-remove-logo">
                      <X className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No logo — the default icon is used.</p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-logo"
                >
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </Button>
                <p className="text-xs text-slate-400">PNG, JPEG, SVG, or WebP, max 2MB.</p>
              </div>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-branding"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {saveMutation.isPending ? 'Saving…' : 'Save branding'}
              </Button>
            </CardContent>
          </Card>

          {/* Live preview */}
          <Card>
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>How the new brand looks before you save.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mock site header */}
              <div className="rounded-lg border border-slate-200 overflow-hidden" data-testid="preview-header">
                <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
                  ) : (
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: previewColor }} aria-hidden="true">
                      <GraduationCap className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{previewOrg}</p>
                    <p className="text-base font-bold tracking-tight text-slate-950 truncate">{previewName}</p>
                  </div>
                </div>
                {/* Mock hero */}
                <div className="bg-slate-950 text-white px-4 py-8 text-center">
                  <p className="text-4xl font-black tracking-tight">{previewName}</p>
                  <p className="text-sm text-slate-300 mt-2">{previewOrg}</p>
                  <span
                    className="inline-block mt-4 px-5 py-2 rounded-md text-white text-sm font-medium"
                    style={{ backgroundColor: previewColor }}
                  >
                    Register now
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Preview only — the header, landing page, login, and sidebars update across the
                site after saving.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
