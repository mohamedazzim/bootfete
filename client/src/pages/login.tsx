import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { errorToast, infoToast, successToast } from '@/lib/toast';
import { Eye, EyeOff, AlertCircle, GraduationCap } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { login, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      if (user.role === 'super_admin') {
        setLocation('/admin/dashboard');
      } else if (user.role === 'event_admin') {
        setLocation('/event-admin/dashboard');
      } else if (user.role === 'registration_committee') {
        setLocation('/registration-committee/dashboard');
      } else {
        setLocation('/participant/dashboard');
      }
    }
  }, [user, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = 'Enter your username or email.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      await login(username, password);
            successToast(
        toast,
        'Login successful',
        'Welcome back!',
      );
    } catch (error: any) {
      const message: string = error.message || 'Login failed. Please try again.';
      // Map server messages to the offending field where possible.
      const next: { username?: string; password?: string } = {};
      if (/username|email|user|account/i.test(message)) next.username = message;
      else if (/password|credential/i.test(message)) next.password = message;
      setFieldErrors(next);
      if (Object.keys(next).length === 0) setFormError(message);
      errorToast(toast, 'Login failed', message);
    } finally {
      setIsLoading(false);
    }
  }

  function forgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    infoToast(
      toast,
      'Forgot your password?',
      'Contact your administrator to reset your account password.',
    );
  }

  function fieldClass(hasError: boolean) {
    return hasError ? 'border-destructive focus-visible:ring-destructive' : undefined;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex flex-col items-center text-center space-y-2" data-testid="heading-login">
            <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center" aria-hidden="true">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-950">
              BootFete 2K26
            </CardTitle>
            <CardDescription>Staff login — sign in to access your dashboard</CardDescription>
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
          <form onSubmit={handleSubmit} className="space-y-8" noValidate data-testid="form-login">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                aria-invalid={!!fieldErrors.username}
                aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                className={fieldClass(!!fieldErrors.username)}
                data-testid="input-username"
              />
              {fieldErrors.username && (
                <p id="username-error" role="alert" className="text-sm text-destructive">{fieldErrors.username}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  onClick={forgotPassword}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className={fieldClass(!!fieldErrors.password)}
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="text-sm text-destructive">{fieldErrors.password}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            New to BootFete?{' '}
            <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm">
              Register as a participant
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
