import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CalendarDays, Users, LogIn, UserPlus, CalendarX2, GraduationCap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranding } from '@/lib/branding';


interface PublicEvent {
  id: string;
  name: string;
  description?: string | null;
  category: 'technical' | 'non_technical';
  startDate?: string | null;
  endDate?: string | null;
  minMembers: number;
  maxMembers: number;
  rounds?: Array<{ id: string; name: string; startTime?: string | null; endTime?: string | null }>;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

function EventCard({ event }: { event: PublicEvent }) {
  const start = formatDate(event.startDate);
  const end = formatDate(event.endDate);
  const dateLine = start ? (end && end !== start ? `${start} – ${end}` : `Starts ${start}`) : null;
  const teamLine = event.minMembers === event.maxMembers
    ? event.minMembers === 1
      ? 'Solo event'
      : `Team of ${event.minMembers}`
    : `Team of ${event.minMembers}–${event.maxMembers}`;

  return (
    <Card className="flex flex-col" data-testid={`card-event-${event.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-100">
            Open for registration
          </Badge>
          <Badge variant="outline">
            {event.category === 'technical' ? 'Technical' : 'Non-Technical'}
          </Badge>
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
            <dd>{teamLine}</dd>
          </div>
          {event.rounds && event.rounds.length > 0 && (
            <p className="text-slate-500">{event.rounds.length} round{event.rounds.length === 1 ? '' : 's'}</p>
          )}
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

export default function LandingPage() {
  // Phase B: hero follows live branding (accent stays on the trailing token,
  // e.g. the "2K26" in "BootFete 2K26", for any renamed brand).
  const branding = useBranding();
  const heroWords = branding.appName.split(' ');
  const heroTail = heroWords.pop() ?? '';
  const heroHead = heroWords.join(' ');
  const { data: events, isLoading, isError } = useQuery<PublicEvent[]>({
    queryKey: ['/api/events/for-registration'],
    queryFn: async () => {
      const res = await fetch('/api/events/for-registration');
      // No active registration form -> no open events; show the empty state, not an error.
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Failed to load events');
      return res.json();
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 md:py-24 text-center space-y-6">
          <div className="flex items-center justify-center gap-2 text-indigo-300 text-sm font-medium tracking-wide">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {branding.organizerName}
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight" data-testid="heading-landing">
            {heroHead ? <>{heroHead} </> : null}<span className="text-indigo-400">{heroTail}</span>
          </h1>
          <p className="text-base md:text-lg text-slate-300 max-w-2xl mx-auto">
            The annual technical and cultural symposium. Discover open events below,
            register as a participant, or sign in if you are on the organizing team.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/register">
                <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                Participant Registration
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link href="/login">
                <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                Staff Login
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Event discovery */}
      <section className="mx-auto max-w-5xl px-4 py-12 md:py-16 space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-950">Open Events</h2>
          <p className="text-slate-600">Events currently accepting registrations.</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Loading events">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="p-6 space-y-4">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <Card className="p-8 text-center space-y-2">
            <p className="font-medium text-slate-900">Could not load events right now.</p>
            <p className="text-sm text-slate-600">Please refresh the page or try again later.</p>
          </Card>
        )}

        {!isLoading && !isError && events && events.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {!isLoading && !isError && events && events.length === 0 && (
          <Card className="p-12 text-center" data-testid="empty-events">
            <div className="mx-auto h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
              <CalendarX2 className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            </div>
            <p className="text-lg font-medium text-slate-900">Check back later for upcoming events</p>
            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
              Registration is not open for any events at the moment. New events will appear here as soon as they are announced.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
