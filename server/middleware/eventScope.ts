/**
 * Event-scope authorization middleware.
 *
 * Ensures event_admin users can only access resources belonging to
 * their assigned events. Superadmins bypass (global scope).
 * Other roles are denied unless explicitly allowed.
 *
 * Usage:
 *   app.get("/api/events/:eventId/leaderboard",
 *     requireAuth,
 *     requireEventScope("eventId"),  // reads event ID from req.params
 *     handler);
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";

interface AuthRequest extends Request {
  user?: { id: string; role: string };
  params: Record<string, string>;
}

/**
 * Middleware factory: enforce that the event ID in `paramName`
 * belongs to the authenticated event_admin's assigned events.
 *
 * - super_admin: allowed (global)
 * - event_admin: allowed only if event is in their assigned list
 * - all other roles: 403
 */
export function requireEventScope(paramName: string = "eventId") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Superadmin has global scope
      if (user.role === "super_admin") {
        return next();
      }

      // Only event_admin gets event-scoped access via this middleware
      if (user.role !== "event_admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const eventId = req.params[paramName];
      if (!eventId) {
        return res.status(400).json({ message: "Event ID required" });
      }

      // Verify event exists (404 to avoid enumeration distinction)
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Verify admin is assigned to this event
      const myEvents = await storage.getEventsByAdmin(user.id);
      const authorized = myEvents.some((e: any) => e.id === eventId);

      if (!authorized) {
        return res.status(403).json({ message: "Access denied" });
      }

      next();
    } catch (error) {
      console.error("Event scope check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
}

/**
 * Helper: check if an event_admin is authorized for a given event ID.
 * Returns true for super_admin (global), checks assignment for event_admin.
 */
export async function isEventAuthorized(
  userId: string,
  role: string,
  eventId: string
): Promise<boolean> {
  if (role === "super_admin") return true;
  if (role !== "event_admin") return false;

  const myEvents = await storage.getEventsByAdmin(userId);
  return myEvents.some((e: any) => e.id === eventId);
}
