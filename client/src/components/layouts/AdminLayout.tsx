import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
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
  Settings,
  Palette
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

const BASE_NAVIGATION = [
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
 *
 * Phase B: ultimate admins additionally see "Branding Settings" alongside
 * "Super Admin Overrides". Strict ultimate-only — never inherited by
 * super_admin.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user } = useAuth();
  const navigation = user?.role === 'ultimate_admin'
    ? [...BASE_NAVIGATION, { name: 'Branding Settings', href: '/ultimate-admin/settings', icon: Palette }]
    : BASE_NAVIGATION;
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminSidebar navItems={navigation} personaLabel="Super Admin">
        {children}
      </AdminSidebar>
    </div>
  );
}
