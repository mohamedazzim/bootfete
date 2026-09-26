// Central branding source (Phase A white-label foundation).
//
// getBranding() is the single read path for live chrome and for anything
// generated NEW (certificates, reports, emails). Historical artifacts must
// NOT call this after creation — they snapshot branding at creation time
// (Phase B). Results are cached in Redis; updateBranding() invalidates.
//
// Fail-safe: if the global_settings row is missing (e.g. migrations not run
// yet), every field falls back to DEFAULT_BRANDING so the app keeps working
// with the original BootFete 2K26 identity.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { globalSettings } from "@shared/schema";
import { cacheService } from "./cacheService";

export interface Branding {
  appName: string;
  organizerName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string;
  footerText: string;
}

export const DEFAULT_BRANDING: Branding = {
  appName: "BootFete 2K26",
  organizerName: "MCA Dept, Bishop Heber College",
  logoUrl: null,
  primaryColor: "#4F46E5",
  supportEmail: "Not configured",
  footerText: "© 2026 BootFete. All rights reserved.",
};

const CACHE_KEY = "branding:global";
const CACHE_TTL_SECONDS = 3600;
const SINGLETON_ID = "global";

function toBranding(row: typeof globalSettings.$inferSelect | undefined): Branding {
  if (!row) return { ...DEFAULT_BRANDING };
  return {
    appName: row.appName || DEFAULT_BRANDING.appName,
    organizerName: row.organizerName || DEFAULT_BRANDING.organizerName,
    logoUrl: row.logoUrl ?? null,
    primaryColor: row.primaryColor || DEFAULT_BRANDING.primaryColor,
    supportEmail: row.supportEmail || DEFAULT_BRANDING.supportEmail,
    footerText: row.footerText || DEFAULT_BRANDING.footerText,
  };
}

export async function getBranding(): Promise<Branding> {
  return cacheService.get<Branding>(
    CACHE_KEY,
    async () => {
      const rows = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.id, SINGLETON_ID))
        .limit(1);
      return toBranding(rows[0]);
    },
    CACHE_TTL_SECONDS,
  );
}

export interface BrandingPatch {
  appName?: string;
  organizerName?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  supportEmail?: string;
  footerText?: string;
}

// Phase B historical integrity: resolve the brand for a GENERATED artifact
// (certificate, report, email) tied to a single event.
//   1. The event's own snapshot FIRST — its identity at creation time.
//      Used verbatim, including a null logo (a historical event that had
//      no logo must not gain the live logo on re-generation).
//   2. Live global_settings ONLY as fallback — covers events that predate
//      the snapshot migration. Those were backfilled at migration time from
//      whatever global_settings held then (migration 004 documents this as
//      an approximation, not historical truth).
// Callers pass the event row they already loaded; nothing here re-queries it.
export interface EventBranding {
  appName: string;
  organizerName: string;
  logoUrl: string | null;
}

export async function resolveEventBranding(
  event?: {
    appName?: string | null;
    organizerName?: string | null;
    logoUrl?: string | null;
  } | null,
): Promise<EventBranding> {
  if (event?.appName && event?.organizerName) {
    return {
      appName: event.appName,
      organizerName: event.organizerName,
      logoUrl: event.logoUrl ?? null,
    };
  }
  const live = await getBranding();
  return {
    appName: live.appName,
    organizerName: live.organizerName,
    logoUrl: live.logoUrl,
  };
}

function sanitizePatch(patch: BrandingPatch): BrandingPatch {
  const out: BrandingPatch = {};
  if (patch.appName !== undefined) {
    const v = patch.appName.trim();
    if (!v || v.length > 80) throw new Error("appName must be 1-80 characters");
    out.appName = v;
  }
  if (patch.organizerName !== undefined) {
    const v = patch.organizerName.trim();
    if (!v || v.length > 120) throw new Error("organizerName must be 1-120 characters");
    out.organizerName = v;
  }
  if (patch.logoUrl !== undefined) {
    if (patch.logoUrl !== null) {
      const v = patch.logoUrl.trim();
      if (v.length > 500) throw new Error("logoUrl must be at most 500 characters");
      if (!/^https?:\/\//i.test(v) && !v.startsWith("/")) {
        throw new Error("logoUrl must be an http(s) URL or a site-relative path");
      }
      out.logoUrl = v;
    } else {
      out.logoUrl = null;
    }
  }
  if (patch.primaryColor !== undefined) {
    const v = patch.primaryColor.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error("primaryColor must be a #RRGGBB hex color");
    out.primaryColor = v;
  }
  if (patch.supportEmail !== undefined) {
    const v = patch.supportEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 120) {
      throw new Error("supportEmail must be a valid email address");
    }
    out.supportEmail = v;
  }
  if (patch.footerText !== undefined) {
    const v = patch.footerText.trim();
    if (v.length > 200) throw new Error("footerText must be at most 200 characters");
    out.footerText = v;
  }
  return out;
}

export async function updateBranding(patch: BrandingPatch, updatedBy: string): Promise<Branding> {
  const clean = sanitizePatch(patch);
  if (Object.keys(clean).length === 0) {
    throw new Error("No valid branding fields to update");
  }
  const values: Record<string, unknown> = { ...clean, updatedBy, updatedAt: new Date() };
  await db
    .insert(globalSettings)
    .values({ id: SINGLETON_ID, ...values } as typeof globalSettings.$inferInsert)
    .onConflictDoUpdate({
      target: globalSettings.id,
      set: values as Partial<typeof globalSettings.$inferInsert>,
    });
  await cacheService.delete(CACHE_KEY);
  return getBranding();
}
