import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { cacheService } from "../services/cacheService";

// Track-3: bounds how long a role change takes to propagate to in-flight
// requests. Disqualification-critical paths check participant.status from
// the DB per request, so they are unaffected by this window.
const AUTH_USER_CACHE_TTL_SECONDS = 20;

const JWT_SECRET = process.env.JWT_SECRET || "symposium-secret-key-change-in-production";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    role: string;
    eventId?: string;
    // Multi-tenancy (Phase 1): the symposium this user is scoped to.
    // NULL for ultimate_admin (unscoped — sees all symposiums) and for
    // participant users (tenant context derives from the event acted on).
    symposiumId: string | null;
    // Phase 2 credential safety: mirrored here (and in the auth:user cache
    // projection below) so GET /api/auth/me reflects the flag and the
    // client's post-login routing never acts on a stale value.
    mustChangePassword: boolean;
  };
}

// Phase A RBAC hierarchy: ultimate_admin is the top tier and inherits every
// super_admin capability. This is the SINGLE place that defines the
// inheritance — all ad-hoc `role === 'super_admin'` checks across the server
// must go through this helper so a future role change can't silently lock
// ultimate_admin out of (or into) anything.
export function hasSuperAdminAccess(user: { role?: string } | undefined | null): boolean {
  return !!user && (user.role === "super_admin" || user.role === "ultimate_admin");
}

// Multi-tenancy (Phase 1) tenant scope resolution.
//
// ROLE-FIRST, never null-first: ultimate_admin is unscoped BY ROLE (returns
// null). A scoped admin role (super_admin / event_admin /
// registration_committee) with a NULL symposium_id is a data-integrity
// defect — this throws instead of silently returning null (which callers
// would misread as "unscoped"). Fail-closed by construction.
//
// NOTE: currently no callers — kept as the canonical pure-function contract
// for future use. Do not "simplify" it back to `?? null`.
export function getTenantScope(
  user: { role?: string; symposiumId?: string | null } | undefined | null,
): string | null {
  if (!user) return null;
  if (user.role === "ultimate_admin") return null;
  if (!user.symposiumId) {
    throw new Error(
      `[data-integrity] ${user.role} user has NULL symposium_id — denying unscoped access`
    );
  }
  return user.symposiumId;
}

// Data-integrity alert: a scoped admin role reached an isolation check with
// NULL symposium_id. This must never happen (migration 005 backfills;
// migration 006 adds a CHECK constraint; provisioning stamps it). Log loudly
// so it gets investigated, then deny.
export function logNullScopeAlert(req: AuthRequest): void {
  const u = req.user!;
  console.error(
    `[data-integrity] ALERT: ${u.role} user ${u.id} (${u.username}) has NULL symposium_id. ` +
    `Treating as error state (403), NOT as unscoped access.`
  );
}

// Fail-closed guard for tenant-scoped routes. Returns the symposium id to
// scope queries by, or null for ultimate_admin (unscoped BY ROLE). A
// non-ultimate caller with no symposium_id is a provisioning defect — logs a
// data-integrity alert and 403s here instead of leaking cross-tenant data.
// When the response has been sent (403), returns undefined and the caller
// MUST `return` immediately.
export function assertTenantScope(req: AuthRequest, res: Response): string | null | undefined {
  const u = req.user!;
  if (u.role === "ultimate_admin") return null;
  if (!u.symposiumId) {
    logNullScopeAlert(req);
    res.status(403).json({ message: "Account is not assigned to a symposium" });
    return undefined;
  }
  return u.symposiumId;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ message: "Authentication required (No Token Provided)" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string; eventId?: string };
    // Track-3: cache the projected user row in Redis (20s TTL) to eliminate
    // a Neon round-trip on every request — answer saves hit this
    // ~40/min/user at peak. The password hash is never cached; req.user
    // only needs id/username/email/fullName/role/symposiumId plus the
    // mustChangePassword flag (drives forced-change routing client-side).
    // Both this key (auth:user:) and the /me key (auth:me:) must be dropped
    // together — use invalidateUserCache, never delete one key alone.
    const authUser = await cacheService.get(
      `auth:user:${decoded.id}`,
      async () => {
        const u = await storage.getUser(decoded.id);
        if (!u) return null;
        return { id: u.id, username: u.username, email: u.email, fullName: u.fullName, role: u.role, symposiumId: u.symposiumId ?? null, mustChangePassword: !!u.mustChangePassword };
      },
      AUTH_USER_CACHE_TTL_SECONDS,
    );

    if (!authUser) {
      return res.status(401).json({ message: `User not found (ID: ${decoded.id})` });
    }

    req.user = {
      id: authUser.id,
      username: authUser.username,
      email: authUser.email,
      fullName: authUser.fullName,
      role: authUser.role,
      symposiumId: authUser.symposiumId ?? null,
      mustChangePassword: !!authUser.mustChangePassword,
      eventId: decoded.eventId
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Invalidate BOTH auth cache keys for a user. GET /api/auth/me caches the
// req.user projection under auth:me:<id> (60s), while requireAuth caches the
// same projection under auth:user:<id> (20s). Deleting only one leaves the
// other serving stale profile/flag data — every credential, role, or
// profile write must go through this helper.
export async function invalidateUserCache(userId: string): Promise<void> {
  await cacheService.delete(`auth:user:${userId}`);
  await cacheService.delete(`auth:me:${userId}`);
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!hasSuperAdminAccess(req.user)) {
    return res.status(403).json({ message: "Super Admin access required" });
  }

  next();
}

