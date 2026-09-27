// Public per-symposium landing page (Phase 2).
//
// Routed by the locked slug: /s/bootfete-2k26. Shows ONLY this symposium's
// branding and its own active events — no cross-symposium listing anywhere.
// Unknown slugs render a 404-style not-found state.
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'wouter';
import { CalendarDays, Users, LogIn, UserPlus, GraduationCap, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface SymposiumEvent {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  category?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}

interface SymposiumLanding {
  symposium: {
    id: string;
    name: string;
    slug: string;
    organizerName?: string | null;
    logoUrl?: string | null;
    footerText?: string | null;
  };
  branding: {
    appName: string;
    organizerName: string;
    logoUrl?: string | null;
    primaryColor: string;
    supportEmail: string;
    footerText: string;
  };
  events: SymposiumEvent[];
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

function EventCard({ event }: { event: SymposiumEvent }) {
  const start = formatDate(event.startDate);
  const end = formatDate(event.endDate);
  const dateLine = start ? (end && end !== start ? `${start} – ${end}` : `Starts ${start}`) : null;

  return (
    <Card className="flex flex-col" data-testid={`card-event-${event.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100">
            Open for registration
          </Badge>
          {event.category && (
            <Badge variant="outline">
              {event.category === 'technical' ? 'Technical' : 'Non-Technical'}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg leading-7">{event.name}</CardTitle>
        {event.description && (
          <CardDescription className="line-clamp-3">{event.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="space-y-2 text-sm text-slate-600">
          {dateLine && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Dates</dt>
              <dd>{dateLine}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Eligibility</dt>
            <dd>See event details for team size</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/register/event/${event.id}`}>
            Register for this event
            <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function SymposiumLandingPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery<SymposiumLanding>({
    queryKey: ['/api/symposiums/by-slug', slug],
    queryFn: async () => {
      const res = await fetch(`/api/symposiums/by-slug/${encodeURIComponent(slug ?? '')}`);
      if (res.status === 404) throw new Error('NOT_FOUND');
      if (!res.ok) throw new Error('Failed to load symposium');
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-16 space-y-4">
          <Skeleton className="h-12 w-2/3 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-8">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle>Symposium not found</CardTitle>
            <CardDescription>
              No symposium exists at <span className="font-mono">/s/{slug}</span>.
              Check the link or return to the directory.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to directory
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const { symposium, branding, events } = data;
  const heroWords = branding.appName.split(' ');
  const heroTail = heroWords.pop() ?? '';
  const heroHead = heroWords.join(' ');
  const primaryColor = branding.primaryColor || '#4F46E5';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero — this symposium's branding only */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 md:py-24 text-center space-y-6">
          <div className="flex items-center justify-center gap-2 text-sm font-medium tracking-wide" style={{ color: primaryColor }}>
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {branding.organizerName}
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight" data-testid="heading-symposium-landing">
            {heroHead ? <>{heroHead} </> : null}<span style={{ color: primaryColor }}>{heroTail}</span>
          </h1>
          <p className="text-base md:text-lg text-slate-300 max-w-2xl mx-auto">
            Discover open events below and register as a participant.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Button asChild size="lg" variant="secondary">
              <a href="#events">
                <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                Register as participant
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-slate-600 hover:bg-slate-800">
              <Link href={`/s/${slug}/login`}>
                <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                Organizer sign in
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Events — this symposium's active events only */}
      <section id="events" className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-2xl font-bold mb-6">Open events</h2>
        {events.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No open events right now at {symposium.name}. Check back soon.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-slate-500">
          {branding.footerText || symposium.name}
          {branding.supportEmail && branding.supportEmail !== 'Not configured' && (
            <> · <a href={`mailto:${branding.supportEmail}`} className="underline">{branding.supportEmail}</a></>
          )}
        </div>
      </footer>
    </div>
  );
}
