import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/lib/branding';

export interface AdminNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface AdminSidebarProps {
  navItems: AdminNavItem[];
  personaLabel: string;
  children: ReactNode;
}

/**
 * AdminSidebar — the single shared shell for administrative personas.
 * Light sidebar + mobile drawer + content region on an 8pt spacing rhythm.
 * Role-scoped navigation is passed in; identity/account chrome lives in the
 * global <Header />. Wired for super_admin/ultimate_admin (AdminLayout), event_admin
 * (EventAdminLayout) and registration_committee (RegistrationCommitteeLayout).
 */
export default function AdminSidebar({ navItems, personaLabel, children }: AdminSidebarProps) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Phase B: sidebar header wordmark follows live branding.
  const branding = useBranding();

  // The mobile menu button lives in the global <Header /> (above this shell in
  // the tree), so it toggles the drawer via a window event bridge.
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener('bootfete:toggle-sidebar', toggle);
    return () => window.removeEventListener('bootfete:toggle-sidebar', toggle);
  }, []);

  const navTestId = (name: string) => `nav-${name.toLowerCase().replace(/ /g, '-')}`;

  const renderNav = (onNavigate?: () => void) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || location.startsWith(item.href + '/');
        return (
          <button
            key={item.name}
            onClick={() => {
              setLocation(item.href);
              onNavigate?.();
            }}
            data-testid={navTestId(item.name)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px]',
              isCollapsed && !onNavigate ? 'justify-center px-2' : '',
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0', isCollapsed && !onNavigate ? '' : 'mr-2')} />
            {(!isCollapsed || onNavigate) && item.name}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Mobile drawer — toggled from the global <Header /> via event bridge */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-4 pt-10">
          <div className="mb-6 px-2">
            <h2 className="text-lg font-bold text-slate-900 truncate">{branding.appName}</h2>
            <p className="text-sm font-normal text-slate-500">{personaLabel}</p>
          </div>
          {renderNav(() => setOpen(false))}
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className="p-4 flex-1 overflow-y-auto">
          {renderNav()}
        </div>
        <div className="p-4 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            className="w-full flex items-center justify-center text-slate-500 hover:text-slate-900"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : (
              <span className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                <span className="text-xs uppercase font-semibold tracking-wider">Collapse</span>
              </span>
            )}
          </Button>
        </div>
      </aside>

      {/* Content region — 8pt rhythm gutters */}
      <main className="flex-1 overflow-auto p-4 md:p-8 w-full">
        {children}
      </main>
    </div>
  );
}
