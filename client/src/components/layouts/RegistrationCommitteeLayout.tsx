import { ReactNode } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import { Home, ClipboardList, UserPlus } from 'lucide-react';

interface RegistrationCommitteeLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/registration-committee/dashboard', icon: Home },
  { name: 'Registrations', href: '/registration-committee/registrations', icon: ClipboardList },
  { name: 'On-Spot Registration', href: '/registration-committee/on-spot-registration', icon: UserPlus },
];

/**
 * RegistrationCommitteeLayout — Phase 4: migrated to the shared
 * <AdminSidebar /> shell. Only the role-scoped nav items and persona label
 * differ from AdminLayout. Global identity/account chrome (avatar, logout,
 * websocket badge) lives in <Header />; route guards are unchanged
 * (see App.tsx ProtectedRoute).
 */
export default function RegistrationCommitteeLayout({ children }: RegistrationCommitteeLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminSidebar navItems={navigation} personaLabel="Registration Committee">
        {children}
      </AdminSidebar>
    </div>
  );
}
