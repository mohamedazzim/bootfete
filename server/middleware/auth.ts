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
    // only needs id/username/email/fullName/role.
    const authUser = await cacheService.get(
      `auth:user:${decoded.id}`,
      async () => {
        const u = await storage.getUser(decoded.id);
        if (!u) return null;
        return { id: u.id, username: u.username, email: u.email, fullName: u.fullName, role: u.role };
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
      eventId: decoded.eventId
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
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

export async function requireEventAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (hasSuperAdminAccess(req.user)) {
    return next();
  }

  const eventId = req.params.eventId || req.params.id;
  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  if (req.user.role === "event_admin") {
    const admins = await storage.getEventAdminsByEvent(eventId);
    const isAssigned = admins.some(admin => admin.id === req.user!.id);

    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this event" });
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

  if (hasSuperAdminAccess(req.user)) {
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

  if (req.user.role === "event_admin") {
    // Track-2: single indexed lookup on (admin_id, event_id) instead of
    // fetching every assigned admin and scanning in JS.
    const isAssigned = await storage.isUserEventAdmin(req.user.id, round.eventId);

    if (!isAssigned) {
      return res.status(403).json({ message: "You are not assigned to this event" });
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

  if (hasSuperAdminAccess(req.user)) {
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

    return next();
  }

  return res.status(403).json({ message: "Access denied" });
}
