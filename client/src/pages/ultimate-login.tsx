// Platform login — the bare "/" page.
// Generic TechnoZim chrome only: no symposium name, no college name, no logo.
// This is where the ultimate_admin signs in; symposium staff use their
// symposium's own link (/s/:slug/login).
import LoginCard from '@/components/login-card';
import { PLATFORM_BRANDING } from '@/lib/branding';

export default function UltimateLogin() {
  return (
    <LoginCard
      branding={{ appName: PLATFORM_BRANDING.appName }}
      description="Platform administration — sign in with your ultimate admin account"
      documentTitle={`${PLATFORM_BRANDING.appName} — Platform login`}
    />
  );
}
