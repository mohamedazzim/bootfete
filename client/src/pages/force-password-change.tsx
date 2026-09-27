import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, hasSuperAdminAccess } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { successToast, errorToast } from '@/lib/toast';

// Phase 2 credential safety: staff accounts provisioned with a generated
// password land here on first login. They cannot proceed until they set
// their own password (clears the mustChangePassword flag server-side).
export default function ForcePasswordChange() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      errorToast(toast, 'Invalid password', 'New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      errorToast(toast, 'Mismatch', 'New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      errorToast(toast, 'Invalid password', 'New password must differ from the temporary one');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Password change failed');
      }
      successToast(toast, 'Password changed', 'Welcome!');
      // Route to the role's landing page now that the flag is cleared.
      if (hasSuperAdminAccess(user?.role)) {
        setLocation('/admin/dashboard');
      } else if (user?.role === 'event_admin') {
        setLocation('/event-admin/dashboard');
      } else if (user?.role === 'registration_committee') {
        setLocation('/registration-committee/dashboard');
      } else {
        setLocation('/participant/dashboard');
      }
      // Reload so /api/auth/me re-fetches with the cleared flag.
      window.location.reload();
    } catch (err: any) {
      errorToast(toast, 'Password change failed', err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Set your password
          </CardTitle>
          <CardDescription>
            Your account was created with a temporary password. Choose your own
            password to continue — this is required before you can use the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Temporary password</Label>
              <Input
                id="current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Set password and continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
