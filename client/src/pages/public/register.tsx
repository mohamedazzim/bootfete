import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useBranding } from '@/lib/branding';
import { useAuth } from '@/lib/auth';
import { errorToast, successToast } from '@/lib/toast';

interface FieldErrors {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
}

/**
 * Public participant self-registration. Posts to the existing
 * POST /api/auth/register endpoint with role="participant".
 * Auth (JWT/session) logic is untouched — auth.tsx handles it.
 */
export default function ParticipantRegister() {
  // Phase B: registration chrome follows live branding.
  const branding = useBranding();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { register, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation('/participant/dashboard');
    return null;
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (fullName.trim().length < 2) errors.fullName = 'Please enter your full name.';
    if (username.trim().length < 3) errors.username = 'Username must be at least 3 characters.';
    else if (!/^[a-zA-Z0-9_-]+$/.test(username.trim()))
      errors.username = 'Username can only contain letters, numbers, underscores, and hyphens.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      await register(username.trim(), password, email.trim(), fullName.trim(), 'participant');
            successToast(
        toast,
        'Registration successful',
        `Welcome to ${branding.appName}!`,
      );
    } catch (error: any) {
      const message: string = error.message || 'Registration failed. Please try again.';
      // Map server messages to the offending field where possible.
      const next: FieldErrors = {};
      if (/username/i.test(message)) next.username = message;
      else if (/email/i.test(message)) next.email = message;
      else if (/password/i.test(message)) next.password = message;
      else if (/full name/i.test(message)) next.fullName = message;
      setFieldErrors(next);
      if (Object.keys(next).length === 0) setFormError(message);
      errorToast(toast, 'Registration failed', message);
    } finally {
      setIsLoading(false);
    }
  }

  function fieldClass(hasError: boolean) {
    return hasError ? 'border-destructive focus-visible:ring-destructive' : undefined;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex flex-col items-center text-center space-y-2" data-testid="heading-register">
            <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center" aria-hidden="true">
              <UserPlus className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-950">
              {branding.appName}
            </CardTitle>
            <CardDescription>Participant Registration — create your account</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {formError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-8" noValidate data-testid="form-register">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                aria-invalid={!!fieldErrors.fullName}
                aria-describedby={fieldErrors.fullName ? 'fullName-error' : undefined}
                className={fieldClass(!!fieldErrors.fullName)}
                data-testid="input-fullName"
              />
              {fieldErrors.fullName && (
                <p id="fullName-error" role="alert" className="text-sm text-destructive">{fieldErrors.fullName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-username">Username</Label>
              <Input
                id="reg-username"
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                aria-invalid={!!fieldErrors.username}
                aria-describedby={fieldErrors.username ? 'reg-username-error' : undefined}
                className={fieldClass(!!fieldErrors.username)}
                data-testid="input-reg-username"
              />
              {fieldErrors.username && (
                <p id="reg-username-error" role="alert" className="text-sm text-destructive">{fieldErrors.username}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
                className={fieldClass(!!fieldErrors.email)}
                data-testid="input-reg-email"
              />
              {fieldErrors.email && (
                <p id="reg-email-error" role="alert" className="text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined}
                className={fieldClass(!!fieldErrors.password)}
                data-testid="input-reg-password"
              />
              {fieldErrors.password && (
                <p id="reg-password-error" role="alert" className="text-sm text-destructive">{fieldErrors.password}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
              {isLoading ? 'Creating account…' : 'Register as Participant'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
