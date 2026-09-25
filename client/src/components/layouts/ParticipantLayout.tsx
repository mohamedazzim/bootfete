import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Circle, LayoutDashboard, ClipboardList, Compass } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Link, useLocation } from 'wouter';

interface ParticipantLayoutProps {
  children: ReactNode;
}

export default function ParticipantLayout({ children }: ParticipantLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { isConnected } = useWebSocket();

  const { data: credentialData } = useQuery<any>({
    queryKey: ['/api/participants/my-credential'],
    enabled: user?.role === 'participant',
  });

  const eventName = credentialData?.event?.name || 'Event';
  const participantName = user?.fullName || user?.email?.split('@')[0] || user?.username || 'Participant';

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/participant/dashboard">
              <span className="text-lg font-bold text-gray-900 cursor-pointer" data-testid="heading-symposium">
                BOOTFETE <span className="hidden sm:inline">2K26</span>
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-2">
              <span className="text-gray-300">|</span>
              <span className="text-sm font-medium text-gray-700 max-w-[200px] truncate" data-testid="text-event-name" title={eventName}>
                {eventName}
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-sm text-gray-600 max-w-[150px] truncate" data-testid="text-participant-name" title={participantName}>
                {participantName}
              </span>
            </div>

            {isConnected && (
              <Badge variant="outline" className="hidden sm:flex items-center ml-2 border-green-200 bg-green-50 text-green-700" data-testid="badge-websocket-connected">
                <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
                <span>Live</span>
              </Badge>
            )}
            {/* Round-2 M16: the socket is the realtime lifeline — when it
                drops, say so persistently instead of silently going stale. */}
            {!isConnected && (
              <Badge variant="outline" className="hidden sm:flex items-center ml-2 border-red-200 bg-red-50 text-red-700" data-testid="badge-websocket-disconnected" role="status">
                <Circle className="w-2 h-2 mr-1 fill-red-500 text-red-500 animate-pulse" />
                <span>Reconnecting…</span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/participant/dashboard">
              <Button
                variant={isActive('/participant/dashboard') ? 'default' : 'ghost'}
                size="sm"
                className="text-xs sm:text-sm"
              >
                <LayoutDashboard className="h-4 w-4 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </Link>

            <Link href="/participant/my-tests">
              <Button
                variant={isActive('/participant/my-tests') ? 'default' : 'ghost'}
                size="sm"
                className="text-xs sm:text-sm"
              >
                <ClipboardList className="h-4 w-4 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline">My Tests</span>
              </Button>
            </Link>

            <Link href="/participant/events">
              <Button
                variant={isActive('/participant/events') ? 'default' : 'ghost'}
                size="sm"
                className="text-xs sm:text-sm"
              >
                <Compass className="h-4 w-4 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline">Events</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="text-xs sm:text-sm ml-1"
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