// Strict: ONLY ultimate_admin. Used for white-label branding administration
// and anything else that must never be reachable by a standard super_admin.
export function requireUltimateAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "ultimate_admin") {
    return res.status(403).json({ message: "Ultimate Admin access required" });
  }

  next();
}

export function requireEventAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "event_admin" && !hasSuperAdminAccess(req.user)) {
    return res.status(403).json({ message: `Event Admin access required (Current Role: ${req.user.role})` });
  }

  next();
}

export function requireParticipant(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "participant") {
    return res.status(403).json({ message: "Participant access required" });
  }

  next();
}

export function requireRegistrationCommittee(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.role !== "registration_committee" && !hasSuperAdminAccess(req.user)) {
    return res.status(403).json({ message: "Registration Committee access required" });
  }

  next();
}

// Multi-tenancy (Phase 1): symposium_id of an event is immutable after
// creation (no route may ever update it), so it is safe to cache long.
// Used to scope the super_admin bypass in the access middlewares without
// a DB round-trip on every request. Returns null when the event is gone.
async function getEventSymposiumId(eventId: string): Promise<string | null> {
  return cacheService.get(
    `event:symposium:${eventId}`,
    async () => {
      const e = await storage.getEvent(eventId);
      return e ? (e.symposiumId ?? null) : null;
    },
    3600,
  );
}

// Cross-symposium denial message shared by the access middlewares.
function crossSymposium(res: Response) {
  return res.status(403).json({ message: "Event belongs to a different symposium" });
}

export async function requireEventAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const eventId = req.params.eventId || req.params.id;

  // ultimate_admin keeps the global bypass — unscoped by design (Phase 1).
  if (req.user.role === "ultimate_admin") {
    return next();
  }

  if (hasSuperAdminAccess(req.user)) {
    // Scoped super_admin: the old global bypass is now symposium-scoped.
    // Role-first: ultimate_admin returned above by role. A super_admin with
    // NULL symposium_id is a data-integrity defect — log + deny, never treat
    // as unscoped.
    if (!eventId) {
      return res.status(403).json({ message: "Cannot determine event scope" });
    }
    const symposiumId = await getEventSymposiumId(eventId);
    if (!symposiumId) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (symposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }
    return next();
  }

  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  if (req.user.role === "event_admin") {
    const admins = await storage.getEventAdminsByEvent(eventId);
    const isAssigned = admins.some(admin => admin.id === req.user!.id);

    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this event" });
    }

    // Explicit cross-symposium check: assignment alone must not leak across
    // tenant boundaries (defense in depth — the assignment route also
    // enforces same-symposium on both sides). An event_admin with NULL
    // symposium_id is a data-integrity defect — log + deny.
    const symposiumId = await getEventSymposiumId(eventId);
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (symposiumId && symposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }

    return next();
  }

  if (req.user.role === "participant") {
    const participant = await storage.getParticipantByUserAndEvent(req.user.id, eventId);

    if (!participant) {
      return res.status(403).json({ message: "You are not registered for this event" });
    }

    return next();
  }

  return res.status(403).json({ message: "Access denied" });
}

