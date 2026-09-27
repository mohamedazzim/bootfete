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
import { useAuth } from "./auth";
import { apiRequest } from "./queryClient";

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

// The platform (ultimate-admin) identity. Used on the platform login and on
// every ultimate-admin chrome surface — a tenant's symposium branding must
// never leak into the platform operator's view.
export const PLATFORM_BRANDING: PublicBranding = {
  ...DEFAULT_CLIENT_BRANDING,
  appName: "TechnoZim",
  organizerName: "",
  footerText: "© 2026 TechnoZim. All rights reserved.",
};

const BrandingContext = createContext<PublicBranding>(DEFAULT_CLIENT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  // Tenant scoping: a logged-in symposium user sees their OWN symposium's
  // branding in the nav chrome — never the default (oldest) symposium's.
  // The symposium id is part of the query key, so login/logout swaps the
  // cached brand instead of showing a stale one. Logged-out and
  // ultimate-admin contexts fall back to the default brand (the ultimate
  // header overrides to the platform identity by route anyway).
  const { user } = useAuth();
  const symposiumId = user?.symposiumId ?? null;
  const { data } = useQuery<PublicBranding>({
    queryKey: ["/api/settings/branding", symposiumId ?? "default"],
    queryFn: async () => {
      const url = symposiumId
        ? `/api/settings/branding?symposiumId=${encodeURIComponent(symposiumId)}`
        : "/api/settings/branding";
      const res = await apiRequest("GET", url);
      return (await res.json()) as PublicBranding;
    },
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
