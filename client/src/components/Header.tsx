import { useAuth, hasSuperAdminAccess } from '@/lib/auth';
import { useBranding } from '@/lib/branding';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, LogOut, Circle, Menu } from 'lucide-react';

const PERSONA_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  event_admin: 'Event Admin',
  registration_committee: 'Registration Committee',
  participant: 'Participant',
};

/**
 * Header — slim global identity bar (max 56px) replacing the 120px
 * institutional letterhead banner. Rendered above every route except the
 * active exam route (see App.tsx). Persona-specific navigation lives in
 * the per-role layouts; this bar carries identity + account only.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { isConnected } = useWebSocket();
  // Phase B: sitewide live branding — header wordmark follows global_settings.
  const branding = useBranding();

  const personaLabel = user ? (PERSONA_LABELS[user.role] ?? user.role) : null;
  // Phase 4: all three administrative personas share the <AdminSidebar />
  // shell, so the mobile drawer toggle is available to each of them.
  const showSidebarToggle =
    hasSuperAdminAccess(user?.role) ||
    user?.role === 'event_admin' ||
    user?.role === 'registration_committee';

  const toggleSidebar = () => window.dispatchEvent(new Event('bootfete:toggle-sidebar'));

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="h-14 px-4 flex items-center justify-between gap-3">
        {/* Identity cluster — min-w-0 allows graceful ellipsis, never mid-word break */}
        <div className="flex items-center gap-2.5 min-w-0">
          {showSidebarToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0 min-h-[44px] min-w-[44px]"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0" aria-hidden="true">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="hidden sm:block text-sm font-medium text-slate-700 truncate max-w-[220px] lg:max-w-none">
            {branding.organizerName}
          </span>
          <span className="hidden sm:block text-slate-300" aria-hidden="true">|</span>
          {/* Compact mobile lockup: dynamic wordmark, truncated so a long
              renamed brand can never overflow the 390px viewport */}
          <span className="sm:hidden text-base font-bold tracking-tight text-slate-950 truncate max-w-[160px]">
            {branding.appName}
          </span>
          <span className="hidden sm:block text-base font-bold tracking-tight text-slate-950 whitespace-nowrap">
            {branding.appName}
          </span>
          {personaLabel && (
            <Badge variant="secondary" className="hidden min-[420px]:inline-flex bg-indigo-50 text-indigo-700 border-indigo-100 whitespace-nowrap">
              {personaLabel}
            </Badge>
          )}
        </div>

        {/* Status + account cluster */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {user && isConnected && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700" data-testid="badge-websocket-connected">
              <Circle className="w-2 h-2 mr-1 fill-emerald-500 text-emerald-500" />
              <span className="hidden sm:inline">Live</span>
            </Badge>
          )}
          {user && !isConnected && (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700" data-testid="badge-websocket-disconnected" role="status">
              <Circle className="w-2 h-2 mr-1 fill-red-500 text-red-500 animate-pulse" />
              <span className="hidden sm:inline">Reconnecting…</span>
            </Badge>
          )}
          {user ? (
            <>
              <div className="hidden md:flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0" data-testid="user-avatar">
                  <span className="text-white text-sm font-medium">
                    {user?.fullName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-slate-900 leading-5" data-testid="text-user-name">
                    {user?.fullName}
                  </p>
                  <p className="text-xs font-normal text-slate-500 leading-4" data-testid="text-user-email">{user?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                data-testid="button-logout"
                className="max-md:min-h-[44px] max-md:min-w-[44px]"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Logout</span>
              </Button>
            </>
          ) : (
            <span className="text-sm font-normal text-slate-500">{branding.appName}</span>
          )}
        </div>
      </div>
    </header>
  );
}
