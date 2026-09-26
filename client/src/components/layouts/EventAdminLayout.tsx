import { ReactNode } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import { Calendar, Users, LayoutDashboard } from 'lucide-react';

interface EventAdminLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/event-admin/dashboard', icon: LayoutDashboard },
  { name: 'My Events', href: '/event-admin/events', icon: Calendar },
  { name: 'Participants', href: '/event-admin/participants', icon: Users },
];

/**
 * EventAdminLayout — Phase 4: migrated to the shared <AdminSidebar /> shell.
 * Only the role-scoped nav items and persona label differ from AdminLayout.
 * Global identity/account chrome (avatar, logout, websocket badge) lives in
 * <Header />; route guards are unchanged (see App.tsx ProtectedRoute).
 */
export default function EventAdminLayout({ children }: EventAdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminSidebar navItems={navigation} personaLabel="Event Admin">
        {children}
      </AdminSidebar>
    </div>
  );
}
