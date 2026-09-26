/**
 * Required deployment environment — validated at boot, no silent fallbacks.
 *
 * APP_URL: public base URL baked into every email link (password resets,
 * event/test links). SENDER_EMAIL: the envelope sender identity for all
 * outbound mail (must be a domain whose DNS — SPF/DKIM — the deployment
 * controls, or providers/ESPs will reject or spam-filter the mail).
 *
 * The previous production domain expired, so there are deliberately NO
 * hardcoded fallback values: a silent substitute would send dead links or
 * mail from an unauthenticated domain. When a var is unset the server boots
 * in a degraded mode (local dev without email flows keeps working), but
 * every attempt to use the missing value throws a descriptive error and
 * /api/health reports the gap.
 *
 * Neither value is ever derived from app_name/organizer_name — branding
 * renames must not change infrastructure identity.
 */

const HINTS: Record<string, string> = {
  APP_URL:
    "Email links (password resets, event links, test links) cannot be built without it.",
  SENDER_EMAIL:
    "Outbound mail has no sender identity without it — providers will reject or spam-filter it.",
};

function requiredEnv(name: keyof typeof HINTS): string {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new Error(
      `${name} is not set. ${HINTS[name]} Set ${name} in your environment.`
    );
  }
  return raw;
}

/** Base URL for links inside emails. Trailing slashes stripped. */
export function getAppBaseUrl(): string {
  return requiredEnv("APP_URL").replace(/\/+$/, "");
}

/** Envelope sender address for all outbound mail. */
export function getSenderEmail(): string {
  return requiredEnv("SENDER_EMAIL");
}

/** Names of required env vars that are currently unset/empty. */
export function getConfigGaps(): string[] {
  const gaps: string[] = [];
  if (!process.env.APP_URL?.trim()) gaps.push("APP_URL");
  if (!process.env.SENDER_EMAIL?.trim()) gaps.push("SENDER_EMAIL");
  return gaps;
}
