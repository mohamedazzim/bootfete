// Central branding source (Phase A white-label foundation, Phase 1 multi-tenancy).
//
// getBranding(symposiumId?) is the single read path for live chrome and for
// anything generated NEW (certificates, reports, emails). Historical artifacts
// must NOT call this after creation — they snapshot branding at creation time
// (Phase B). Results are cached in Redis; updateBranding() invalidates.
//
// Multi-tenancy: branding now resolves from the symposium row, NOT the
// deprecated global_settings singleton (kept in the DB but no longer read).
//   - symposiumId provided → that symposium's row.
//   - omitted (unauthenticated contexts: landing/login pages, health) → the
//     oldest symposium, which preserves the exact pre-migration behavior
//     (symposium #1 was seeded FROM global_settings at migration time).
//
// Fail-safe: if no symposium row exists (e.g. migrations not run yet), every
// field falls back to DEFAULT_BRANDING so the app keeps working with the
// original BootFete 2K26 identity.
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { symposiums } from "@shared/schema";
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

const CACHE_TTL_SECONDS = 3600;
const DEFAULT_CACHE_KEY = "branding:default";
const symposiumCacheKey = (id: string) => `branding:symposium:${id}`;

function toBranding(row: typeof symposiums.$inferSelect | undefined): Branding {
  if (!row) return { ...DEFAULT_BRANDING };
  return {
    appName: row.name || DEFAULT_BRANDING.appName,
    organizerName: row.organizerName || DEFAULT_BRANDING.organizerName,
    logoUrl: row.logoUrl ?? null,
    primaryColor: row.primaryColor || DEFAULT_BRANDING.primaryColor,
    supportEmail: row.supportEmail || DEFAULT_BRANDING.supportEmail,
    footerText: row.footerText || DEFAULT_BRANDING.footerText,
  };
}

// Oldest symposium id — the default brand for unauthenticated contexts and
// the attribution fallback for background jobs with no tenant context.
// Cached long; symposium rows are never deleted in normal operation.
export async function getDefaultSymposiumId(): Promise<string | null> {
  return cacheService.get<string | null>(
    "branding:default-symposium-id",
    async () => {
      const rows = await db
        .select({ id: symposiums.id })
        .from(symposiums)
        .orderBy(asc(symposiums.createdAt))
        .limit(1);
      return rows[0]?.id ?? null;
    },
    CACHE_TTL_SECONDS,
  );
}

export async function getBranding(symposiumId?: string | null): Promise<Branding> {
  if (symposiumId) {
    return cacheService.get<Branding>(
      symposiumCacheKey(symposiumId),
      async () => {
        const rows = await db
          .select()
          .from(symposiums)
          .where(eq(symposiums.id, symposiumId))
          .limit(1);
        return toBranding(rows[0]);
      },
      CACHE_TTL_SECONDS,
    );
  }
  return cacheService.get<Branding>(
    DEFAULT_CACHE_KEY,
    async () => {
      const defaultId = await getDefaultSymposiumId();
      if (!defaultId) return { ...DEFAULT_BRANDING };
      const rows = await db
        .select()
        .from(symposiums)
        .where(eq(symposiums.id, defaultId))
        .limit(1);
      return toBranding(rows[0]);
    },
    CACHE_TTL_SECONDS,
  );
}

export interface BrandingPatch {
  // NOTE: no `name`/`appName` member — symposium names are immutable.
  // There is intentionally no way to rename a symposium via this API.
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
//   2. The OWNING SYMPOSIUM's live branding as fallback — covers events that
//      predate the snapshot migration. (Phase 1: this used to be the global
//      singleton; it now defaults from the event's symposium instead.)
// Callers pass the event row they already loaded; nothing here re-queries it.
// The event's symposiumId is read straight off that row when present.
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
    symposiumId?: string | null;
  } | null,
  symposiumId?: string | null,
): Promise<EventBranding> {
  if (event?.appName && event?.organizerName) {
    return {
      appName: event.appName,
      organizerName: event.organizerName,
      logoUrl: event.logoUrl ?? null,
    };
  }
  const live = await getBranding(symposiumId ?? event?.symposiumId ?? null);
  return {
    appName: live.appName,
    organizerName: live.organizerName,
    logoUrl: live.logoUrl,
  };
}

function sanitizePatch(patch: BrandingPatch): BrandingPatch {
  const out: BrandingPatch = {};
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

export async function updateBranding(
  symposiumId: string,
  patch: BrandingPatch,
  updatedBy: string,
): Promise<Branding> {
  const clean = sanitizePatch(patch);
  if (Object.keys(clean).length === 0) {
    throw new Error("No valid branding fields to update");
  }
  const existing = await db
    .select({ id: symposiums.id })
    .from(symposiums)
    .where(eq(symposiums.id, symposiumId))
    .limit(1);
  if (!existing[0]) {
    throw new Error("Symposium not found");
  }
  await db
    .update(symposiums)
    .set(clean as Partial<typeof symposiums.$inferInsert>)
    .where(eq(symposiums.id, symposiumId));
  await cacheService.delete(symposiumCacheKey(symposiumId));
  await cacheService.delete(DEFAULT_CACHE_KEY);
  await cacheService.delete("branding:default-symposium-id");
  return getBranding(symposiumId);
}
