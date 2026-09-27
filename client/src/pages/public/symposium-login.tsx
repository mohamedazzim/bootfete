// Per-symposium login — "/s/:slug/login".
// Shows ONLY this symposium's branding: its logo, event name and college
// (organizer) name. Fetches the public by-slug endpoint, the same source as
// the symposium landing page — never the default/oldest symposium's brand.
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LoginCard from '@/components/login-card';

interface SymposiumLoginData {
  symposium: { id: string; name: string; slug: string; organizerName: string };
  branding: {
    appName: string;
    organizerName: string;
    logoUrl: string | null;
    primaryColor: string;
    supportEmail: string;
    footerText: string;
  };
}

export default function SymposiumLogin() {
  const params = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const slug = params.slug ?? '';

  const { data, isLoading, isError } = useQuery<SymposiumLoginData>({
    queryKey: ['/api/symposiums/by-slug', slug, 'login'],
    queryFn: async () => {
      const res = await fetch(`/api/symposiums/by-slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('not found');
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-600">Loading…</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Symposium not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              No symposium exists at <span className="font-mono">/s/{slug}</span>. Check the
              login link shared by your symposium administrator.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setLocation('/')}>
              Go to platform login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { branding } = data;
  return (
    <LoginCard
      branding={{
        appName: branding.appName,
        organizerName: branding.organizerName,
        logoUrl: branding.logoUrl,
        accentColor: branding.primaryColor,
      }}
      description="Staff login — sign in to access your dashboard"
      documentTitle={`${branding.appName} — Login`}
    />
  );
}