export async function requireRoundAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // ultimate_admin keeps the global bypass — unscoped by design (Phase 1).
  if (req.user.role === "ultimate_admin") {
    return next();
  }

  const roundId = req.params.roundId;
  if (!roundId) {
    return res.status(400).json({ message: "Round ID is required" });
  }

  const round = await storage.getRound(roundId);
  if (!round) {
    return res.status(404).json({ message: "Round not found" });
  }

  // Multi-tenancy: resolve the round's symposium once, reuse for every role.
  const symposiumId = await getEventSymposiumId(round.eventId);

  if (hasSuperAdminAccess(req.user)) {
    // Scoped super_admin: the old global bypass is now symposium-scoped.
    // NULL symposium_id on a super_admin is a data-integrity defect.
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (!symposiumId || symposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }
    return next();
  }

  if (req.user.role === "event_admin") {
    // Track-2: single indexed lookup on (admin_id, event_id) instead of
    // fetching every assigned admin and scanning in JS.
    const isAssigned = await storage.isUserEventAdmin(req.user.id, round.eventId);

    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this event" });
    }

    // Explicit cross-symposium check (defense in depth). NULL symposium_id
    // on an event_admin is a data-integrity defect — log + deny.
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (symposiumId && symposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }

    return next();
  }

  // Allow participants who have an attempt in this round to access round info
  // This is needed for checking if round is paused/ended during the test
  if (req.user.role === "participant") {
    // Track-2: single indexed lookup on the (user_id, round_id) unique
    // constraint instead of SELECT *-ing every attempt in the round and
    // scanning in JS (polled every 5s by monitors/dashboards).
    const attempt = await storage.getTestAttemptByUserAndRound(req.user.id, roundId);

    if (attempt) {
      return next();
    }

    // Also allow if participant is registered for this event.
    // Track-2: single indexed lookup on the (user_id, event_id) unique
    // constraint instead of fetching all event participants and scanning.
    const participant = await storage.getParticipantByUserAndEvent(req.user.id, round.eventId);
    if (participant) {
      return next();
    }
  }

  return res.status(403).json({ message: "Access denied" });
}

export async function requireEventAdminOrSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // ultimate_admin keeps the global bypass — unscoped by design (Phase 1).
  if (req.user.role === "ultimate_admin") {
    return next();
  }

  // Try to get eventId from params, or derive it from roundId
  let eventId = req.params.eventId;

  // If no eventId but we have roundId, get eventId from the round
  if (!eventId && req.params.roundId) {
    const round = await storage.getRound(req.params.roundId);
    if (round) {
      eventId = round.eventId;
    }
  }

  // SEC-04: routes like /api/attempts/:attemptId/* and
  // /api/answers/:answerId/evaluate carry no eventId/roundId, so the check
  // below used to degrade to "any event_admin". Derive the event via
  // attempt -> round -> event (or answer -> attempt -> round -> event).
  if (!eventId && req.params.attemptId) {
    const attempt = await storage.getTestAttempt(req.params.attemptId);
    if (attempt) {
      const round = await storage.getRound(attempt.roundId);
      if (round) {
        eventId = round.eventId;
      }
    }
  }

  if (!eventId && req.params.answerId) {
    const answer = await storage.getAnswer(req.params.answerId);
    if (answer) {
      const attempt = await storage.getTestAttempt(answer.attemptId);
      if (attempt) {
        const round = await storage.getRound(attempt.roundId);
        if (round) {
          eventId = round.eventId;
        }
      }
    }
  }

  if (hasSuperAdminAccess(req.user)) {
    // Scoped super_admin: the old global bypass is now symposium-scoped.
    // Routes with no derivable event (e.g. /api/upload/question-image)
    // touch no tenant data — the tenant binding happens when the uploaded
    // asset is attached via an event-scoped route.
    // NULL symposium_id on a super_admin is a data-integrity defect.
    if (!eventId) {
      if (!req.user.symposiumId) {
        logNullScopeAlert(req);
        return res.status(403).json({ message: "Account is not assigned to a symposium" });
      }
      return next();
    }
    const superSymposiumId = await getEventSymposiumId(eventId);
    if (!superSymposiumId) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (superSymposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }
    return next();
  }

  // For routes without eventId or roundId (like /api/upload/question-image), 
  // just check if the user is an event_admin
  if (!eventId) {
    if (req.user.role === "event_admin") {
      return next();
    }
    return res.status(403).json({ message: "Access denied" });
  }

  if (req.user.role === "event_admin") {
    const admins = await storage.getEventAdminsByEvent(eventId);
    const isAssigned = admins.some(admin => admin.id === req.user!.id);

    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this event" });
    }

    // Explicit cross-symposium check (defense in depth — the assignment
    // route also enforces same-symposium on both sides). NULL symposium_id
    // on an event_admin is a data-integrity defect — log + deny.
    const adminSymposiumId = await getEventSymposiumId(eventId);
    if (!req.user.symposiumId) {
      logNullScopeAlert(req);
      return crossSymposium(res);
    }
    if (adminSymposiumId && adminSymposiumId !== req.user.symposiumId) {
      return crossSymposium(res);
    }

    return next();
  }

  return res.status(403).json({ message: "Access denied" });
}
