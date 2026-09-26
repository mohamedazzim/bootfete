// Live sitewide branding (Phase B).
//
// BrandingProvider fetches the public /api/settings/branding endpoint once
// on app load and exposes it via useBranding(). Every forward-facing chrome
// surface (header, landing, login, sidebars, document.title) reads from
// here — never from hardcoded literals.
//
// On fetch failure the context falls back to DEFAULT_CLIENT_BRANDING (the
// original BootFete 2K26 identity), so the UI keeps working offline or when
// the endpoint is unreachable.
//
// This is LIVE chrome only. Historical artifacts (certificates, reports,
// emails for existing events) resolve the event's own snapshot server-side
// and never consult this context.
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

export interface PublicBranding {
  appName: string;
  organizerName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string;
  footerText: string;
}

export const DEFAULT_CLIENT_BRANDING: PublicBranding = {
  appName: "BootFete 2K26",
  organizerName: "MCA Dept, Bishop Heber College",
  logoUrl: null,
  primaryColor: "#4F46E5",
  supportEmail: "Not configured",
  footerText: "© 2026 BootFete. All rights reserved.",
};

const BrandingContext = createContext<PublicBranding>(DEFAULT_CLIENT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  // The default queryFn (see lib/queryClient) fetches queryKey.join("/").
  // Fetched once per session; a rename takes effect on next load (the
  // ultimate-admin settings page also updates the cache on save).
  const { data } = useQuery<PublicBranding>({
    queryKey: ["/api/settings/branding"],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  return (
    <BrandingContext.Provider value={data ?? DEFAULT_CLIENT_BRANDING}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): PublicBranding {
  return useContext(BrandingContext);
}
