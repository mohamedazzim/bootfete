import { ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Calendar,
  Users,
  FileText,
  LayoutDashboard,
  LogOut,
  FormInput,
  UserCheck,
  ShieldAlert,
  Mail,
  Circle,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/contexts/WebSocketContext';

interface AdminLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Events', href: '/admin/events', icon: Calendar },
  { name: 'Event Admins', href: '/admin/event-admins', icon: Users },
  { name: 'Registration Forms', href: '/admin/registration-forms', icon: FormInput },
  { name: 'Registration Committee', href: '/admin/registration-committee', icon: UserCheck },
  { name: 'Registrations', href: '/admin/registrations', icon: FileText },
  { name: 'Reports', href: '/admin/reports', icon: FileText },
  { name: 'Email Logs', href: '/admin/email-logs', icon: Mail },
  { name: 'Super Admin Overrides', href: '/admin/super-admin-overrides', icon: ShieldAlert },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { isConnected } = useWebSocket();
  const [open, setOpen] = useState(false);

  const NavContent = () => (
    <nav className="space-y-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || location.startsWith(item.href + '/');

        return (
          <button
            key={item.name}
            onClick={() => {
              setLocation(item.href);
              setOpen(false);
            }}
            data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.name}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 md:gap-4">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-4 pt-10">
                <div className="mb-6 px-2">
                  <h2 className="text-lg font-bold text-gray-900">Symposium</h2>
                  <p className="text-sm text-gray-500">Super Admin</p>
                </div>
                <NavContent />
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2 md:gap-4">
              <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate max-w-[150px] md:max-w-none">
                Symposium <span className="hidden sm:inline">Management</span>
              </h1>
              <span className="hidden md:inline text-sm text-gray-500">|</span>
              <span className="hidden md:inline text-sm text-gray-600">Super Admin</span>
              {isConnected && (
                <Badge variant="outline" className="ml-1 md:ml-2" data-testid="badge-websocket-connected">
                  <Circle className="w-2 h-2 mr-1 fill-green-500 text-green-500" />
                  <span className="hidden sm:inline">Live</span>
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0" data-testid="user-avatar">
                <span className="text-white text-sm font-medium">
                  {user?.fullName?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-900" data-testid="text-user-name">
                  {user?.fullName}
                </p>
                <p className="text-xs text-gray-500" data-testid="text-user-email">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden md:block w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <NavContent />
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-4 md:p-6 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
