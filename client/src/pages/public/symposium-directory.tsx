// Public symposium directory (Phase 2).
//
// DECISION: the bare "/" root is a simple public directory listing every
// symposium with a link to its per-symposium landing page (/s/:slug).
// Rationale: with multiple tenants, "/" cannot guess which symposium's
// branding/events to show. A directory is explicit, bookmarkable, and
// degrades gracefully (one symposium → one card). Logged-in users bypass
// it entirely via the existing role-based dashboard redirects in App.tsx.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Building2, ArrowRight, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface DirectoryEntry {
  id: string;
  name: string;
  slug: string;
  organizerName?: string | null;
}

export default function SymposiumDirectory() {
  const { data: symposiums = [], isLoading } = useQuery<DirectoryEntry[]>({
    queryKey: ['/api/symposiums/directory'],
    queryFn: async () => {
      const res = await fetch('/api/symposiums/directory');
      if (!res.ok) throw new Error('Failed to load symposiums');
      return res.json();
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-indigo-300 text-sm font-medium tracking-wide">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            BootFete
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight" data-testid="heading-directory">
            Find your symposium
          </h1>
          <p className="text-slate-300 max-w-xl mx-auto">
            Choose your symposium below to see its events and register.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : symposiums.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No symposiums are currently listed.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {symposiums.map((s) => (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 text-indigo-600" />
                    {s.name}
                  </CardTitle>
                  {s.organizerName && (
                    <CardDescription>{s.organizerName}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex items-end">
                  <Button asChild className="w-full">
                    <Link href={`/s/${s.slug}`}>
                      View events <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
