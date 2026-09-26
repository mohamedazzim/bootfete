import { ReactNode } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import {
  Calendar,
  Users,
  FileText,
  LayoutDashboard,
  FormInput,
  UserCheck,
  ShieldAlert,
  Mail,
  ClipboardCheck,
  Settings
} from 'lucide-react';

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
  { name: 'Test Manager', href: '/admin/tests', icon: ClipboardCheck },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
  { name: 'Super Admin Overrides', href: '/admin/super-admin-overrides', icon: ShieldAlert },
];

/**
 * AdminLayout — superadmin implementation of the shared <AdminSidebar />
 * shell. Global identity/account chrome lives in <Header />.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminSidebar navItems={navigation} personaLabel="Super Admin">
        {children}
      </AdminSidebar>
    </div>
  );
}
