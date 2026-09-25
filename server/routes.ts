import express, { type Express, Request, Response } from "express"
import { createServer, type Server } from "http"
import { storage } from "./storage"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { nanoid } from "nanoid"
import PDFDocument from "pdfkit"
import ExcelJS from "exceljs"
import QRCode from "qrcode"
import { cacheService } from "./services/cacheService"
import { redisClient } from "./services/redisClient"
import { z } from "zod"
import { insertUserSchema, insertEventSchema, insertEventRulesSchema, insertRoundSchema, insertRoundRulesSchema, insertQuestionSchema, insertParticipantSchema, insertTestAttemptSchema, insertAnswerSchema, insertReportSchema, insertRegistrationFormSchema, insertRegistrationSchema, insertEventCredentialSchema, PAPER_PRESENTATION_TOPICS, FOOD_TYPES, users, registrations, teamMembers, participantRegistry, eventCredentials, testAttempts, participants } from "@shared/schema"
import { db } from "./db"
import { eq, and, inArray } from "drizzle-orm"
import {
  requireAuth,
  requireSuperAdmin,
  requireEventAdmin,
  requireParticipant,
  requireEventAccess,
  requireRoundAccess,
  requireRegistrationCommittee,
  requireEventAdminOrSuperAdmin,
  type AuthRequest,
} from "./middleware/auth"
import { loginLimiter, publicApiLimiter } from "./middleware/rateLimit"
import { emailService } from "./services/emailService"
import { WebSocketService } from "./services/websocketService"
import fs from "fs";
import path from "path";
import multer from "multer";
import { log } from "./vite"
import { setIO, io as socketIo } from "./websocket"
import { queueService } from "./services/queueService"

const JWT_SECRET = process.env.JWT_SECRET || "symposium-secret-key-change-in-production"

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production environment")
}

// Multer configuration for question image uploads
const questionImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'questions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `question-${uniqueSuffix}${ext}`);
  }
});

const uploadQuestionImage = multer({
  storage: questionImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP allowed.'));
    }
  }
});

function generateFormSlug(eventName: string): string {
  const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `${slug}-${nanoid(8)}`
}

function generateSecurePassword(): string {
  return crypto.randomBytes(12).toString("base64").slice(0, 16)
}

function generateHumanReadableCredentials(
  fullName: string,
  eventName: string,
  counter: number,
): { username: string; password: string } {
  const firstName = fullName.split(" ")[0]
  const cleanEventName = eventName.toLowerCase().replace(/[^a-z0-9]/g, "")

  const eventPrefix = cleanEventName.substring(0, 3)
  const namePrefix = firstName.toLowerCase().substring(0, 4)
  const passwordPrefix = firstName.substring(0, 3)
  const capitalizedPasswordPrefix = passwordPrefix.charAt(0).toUpperCase() + passwordPrefix.slice(1).toLowerCase()

  return {
    username: `${eventPrefix}${namePrefix}${counter}`,
    password: `${capitalizedPasswordPrefix}@${counter}`,
  }
}

async function generateUniqueEventCredentials(
  fullName: string,
  eventName: string,
  baseCounter: number,
): Promise<{ username: string; password: string }> {
  let counter = baseCounter
  let maxAttempts = 100

  while (maxAttempts > 0) {
    const credentials = generateHumanReadableCredentials(fullName, eventName, counter)
    const existing = await storage.getEventCredentialByUsername(credentials.username)

    if (!existing) {
      return credentials
    }

    counter++
    maxAttempts--
  }

  const randomSuffix = nanoid(4)
  const firstName = fullName.split(" ")[0]
  const cleanEventName = eventName.toLowerCase().replace(/[^a-z0-9]/g, "")
  const eventPrefix = cleanEventName.substring(0, 3)
  const namePrefix = firstName.toLowerCase().substring(0, 4)
  const passwordPrefix = firstName.substring(0, 3)
  const capitalizedPasswordPrefix = passwordPrefix.charAt(0).toUpperCase() + passwordPrefix.slice(1).toLowerCase()

  return {
    username: `${eventPrefix}${namePrefix}${randomSuffix}`,
    password: `${capitalizedPasswordPrefix}@${baseCounter}`,
  }
}

function timesOverlap(start1: Date | null, end1: Date | null, start2: Date | null, end2: Date | null): boolean {
  if (!start1 || !end1 || !start2 || !end2) return false
  return start1 < end2 && start2 < end1
}

async function validateEventSelection(eventIds: string[]): Promise<{ valid: boolean; error?: string }> {
  if (eventIds.length === 0) {
    return { valid: false, error: "At least one event must be selected" }
  }

  const events = await storage.getEventsByIds(eventIds)

  if (events.length !== eventIds.length) {
    return { valid: false, error: "One or more selected events not found" }
  }

  const technical = events.filter((e) => e.category === "technical")
  const nonTechnical = events.filter((e) => e.category === "non_technical")

  if (technical.length > 1) {
    return { valid: false, error: "Only one technical event can be selected" }
  }
  if (nonTechnical.length > 1) {
    return { valid: false, error: "Only one non-technical event can be selected" }
  }

  // Check for events with the same start time (event-level conflict)
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const e1 = events[i]
      const e2 = events[j]

      // Check if both events have the same start date/time
      if (e1.startDate && e2.startDate) {
        const e1StartTime = new Date(e1.startDate).getTime()
        const e2StartTime = new Date(e2.startDate).getTime()
        if (e1StartTime === e2StartTime) {
          return { valid: false, error: `Events "${e1.name}" and "${e2.name}" have the same start time and cannot be selected together` }
        }
      }

      // Also check round-level overlaps
      const e1Rounds = await storage.getRoundsByEvent(e1.id)
      const e2Rounds = await storage.getRoundsByEvent(e2.id)

      for (const r1 of e1Rounds) {
        for (const r2 of e2Rounds) {
          if (timesOverlap(r1.startTime, r1.endTime, r2.startTime, r2.endTime)) {
            return { valid: false, error: `Events "${e1.name}" and "${e2.name}" have overlapping times` }
          }
        }
      }
    }
  }

  return { valid: true }
}

async function logSuperAdminAction(
  adminId: string,
  adminUsername: string,
  action: string,
  targetType: string,
  targetId: string,
  targetName: string | null,
  changes: any | null,
  reason: string | null,
  ipAddress: string | null,
) {
  await storage.createAuditLog({
    adminId,
    adminUsername,
    action,
    targetType,
    targetId,
    targetName,
    changes,
    reason,
    ipAddress,
  })
}

const getClientIp = (req: Request) => {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.headers["x-real-ip"]?.toString() ||
    req.connection.remoteAddress ||
    null
  )
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "BootFete 2K26 API is running" });
  });

  app.get("/api/users", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getUsers()
      const usersWithoutPasswords = users.map(({ password, ...user }) => user)
      res.json(usersWithoutPasswords)
    } catch (error) {
      console.error("Get users error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch("/api/users/:id/credentials", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { username, email, password, fullName } = req.body

      if (!username && !email && !password && !fullName) {
        return res.status(400).json({ message: "At least one field (username, email, password, or fullName) must be provided" })
      }

      const updates: any = {}
      if (username !== undefined) updates.username = username
      if (email !== undefined) updates.email = email
      if (fullName !== undefined) updates.fullName = fullName
      if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 8) {
          return res.status(400).json({ message: "Password must be at least 8 characters" })
        }
        const hashedPassword = await bcrypt.hash(password, 10)
        updates.password = hashedPassword
      }

      const user = await storage.updateUserCredentials(req.params.id, updates)
      if (!user) {
        return res.status(404).json({ message: "User not found" })
      }

      const { password: _, ...userWithoutPassword } = user
      res.json({
        message: "User credentials updated successfully",
        user: userWithoutPassword,
      })
    } catch (error: any) {
      console.error("Update user credentials error:", error)
      if (error.message === "Username already exists" || error.message === "Email already exists") {
        return res.status(400).json({ message: error.message })
      }
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.delete("/api/users/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const targetId = req.params.id

      // Safety guards: a super admin cannot delete their own account, and the
      // last remaining super admin can never be deleted.
      if (targetId === req.user!.id) {
        return res.status(400).json({ message: "You cannot delete your own account" })
      }

      const targetUser = await storage.getUser(targetId)
      if (targetUser && targetUser.role === "super_admin") {
        const allUsers = await storage.getUsers()
        const superAdminCount = allUsers.filter((u) => u.role === "super_admin").length
        if (superAdminCount <= 1) {
          return res.status(400).json({ message: "Cannot delete the last Super Admin" })
        }
      }

      await storage.deleteUser(targetId)
      res.json({ message: "User deleted successfully" })
    } catch (error) {
      console.error("Delete user error:", error)
      res.status(500).json({ message: "Failed to delete user" })
    }
  })

  app.get("/api/admin/orphaned-admins", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const orphanedAdmins = await storage.getOrphanedEventAdmins()
      const adminsWithoutPasswords = orphanedAdmins.map(({ password, ...admin }) => admin)
      res.json(adminsWithoutPasswords)
    } catch (error) {
      console.error("Get orphaned admins error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/admin/system-settings", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const from = emailService.getFromAddress();
      const activeProvider = emailService.getActiveProvider();
      res.json({
        email: {
          provider: activeProvider,
          configured: true,
          host: activeProvider === 'brevo' ? 'api.brevo.com' : 'api.resend.com',
          user: activeProvider,
          from: `${from.name} <${from.email}>`,
        }
      })
    } catch (error) {
      console.error("Get system settings error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // --- Monitoring Dashboard Endpoints ---

  app.get('/api/admin/status', requireAuth, requireSuperAdmin, (req, res) => {
    res.json({
      instance_id: process.env.INSTANCE_ID || 'standalone',
      uptime_seconds: Math.round(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      cpu_percent: 0 // Node.js doesn't expose CPU usage easily without extra libs, placeholder
    });
  });

  app.get('/api/admin/queue-stats', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const stats = await queueService.getQueueStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch queue stats" });
    }
  });

  // --------------------------------------

  app.post("/api/auth/register", publicApiLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password, email, fullName, role } = req.body

      if (!username || !password || !email || !fullName || !role) {
        return res.status(400).json({ message: "All fields are required" })
      }

      // INPUT VALIDATION: Username format
      if (typeof username !== 'string' || username.length < 3 || username.length > 50) {
        return res.status(400).json({ message: "Username must be 3-50 characters" })
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, underscores, and hyphens" })
      }

      // INPUT VALIDATION: Password strength
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" })
      }

      // INPUT VALIDATION: Email format
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" })
      }

      // INPUT VALIDATION: Full name
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        return res.status(400).json({ message: "Full name must be at least 2 characters" })
      }

      const validRoles = ["super_admin", "event_admin", "participant", "registration_committee"]
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" })
      }

      // SECURITY: privileged accounts must only ever be created by a Super Admin.
      // Public/self-registration is restricted to the participant role.
      if (role !== "participant") {
        const token = req.headers.authorization?.replace("Bearer ", "")
        if (!token) {
          return res.status(401).json({ message: "Authentication required to create admin accounts" })
        }

        let adminUserId: string
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as { id: string }
          adminUserId = decoded.id
        } catch {
          return res.status(401).json({ message: "Invalid or expired token" })
        }

        const adminUser = await storage.getUser(adminUserId)
        if (!adminUser || adminUser.role !== "super_admin") {
          return res.status(403).json({ message: "Super Admin access required to create admin accounts" })
        }
      }

      const existingUser = await storage.getUserByUsername(username)
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" })
      }

      const existingEmail = await storage.getUserByEmail(email)
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" })
      }

      const hashedPassword = await bcrypt.hash(password, 10)

      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        fullName: fullName.trim(),
        role,
      } as any)

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" })

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        token,
      })
    } catch (error) {
      console.error("Registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" })
      }

      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ message: "Invalid credentials format" })
      }

      // First, try event credential login (for participants)
      const eventCredential = await storage.getEventCredentialByUsername(username)
      if (eventCredential) {
        // Check if password is a bcrypt hash (starts with $2a$, $2b$, or $2y$ and is 60 chars)
        const storedPassword = eventCredential.eventPassword
        const isBcryptHash = storedPassword.length === 60 && storedPassword.startsWith('$2')

        let isValidPassword = false
        if (isBcryptHash) {
          // Compare with bcrypt for hashed passwords
          isValidPassword = await bcrypt.compare(password, storedPassword)
        } else {
          // Plain text comparison for legacy passwords
          isValidPassword = password === storedPassword
        }

        if (!isValidPassword) {
          return res.status(401).json({ message: "Invalid credentials" })
        }

        const user = await storage.getUser(eventCredential.participantUserId)
        if (!user) {
          return res.status(401).json({ message: "Invalid credentials" })
        }

        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role, eventId: eventCredential.eventId },
          JWT_SECRET,
          { expiresIn: "7d" },
        )

        return res.json({
          message: "Login successful",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            eventId: eventCredential.eventId,
          },
          token,
        })
      }

      // If not event credential, try regular user login (by username or email)
      let user = await storage.getUserByUsername(username)
      if (!user) {
        user = await storage.getUserByEmail(username)
      }
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      const isValidPassword = await bcrypt.compare(password, user.password)
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" })
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" })

      res.json({
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        token,
      })
    } catch (error) {
      console.error("Login error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;

      // Check cache first (60 second cache for user data)
      const cacheKey = `auth:me:${user.id}`;
      const cachedUser = await cacheService.get(
        cacheKey,
        async () => user,
        60
      );

      res.json(cachedUser);
    } catch (error) {
      console.error("Get auth/me error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  })

  app.get(
    "/api/participants/my-credential",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!;
        const allCredentials = await storage.getEventCredentialsByParticipant(user.id);
        const registeredEvents = await Promise.all(allCredentials.map(async (c) => {
          const ev = await storage.getEvent(c.eventId);
          return { id: c.eventId, name: ev?.name || 'Event' };
        }));

        let eventId = (req.query.eventId as string) || user.eventId;

        // Determine which event to use
        if (!eventId) {
          if (allCredentials.length === 0) {
            return res.status(400).json({ message: "No event associated with this user" });
          }
          eventId = allCredentials[0].eventId;
        }

        // Check cache first (5 minute cache)
        const cacheKey = `participant:credential:${user.id}:${eventId}`;
        const response = await cacheService.get(
          cacheKey,
          async () => {
            const data = await storage.getParticipantCredentialWithDetails(user.id, eventId);

            if (!data) {
              throw new Error("Event credential not found");
            }

            const { credential, event, rounds, eventRules, activeRoundRules } = data;

            return {
              credential: {
                id: credential.id,
                eventUsername: credential.eventUsername,
                testEnabled: credential.testEnabled,
                enabledAt: credential.enabledAt,
              },
              event: {
                id: event.id,
                name: event.name,
                description: event.description,
                type: event.type,
                category: event.category,
              },
              rounds: rounds.map((round: any) => ({
                id: round.id,
                name: round.name,
                duration: round.duration,
                startTime: round.startTime,
                endTime: round.endTime,
                status: round.status,
              })),
              eventRules: {
                noRefresh: eventRules?.noRefresh,
                noTabSwitch: eventRules?.noTabSwitch,
                forceFullscreen: eventRules?.forceFullscreen,
                disableShortcuts: eventRules?.disableShortcuts,
                autoSubmitOnViolation: eventRules?.autoSubmitOnViolation,
                maxTabSwitchWarnings: eventRules?.maxTabSwitchWarnings,
                additionalRules: eventRules?.additionalRules,
              },
              roundRules: activeRoundRules
                ? {
                  noRefresh: activeRoundRules.noRefresh,
                  noTabSwitch: activeRoundRules.noTabSwitch,
                  forceFullscreen: activeRoundRules.forceFullscreen,
                  disableShortcuts: activeRoundRules.disableShortcuts,
                  autoSubmitOnViolation: activeRoundRules.autoSubmitOnViolation,
                  maxTabSwitchWarnings: activeRoundRules.maxTabSwitchWarnings,
                  additionalRules: activeRoundRules.additionalRules,
                }
                : null,
              allEvents: registeredEvents,
            };
          },
          30 // Reduced from 300s to 30s for faster round status updates
        );

        res.json(response);
      } catch (error) {
        console.error("Get participant credential error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.patch("/api/participants/:participantId/disqualify", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId } = req.params

      // Authorization: only the participant themselves (proctoring self-elimination)
      // or an assigned event admin / super admin may disqualify.
      const existing = await storage.getParticipant(participantId)
      if (!existing) {
        return res.status(404).json({ message: "Participant not found" })
      }

      const user = req.user!
      const isAdmin = user.role === "super_admin" ||
        (user.role === "event_admin" && (await storage.isUserEventAdmin(user.id, existing.eventId)))

      if (!isAdmin && existing.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" })
      }

      const participant = await storage.updateParticipantStatus(participantId, "disqualified")

      if (!participant) {
        return res.status(404).json({ message: "Participant not found" })
      }

      // Mark all test attempts for this participant in this event as disqualified
      const eventRounds = await storage.getRoundsByEvent(existing.eventId);
      const roundIds = eventRounds.map(r => r.id);
      if (roundIds.length > 0) {
        await db.update(testAttempts)
          .set({ status: "disqualified", totalScore: 0 })
          .where(and(
            eq(testAttempts.userId, existing.userId),
            inArray(testAttempts.roundId, roundIds)
          ));
      }
      await cacheService.deletePattern('leaderboard:*');

      res.json({
        message: "Participant disqualified successfully",
        participant,
      })
    } catch (error) {
      console.error("Disqualify participant error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get all events
  app.get("/api/events", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role === "super_admin" || req.user!.role === "registration_committee") {
        const events = await cacheService.get(
          'events:list:all',
          () => storage.getEvents(),
          3600
        );
        res.json(events)
      } else if (req.user!.role === "event_admin") {
        const events = await cacheService.get(
          `events:list:admin:${req.user!.id}`,
          () => storage.getEventsByAdmin(req.user!.id),
          3600
        );
        res.json(events)
      } else if (req.user!.role === "participant") {
        const allEvents = await cacheService.get(
          'events:list:active',
          async () => {
            const all = await storage.getEvents();
            return all.filter((e) => e.status === "active");
          },
          3600
        );
        res.json(allEvents)
      } else {
        res.json([])
      }
    } catch (error) {
      console.error("Get events error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/events/unassigned", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getEventsWithoutAdmins()
      res.json(events)
    } catch (error) {
      console.error("Get unassigned events error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/events/for-registration", async (req: Request, res: Response) => {
    try {
      const activeForm = await storage.getActiveRegistrationForm()

      if (!activeForm) {
        return res.status(404).json({ message: "No active registration form found" })
      }

      const allEvents = await storage.getEvents()

      const allowedEvents = allEvents.filter((event) => activeForm.allowedCategories.includes(event.category))

      const eventsWithRounds = await Promise.all(
        allowedEvents.map(async (event) => {
          const rounds = await storage.getRoundsByEvent(event.id)
          return {
            id: event.id,
            name: event.name,
            description: event.description,
            category: event.category,
            startDate: event.startDate,
            endDate: event.endDate,
            minMembers: event.minMembers,
            maxMembers: event.maxMembers,
            rounds: rounds.map((r) => ({
              id: r.id,
              name: r.name,
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          }
        }),
      )
      res.json(eventsWithRounds)
    } catch (error) {
      console.error("Get events for registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/events/public/:id", async (req: Request, res: Response) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      // Whitelist public fields â€” no internal metadata (createdBy, etc.)
      const { createdBy: _createdBy, ...publicEvent } = event;
      res.json(publicEvent);
    } catch (error) {
      console.error("Get public event error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/events/for-registration-grouped", async (req: Request, res: Response) => {
    try {
      const activeForm = await storage.getActiveRegistrationForm()
      if (!activeForm) {
        return res.status(404).json({ message: "No active registration form found" })
      }

      const allEvents = await storage.getEvents()
      const allowedEvents = allEvents.filter((event) => activeForm.allowedCategories.includes(event.category))

      const eventsWithRounds = await Promise.all(
        allowedEvents.map(async (event) => {
          const rounds = await storage.getRoundsByEvent(event.id)
          return {
            id: event.id,
            name: event.name,
            description: event.description,
            category: event.category,
            minMembers: event.minMembers,
            maxMembers: event.maxMembers,
            rounds: rounds.map((r) => ({
              id: r.id,
              name: r.name,
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          }
        }),
      )

      const technical = eventsWithRounds.filter((e) => e.category === "technical")
      const non_technical = eventsWithRounds.filter((e) => e.category === "non_technical")

      return res.json({ technical, non_technical })
    } catch (error) {
      console.error("Get grouped events for registration error:", error)
      return res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get event details
  app.get("/api/events/:id", requireAuth, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const eventId = req.params.id;
      const event = await cacheService.get(
        `event:${eventId}`,
        () => storage.getEvent(eventId),
        1800
      );

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Get event error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Create event
  app.post("/api/events", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, type, category, startDate, endDate, status, minMembers, maxMembers } = req.body

      // Dev log: incoming payload category
      try { console.log(`Create event payload category: ${category}`) } catch (e) { }

      if (!name || !description || !type) {
        return res.status(400).json({ message: "Name, description, and type are required" })
      }

      if (category !== undefined && !["technical", "non_technical"].includes(category)) {
        return res.status(400).json({ message: "Invalid category. Must be 'technical' or 'non_technical'." })
      }

      const existingEvent = await storage.getEventByName(name)
      if (existingEvent) {
        return res.status(400).json({ message: "An event with this name already exists" })
      }

      // VALIDATION FIX: Verify start/end dates are valid and in proper order
      if (startDate && endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        if (start >= end) {
          return res.status(400).json({ message: "Event start date must be before end date" })
        }
        if (start < new Date()) {
          return res.status(400).json({ message: "Event start date cannot be in the past" })
        }
      }

      // Team size validation
      if (minMembers !== undefined && maxMembers !== undefined) {
        if (minMembers > maxMembers) {
          return res.status(400).json({ message: "Minimum members cannot be greater than maximum members" })
        }
        if (minMembers < 1) {
          return res.status(400).json({ message: "Minimum members must be at least 1" })
        }
      }

      const event = await storage.createEvent({
        name,
        description,
        type,
        category: category ?? "technical",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status || "draft",
        minMembers: minMembers || 1,
        maxMembers: maxMembers || 1,
        createdBy: req.user!.id,
      })

      // Dev log: what was stored
      try { console.log(`Event created: id=${event.id} category=${event.category} name=${event.name}`) } catch (e) { }

      await storage.createEventRules({
        eventId: event.id,
        noRefresh: true,
        noTabSwitch: true,
        forceFullscreen: true,
        disableShortcuts: true,
        autoSubmitOnViolation: true,
        maxTabSwitchWarnings: 2,
        additionalRules: null,
      })

      // Invalidate cache
      await cacheService.deletePattern('events:list*');

      res.status(201).json(event)
    } catch (error) {
      console.error("Create event error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch("/api/events/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, type, category, startDate, endDate, status, minMembers, maxMembers } = req.body

      try { console.log(`Update event payload for id=${req.params.id} incoming category: ${category}`) } catch (e) { }

      if (name !== undefined) {
        const existingEvent = await storage.getEventByName(name)
        if (existingEvent && existingEvent.id !== req.params.id) {
          return res.status(400).json({ message: "An event with this name already exists" })
        }
      }

      if (category !== undefined && !["technical", "non_technical"].includes(category)) {
        return res.status(400).json({ message: "Invalid category. Must be 'technical' or 'non_technical'." })
      }

      // VALIDATION FIX: Verify start/end dates are valid and in proper order when updating
      if (startDate && endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        if (start >= end) {
          return res.status(400).json({ message: "Event start date must be before end date" })
        }
      }

      // Team size validation
      if (minMembers !== undefined && maxMembers !== undefined) {
        if (minMembers > maxMembers) {
          return res.status(400).json({ message: "Minimum members cannot be greater than maximum members" })
        }
        if (minMembers < 1) {
          return res.status(400).json({ message: "Minimum members must be at least 1" })
        }
      }

      const updateData: any = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (type !== undefined) updateData.type = type
      if (category !== undefined) updateData.category = category
      // BUG-A-08: explicit null clears the date; new Date(null) would store epoch 1970.
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
      if (status !== undefined) updateData.status = status
      if (minMembers !== undefined) updateData.minMembers = minMembers
      if (maxMembers !== undefined) updateData.maxMembers = maxMembers

      const event = await storage.updateEvent(req.params.id, updateData)
      try { console.log(`Event updated: id=${event?.id} category=${event?.category} name=${event?.name}`) } catch (e) { }
      if (!event) {
        return res.status(404).json({ message: "Event not found" })
      }

      // Invalidate cache
      await cacheService.delete(`event:${req.params.id}`);
      await cacheService.deletePattern('events:list*');
      await cacheService.deletePattern('leaderboard:*');

      // Notify via WebSocket
      if (socketIo) {
        socketIo.to(`event:${req.params.id}`).emit('eventUpdate', { eventId: req.params.id, event });
      }

      res.json(event)
    } catch (error) {
      console.error("Update event error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.delete("/api/events/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // SECURITY FIX: Verify event exists before deletion to prevent race conditions
      const event = await storage.getEvent(req.params.id)
      if (!event) {
        return res.status(404).json({ message: "Event not found" })
      }

      // Handle optional admin deletion
      if (req.query.deleteAdmins === 'true') {
        const eventAdmins = await storage.getEventAdminsByEvent(req.params.id);
        for (const admin of eventAdmins) {
          // Check if admin is assigned to other events
          const adminEvents = await storage.getEventsByAdmin(admin.id);
          // If only assigned to this event (length 1 and it's this event), delete user
          if (adminEvents.length === 1 && adminEvents[0].id === req.params.id) {
            await storage.deleteUser(admin.id);
          }
        }
      }

      // Cleanup registrations (remove event ID from selected_events JSON array)
      await storage.removeEventFromRegistrations(req.params.id);

      // CASCADE DELETE BEHAVIOR: Deleting an event automatically deletes eventAdmins (assignments),
      // eventRules, rounds, roundRules, questions, testAttempts, answers, participants, and reports.
      await storage.deleteEvent(req.params.id)

      // Invalidate cache
      await cacheService.delete(`event:${req.params.id}`);
      await cacheService.deletePattern('events:list*');
      await cacheService.deletePattern(`rounds:${req.params.id}*`);
      await cacheService.deletePattern('leaderboard:*');

      res.json({ message: "Event deleted successfully" })
    } catch (error) {
      console.error("Delete event error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post("/api/events/:eventId/admins", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { adminId } = req.body

      if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" })
      }

      const admin = await storage.getUser(adminId)
      if (!admin || admin.role !== "event_admin") {
        return res.status(400).json({ message: "Invalid event admin" })
      }

      await storage.assignEventAdmin(req.params.eventId, adminId)
      res.json({ message: "Event admin assigned successfully" })
    } catch (error) {
      console.error("Assign event admin error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // ...existing code...

  app.get("/api/events/:eventId/admins", requireAuth, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const admins = await storage.getEventAdminsByEvent(req.params.eventId)
      const adminsWithoutPasswords = admins.map(({ password, ...admin }) => admin)
      res.json(adminsWithoutPasswords)
    } catch (error) {
      console.error("Get event admins error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.delete(
    "/api/events/:eventId/admins/:adminId",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.removeEventAdmin(req.params.eventId, req.params.adminId)
        res.json({ message: "Event admin removed successfully" })
      } catch (error) {
        console.error("Remove event admin error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/events/:eventId/rules", requireAuth, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const rules = await storage.getEventRules(req.params.eventId)
      if (!rules) {
        return res.status(404).json({ message: "Event rules not found" })
      }
      res.json(rules)
    } catch (error) {
      console.error("Get event rules error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch("/api/events/:eventId/rules", requireAuth, requireEventAdmin, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const {
        noRefresh,
        noTabSwitch,
        forceFullscreen,
        disableShortcuts,
        autoSubmitOnViolation,
        maxTabSwitchWarnings,
        additionalRules,
      } = req.body

      const updateData: any = {}
      if (noRefresh !== undefined) updateData.noRefresh = noRefresh
      if (noTabSwitch !== undefined) updateData.noTabSwitch = noTabSwitch
      if (forceFullscreen !== undefined) updateData.forceFullscreen = forceFullscreen
      if (disableShortcuts !== undefined) updateData.disableShortcuts = disableShortcuts
      if (autoSubmitOnViolation !== undefined) updateData.autoSubmitOnViolation = autoSubmitOnViolation
      if (maxTabSwitchWarnings !== undefined) updateData.maxTabSwitchWarnings = maxTabSwitchWarnings
      if (additionalRules !== undefined) updateData.additionalRules = additionalRules

      const rules = await storage.updateEventRules(req.params.eventId, updateData)
      if (!rules) {
        return res.status(404).json({ message: "Event rules not found" })
      }

      res.json(rules)
    } catch (error) {
      console.error("Update event rules error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get rounds for an event
  app.get("/api/events/:eventId/rounds", requireAuth, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const eventId = req.params.eventId;
      const rounds = await cacheService.get(
        `rounds:${eventId}`,
        () => storage.getRoundsByEvent(eventId),
        900
      );
      res.json(rounds);
    } catch (error) {
      console.error("Get rounds error:", error)
      res.status(500).json({ message: "Failed to fetch rounds" });
    }
  });

  // Create round
  app.post("/api/events/:eventId/rounds", requireAuth, requireEventAdmin, requireEventAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { name, description, roundNumber, duration, startTime, endTime, status, conductMedium, roundType } = req.body

      // STRICT CHECK: Round Number
      if (!name || roundNumber === undefined) {
        return res.status(400).json({ message: "Name and round number are required" })
      }

      if (roundNumber !== 1 && roundNumber !== 2) {
        return res.status(400).json({ message: "Only Round 1 (Prelims) and Round 2 (Finals) are allowed." });
      }

      // Validate roundType
      const validRoundTypes = ['prelims', 'finals'];
      const resolvedRoundType = roundType && validRoundTypes.includes(roundType) ? roundType : 'prelims';

      // Map conductMedium to isManual & Default to 'online'
      const medium = conductMedium || 'online';
      const isManual = medium === 'physical';

      // Validation: Duration required only for online tests
      if (!isManual && !duration) {
        return res.status(400).json({ message: "Duration is required for online rounds" })
      }

      // H-10: explicit allowlist — never spread req.body into the insert, or a
      // client could set id / status / resultsPublished / showAnswers and
      // bypass start-gate validations.
      // Duration is validated above (required for online rounds); default to 0 for manual rounds.
      const resolvedDuration = isManual ? (duration ?? 0) : duration;

      const round = await storage.createRound({
        name,
        description: description || null,
        roundNumber,
        duration: resolvedDuration,
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
        conductMedium: medium,
        isManual,
        roundType: resolvedRoundType,
        eventId: req.params.eventId,
        status: "not_started", // Server-derived: rounds always start as not_started
      });

      await storage.createRoundRules({
        roundId: round.id,
        noRefresh: true,
        noTabSwitch: true,
        forceFullscreen: true,
        disableShortcuts: true,
        autoSubmitOnViolation: true,
        maxTabSwitchWarnings: 2,
        additionalRules: null,
      })

      // Invalidate cache
      await cacheService.delete(`rounds:${req.params.eventId}`);

      res.status(201).json(round)
    } catch (error) {
      console.error("Create round error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/rounds/:roundId", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      const round = await storage.getRound(req.params.roundId)
      if (!round) {
        return res.status(404).json({ message: "Round not found" })
      }
      res.json(round)
    } catch (error) {
      console.error("Get round error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.delete(
    "/api/rounds/:roundId",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId);
        if (!round) {
          return res.status(404).json({ message: "Round not found" });
        }
        await storage.deleteRound(req.params.roundId)

        // Invalidate cache
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern(`questions:${req.params.roundId}*`);
        await cacheService.deletePattern('leaderboard:*');

        res.json({ message: "Round deleted successfully" })
      } catch (error) {
        console.error("Delete round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // Delete all test data (attempts & answers) for a round, keeping the round structure
  app.delete(
    "/api/rounds/:roundId/test-data",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const { roundId } = req.params;
        const round = await storage.getRound(roundId);
        if (!round) {
          return res.status(404).json({ message: "Round not found" });
        }

        // Only super_admin can delete test data (destructive operation)
        if (req.user!.role !== "super_admin") {
          return res.status(403).json({ message: "Only Super Admin can delete test data" });
        }

        const result = await storage.deleteRoundTestData(roundId);

        // Also delete winners for this event (since they're based on test results)
        await storage.deleteEventWinnersByEvent(round.eventId);

        // Reset round status to allow re-running
        await storage.updateRoundStatus(roundId, 'not_started', null);

        // Invalidate caches
        await cacheService.deletePattern(`leaderboard:*`);
        await cacheService.deletePattern(`rounds:${round.eventId}`);
        await cacheService.delete(`round:${roundId}`);
        await cacheService.deletePattern(`winners:${round.eventId}`);

        res.json({
          message: "Test data deleted successfully",
          deletedAttempts: result.deletedAttempts,
          deletedAnswers: result.deletedAnswers
        });
      } catch (error) {
        console.error("Delete test data error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  )

  app.patch(
    "/api/rounds/:roundId",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const { name, description, roundNumber, duration, startTime, endTime, status, conductMedium, roundType } = req.body

        // RESTRICTION: Event Admins cannot update schedule, status, or duration
        // once the round is underway. Pre-start configuration (name, description,
        // duration, etc.) is allowed because the round-edit UI relies on it.
        if (req.user!.role === 'event_admin') {
          const existingRound = await storage.getRound(req.params.roundId);
          if (!existingRound) {
            return res.status(404).json({ message: "Round not found" });
          }

          const roundNotStarted = existingRound.status === 'not_started' || existingRound.status === 'upcoming';
          const allowedKeys = roundNotStarted
            ? ['name', 'description', 'duration', 'roundType', 'conductMedium', 'roundNumber']
            : ['name', 'description'];

          const updateData: any = {};
          for (const key of allowedKeys) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
          }
          if (updateData.conductMedium !== undefined) {
            updateData.isManual = updateData.conductMedium === 'physical';
          }

          const updated = await storage.updateRound(req.params.roundId, updateData);
          if (!updated) {
            return res.status(404).json({ message: "Round not found" });
          }

          await cacheService.delete(`rounds:${updated.eventId}`);
          await cacheService.deletePattern('leaderboard:*');
          return res.json(updated);
        }

        const updateData: any = {}
        if (name !== undefined) updateData.name = name
        if (description !== undefined) updateData.description = description
        if (roundNumber !== undefined) updateData.roundNumber = roundNumber
        if (duration !== undefined) updateData.duration = duration
        // BUG-A-08: explicit null clears the time; new Date(null) would store epoch 1970.
        if (startTime !== undefined) updateData.startTime = startTime ? new Date(startTime) : null
        if (endTime !== undefined) updateData.endTime = endTime ? new Date(endTime) : null
        if (status !== undefined) updateData.status = status
        if (conductMedium !== undefined) {
          updateData.conductMedium = conductMedium;
          updateData.isManual = conductMedium === 'physical';
        }
        if (roundType !== undefined) updateData.roundType = roundType

        const round = await storage.updateRound(req.params.roundId, updateData)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        // Invalidate cache
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');

        res.json(round)
      } catch (error) {
        console.error("Update round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/rounds/:roundId/start",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        if (round.status !== "not_started" && round.status !== "upcoming") {
          return res.status(400).json({ message: "Round can only be started when status is 'not_started' or 'upcoming'" })
        }

        // VALIDATION: Check if round has questions (skip for physical/offline rounds)
        if (round.conductMedium !== 'physical') {
          const questions = await storage.getQuestionsByRound(round.id)
          if (questions.length === 0) {
            return res.status(400).json({ message: "Cannot start round: No questions have been added." })
          }
        }

        // VALIDATION: Check for other active rounds in the same event
        const eventRounds = await storage.getRoundsByEvent(round.eventId)
        const activeRound = eventRounds.find(r => r.status === 'in_progress' && r.id !== round.id)
        if (activeRound) {
          return res.status(409).json({
            message: `Cannot start round: '${activeRound.name}' is currently in progress. Please end it first.`
          })
        }

        // Update round status and schedule if duration provided
        // Update round status and schedule if duration provided
        const duration = req.body.duration ? parseInt(req.body.duration) : round.duration;

        if (!duration || isNaN(duration) || duration <= 0) {
          return res.status(400).json({ message: "A valid positive duration (in minutes) is required to start the round." });
        }

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + duration * 60000);

        // Update round with new status and schedule
        // using updateRound partial since we need to update multiple fields
        const updatedRound = await storage.updateRound(req.params.roundId, {
          status: "in_progress",
          startedAt: startTime,
          duration: duration,
          startTime: startTime,
          endTime: endTime
        })

        if (!updatedRound) {
          return res.status(500).json({ message: "Failed to update round status" })
        }

        // Automatically enable test for all participants when starting the round
        const credentials = await storage.getEventCredentialsByEvent(round.eventId)
        await Promise.all(
          credentials.map((cred) => storage.updateEventCredentialTestStatus(cred.id, true, req.user!.id)),
        )

        // Get event details (kept for potential future use)
        const event = await storage.getEventById(round.eventId)

        // NOTE: Test start reminder emails removed to save email credits (300/day limit)
        // Participants should be aware of the schedule via the dashboard

        // Invalidate cache - include participant credentials so dashboard updates immediately
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');
        await cacheService.deletePattern('participant:credential:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, "in_progress", updatedRound)

        res.json(updatedRound)
      } catch (error) {
        console.error("Start round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )


  // Get selection pool for the next round
  // BUG-A-04: was requireEventAdmin (any event_admin could read this PII pool
  // for any event). requireEventAdminOrSuperAdmin scopes to admins assigned
  // to :eventId. (publish-results was already scoped via requireRoundAccess.)
  app.get("/api/events/:eventId/rounds/:roundNum/selection-pool", requireAuth, requireEventAdminOrSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId, roundNum } = req.params;
      const roundNumber = parseInt(roundNum);
      const rounds = await storage.getRoundsByEvent(eventId);
      const round = rounds.find(r => r.roundNumber === roundNumber);

      if (!round) {
        console.error(`[Pre-Selection] Round not found. Event: ${eventId}, Num: ${roundNum}, Available: ${JSON.stringify(rounds.map(r => r.roundNumber))}`);
        return res.status(404).json({ message: "Round not found" });
      }

      let selectionPool = [];

      // For any round beyond the first, always surface the previously saved qualifiers.
      // This ensures finals (and any later rounds) only show promoted participants.
      if (roundNumber > 1) {
        // Find the most recent non-finals round below the current one
        const prevQualifyingRound = [...rounds]
          .filter(r => r.roundNumber < roundNumber && r.roundType !== 'finals')
          .sort((a, b) => b.roundNumber - a.roundNumber)[0];

        let qualifiers = [] as any[];
        if (prevQualifyingRound) {
          qualifiers = await storage.getManualRoundEntriesByEventAndRound(eventId, prevQualifyingRound.roundNumber);
        }

        // Fallback: if nothing found, take any manual qualifiers stored for this event
        if (!prevQualifyingRound || qualifiers.length === 0) {
          qualifiers = await storage.getManualRoundEntriesByEvent(eventId);
        }

        const users = await storage.getUsers();
        const registrations = await storage.getRegistrationsByEvent(eventId);
        const regMap = new Map<string, { reg: any; member?: any }>();
        for (const r of registrations) {
          if (r.organizerEmail) {
            regMap.set(r.organizerEmail.toLowerCase(), { reg: r });
          }
          if (r.teamMembers && Array.isArray(r.teamMembers)) {
            for (const m of r.teamMembers) {
              if (m.memberEmail) {
                regMap.set(m.memberEmail.toLowerCase(), { reg: r, member: m });
              }
            }
          }
        }

        selectionPool = qualifiers.map(q => {
          const user = q.participantUserId ? users.find(u => u.id === q.participantUserId) : undefined;
          const email = (q as any).participantEmail || user?.email || '';
          const match = email ? regMap.get(email.toLowerCase()) : null;

          return {
            userId: q.participantUserId,
            name: q.participantName || user?.fullName || 'Unknown',
            email,
            score: q.rank ? q.rank : q.score || 0,
            rank: q.rank,
            college: q.participantCollege || match?.reg?.organizerCollege || 'N/A',
            dept: q.participantDept || match?.member?.memberDept || match?.reg?.organizerDept || 'N/A',
            rollNo: q.participantRollNo || match?.member?.memberRollNo || match?.reg?.organizerRollNo || '-',
            teamMembers: match?.reg?.teamMembers || (q as any).teamMembers || []
          };
        });

        return res.json(selectionPool);
      }

      if (round.conductMedium === 'online' || round.isManual === false) {
        const leaderboard = await storage.getRoundLeaderboard(round.id);
        const participants = await storage.getParticipantsByEvent(eventId);

        selectionPool = await Promise.all(leaderboard.map(async (entry) => {
          const participant = participants.find(p => p.userId === entry.userId);
          const user = await storage.getUser(entry.userId);
          if (!user) return null;

          let extraDetails: any = {};
          if (user.role === 'participant') {
            const [reg] = await db.select().from(registrations).where(eq(registrations.organizerEmail, user.email));
            if (reg) {
              extraDetails = {
                college: reg.organizerCollege,
                dept: reg.organizerDept,
                rollNo: reg.organizerRollNo
              };
            } else {
              const [member] = await db.select().from(teamMembers).where(eq(teamMembers.memberEmail, user.email));
              if (member) {
                const [teamReg] = await db.select().from(registrations).where(eq(registrations.id, member.registrationId));
                extraDetails = {
                  college: teamReg?.organizerCollege || 'N/A',
                  dept: member.memberDept || teamReg?.organizerDept || 'N/A',
                  rollNo: member.memberRollNo || '-'
                };
              }
            }
          }

          return {
            userId: entry.userId,
            name: entry.userName || user.fullName || 'Unknown',
            email: user.email,
            score: entry.totalScore || 0,
            rank: entry.rank,
            college: extraDetails.college || 'N/A',
            dept: extraDetails.dept || 'N/A',
            rollNo: extraDetails.rollNo || '-'
          };
        }));
        selectionPool = selectionPool.filter(p => p !== null);
      } else {
        // Physical implementation
        const participants = await storage.getParticipantsByEvent(eventId);
        const users = await storage.getUsers();
        selectionPool = participants.map(p => {
          const u = users.find(user => user.id === p.userId);
          return u ? {
            userId: u.id,
            name: u.fullName,
            email: u.email,
            score: 0,
            rank: 0,
            college: 'N/A',
            dept: 'N/A',
            rollNo: '-'
          } : null;
        }).filter(p => p !== null);
      }
      res.json(selectionPool);
    } catch (error) {
      console.error("Selection pool error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- Question Management Routes --- (Note: Main CRUD defined later with caching)

  app.post("/api/rounds/:roundId/questions", requireAuth, requireEventAdminOrSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertQuestionSchema.safeParse({
        ...req.body,
        roundId: req.params.roundId,
      });
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ');
        return res.status(400).json({ message: `Invalid question data: ${details}`, errors: parsed.error.issues });
      }

      // Question text must be non-empty (zod text() alone allows "")
      if (typeof parsed.data.questionText !== 'string' || parsed.data.questionText.trim().length === 0) {
        return res.status(400).json({ message: "Invalid question data: questionText must be a non-empty string" });
      }

      const question = await storage.createQuestion(parsed.data);
      // Invalidate cache so new question appears immediately
      await cacheService.delete(`questions:${req.params.roundId}`);
      res.status(201).json(question);
    } catch (error: any) {
      console.error("Create question error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/rounds/:roundId/questions/:questionId", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { questionId, roundId } = req.params;
      const question = await storage.getQuestion(questionId);
      if (!question) return res.status(404).json({ message: "Question not found" });

      if (question.roundId !== roundId) {
        return res.status(400).json({ message: "Question does not belong to this round" });
      }

      // Never leak the answer key to participants mid-exam (H-09): apply the
      // same sanitization rule as the round questions list endpoint.
      const isPrivileged = req.user!.role === "super_admin" || req.user!.role === "event_admin";
      if (!isPrivileged && req.user!.role === "participant") {
        const round = await storage.getRound(roundId);
        const canViewAnswers = round?.showAnswers || (round?.resultsPublished && round?.status === "completed");
        if (!canViewAnswers) {
          return res.json({
            ...question,
            correctAnswer: null, // Hide correct answer
            expectedOutput: null, // Hide expected output for coding/fill-up questions
            testCases: null, // Hide test cases
          });
        }
      }

      res.json(question);
    } catch (error) {
      console.error("Get question error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/rounds/:roundId/questions/:questionId", requireAuth, requireEventAdminOrSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { questionId, roundId } = req.params;

      const existingQuestion = await storage.getQuestion(questionId);
      if (!existingQuestion) {
        return res.status(404).json({ message: "Question not found" });
      }

      if (existingQuestion.roundId !== roundId) {
        return res.status(400).json({ message: "Question does not belong to this round" });
      }

      // Whitelist updatable fields to avoid passing unknown keys to Drizzle
      const body = req.body || {};
      const updateData: Record<string, unknown> = {};
      for (const key of ['questionType', 'questionText', 'questionNumber', 'points', 'options', 'correctAnswer', 'expectedOutput', 'testCases'] as const) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      const question = await storage.updateQuestion(questionId, updateData);
      if (!question) return res.status(404).json({ message: "Question not found" });

      // Invalidate cache so edits appear immediately
      await cacheService.delete(`questions:${roundId}`);

      res.json(question);
    } catch (error) {
      console.error("Update question error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/rounds/:roundId/questions/:questionId", requireAuth, requireEventAdminOrSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { questionId, roundId } = req.params;

      const existingQuestion = await storage.getQuestion(questionId);
      if (!existingQuestion) {
        return res.status(404).json({ message: "Question not found" });
      }

      if (existingQuestion.roundId !== roundId) {
        return res.status(400).json({ message: "Question does not belong to this round" });
      }

      await storage.deleteQuestion(questionId);

      // Invalidate cache
      await cacheService.delete(`questions:${roundId}`);

      res.json({ message: "Question deleted successfully" });
    } catch (error) {
      console.error("Delete question error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Image upload with proper error handling
  app.post("/api/upload/question-image", requireAuth, requireEventAdminOrSuperAdmin, (req: AuthRequest, res: Response, next: any) => {
    uploadQuestionImage.single('image')(req, res, async (err: any) => {
      if (err) {
        console.error("Image upload error:", err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: "File too large. Maximum size is 10MB." });
        }
        if (err.message) {
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: "Failed to upload image" });
      }

      if (req.user!.role === 'event_admin') {
        const targetEventId = (req.body?.eventId || req.query?.eventId) as string;
        if (targetEventId) {
          const isAuthorized = await storage.isUserEventAdmin(req.user!.id, targetEventId);
          if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to upload images for this event" });
          }
        }
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided. Please select an image." });
      }

      const imageUrl = `/uploads/questions/${req.file.filename}`;
      console.log("Image uploaded successfully:", imageUrl);
      res.json({ url: imageUrl });
    });
  });

  // Multi-image upload for Image MCQ questions (2-6 images)
  app.post("/api/upload/question-images", requireAuth, requireEventAdminOrSuperAdmin, (req: AuthRequest, res: Response) => {
    uploadQuestionImage.array('images', 6)(req, res, async (err: any) => {
      if (err) {
        console.error("Multi-image upload error:", err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: "File too large. Maximum size is 10MB per image." });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: "Maximum 6 images allowed." });
        }
        if (err.message) {
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: "Failed to upload images" });
      }

      if (req.user!.role === 'event_admin') {
        const targetEventId = (req.body?.eventId || req.query?.eventId) as string;
        if (targetEventId) {
          const isAuthorized = await storage.isUserEventAdmin(req.user!.id, targetEventId);
          if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to upload images for this event" });
          }
        }
      }

      const files = req.files as Express.Multer.File[];

      if (!files || files.length < 2) {
        return res.status(400).json({ message: "At least 2 images are required for Image MCQ." });
      }

      if (files.length > 6) {
        return res.status(400).json({ message: "Maximum 6 images allowed." });
      }

      const urls = files.map(file => `/uploads/questions/${file.filename}`);
      console.log("Multi-image upload successful:", urls);
      res.json({ urls, count: urls.length });
    });
  });


  // Publish Results & Promote Qualifiers
  app.post(
    "/api/events/:eventId/rounds/:roundNum/results",
    requireAuth,
    requireEventAdmin, // Allows event_admin
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId, roundNum } = req.params;
        const { qualifiers, finalsRoom, finalsTime } = req.body;
        console.log(`[Results] Declaring winners for Event ${eventId}, Round ${roundNum}`);
        console.log(`[Results] Payload:`, JSON.stringify({ qualifiersCount: qualifiers?.length, finalsRoom, finalsTime }));
        const roundNumber = parseInt(roundNum);

        // Get current round
        const rounds = await storage.getRoundsByEvent(eventId);
        const currentRound = rounds.find(r => r.roundNumber === roundNumber);

        if (!currentRound) {
          return res.status(404).json({ message: `Current round not found (Round: ${roundNumber}, Event: ${eventId}, Rounds Count: ${rounds.length})` });
        }

        // Check if already finalized (unless no winners exist - recovery mode)
        const eventWinners = await storage.getEventWinners(eventId);
        if ((currentRound.status === "completed" || currentRound.resultsPublished) && eventWinners.length > 0) {
          return res.status(400).json({ message: "Results already finalized. Cannot re-declare winners." });
        }

        // 1. Mark current round as completed
        // 1. Mark current round as completed logic moved below

        // Move expensive DB calls OUTSIDE the loop
        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        const roundsList = rounds;
        const failedEmails: string[] = [];

        // Determine if this is finals based on roundType field (explicit) - defaults to prelims for backwards compatibility
        const isFinals = currentRound.roundType === 'finals';
        console.log(`[Results] Round type: ${currentRound.roundType || 'prelims'}, isFinals: ${isFinals}`);

        // Pre-calculate formatted time once
        // Finals time is not needed for winner/runner or qualification emails
        // let formattedTime = 'To be announced';

        // Mark current round as completed
        try {
          await storage.updateRoundStatus(currentRound.id, "completed");
        } catch (e) {
          console.error("[Results] Failed to update round status", e);
          // Verify round status did not crash the request
        }

        if (!isFinals) {
          // Prelims - Promote to next round logic (send qualification emails)
          console.log(`[Results] PRELIMS: Promoting ${qualifiers.length} users to next round`);

          // PERSIST QUALIFIERS TO DB (manualRoundEntries) so isQualified survives reload
          try {
            // Clear existing entries for this round to avoid duplicates
            await storage.deleteManualRoundEntriesByEventAndRound(eventId, roundNumber);
            // Save each qualifier
            for (let i = 0; i < qualifiers.length; i++) {
              const q = qualifiers[i];
              let userId = q.userId;
              // Resolve userId from email if missing
              if (!userId && q.email) {
                try {
                  const user = await storage.getUserByEmail(q.email);
                  if (user) userId = user.id;
                } catch (e) { /* ignore lookup errors */ }
              }
              await storage.createManualRoundEntry({
                eventId,
                roundNumber,
                roundName: currentRound.name,
                participantUserId: userId || null,
                participantName: q.userName || q.name,
                participantRollNo: q.rollNo,
                participantCollege: q.college,
                participantDept: q.dept,
                rank: i + 1,
                enteredBy: req.user!.id
              });
            }
            console.log(`[Results] Saved ${qualifiers.length} qualifiers to manualRoundEntries`);
          } catch (dbError) {
            console.error("[Results] Failed to persist qualifiers:", dbError);
          }

          // Only send qualification emails for PRELIMS (with time/location if needed)
          for (const qualifier of qualifiers) {
            try {
              await emailService.sendTestQualificationWithFinalsDetails(
                qualifier.email,
                qualifier.userName,
                event.name,
                currentRound.name,
                0, // score removed (not applicable for this use case)
                0, // maxScore removed (not applicable for this use case)
                finalsRoom || '', // finalsRoom (if provided)
                finalsTime || '', // finalsTime (if provided)
                "Congratulations on qualifying for the next round!"
              );
            } catch (emailError: any) {
              console.error(`[Results] Failed to send email to ${qualifier.email}:`, emailError);
              failedEmails.push(qualifier.email);
            }
          }

        } else {
          // Final Winner Declaration Logic
          console.log(`[Results] Declaring ${qualifiers.length} Final Winners`);

          // DO NOT SEND ANY WINNER/RUNNER EMAILS FOR FINALS
          // Only save winners to DB
          for (const qualifier of qualifiers) {
            try {
              // Save Winner to DB (all positions)
              let pUserId = qualifier.userId;
              // Fallback: If userId is missing, try to find user by email
              if (!pUserId && qualifier.email) {
                try {
                  const user = await storage.getUserByEmail(qualifier.email);
                  if (user) {
                    pUserId = user.id;
                    console.log(`[Results] Resolved missing userId for ${qualifier.email} -> ${pUserId}`);
                  }
                } catch (lookupError) {
                  console.error(`[Results] User lookup failed for ${qualifier.email}:`, lookupError);
                }
              }
              if (pUserId) {
                await storage.createEventWinner({
                  eventId: event.id,
                  position: qualifier.position || (qualifiers.indexOf(qualifier) + 1),
                  participantUserId: pUserId,
                  participantName: qualifier.userName, // Use userName from payload
                  participantRollNo: qualifier.rollNo,
                  participantCollege: qualifier.college,
                  participantDept: qualifier.dept,
                  finalScore: qualifier.score || 0,
                  winningRound: currentRound.name,
                  teamMembers: qualifier.teamMembers || []
                });
              } else {
                console.warn(`[Results] Could not save winner for ${qualifier.email} - No User ID found.`);
              }
            } catch (dbError) {
              console.error(`[Results] Failed to save winner ${qualifier.email}:`, dbError);
            }
          }
        }

        res.json({
          message: failedEmails.length > 0
            ? `Results processed but ${failedEmails.length} emails failed to send.`
            : "Results processing completed successfully",
          failedEmails
        });

      } catch (error: any) {
        console.error("Publish results CRITICAL error:", error);
        // Log stack trace
        if (error.stack) console.error(error.stack);
        res.status(500).json({ message: "Internal System Error: " + error.message });
      }
    }
  );

  app.post(
    "/api/rounds/:roundId/end",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }



        if (round.status !== "in_progress") {
          return res.status(400).json({ message: "Round can only be ended when status is 'in_progress'" })
        }

        const updatedRound = await storage.updateRoundStatus(req.params.roundId, "completed")

        // Invalidate cache - include participant credentials so dashboard updates immediately
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');
        await cacheService.deletePattern('participant:credential:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, "completed", updatedRound)

        res.json(updatedRound)
      } catch (error) {
        console.error("End round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/rounds/:roundId/restart",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        // Delete all test attempts
        await storage.deleteTestAttemptsByRound(req.params.roundId)

        // Reset round status
        const updatedRound = await storage.updateRoundStatus(req.params.roundId, "not_started", null)

        // Disable test for all participants when restarting
        const credentials = await storage.getEventCredentialsByEvent(round.eventId)
        await Promise.all(
          credentials.map((cred) => storage.updateEventCredentialTestStatus(cred.id, false, req.user!.id)),
        )

        // Invalidate cache - include participant credentials so dashboard updates immediately
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');
        await cacheService.deletePattern('participant:credential:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, "not_started", updatedRound)

        res.json({
          message: "Round restarted successfully",
          round: updatedRound,
        })
      } catch (error) {
        console.error("Restart round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/rounds/:roundId/publish-results",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        const { userIds } = req.body || {}

        // Targeted share: notify only the selected participants by email.
        // This does NOT flip the global resultsPublished flag — a targeted
        // share must never silently become a global publish (H-14).
        if (userIds !== undefined) {
          if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: "userIds must be a non-empty array" })
          }

          const event = await storage.getEvent(round.eventId)
          let sentCount = 0

          for (const userId of userIds) {
            const attempt = await storage.getTestAttemptByUserAndRound(userId, req.params.roundId)
            const user = await storage.getUser(userId)

            if (user && attempt) {
              queueService.addEmailJob(
                user.email,
                `Test Results: ${round.name} - ${event?.name}`,
                'test_result_qualified',
                {
                  name: user.fullName,
                  eventName: event?.name || 'Event',
                  roundName: round.name,
                  score: attempt.totalScore || 0,
                  maxScore: attempt.maxScore || 100, // Fallback
                },
                user.fullName
              ).catch(err => console.error(`Failed to queue result email for ${user.email}`, err));
              sentCount++
            }
          }

          return res.json({ message: `Results shared with ${sentCount} participants`, sentCount })
        }

        // Global publish: flip the flag, invalidate caches, notify via WebSocket.
        const updatedRound = await storage.updateRoundResultsPublished(req.params.roundId, true)

        // Invalidate cache
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, round.status, updatedRound)

        // NOTE: Global result published emails removed to save email credits (300/day limit)

        res.json({
          message: "Results published successfully",
          round: updatedRound,
        })
      } catch (error) {
        console.error("Publish results error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/rounds/:roundId/rules", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      let rules = await storage.getRoundRules(req.params.roundId)

      if (!rules) {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        rules = await storage.createRoundRules({
          roundId: req.params.roundId,
          noRefresh: true,
          noTabSwitch: true,
          forceFullscreen: true,
          disableShortcuts: true,
          autoSubmitOnViolation: true,
          maxTabSwitchWarnings: 2,
          additionalRules: null,
        })
      }

      res.json(rules)
    } catch (error) {
      console.error("Get round rules error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch(
    "/api/rounds/:roundId/rules",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          noRefresh,
          noTabSwitch,
          forceFullscreen,
          disableShortcuts,
          autoSubmitOnViolation,
          maxTabSwitchWarnings,
          additionalRules,
        } = req.body

        const updateData: any = {}
        if (noRefresh !== undefined) updateData.noRefresh = noRefresh
        if (noTabSwitch !== undefined) updateData.noTabSwitch = noTabSwitch
        if (forceFullscreen !== undefined) updateData.forceFullscreen = forceFullscreen
        if (disableShortcuts !== undefined) updateData.disableShortcuts = disableShortcuts
        if (autoSubmitOnViolation !== undefined) updateData.autoSubmitOnViolation = autoSubmitOnViolation
        if (maxTabSwitchWarnings !== undefined) updateData.maxTabSwitchWarnings = maxTabSwitchWarnings
        if (additionalRules !== undefined) updateData.additionalRules = additionalRules

        const rules = await storage.updateRoundRules(req.params.roundId, updateData)
        if (!rules) {
          return res.status(404).json({ message: "Round rules not found" })
        }

        res.json(rules)
      } catch (error) {
        console.error("Update round rules error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // Get questions for a round
  app.get("/api/rounds/:roundId/questions", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      const roundId = req.params.roundId;
      const questions = await cacheService.get(
        `questions:${roundId}`,
        () => storage.getQuestionsByRound(roundId),
        300
      );

      const round = await storage.getRound(roundId);
      const isPrivileged = req.user!.role === 'super_admin' || req.user!.role === 'event_admin';

      if (!isPrivileged && req.user!.role === 'participant') {
        const canViewAnswers = round?.showAnswers || (round?.resultsPublished && round?.status === 'completed');
        if (!canViewAnswers) {
          const sanitized = questions.map((q: any) => ({
            ...q,
            correctAnswer: null,
            expectedOutput: null,
            testCases: null,
          }));
          return res.json(sanitized);
        }
      }

      res.json(questions);
    } catch (error) {
      console.error("Get questions error:", error)
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  });

  app.post(
    "/api/rounds/:roundId/questions/bulk",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const { questions } = req.body

        if (!questions || !Array.isArray(questions) || questions.length === 0) {
          return res.status(400).json({ message: "Questions array is required and must not be empty" })
        }

        const errors: string[] = []
        const createdQuestions = []

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i]

          if (!q.questionText || q.questionNumber === undefined) {
            errors.push(`Question ${i + 1}: questionText and questionNumber are required`)
            continue
          }

          try {
            const question = await storage.createQuestion({
              roundId: req.params.roundId,
              questionType: q.questionType || "multiple_choice",
              questionText: q.questionText,
              questionNumber: q.questionNumber,
              points: q.points || 1,
              options: q.options || null,
              correctAnswer: q.correctAnswer || null,
              expectedOutput: q.expectedOutput || null,
              testCases: q.testCases || null,
            })
            createdQuestions.push(question)
          } catch (error: any) {
            errors.push(`Question ${i + 1}: ${error.message}`)
          }
        }

        if (errors.length > 0 && createdQuestions.length === 0) {
          return res.status(400).json({ message: "Failed to create any questions", errors })
        }

        // Invalidate cache
        await cacheService.delete(`questions:${req.params.roundId}`);

        res.status(201).json({
          message: `Successfully created ${createdQuestions.length} questions`,
          created: createdQuestions.length,
          errors: errors.length > 0 ? errors : undefined,
          questions: createdQuestions,
        })
      } catch (error) {
        console.error("Bulk create questions error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/events/:eventId/participants",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const participant = await storage.registerParticipant({
          eventId: req.params.eventId,
          userId: req.user!.id,
          status: "registered",
        })

        res.status(201).json(participant)
      } catch (error) {
        console.error("Register participant error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get(
    "/api/events/:eventId/participants",
    requireAuth,
    requireEventAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const participants = await storage.getParticipantsByEvent(req.params.eventId)
        res.json(participants)
      } catch (error) {
        console.error("Get participants error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get(
    "/api/participants/my-registrations",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const participants = await storage.getParticipantsByUser(req.user!.id)
        res.json(participants)
      } catch (error) {
        console.error("Get my registrations error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )


  // Get events assigned to a specific admin (Super Admin only)
  app.get("/api/users/:userId/assigned-events", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getEventsByAdmin(req.params.userId)
      res.json(events)
    } catch (error) {
      console.error("Get user assigned events error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get all events assigned to this admin
  app.get("/api/event-admin/events", requireAuth, requireEventAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getEventsByAdmin(req.user!.id)
      res.json(events)
    } catch (error) {
      console.error("Get admin events error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get single event details (for dashboard mostly, assumes single assignment primarily but could be expanded)

  app.get("/api/event-admin/my-event", requireAuth, requireEventAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getEventsByAdmin(req.user!.id)

      if (events.length === 0) {
        return res.status(404).json({ message: "No event assigned to this admin" })
      }

      const event = events[0]
      // Use registrations for accurate count (1 team = 1 count)
      const allRegistrations = await storage.getRegistrations()
      const eventRegistrations = allRegistrations.filter(r => r.eventId === event.id && r.status !== 'cancelled' && r.status !== 'disqualified')
      const participantCount = eventRegistrations.length

      res.json({
        event,
        participantCount,
      })
    } catch (error) {
      console.error("Get my event error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Test Attempt Routes
  app.post(
    "/api/events/:eventId/rounds/:roundId/start",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId, roundId } = req.params
        const userId = req.user!.id

        // SECURITY: the participant must actually belong to this event â€”
        // prevents cross-event test participation (IDOR).
        const participantRecord = await storage.getParticipantByUserAndEvent(userId, eventId)
        if (!participantRecord) {
          return res.status(403).json({ message: "You are not registered for this event" })
        }

        // Check if user already has an attempt for this round
        const existingAttempt = await storage.getTestAttemptByUserAndRound(userId, roundId)
        if (existingAttempt) {
          return res.status(400).json({ message: "You already have an attempt for this round" })
        }

        // Get round to calculate max score
        const round = await storage.getRound(roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        // SECURITY: the round must belong to the event in the URL
        if (round.eventId !== eventId) {
          return res.status(403).json({ message: "Round does not belong to this event" })
        }

        // CRITICAL: Validate round status and medium
        if (round.status !== "in_progress") {
          return res.status(400).json({ message: "Round is not active for testing (Status: " + round.status + ")" })
        }

        if (round.conductMedium !== "online") {
          return res.status(400).json({ message: "This round does not support online testing" })
        }

        // Get questions to calculate max score
        const questions = await storage.getQuestionsByRound(roundId)

        // Validate that questions exist
        if (questions.length === 0) {
          return res.status(400).json({
            message: "Cannot start test - no questions have been added to this round yet"
          })
        }

        const maxScore = questions.length // STATIC 1 POINT PER QUESTION

        const attempt = await storage.createTestAttempt({
          roundId,
          userId,
          status: "in_progress",
          tabSwitchCount: 0,
          refreshAttemptCount: 0,
          violationLogs: [],
          totalScore: 0,
          maxScore,
        })

        // Invalidate leaderboards
        await cacheService.deletePattern('leaderboard:*');

        // Notify admins
        WebSocketService.notifyTestSubmission({
          userId: req.user!.id,
          roundId: round.id,
          eventId: round.eventId,
          attemptId: attempt.id,
          score: 0
        });

        WebSocketService.broadcastToEvent(round.eventId, 'leaderboardUpdate', {
          eventId: round.eventId,
          roundId: round.id
        });

        res.status(201).json(attempt)
      } catch (error) {
        console.error("Start test attempt error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get(
    "/api/participants/rounds/:roundId/my-attempt",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const { roundId } = req.params
        const userId = req.user!.id

        const existingAttempt = await storage.getTestAttemptByUserAndRound(userId, roundId)

        if (!existingAttempt) {
          return res.json({ attempt: null })
        }

        res.json({ attempt: existingAttempt })
      } catch (error) {
        console.error("Get my attempt error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/attempts/:attemptId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const attempt = await storage.getTestAttempt(req.params.attemptId)
      if (!attempt) {
        return res.status(404).json({ message: "Test attempt not found" })
      }

      // Only allow user to view their own attempt or admins
      if (attempt.userId !== req.user!.id && req.user!.role === "participant") {
        return res.status(403).json({ message: "Access denied" })
      }

      // Get round and questions
      const round = await storage.getRound(attempt.roundId)
      const questions = await storage.getQuestionsByRound(attempt.roundId)
      const answers = await storage.getAnswersByAttempt(attempt.id)

      // Get event to check if it has ended
      const event = round ? await storage.getEvent(round.eventId) : null

      // Check if results should be shown:
      // Results are shown when BOTH conditions are met:
      // 1. Admin has published results (round.resultsPublished === true), AND
      // 2. Participant's attempt duration has elapsed (current time > attempt.startedAt + duration)

      // Calculate if the participant's attempt duration has elapsed
      // Use attempt.startedAt (when participant started) not round.startedAt (when admin started round)
      let attemptDurationElapsed = false
      if (attempt.startedAt && round?.duration) {
        const attemptEndTime = new Date(attempt.startedAt).getTime() + (round.duration * 60 * 1000)
        attemptDurationElapsed = Date.now() > attemptEndTime
      }

      const resultsPublished = round?.resultsPublished ?? false
      const eventEnded = resultsPublished && attemptDurationElapsed

      // canViewResults is true if admin has enabled "Show Answers" for the round
      const canViewResults = round?.showAnswers ?? false

      const isAdmin = req.user!.role === "super_admin" || req.user!.role === "event_admin"

      // Hide scores and answers if showAnswers is not enabled (for participants only)
      let responseData: any = {
        ...attempt,
        round,
        questions,
        answers,
        event,
        eventEnded,
        canViewResults,
      }

      if (!canViewResults && !isAdmin && req.user!.role === "participant") {
        // Hide sensitive data until admin enables show answers
        responseData = {
          ...attempt,
          totalScore: null,
          maxScore: null,
          round: {
            ...round,
          },
          questions: questions.map((q: any) => ({
            ...q,
            correctAnswer: null, // Hide correct answers
            expectedOutput: null, // Hide expected output for coding/fill-up questions
            testCases: null, // Hide test cases
          })),
          answers: answers.map((a: any) => ({
            ...a,
            isCorrect: null, // Hide correctness
            pointsAwarded: null, // Hide points
          })),
          event,
          eventEnded,
          canViewResults,
        }
      }

      res.json(responseData)
    } catch (error) {
      console.error("Get test attempt error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post(
    "/api/attempts/:attemptId/answers",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const { attemptId } = req.params
        const { questionId, answer } = req.body

        if (!questionId || answer === undefined) {
          return res.status(400).json({ message: "Question ID and answer are required" })
        }

        const attempt = await storage.getTestAttempt(attemptId)
        if (!attempt) {
          return res.status(404).json({ message: "Test attempt not found" })
        }

        if (attempt.userId !== req.user!.id) {
          return res.status(403).json({ message: "Access denied" })
        }

        if (attempt.status !== "in_progress") {
          return res.status(400).json({ message: "Test is not in progress" })
        }

        const round = await storage.getRound(attempt.roundId);
        if (round && round.status === 'paused') {
          return res.status(403).json({ message: "Test is currently paused by admin" });
        }

        // H-15: atomic upsert on (attempt_id, question_id) — the old
        // find-then-insert/update raced under concurrent saves.
        const savedAnswer = await storage.upsertAnswer({ attemptId, questionId, answer })

        res.json(savedAnswer)
      } catch (error) {
        console.error("Save answer error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/attempts/:attemptId/violations",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const { attemptId } = req.params
        const { type } = req.body // 'tab_switch', 'refresh', 'shortcut'

        const attempt = await storage.getTestAttempt(attemptId)
        if (!attempt) {
          return res.status(404).json({ message: "Test attempt not found" })
        }

        if (attempt.userId !== req.user!.id) {
          return res.status(403).json({ message: "Access denied" })
        }

        if (attempt.status !== "in_progress") {
          return res.status(400).json({ message: "Test is not in progress" })
        }

        const violationLogs = (attempt.violationLogs as any[]) || []
        const now = new Date()

        // H-11: coalesce duplicate detector firings. One tab switch fires both
        // 'blur' and 'visibilitychange' client-side; without this a single
        // switch incremented the counters twice and wrongfully eliminated
        // mobile users (threshold 2) on their first switch.
        const lastLog = violationLogs[violationLogs.length - 1]
        const lastTime = lastLog ? new Date(lastLog.timestamp).getTime() : 0
        if (lastLog && lastLog.type === type && now.getTime() - lastTime < 5000) {
          return res.json(attempt)
        }

        violationLogs.push({
          type,
          timestamp: now.toISOString(),
        })

        const updates: any = { violationLogs }

        if (type === "tab_switch") {
          updates.tabSwitchCount = (attempt.tabSwitchCount || 0) + 1
        } else if (type === "refresh") {
          updates.refreshAttemptCount = (attempt.refreshAttemptCount || 0) + 1
        }

        const updatedAttempt = await storage.updateTestAttempt(attemptId, updates)

        res.json(updatedAttempt)
      } catch (error) {
        console.error("Log violation error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/attempts/:attemptId/submit",
    requireAuth,
    requireParticipant,
    async (req: AuthRequest, res: Response) => {
      try {
        const { attemptId } = req.params

        const attempt = await storage.getTestAttempt(attemptId)
        if (!attempt) {
          return res.status(404).json({ message: "Test attempt not found" })
        }

        if (attempt.userId !== req.user!.id) {
          return res.status(403).json({ message: "Access denied" })
        }

        if (attempt.status !== "in_progress") {
          return res.status(400).json({ message: "Test is already submitted" })
        }

        // Check if participant is disqualified
        const round = await storage.getRound(attempt.roundId);
        if (round) {
          const participant = await storage.getParticipantByUserAndEvent(req.user!.id, round.eventId);
          if (participant?.status === "disqualified") {
            const updatedAttempt = await storage.updateTestAttempt(attemptId, {
              status: "disqualified",
              submittedAt: new Date(),
              completedAt: new Date(),
              totalScore: 0,
            });
            await cacheService.deletePattern('leaderboard:*');
            return res.json({
              message: "Test submitted (disqualified)",
              attempt: updatedAttempt,
              totalScore: null,
            });
          }
        }

        // Get questions and answers to calculate score
        const questions = await storage.getQuestionsByRound(attempt.roundId)
        const answers = await storage.getAnswersByAttempt(attemptId)

        let totalScore = 0

        // Grade answers
        for (const answer of answers) {
          const question = questions.find((q) => q.id === answer.questionId)
          if (!question) continue

          let isCorrect = false
          let pointsAwarded = 0
          const questionPoints = question.points || 1

          // Generic Auto-grading Logic for ALL Question Types
          const userAnswer = (answer.answer || "").trim().toLowerCase();
          const correct = (question.correctAnswer || "").trim().toLowerCase();
          const expected = (question.expectedOutput || "").trim().toLowerCase();

          if (correct) {
            // Auto-grade based on correctAnswer (MCQ, Image MCQ, True/False, Short Answer, Fill-up, etc.)
            isCorrect = userAnswer === correct;
            pointsAwarded = isCorrect ? questionPoints : 0;
          } else if (expected) {
            // Auto-grade based on expectedOutput (Coding, etc.)
            // Note: This is strict string matching. For advanced coding, a runner is needed.
            isCorrect = userAnswer === expected;
            pointsAwarded = isCorrect ? questionPoints : 0;
          } else {
            // No answer key defined -> Manual grading required
            isCorrect = false;
            pointsAwarded = 0;
          }

          totalScore += pointsAwarded

          // Update answer with grading
          await storage.updateAnswer(answer.id, {
            isCorrect,
            pointsAwarded,
          })
        }

        // Update attempt as completed
        const updatedAttempt = await storage.updateTestAttempt(attemptId, {
          status: "completed",
          submittedAt: new Date(),
          completedAt: new Date(),
          totalScore,
        })

        // Invalidate leaderboards
        await cacheService.deletePattern('leaderboard:*');

        // Notify admins of submission
        WebSocketService.notifyTestSubmission({
          userId: req.user!.id,
          roundId: attempt.roundId,
          eventId: attempt.roundId ? (await storage.getRound(attempt.roundId))?.eventId || "" : "",
          attemptId: attemptId,
          score: totalScore
        });

        // Trigger leaderboard update
        WebSocketService.broadcastToEvent((await storage.getRound(attempt.roundId))?.eventId || "", 'leaderboardUpdate', {
          eventId: (await storage.getRound(attempt.roundId))?.eventId || "",
          roundId: attempt.roundId
        });

        res.json(updatedAttempt)
      } catch (error) {
        console.error("Submit test error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/participants/my-attempts", requireAuth, requireParticipant, async (req: AuthRequest, res: Response) => {
    try {
      const attempts = await storage.getTestAttemptsByUser(req.user!.id)

      const attemptsWithRounds = await Promise.all(
        attempts.map(async (attempt) => {
          const round = await storage.getRound(attempt.roundId)
          const event = round ? await storage.getEvent(round.eventId) : null

          // Logic Change: Use round.showAnswers to determine visibility regardless of duration
          // But usually duration check is also good practice, but user wants "Admin clicks button".
          // So we rely purely on showAnswers for showing details.

          const canViewResults = round?.showAnswers ?? false

          const roundWithEvent = round ? { ...round, event } : round

          if (!canViewResults && attempt.status === 'completed') {
            return {
              ...attempt,
              totalScore: null,
              maxScore: null,
              round: roundWithEvent,
              canViewResults: false
            }
          }

          return { ...attempt, round: roundWithEvent, canViewResults }
        })
      )

      res.json(attemptsWithRounds)
    } catch (error) {
      console.error("Get my attempts error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // New Routes for Test Workflow

  app.post("/api/rounds/:roundId/toggle-answers", requireAuth, requireEventAdminOrSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { roundId } = req.params;
      const { show } = req.body;

      if (typeof show !== 'boolean') {
        return res.status(400).json({ message: "'show' must be a boolean" });
      }

      const round = await storage.getRound(roundId);
      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      // One-way action: once answers are shown, they cannot be hidden again.
      if (round.showAnswers && show === false) {
        return res.status(400).json({ message: "Answers are already visible and cannot be hidden" });
      }

      // If already enabled and caller re-sends show=true, treat as idempotent.
      if (round.showAnswers && show === true) {
        return res.json(round);
      }

      // Enforce: can only show answers after ALL participants have submitted.
      // Use participant list (registered users) as the source of truth.
      if (show === true) {
        const participants = await storage.getParticipantsByEventId(round.eventId);
        const totalParticipants = participants.length;

        const attempts = await storage.getTestAttemptsByRound(roundId);
        const completedParticipants = new Set(
          attempts.filter(a => a.submittedAt !== null).map(a => a.userId)
        );

        if (totalParticipants === 0 || completedParticipants.size !== totalParticipants) {
          return res.status(400).json({
            message: "Cannot show answers until all participants have submitted",
            totalParticipants,
            completedParticipants: completedParticipants.size,
          });
        }
      }

      // Note: requireRoundAccess already verifies round existence
      const updated = await storage.updateRoundShowAnswers(roundId, show);

      // Invalidate caches
      await cacheService.delete(`rounds:${round.eventId}`);

      res.json(updated);
    } catch (error) {
      console.error("Toggle answers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/events/:eventId/leaderboard", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      const event = await storage.getEvent(eventId);

      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const rounds = await storage.getRoundsByEvent(eventId);
      const leaderboard = await cacheService.get(
        `leaderboard:event:${eventId}`,
        () => storage.getEventLeaderboard(eventId),
        30,
      );

      const isAdmin = req.user!.role === "super_admin" || req.user!.role === "event_admin";
      const answersVisible = rounds.length > 0 && rounds.every((round) => round.showAnswers);

      if (isAdmin) {
        return res.json({
          scope: "admin",
          answersVisible,
          canSelectParticipants: true,
          leaderboard,
        });
      }

      const participant = await storage.getParticipantByUserAndEvent(req.user!.id, eventId);
      if (!participant) {
        return res.status(403).json({ message: "You are not registered for this event" });
      }

      if (!answersVisible) {
        return res.json({
          scope: "participant",
          answersVisible: false,
          participantResult: null,
          message: "Results not yet published",
        });
      }

      const participantEntry = leaderboard.find((entry) => entry.userId === req.user!.id) || null;

      const userAttempts = await storage.getTestAttemptsByUser(req.user!.id);
      const eventRoundIds = new Set(rounds.map((round) => round.id));
      const eventAttempts = userAttempts.filter(
        (attempt) => eventRoundIds.has(attempt.roundId) && attempt.status === "completed",
      );

      const answers = await storage.getAnswersByAttemptIds(eventAttempts.map((attempt) => attempt.id));
      const answersByAttempt = new Map<string, typeof answers>();
      answers.forEach((answer) => {
        const existing = answersByAttempt.get(answer.attemptId);
        if (existing) {
          existing.push(answer);
        } else {
          answersByAttempt.set(answer.attemptId, [answer]);
        }
      });

      const roundOrder = new Map(rounds.map((round) => [round.id, round.roundNumber]));

      const questionMaps = new Map<string, Map<string, string>>();
      for (const round of rounds) {
        if (!eventAttempts.some((attempt) => attempt.roundId === round.id)) {
          continue;
        }
        const roundQuestions = await storage.getQuestionsByRound(round.id);
        questionMaps.set(round.id, new Map(roundQuestions.map((question) => [question.id, question.questionText])));
      }

      const roundResults = eventAttempts
        .map((attempt) => {
          const roundMeta = rounds.find((round) => round.id === attempt.roundId);
          const questionTextMap = questionMaps.get(attempt.roundId) || new Map<string, string>();
          const attemptAnswers = (answersByAttempt.get(attempt.id) || []).map((answer) => ({
            id: answer.id,
            questionId: answer.questionId,
            answer: answer.answer,
            isCorrect: answer.isCorrect,
            pointsAwarded: answer.pointsAwarded,
            answeredAt: answer.answeredAt,
            questionText: questionTextMap.get(answer.questionId) || null,
          }));

          return {
            roundId: attempt.roundId,
            roundName: roundMeta?.name || "Round",
            totalScore: attempt.totalScore || 0,
            maxScore: attempt.maxScore,
            submittedAt: attempt.submittedAt,
            answers: attemptAnswers,
          };
        })
        .sort((a, b) => {
          const aOrder = roundOrder.get(a.roundId) ?? 0;
          const bOrder = roundOrder.get(b.roundId) ?? 0;
          return aOrder - bOrder;
        });

      const fallbackTotalScore = roundResults.reduce((sum, roundResult) => sum + (roundResult.totalScore || 0), 0);
      const fallbackMaxScore = roundResults.reduce((sum, roundResult) => sum + (roundResult.maxScore || 0), 0);

      const lastSubmission = roundResults.length > 0 ? roundResults[roundResults.length - 1].submittedAt : null;

      return res.json({
        scope: "participant",
        answersVisible: true,
        participantResult: participantEntry
          ? {
            ...participantEntry,
            rounds: roundResults,
          }
          : {
            rank: null,
            userId: req.user!.id,
            userName: req.user!.fullName,
            totalScore: fallbackTotalScore,
            maxScore: fallbackMaxScore,
            submittedAt: lastSubmission,
            rounds: roundResults,
          },
      });
    } catch (error) {
      console.error("Get event leaderboard error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/reports", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const reports = await storage.getReports()
      res.json(reports)
    } catch (error) {
      console.error("Get reports error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post("/api/reports/generate/event", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { eventId } = req.body

      if (!eventId) {
        return res.status(400).json({ message: "Event ID is required" })
      }

      const report = await storage.generateEventReport(eventId, req.user!.id)
      res.status(201).json(report)
    } catch (error) {
      console.error("Generate event report error:", error)
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" })
    }
  })

  app.post(
    "/api/reports/generate/symposium",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const report = await storage.generateSymposiumReport(req.user!.id)
        res.status(201).json(report)
      } catch (error) {
        console.error("Generate symposium report error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/reports/:id/download", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params
      const report = await storage.getReport(id)

      if (!report) {
        return res.status(404).json({ message: "Report not found" })
      }

      res.setHeader("Content-Type", "application/json")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${report.title.replace(/[^a-z0-9]/gi, "_")}_${id}.json"`,
      )
      res.json(report.reportData)
    } catch (error) {
      console.error("Download report error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post(
    "/api/admin/backfill-round-rules",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const events = await storage.getEvents()
        let processedCount = 0
        let createdCount = 0

        for (const event of events) {
          const rounds = await storage.getRoundsByEvent(event.id)

          for (const round of rounds) {
            processedCount++
            const existingRules = await storage.getRoundRules(round.id)

            if (!existingRules) {
              await storage.createRoundRules({
                roundId: round.id,
                noRefresh: true,
                noTabSwitch: true,
                forceFullscreen: true,
                disableShortcuts: true,
                autoSubmitOnViolation: true,
                maxTabSwitchWarnings: 2,
                additionalRules: null,
              })
              createdCount++
            }
          }
        }

        res.json({
          message: "Backfill completed successfully",
          processedRounds: processedCount,
          createdRules: createdCount,
        })
      } catch (error) {
        console.error("Backfill round rules error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )



  // Super Admin: Get ALL Rounds with event details
  app.get("/api/super-admin/all-rounds", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const events = await storage.getEvents();
      let allRounds: any[] = [];

      for (const event of events) {
        const rounds = await storage.getRoundsByEvent(event.id);
        const roundsWithEventName = await Promise.all(rounds.map(async r => {
          // Auto-complete if time ended
          if (r.status === 'in_progress' && r.endTime && new Date(r.endTime) < new Date()) {
            console.log(`Auto-completing expired round ${r.id}`);
            const updated = await storage.updateRoundStatus(r.id, 'completed');
            // Invalidate cache
            await cacheService.delete(`rounds:${r.eventId}`);
            return {
              ...updated,
              eventName: event.name,
              eventCategory: event.category
            };
          }

          return {
            ...r,
            eventName: event.name,
            eventCategory: event.category
          };
        }));
        allRounds = [...allRounds, ...roundsWithEventName];
      }

      // Sort by start time descending
      allRounds.sort((a, b) => {
        const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return dateB - dateA;
      });

      res.json(allRounds);
    } catch (error) {
      console.error("Get all rounds error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/rounds/:roundId/pause",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        if (round.status !== "in_progress") {
          return res.status(400).json({ message: "Round can only be paused when status is 'in_progress'" })
        }

        const updatedRound = await storage.updateRoundStatus(req.params.roundId, "paused")

        // Invalidate cache - include participant credentials so dashboard updates immediately
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');
        await cacheService.deletePattern('participant:credential:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, "paused", updatedRound)

        res.json(updatedRound)
      } catch (error) {
        console.error("Pause round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post(
    "/api/rounds/:roundId/resume",
    requireAuth,
    requireEventAdmin,
    requireRoundAccess,
    async (req: AuthRequest, res: Response) => {
      try {
        const round = await storage.getRound(req.params.roundId)
        if (!round) {
          return res.status(404).json({ message: "Round not found" })
        }

        if (round.status !== "paused") {
          return res.status(400).json({ message: "Round can only be resumed when status is 'paused'" })
        }

        const pauseDurationMs = Math.max(0, Date.now() - new Date(round.updatedAt).getTime());

        // Shift startedAt for all in-progress attempts of this round so pause time is not counted against test duration
        if (pauseDurationMs > 0) {
          const inProgressAttempts = await db.select()
            .from(testAttempts)
            .where(and(
              eq(testAttempts.roundId, round.id),
              eq(testAttempts.status, 'in_progress')
            ));

          for (const att of inProgressAttempts) {
            const newStartedAt = new Date(att.startedAt.getTime() + pauseDurationMs);
            await db.update(testAttempts)
              .set({ startedAt: newStartedAt })
              .where(eq(testAttempts.id, att.id));
          }
        }

        const updatedRound = await storage.updateRoundStatus(req.params.roundId, "in_progress")

        // Invalidate cache - include participant credentials so dashboard updates immediately
        await cacheService.delete(`rounds:${round.eventId}`);
        await cacheService.deletePattern('leaderboard:*');
        await cacheService.deletePattern('participant:credential:*');

        // Notify via WebSocket
        WebSocketService.notifyRoundStatus(round.eventId, req.params.roundId, "in_progress", updatedRound)

        res.json(updatedRound)
      } catch (error) {
        console.error("Resume round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.post("/api/registration-forms", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { title, description, formFields, headerImage } = req.body

      if (!title || !formFields || !Array.isArray(formFields)) {
        return res.status(400).json({ message: "Title and formFields are required" })
      }

      const slug = generateFormSlug(title)
      const form = await storage.createRegistrationForm(title, description || "", formFields, slug, headerImage || null)

      res.status(201).json(form)
    } catch (error) {
      console.error("Create registration form error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/registration-forms/active", async (req: Request, res: Response) => {
    try {
      const form = await storage.getActiveRegistrationForm()
      if (!form) {
        return res.status(404).json({ message: "No active registration form found" })
      }
      res.json(form)
    } catch (error) {
      console.error("Get active registration form error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch("/api/registration-forms/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body
      const form = await storage.updateRegistrationForm(req.params.id, updates)
      if (!form) {
        return res.status(404).json({ message: "Form not found" })
      }
      res.json(form)
    } catch (error) {
      console.error("Update registration form error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.delete("/api/registration-forms/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const form = await storage.getRegistrationFormById(req.params.id)
      if (!form) {
        return res.status(404).json({ message: "Form not found" })
      }

      if (form.isActive) {
        return res.status(400).json({ message: "Cannot delete an active form. Please deactivate it first." })
      }

      await storage.deleteRegistrationForm(req.params.id)
      res.json({ message: "Registration form deleted successfully" })
    } catch (error: any) {
      console.error("Delete registration form error:", error)
      res.status(500).json({ message: error.message || "Internal server error" })
    }
  })

  app.get("/api/registration-forms/all", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const forms = await storage.getAllRegistrationForms()
      res.json(forms)
    } catch (error) {
      console.error("Get all registration forms error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/registration-forms/:id/details", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const form = await storage.getRegistrationFormById(req.params.id)
      if (!form) {
        return res.status(404).json({ message: "Form not found" })
      }
      res.json(form)
    } catch (error) {
      console.error("Get registration form by id error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/registration-forms/:slug", async (req: Request, res: Response) => {
    try {
      const form = await storage.getRegistrationFormBySlug(req.params.slug)
      if (!form) {
        return res.status(404).json({ message: "Form not found" })
      }
      res.json(form)
    } catch (error) {
      console.error("Get registration form error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // OLD FORM-BASED REGISTRATION - DEPRECATED
  // This route is disabled in favor of the new team-based registration system
  // Use POST /api/register for new team-based registrations
  app.post("/api/registration-forms/:slug/submit", async (req: Request, res: Response) => {
    res.status(410).json({
      message: "This registration form is no longer active. Please use the new team-based registration system."
    })
  })

  // ============ NEW TEAM-BASED REGISTRATION ENDPOINTS ============

  // Validate a roll number for registration
  app.post("/api/validate-rollno", async (req: Request, res: Response) => {
    try {
      const { rollNo, eventId } = req.body

      if (!rollNo || !eventId) {
        return res.status(400).json({ message: "rollNo and eventId are required" })
      }

      const event = await storage.getEventById(eventId)
      if (!event) {
        return res.status(404).json({ message: "Event not found" })
      }

      // Check if this roll number is already registered for an event in the same category
      const categoryCheck = await storage.checkRollNoCategoryRegistration(rollNo, event.category as 'technical' | 'non_technical')

      if (categoryCheck.isRegistered) {
        return res.json({
          valid: false,
          blocked: true,
          reason: `Already registered for ${categoryCheck.event?.name || 'another event'} in ${event.category} category`,
          existingEvent: categoryCheck.event?.name,
          role: categoryCheck.role,
          category: event.category
        })
      }

      res.json({
        valid: true,
        blocked: false,
        category: event.category
      })
    } catch (error) {
      console.error("Validate roll number error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Check registration status for a student  
  app.post("/api/check-registration-status", async (req: Request, res: Response) => {
    try {
      const { rollNo, eventId } = req.body

      if (!rollNo) {
        return res.status(400).json({ message: "rollNo is required" })
      }

      // Get all registrations for this roll number
      const registrations = await storage.getRegistrationsByRollNo(rollNo)

      // If a specific event is provided, check if they can register for it
      if (eventId) {
        const event = await storage.getEventById(eventId)
        if (!event) {
          return res.status(404).json({ message: "Event not found" })
        }

        const categoryCheck = await storage.checkRollNoCategoryRegistration(rollNo, event.category as 'technical' | 'non_technical')

        return res.json({
          rollNo,
          registrations: registrations.map(r => ({
            eventId: r.eventId,
            eventName: r.event?.name,
            category: r.event?.category,
            role: r.role,
            status: r.status,
            teamSize: 1 + (r.teamMembers?.length || 0)
          })),
          canRegisterForEvent: !categoryCheck.isRegistered,
          blockedReason: categoryCheck.isRegistered
            ? `Already registered for ${categoryCheck.event?.name} in ${event.category} category`
            : null
        })
      }

      res.json({
        rollNo,
        registrations: registrations.map(r => ({
          eventId: r.eventId,
          eventName: r.event?.name,
          category: r.event?.category,
          role: r.role,
          status: r.status,
          teamSize: 1 + (r.teamMembers?.length || 0)
        })),
        technicalRegistered: registrations.some(r => r.event?.category === 'technical'),
        nonTechnicalRegistered: registrations.some(r => r.event?.category === 'non_technical')
      })
    } catch (error) {
      console.error("Check registration status error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get all registrations (Admin)
  app.get("/api/registrations", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const registrations = await cacheService.get(
        'registrations:all',
        () => storage.getRegistrations(),
        300 // 5 minutes TTL - registrations change frequently
      )
      res.json(registrations)
    } catch (error) {
      console.error("Get registrations error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Update registration details (Admin only)
  app.patch("/api/registrations/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { id } = req.params;
      const updates = req.body;

      // Basic validation
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updates provided" });
      }

      const registration = await storage.getRegistration(id);
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" });
      }

      const updated = await storage.updateRegistration(id, updates);

      // Audit Log
      await logSuperAdminAction(
        user.id,
        user.username,
        "UPDATE_REGISTRATION",
        "registration",
        id,
        updated?.organizerName || null,
        updates,
        "Registration details updated",
        getClientIp(req)
      );

      // Notify real-time update
      if (updated) {
        WebSocketService.notifyRegistrationUpdate(updated.eventId, updated);
      }

      res.json(updated);
    } catch (error) {
      console.error("Update registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  })

  // Download registrations as Excel (grouped by participant)
  app.get("/api/registrations/download-excel", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      // Get all confirmed registrations with event details
      const registrations = await storage.getRegistrations()
      const confirmedRegistrations = registrations.filter(r => r.status === 'confirmed')

      if (confirmedRegistrations.length === 0) {
        return res.status(404).json({ message: "No confirmed registrations found" })
      }

      // Group by roll number (include both organizers and team members)
      const participantMap = new Map<string, {
        name: string
        rollNo: string
        email: string
        dept: string
        college: string
        phone: string
        events: string[]
      }>()

      for (const reg of confirmedRegistrations) {
        const eventName = reg.event?.name || 'Unknown Event'

        // Add organizer
        const organizerRollNo = reg.organizerRollNo
        if (participantMap.has(organizerRollNo)) {
          // Add event to existing participant
          participantMap.get(organizerRollNo)!.events.push(eventName)
        } else {
          // Create new participant entry for organizer
          participantMap.set(organizerRollNo, {
            name: reg.organizerName,
            rollNo: reg.organizerRollNo,
            email: reg.organizerEmail,
            dept: reg.organizerDept,
            college: reg.organizerCollege || 'N/A',
            phone: reg.organizerPhone || 'N/A',
            events: [eventName]
          })
        }

        // Add team members (inherit organizer's college since they're part of the same team)
        if (reg.teamMembers && reg.teamMembers.length > 0) {
          for (const member of reg.teamMembers) {
            const memberRollNo = member.memberRollNo
            if (participantMap.has(memberRollNo)) {
              // Add event to existing team member
              participantMap.get(memberRollNo)!.events.push(eventName)
            } else {
              // Create new participant entry for team member
              participantMap.set(memberRollNo, {
                name: member.memberName,
                rollNo: member.memberRollNo,
                email: member.memberEmail,
                dept: member.memberDept,
                college: reg.organizerCollege || 'N/A', // Use organizer's college for team members
                phone: member.memberPhone || 'N/A',
                events: [eventName]
              })
            }
          }
        }
      }

      // Convert map to array and sort by name
      const participants = Array.from(participantMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      )

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Confirmed Participants')

      // Define columns
      worksheet.columns = [
        { header: '#', key: 'index', width: 8 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Roll No', key: 'rollNo', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Department', key: 'dept', width: 15 },
        { header: 'College', key: 'college', width: 20 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Events', key: 'events', width: 40 },
        { header: 'Total Registrations', key: 'totalRegistrations', width: 20 }
      ]

      // Style header row
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      }
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }

      // Add data rows
      participants.forEach((participant, index) => {
        worksheet.addRow({
          index: index + 1,
          name: participant.name,
          rollNo: participant.rollNo,
          email: participant.email,
          dept: participant.dept,
          college: participant.college,
          phone: participant.phone,
          events: participant.events.join(', '),
          totalRegistrations: participant.events.length
        })
      })

      // Auto-fit columns and add borders
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          }
          if (rowNumber > 1) {
            cell.alignment = { vertical: 'middle' }
          }
        })
      })

      // Set response headers for file download
      const fileName = `confirmed-participants-${new Date().toISOString().split('T')[0]}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

      // Write to response
      await workbook.xlsx.write(res)
      res.end()
    } catch (error) {
      console.error("Download registrations Excel error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Create a new team-based registration
  app.post("/api/register", publicApiLimiter, async (req: Request, res: Response) => {
    try {
      const {
        eventId,
        organizerRollNo,
        organizerName,
        organizerEmail,
        organizerDept,
        organizerCollege,
        organizerPhone,
        organizerFoodType,
        teamMembers
      } = req.body

      // Validate required fields
      if (!eventId || !organizerRollNo || !organizerName || !organizerEmail || !organizerDept) {
        return res.status(400).json({
          message: "eventId, organizerRollNo, organizerName, organizerEmail, and organizerDept are required"
        })
      }

      // Get event details
      const event = await storage.getEventById(eventId)
      if (!event) {
        return res.status(404).json({ message: "Event not found" })
      }

      // Calculate team size (1 for organizer + team members)
      const totalMembers = 1 + (teamMembers?.length || 0)
      const registrationType = totalMembers > 1 ? 'team' : 'solo'

      // Validate team size
      const minMembers = event.minMembers || 1
      const maxMembers = event.maxMembers || 1

      if (totalMembers < minMembers) {
        return res.status(400).json({
          message: `Team must have at least ${minMembers} member(s). You have ${totalMembers}.`,
          minMembers,
          maxMembers,
          currentSize: totalMembers
        })
      }

      if (totalMembers > maxMembers) {
        return res.status(400).json({
          message: `Team can have at most ${maxMembers} member(s). You have ${totalMembers}.`,
          minMembers,
          maxMembers,
          currentSize: totalMembers
        })
      }

      // Validate all members (Organizer + Team)
      const invalidMembers: Array<{ rollNo: string; name: string; reason: string }> = []

      // Check if organizer is already registered for this category
      const organizerCheck = await storage.checkRollNoCategoryRegistration(
        organizerRollNo,
        event.category as 'technical' | 'non_technical'
      )

      if (organizerCheck.isRegistered) {
        invalidMembers.push({
          rollNo: organizerRollNo,
          name: organizerName,
          reason: `Already registered for ${organizerCheck.event?.name} in ${event.category} category (Organizer)`
        })
      }

      // Validate each team member
      // BUG-B-08: compare normalized roll numbers so "ABC123" vs "abc123"
      // can't appear twice in one team.
      const normalizeRollNo = (r: string) => r.trim().toUpperCase();
      const allRollNos = [normalizeRollNo(organizerRollNo)]

      if (teamMembers && teamMembers.length > 0) {
        for (const member of teamMembers) {
          if (!member.memberRollNo || !member.memberName || !member.memberEmail || !member.memberDept) {
            invalidMembers.push({
              rollNo: member.memberRollNo || 'unknown',
              name: member.memberName || 'Unknown',
              reason: 'Missing required fields (rollNo, name, email, dept)'
            })
            continue
          }

          // Check for duplicate roll numbers in the team
          if (allRollNos.includes(normalizeRollNo(member.memberRollNo))) {
            invalidMembers.push({
              rollNo: member.memberRollNo,
              name: member.memberName,
              reason: 'Duplicate roll number in team'
            })
            continue
          }
          allRollNos.push(normalizeRollNo(member.memberRollNo))

          // Check if member is already registered for this category
          const memberCheck = await storage.checkRollNoCategoryRegistration(
            member.memberRollNo,
            event.category as 'technical' | 'non_technical'
          )

          if (memberCheck.isRegistered) {
            invalidMembers.push({
              rollNo: member.memberRollNo,
              name: member.memberName,
              reason: `Already registered for ${memberCheck.event?.name} in ${event.category} category`
            })
          }
        }
      }

      if (invalidMembers.length > 0) {
        return res.status(409).json({
          message: 'Some team members cannot be registered',
          invalidMembers
        })
      }

      // ATOMIC OPERATION: Validate department limit + create registration in single transaction
      // This prevents race conditions where concurrent requests could bypass the department limit
      const result = await storage.createTeamRegistrationAtomic({
        eventId,
        eventName: event.name,
        organizerRollNo,
        organizerName,
        organizerEmail,
        organizerDept,
        organizerCollege,
        organizerPhone,
        organizerFoodType: organizerFoodType || 'veg', // Default to veg for backward compatibility
        registrationType: registrationType as 'solo' | 'team',
        teamMembers: (teamMembers || []).map((m: any) => ({
          memberRollNo: m.memberRollNo,
          memberName: m.memberName,
          memberEmail: m.memberEmail,
          memberDept: m.memberDept,
          memberPhone: m.memberPhone,
          memberFoodType: m.memberFoodType || 'veg',
        }))
      });

      // Check if registration creation failed due to department limit
      if (!result.success) {
        return res.status(409).json({
          message: result.error || 'Department participant limit exceeded',
          department: result.department,
          currentCount: result.currentCount,
          limit: 10,
          code: 'DEPARTMENT_LIMIT_EXCEEDED'
        });
      }

      const registration = result.registration!;

      // Upsert organizer into participant registry so food preference and
      // participant details persist across future registrations.
      await storage.upsertParticipantRegistry({
        rollNo: organizerRollNo,
        name: organizerName,
        email: organizerEmail,
        dept: organizerDept,
        phone: organizerPhone,
        college: organizerCollege,
        foodType: organizerFoodType || 'veg',
      });

      if (teamMembers && teamMembers.length > 0) {
        for (const member of teamMembers) {
          await storage.upsertParticipantRegistry({
            rollNo: member.memberRollNo,
            name: member.memberName,
            email: member.memberEmail,
            dept: member.memberDept,
            phone: member.memberPhone,
            college: organizerCollege,
            foodType: member.memberFoodType || 'veg',
          });
        }
      }

      // Notify via WebSocket
      WebSocketService.notifyRegistrationUpdate(eventId, {
        ...registration,
        eventName: event.name,
        teamSize: totalMembers
      })

      // Invalidate registration caches
      await cacheService.deletePattern('registrations:*')

      // Send registration received emails (background)
      // 1. Organizer
      queueService.addEmailJob(
        organizerEmail,
        `Registration Successful - ${event.name}`,
        'registration_received',
        {
          name: organizerName,
          eventName: event.name,
          registrationId: registration.id
        },
        organizerName
      ).catch(err => console.error(`Failed to queue registration email for ${organizerEmail}:`, err))

      // 2. Team Members
      if (teamMembers && teamMembers.length > 0) {
        teamMembers.forEach((member: any) => {
          queueService.addEmailJob(
            member.memberEmail,
            `Registration Successful - ${event.name}`,
            'registration_received',
            {
              name: member.memberName,
              eventName: event.name,
              registrationId: registration.id
            },
            member.memberName
          ).catch(err => console.error(`Failed to queue registration email for ${member.memberEmail}:`, err))
        })
      }


      res.status(201).json({
        message: 'Registration submitted successfully',
        registration: {
          id: registration.id,
          eventId: registration.eventId,
          eventName: event.name,
          teamId: registration.teamId,
          organizerRollNo: registration.organizerRollNo,
          organizerName: registration.organizerName,
          registrationType: registration.registrationType,
          teamSize: totalMembers,
          status: registration.status,
          createdAt: registration.createdAt
        }
      })
    } catch (error) {
      console.error("Create registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Batch registration for consolidated emails
  app.post("/api/register/batch", async (req: Request, res: Response) => {
    try {
      const { registrations } = req.body
      if (!registrations || !Array.isArray(registrations) || registrations.length === 0) {
        return res.status(400).json({ message: "Registrations array is required" })
      }

      const results = []
      const successfulEvents = []
      const organizerDetails = {
        name: "",
        email: "",
        rollNo: "",
        college: "",
        dept: ""
      }

      // Helper to check if event is Paper Presentation
      const isPaperPresentation = (eventName: string) => {
        const normalized = eventName.toLowerCase()
        return normalized.includes('paper presentation') || normalized.includes('quanta talks')
      }

      // Process each registration
      for (const regData of registrations) {
        const {
          eventId,
          organizerRollNo,
          organizerName,
          organizerEmail,
          organizerDept,
          organizerCollege,
          organizerPhone,
          organizerFoodType,
          paperTopic,
          teamMembers
        } = regData

        // Capture organizer details from the first valid registration
        if (!organizerDetails.email) {
          organizerDetails.name = organizerName
          organizerDetails.email = organizerEmail
          organizerDetails.rollNo = organizerRollNo
          organizerDetails.college = organizerCollege
          organizerDetails.dept = organizerDept
        }

        // --- Validation Logic (Copied & Adapted) ---
        if (!eventId || !organizerRollNo || !organizerName || !organizerEmail || !organizerDept) {
          results.push({ eventId, success: false, message: "Missing required fields" })
          continue
        }

        // Validate organizer food type (required)
        if (!organizerFoodType || !FOOD_TYPES.includes(organizerFoodType)) {
          results.push({ eventId, success: false, message: "Invalid or missing food type for organizer. Must be 'veg' or 'nonveg'" })
          continue
        }

        // Check if organizer exists in participant registry and validate food type
        const existingOrganizerParticipant = await storage.getParticipantRegistryByRollNo(organizerRollNo)
        if (existingOrganizerParticipant && existingOrganizerParticipant.foodType !== organizerFoodType) {
          results.push({
            eventId,
            success: false,
            message: `Food type mismatch for roll_no: ${organizerRollNo}. Existing value: ${existingOrganizerParticipant.foodType}`
          })
          continue
        }

        const event = await storage.getEventById(eventId)
        if (!event) {
          results.push({ eventId, success: false, message: "Event not found" })
          continue
        }

        // Validate paper topic if Paper Presentation event
        if (isPaperPresentation(event.name)) {
          if (!paperTopic) {
            results.push({ eventId, success: false, message: "Paper topic is required for Paper Presentation event" })
            continue
          }
          if (!PAPER_PRESENTATION_TOPICS.includes(paperTopic as any)) {
            results.push({ eventId, success: false, message: `Invalid paper topic. Must be one of: ${PAPER_PRESENTATION_TOPICS.join(', ')}` })
            continue
          }
        }

        const totalMembers = 1 + (teamMembers?.length || 0)
        const minMembers = event.minMembers || 1
        const maxMembers = event.maxMembers || 1

        if (totalMembers < minMembers || totalMembers > maxMembers) {
          results.push({ eventId, success: false, message: `Invalid team size. Required: ${minMembers}-${maxMembers}` })
          continue
        }

        // Check organizer registration
        const organizerCheck = await storage.checkRollNoCategoryRegistration(
          organizerRollNo,
          event.category as 'technical' | 'non_technical'
        )

        if (organizerCheck.isRegistered) {
          results.push({
            eventId,
            success: false,
            message: `Already registered for ${organizerCheck.event?.name} in ${event.category} category`
          })
          continue
        }

        // Validate Members
        const invalidMembers: any[] = []
        const allRollNos = [organizerRollNo]

        if (teamMembers && teamMembers.length > 0) {
          for (const member of teamMembers) {
            if (!member.memberRollNo || !member.memberName || !member.memberEmail || !member.memberDept) {
              invalidMembers.push({ name: member.memberName, reason: 'Missing fields' })
              continue
            }
            // Validate member food type
            if (!member.memberFoodType || !FOOD_TYPES.includes(member.memberFoodType)) {
              invalidMembers.push({ name: member.memberName, reason: "Invalid or missing food type. Must be 'veg' or 'nonveg'" })
              continue
            }
            // Check if member exists in participant registry and validate food type
            const existingMemberParticipant = await storage.getParticipantRegistryByRollNo(member.memberRollNo)
            if (existingMemberParticipant && existingMemberParticipant.foodType !== member.memberFoodType) {
              invalidMembers.push({
                name: member.memberName,
                reason: `Food type mismatch. Existing value: ${existingMemberParticipant.foodType}`
              })
              continue
            }
            if (allRollNos.includes(member.memberRollNo)) {
              invalidMembers.push({ name: member.memberName, reason: 'Duplicate roll no' })
              continue
            }
            allRollNos.push(member.memberRollNo)

            const memberCheck = await storage.checkRollNoCategoryRegistration(
              member.memberRollNo,
              event.category as 'technical' | 'non_technical'
            )
            if (memberCheck.isRegistered) {
              invalidMembers.push({ name: member.memberName, reason: `Already registered in ${event.category}` })
            }
          }
        }

        if (invalidMembers.length > 0) {
          results.push({ eventId, success: false, message: "Invalid team members", invalidMembers })
          continue
        }

        // ATOMIC OPERATION: Validate department limit + create registration in single transaction
        const result = await storage.createTeamRegistrationAtomic({
          eventId,
          eventName: event.name,
          organizerRollNo,
          organizerName,
          organizerEmail,
          organizerDept,
          organizerCollege,
          organizerPhone,
          organizerFoodType,
          registrationType: totalMembers > 1 ? 'team' : 'solo',
          paperTopic: isPaperPresentation(event.name) ? paperTopic : undefined,
          teamMembers: teamMembers?.map((m: any) => ({
            memberRollNo: m.memberRollNo,
            memberName: m.memberName,
            memberEmail: m.memberEmail,
            memberDept: m.memberDept,
            memberPhone: m.memberPhone,
            memberFoodType: m.memberFoodType,
          })) || []
        });

        // Check if registration creation failed due to department limit
        if (!result.success) {
          results.push({
            eventId,
            success: false,
            message: result.error || 'Department participant limit exceeded',
            code: 'DEPARTMENT_LIMIT_EXCEEDED',
            department: result.department,
            currentCount: result.currentCount
          });
          continue;
        }

        const registration = result.registration!

        // Upsert participant registry entries (stores food preferences globally)
        await storage.upsertParticipantRegistry({
          rollNo: organizerRollNo,
          name: organizerName,
          email: organizerEmail,
          dept: organizerDept,
          phone: organizerPhone,
          college: organizerCollege,
          foodType: organizerFoodType
        })

        // Upsert team members to participant registry
        if (teamMembers && teamMembers.length > 0) {
          for (const member of teamMembers) {
            await storage.upsertParticipantRegistry({
              rollNo: member.memberRollNo,
              name: member.memberName,
              email: member.memberEmail,
              dept: member.memberDept,
              phone: member.memberPhone,
              foodType: member.memberFoodType
            })
          }
        }

        // Notify WebSocket
        WebSocketService.notifyRegistrationUpdate(eventId, {
          ...registration,
          eventName: event.name,
          teamSize: totalMembers
        })

        results.push({ eventId, success: true, registrationId: registration.id, teamId: registration.teamId })
        successfulEvents.push({ name: event.name })

        // Process Emails for Team Members (Individual or Consolidated if we wanted, but sticking to individual for members for now as they might differ per event)
        // User asked for "single mail with both events names... to participant". 
        // "Participant" usually means the person registering (Organizer).
        // Team members might only be in one event, so individual email is fine/better for them unless they are in both.
        // For simplicity and matching the main request (Organizer gets consolidated):
        if (teamMembers && teamMembers.length > 0) {
          teamMembers.forEach((member: any) => {
            queueService.addEmailJob(
              member.memberEmail,
              `Registration Successful - ${event.name}`,
              'registration_received',
              { name: member.memberName, eventName: event.name, registrationId: registration.id },
              member.memberName
            ).catch(console.error)
          })
        }
      }

      await cacheService.deletePattern('registrations:*')

      // Send Consolidated Email to Organizer
      if (successfulEvents.length > 0 && organizerDetails.email) {
        queueService.addEmailJob(
          organizerDetails.email,
          `Registration Successful - ${successfulEvents.length} Events`,
          'registration_received_consolidated',
          {
            name: organizerDetails.name,
            events: successfulEvents,
            details: {
              college: organizerDetails.college,
              rollNo: organizerDetails.rollNo
            }
          },
          organizerDetails.name
        ).catch(err => console.error("Failed to queue consolidated email:", err))
      }

      res.status(201).json({
        message: "Batch registration processed",
        results,
        successfulCount: successfulEvents.length
      })

    } catch (error) {
      console.error("Batch registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get registrations by roll number
  app.get("/api/student-registrations/:rollNo", publicApiLimiter, async (req: Request, res: Response) => {
    try {
      const { rollNo } = req.params

      const registrations = await storage.getRegistrationsByRollNo(rollNo)

      res.json({
        rollNo,
        registrations: registrations.map(r => ({
          id: r.id,
          eventId: r.eventId,
          eventName: r.event?.name,
          eventCategory: r.event?.category,
          role: r.role,
          status: r.status,
          registrationType: r.registrationType,
          teamSize: 1 + (r.teamMembers?.length || 0),
          createdAt: r.createdAt
        })),
        technicalEvent: registrations.find(r => r.event?.category === 'technical')?.event?.name || null,
        nonTechnicalEvent: registrations.find(r => r.event?.category === 'non_technical')?.event?.name || null
      })
    } catch (error) {
      console.error("Get student registrations error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })



  // Get unique colleges for filtering
  app.get("/api/registrations/colleges", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const colleges = await cacheService.get(
        'registrations:colleges',
        () => storage.getUniqueColleges(),
        600 // 10 minutes TTL - colleges rarely change
      )
      res.json(colleges)
    } catch (error) {
      console.error("Get colleges error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // DELETE registration by ID (super admin or registration committee)
  app.delete("/api/registrations/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const registration = await storage.getRegistration(req.params.id)
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" })
      }

      await storage.deleteRegistration(req.params.id)

      // Invalidate all registration caches
      await cacheService.deletePattern('registrations:*')

      // Notify via WebSocket
      WebSocketService.notifyRegistrationUpdate(registration.eventId, {
        type: 'deleted',
        registrationId: req.params.id
      })

      res.json({ message: "Registration deleted successfully" })
    } catch (error) {
      console.error("Delete registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })


  // NEW: Confirm team-based registration
  app.patch("/api/registrations/:id/confirm", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const registration = await storage.getRegistration(req.params.id)
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" })
      }

      if (registration.status !== "pending") {
        return res.status(400).json({ message: "Registration has already been processed" })
      }

      const event = await storage.getEventById(registration.eventId)
      if (!event) {
        return res.status(404).json({ message: "Event not found" })
      }

      const eventCredentialsList: Array<{
        eventId: string;
        eventName: string;
        eventUsername: string;
        eventPassword: string;
        participantName: string;
        participantEmail: string;
        participantRollNo: string;
        teamId: string;
      }> = []

      // Process organizer
      // Function to create user account and participant record (for all team members)
      const processUserAndParticipant = async (name: string, email: string, rollNo: string, dept: string) => {
        // Check if user exists
        let participantUser = await storage.getUserByEmail(email)
        let password = ""

        if (!participantUser) {
          password = generateSecurePassword()
          const hashedPassword = await bcrypt.hash(password, 10)
          const username = `${email.split('@')[0]}_${nanoid(6)}`.toLowerCase()
          participantUser = await storage.createUser({
            username: username,
            password: hashedPassword,
            email: email,
            fullName: name,
            role: "participant",
          } as any)
        }

        // Create participant record
        const existingParticipant = await storage.getParticipantByUserAndEvent(participantUser.id, registration.eventId)
        if (!existingParticipant) {
          await storage.createParticipant(participantUser.id, registration.eventId)
        }

        return participantUser.id
      }

      // Function to create event credentials (for organizer only)
      const processCredentials = async (userId: string, name: string, email: string, rollNo: string) => {
        // Check if credentials already exist
        const existingCredential = await storage.getEventCredentialByUserAndEvent(userId, registration.eventId)

        if (!existingCredential) {
          const count = await storage.getEventCredentialCountForEvent(registration.eventId)
          const counter = count + 1
          const { username: eventUsername, password: eventPassword } = await generateUniqueEventCredentials(
            name,
            event.name,
            counter,
          )

          await storage.createEventCredential(userId, registration.eventId, eventUsername, eventPassword)

          eventCredentialsList.push({
            eventId: registration.eventId,
            eventName: event.name,
            eventUsername,
            eventPassword,
            participantName: name,
            participantEmail: email,
            participantRollNo: rollNo,
            teamId: registration.teamId,
          })

          // NOTE: Individual emails removed - will send consolidated email after all credentials are collected
        } else {
          let eventPassword = existingCredential.eventPassword;
          // Check if password is a bcrypt hash ($2a$, $2b$, or $2y$ and 60 chars) - never email a hash
          if (eventPassword && eventPassword.length === 60 && eventPassword.startsWith('$2')) {
            const { password: newPassword } = await generateUniqueEventCredentials(
              name,
              event.name,
              1,
            );
            eventPassword = newPassword;
            await storage.updateEventCredentialPassword(existingCredential.id, eventPassword);
          }

          eventCredentialsList.push({
            eventId: registration.eventId,
            eventName: event.name,
            eventUsername: existingCredential.eventUsername,
            eventPassword,
            participantName: name,
            participantEmail: email,
            participantRollNo: rollNo,
            teamId: registration.teamId,
          })
        }
      }

      // Process organizer: create user, participant record, AND credentials
      const organizerUserId = await processUserAndParticipant(
        registration.organizerName,
        registration.organizerEmail,
        registration.organizerRollNo,
        registration.organizerDept
      )
      await processCredentials(
        organizerUserId,
        registration.organizerName,
        registration.organizerEmail,
        registration.organizerRollNo
      )

      // Process team members: create user and participant record ONLY (no credentials)
      if (registration.teamMembers && registration.teamMembers.length > 0) {
        for (const member of registration.teamMembers) {
          await processUserAndParticipant(
            member.memberName,
            member.memberEmail,
            member.memberRollNo,
            member.memberDept
          )
          // Note: No credentials created for team members - they share organizer's credentials
        }
      }

      // BUG-C-03: flip the registration status BEFORE queueing any emails —
      // previously a confirm failure after queueing sent a false "Registration
      // Confirmed" email for a registration that stayed pending.
      const updated = await storage.confirmRegistration(req.params.id, user.id)

      // Invalidate registration caches
      await cacheService.deletePattern('registrations:*')

      // Send CONSOLIDATED credentials email to organizer (credits optimization)
      if (eventCredentialsList.length > 0) {
        const credentials = eventCredentialsList.map(cred => ({
          eventName: cred.eventName,
          username: cred.eventUsername,
          password: cred.eventPassword,
          teamId: cred.teamId,
        }))

        // Send ONE email to organizer with all events' credentials
        queueService.addEmailJob(
          registration.organizerEmail,
          `Registration Confirmed - ${eventCredentialsList.length} Event${eventCredentialsList.length > 1 ? 's' : ''}`,
          'credentials_consolidated',
          {
            name: registration.organizerName,
            credentials
          },
          registration.organizerName
        ).catch(err => {
          console.error(`Failed to queue consolidated credentials email for organizer ${registration.organizerEmail}:`, err)
        })

        // Send same consolidated email to team members (they share same credentials)
        if (registration.teamMembers && registration.teamMembers.length > 0) {
          for (const member of registration.teamMembers) {
            queueService.addEmailJob(
              member.memberEmail,
              `Registration Confirmed - ${eventCredentialsList.length} Event${eventCredentialsList.length > 1 ? 's' : ''}`,
              'credentials_consolidated',
              {
                name: member.memberName,
                credentials
              },
              member.memberName
            ).catch(err => {
              console.error(`Failed to queue consolidated credentials email for team member ${member.memberEmail}:`, err)
            })
          }
        }
      }

      // Notify via WebSocket for instant UI update
      WebSocketService.notifyRegistrationConfirmed({
        ...updated,
        organizerName: updated.organizerName,
        eventId: updated.eventId
      })

      res.json({
        registration: updated,
        eventCredentials: eventCredentialsList,
        message: `Successfully confirmed registration for ${eventCredentialsList.length} participant(s)`
      })
    } catch (error: any) {
      // BUG-C-02: concurrent confirm race — the registration was confirmed
      // by another request between our check and the UPDATE.
      if (error?.message?.includes('not in pending state')) {
        return res.status(409).json({ message: 'Registration was already processed by another request' })
      }
      console.error("Confirm registration error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Bulk confirm registrations for same participant (multiple events)
  app.post("/api/registrations/bulk-confirm", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const { registrationIds } = req.body
      if (!registrationIds || !Array.isArray(registrationIds) || registrationIds.length === 0) {
        return res.status(400).json({ message: "registrationIds array is required" })
      }

      const results = []
      const errors = []

      for (const id of registrationIds) {
        try {
          // Get registration
          const registration = await storage.getRegistration(id)
          if (!registration) {
            errors.push({ id, error: "Registration not found" })
            continue
          }

          if (registration.status !== 'pending') {
            // Already confirmed, skip
            continue
          }

          // Get event
          const event = await storage.getEvent(registration.eventId)
          if (!event) {
            errors.push({ id, error: "Event not found" })
            continue
          }

          // Helper to create user and participant
          const ensureParticipant = async (name: string, email: string) => {
            let participantUser = await storage.getUserByEmail(email)
            if (!participantUser) {
              const password = generateSecurePassword()
              const hashedPassword = await bcrypt.hash(password, 10)
              const username = `${email.split('@')[0]}_${nanoid(6)}`.toLowerCase()
              participantUser = await storage.createUser({
                username,
                password: hashedPassword,
                email,
                fullName: name,
                role: "participant",
              } as any)
            }

            const existingParticipant = await storage.getParticipantByUserAndEvent(participantUser.id, registration.eventId)
            if (!existingParticipant) {
              await storage.createParticipant(participantUser.id, registration.eventId)
            }
            return participantUser.id
          }

          // 1. Process Organizer
          const organizerUserId = await ensureParticipant(registration.organizerName, registration.organizerEmail)

          // 2. Ensure Credential for Organizer
          let credentialUsername = ""
          let credentialPassword = ""

          const existingCred = await storage.getEventCredentialByUserAndEvent(organizerUserId, registration.eventId)
          if (existingCred) {
            credentialUsername = existingCred.eventUsername
            credentialPassword = existingCred.eventPassword
          } else {
            const count = await storage.getEventCredentialCountForEvent(registration.eventId)
            const creds = await generateUniqueEventCredentials(
              registration.organizerName,
              event.name,
              count + 1
            )
            credentialUsername = creds.username
            credentialPassword = creds.password

            await storage.createEventCredential(
              organizerUserId,
              registration.eventId,
              credentialUsername,
              credentialPassword
            )
          }

          // 3. Process Team Members
          if (registration.teamMembers && registration.teamMembers.length > 0) {
            for (const member of registration.teamMembers) {
              await ensureParticipant(member.memberName, member.memberEmail)

              // Note: Team members share the organizer's credentials, we don't create new ones
              // We just ensure they are registered as participants
            }
          }

          // 4. Send Emails (Organizer)
          const credData = {
            eventName: event.name,
            username: credentialUsername,
            password: credentialPassword,
            teamId: registration.teamId,
          }

          queueService.addEmailJob(
            registration.organizerEmail,
            `Registration Confirmed - ${event.name}`,
            'credentials_consolidated',
            {
              name: registration.organizerName,
              credentials: [credData]
            },
            registration.organizerName
          ).catch(e => console.error(`Failed to queue email for ${registration.organizerEmail}:`, e))

          // 5. Send Emails (Team Members)
          if (registration.teamMembers && registration.teamMembers.length > 0) {
            for (const member of registration.teamMembers) {
              queueService.addEmailJob(
                member.memberEmail,
                `Registration Confirmed - ${event.name}`,
                'credentials_consolidated',
                {
                  name: member.memberName,
                  credentials: [credData]
                },
                member.memberName
              ).catch(e => console.error(`Failed to queue email for ${member.memberEmail}:`, e))
            }
          }

          // Confirm the registration
          const updated = await storage.confirmRegistration(id, user.id)
          results.push(updated)

          // Notify WebSocket
          WebSocketService.notifyRegistrationConfirmed({
            ...updated,
            organizerName: updated.organizerName,
            eventId: updated.eventId
          })

        } catch (err: any) {
          console.error(`Error processing bulk confirm for ${id}:`, err)
          errors.push({ id, error: err.message })
        }
      }

      // Invalidate caches
      await cacheService.deletePattern('registrations:*')

      res.json({
        success: true,
        confirmed: results.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Confirmed ${results.length} registration(s)`
      })
    } catch (error) {
      console.error("Bulk confirm registrations error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.post(
    "/api/registration-committee/participants",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { fullName, email, phone, college, rollNo, department, year, selectedEvents, teamMembers: incomingTeamMembers } = req.body

        if (!fullName || !email || !selectedEvents || selectedEvents.length === 0 || !college || !rollNo || !department || !year) {
          return res.status(400).json({ message: "All fields (Name, Email, College, Roll No, Dept, Year, Events) are required" })
        }

        const validation = await validateEventSelection(selectedEvents)
        if (!validation.valid) {
          return res.status(400).json({ message: validation.error })
        }

        const existingEmail = await storage.getUserByEmail(email)
        if (existingEmail) {
          return res.status(400).json({ message: "Email already exists" })
        }

        // Check for existing registrations by Roll No (Database Check)
        const eventsList = await storage.getEventsByIds(selectedEvents)
        for (const event of eventsList) {
          const existing = await storage.checkRollNoCategoryRegistration(rollNo, event.category)
          if (existing.isRegistered) {
            return res.status(400).json({
              message: `Participant with Roll No ${rollNo} is already registered for a ${event.category} event (${existing.event?.name})`
            })
          }
        }

        const password = generateSecurePassword()
        const hashedPassword = await bcrypt.hash(password, 10)
        const username = `${email.split('@')[0]}_${nanoid(6)}`.toLowerCase()

        const newUser = await storage.createUser({
          username: username,
          password: hashedPassword,
          email: email,
          fullName: fullName,
          phone: phone || null,
          role: "participant",
          createdBy: user.id,
        } as any)

        const eventCredentialsList = []
        const hasTeam = incomingTeamMembers && Array.isArray(incomingTeamMembers) && incomingTeamMembers.length > 0;
        const atomicTeamMembers = hasTeam ? incomingTeamMembers.map((m: any) => ({
          memberName: m.memberName,
          memberEmail: m.memberEmail,
          memberRollNo: m.memberRollNo,
          memberDept: m.memberDept || `${department} (${year})`,
          memberPhone: m.memberPhone || null,
          memberFoodType: 'veg' as const,
        })) : undefined;

        for (const eventId of selectedEvents) {
          const event = eventsList.find(e => e.id === eventId)
          if (!event) continue

          // 1. Create Registration Record with ATOMIC department validation
          // This prevents race conditions in on-spot registration flow
          const result = await storage.createTeamRegistrationAtomic({
            eventId,
            eventName: event.name,
            organizerRollNo: rollNo,
            organizerName: fullName,
            organizerEmail: email,
            organizerDept: `${department} (${year})`,
            organizerPhone: phone,
            organizerCollege: college, // Store college!
            organizerFoodType: 'veg', // Default for on-spot registration
            registrationType: hasTeam ? 'team' : 'solo',
            teamMembers: atomicTeamMembers,
          });

          // Check if registration failed due to department limit
          if (!result.success) {
            // Rollback user creation (delete the user we just created)
            await storage.deleteUser(newUser.id);

            return res.status(409).json({
              message: result.error || 'Department participant limit exceeded',
              department: result.department,
              currentCount: result.currentCount,
              limit: 10,
              code: 'DEPARTMENT_LIMIT_EXCEEDED'
            });
          }

          const registration = result.registration!;

          // 2. Confirm Registration
          await storage.confirmRegistration(registration.id, user.id)

          // 3. Create Participant Entry for organizer
          await storage.createParticipant(newUser.id, eventId)

          // 3b. Create Participant Entry for each team member
          if (hasTeam) {
            for (const member of incomingTeamMembers) {
              let memberUser = await storage.getUserByEmail(member.memberEmail);
              if (!memberUser) {
                const memPass = generateSecurePassword();
                const memHash = await bcrypt.hash(memPass, 10);
                const memUsername = `${member.memberEmail.split('@')[0]}_${nanoid(6)}`.toLowerCase();
                memberUser = await storage.createUser({
                  username: memUsername,
                  password: memHash,
                  email: member.memberEmail,
                  fullName: member.memberName,
                  phone: member.memberPhone || null,
                  role: "participant",
                  createdBy: user.id,
                } as any);
              }
              const existingPart = await storage.getParticipantByUserAndEvent(memberUser.id, eventId);
              if (!existingPart) {
                await storage.createParticipant(memberUser.id, eventId);
              }
            }
          }

          // 4. Create Credentials
          const count = await storage.getEventCredentialCountForEvent(eventId)
          const counter = count + 1
          const { username: eventUsername, password: eventPassword } = await generateUniqueEventCredentials(
            fullName,
            event.name,
            counter,
          )

          await storage.createEventCredential(newUser.id, eventId, eventUsername, eventPassword)

          eventCredentialsList.push({
            eventId,
            eventName: event.name,
            eventUsername,
            eventPassword,
            teamId: registration.teamId,
          })
        }

        // Send consolidated credentials email (credits optimization)
        if (eventCredentialsList.length > 0) {
          const credentials = eventCredentialsList.map(cred => ({
            eventName: cred.eventName,
            username: cred.eventUsername,
            password: cred.eventPassword,
            teamId: cred.teamId,
          }))

          // Send ONE email with all events' credentials
          queueService.addEmailJob(
            email,
            `Registration Confirmed - ${eventCredentialsList.length} Event${eventCredentialsList.length > 1 ? 's' : ''}`,
            'credentials_consolidated',
            {
              name: fullName,
              credentials
            },
            fullName
          ).catch(err => {
            console.error(`Failed to queue consolidated credentials email for ${email}:`, err)
          })
        }

        // Notify via WebSocket for each event
        for (const eventCred of eventCredentialsList) {
          WebSocketService.notifyRegistrationUpdate(eventCred.eventId, {
            participantId: newUser.id,
            fullName: newUser.fullName,
            email: newUser.email,
            eventName: eventCred.eventName,
          })
        }

        res.status(201).json({
          participant: {
            id: newUser.id,
            fullName: newUser.fullName,
            email: newUser.email,
            phone: newUser.phone,
          },
          mainCredentials: {
            username: newUser.username,
            password: password,
            email: newUser.email,
            phone: newUser.phone,
          },
          eventCredentials: eventCredentialsList,
        })
      } catch (error) {
        console.error("Create on-spot participant error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get(
    "/api/registration-committee/participants",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const filterMy = req.query.my === 'true';
        const participants = await storage.getOnSpotParticipantsByCreator(filterMy ? user.id : undefined)
        res.json(participants)
      } catch (error) {
        console.error("Get on-spot participants error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // Get participant details
  app.get("/api/participants/:id", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      // Check access
      if (req.user!.role === 'participant' && req.user!.id !== req.params.id) {
        // Participants can only view their own details, unless they are viewing via an event context
        // But this endpoint is generic by participant ID (which is a UUID)
        // Actually, the ID here is likely the participant record ID, not user ID
        // Let's check the implementation of getParticipant
      }

      const participantId = req.params.id;
      const participant = await cacheService.get(
        `participant:${participantId}`,
        () => storage.getParticipant(participantId),
        600
      );

      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }

      // Additional access check if needed based on participant.userId

      res.json(participant);
    } catch (error) {
      console.error("Get participant error:", error)
      res.status(500).json({ message: "Failed to fetch participant" });
    }
  });

  app.patch(
    "/api/registration-committee/participants/:id",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { fullName, email, phone } = req.body

        const participant = await storage.getUser(req.params.id)
        if (!participant) {
          return res.status(404).json({ message: "Participant not found" })
        }

        if (participant.createdBy !== user.id) {
          return res.status(403).json({ message: "You can only edit participants you created" })
        }

        const updates: any = {}
        if (fullName !== undefined) updates.fullName = fullName
        if (email !== undefined) updates.email = email
        if (phone !== undefined) updates.phone = phone

        const updatedUser = await storage.updateUserDetails(req.params.id, updates)
        if (!updatedUser) {
          return res.status(404).json({ message: "Participant not found" })
        }

        const { password: _, ...userWithoutPassword } = updatedUser
        res.json(userWithoutPassword)
      } catch (error: any) {
        console.error("Update on-spot participant error:", error)
        if (error.message === "Email already exists") {
          return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.delete(
    "/api/registration-committee/participants/:id",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!

        const participant = await storage.getUser(req.params.id)
        if (!participant) {
          return res.status(404).json({ message: "Participant not found" })
        }

        if (participant.createdBy !== user.id) {
          return res.status(403).json({ message: "You can only delete participants you created" })
        }

        await storage.deleteUser(req.params.id)

        // Invalidate caches
        await cacheService.deletePattern('registrations:*')

        res.json({ message: "Participant deleted successfully" })
      } catch (error) {
        console.error("Delete on-spot participant error:", error)
        res.status(500).json({ message: "Failed to delete participant" })
      }
    },
  )

  app.get(
    "/api/registration-committee/participants/export/csv",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const filterMy = req.query.my === 'true';
        const participants = await storage.getOnSpotParticipantsByCreator(filterMy ? user.id : undefined)

        const csvRows: string[] = []
        csvRows.push("Participant Name,Email,Phone,Event Name,Username,Password")

        for (const participant of participants) {
          const { fullName, email, phone, eventCredentials } = participant

          if (eventCredentials && eventCredentials.length > 0) {
            for (const credential of eventCredentials) {
              const phoneValue = phone || ""
              const eventName = credential.event.name
              const username = credential.eventUsername
              const password = credential.eventPassword

              const escapedFullName = `"${fullName.replace(/"/g, '""')}"`
              const escapedEmail = `"${email.replace(/"/g, '""')}"`
              const escapedPhone = `"${phoneValue.replace(/"/g, '""')}"`
              const escapedEventName = `"${eventName.replace(/"/g, '""')}"`
              const escapedUsername = `"${username.replace(/"/g, '""')}"`
              const escapedPassword = `"${password.replace(/"/g, '""')}"`

              csvRows.push(
                `${escapedFullName},${escapedEmail},${escapedPhone},${escapedEventName},${escapedUsername},${escapedPassword}`,
              )
            }
          }
        }

        const csvContent = csvRows.join("\n")

        res.setHeader("Content-Type", "text/csv; charset=utf-8")
        res.setHeader("Content-Disposition", 'attachment; filename="participants-credentials.csv"')
        res.send(csvContent)
      } catch (error) {
        console.error("CSV export error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get(
    "/api/registration-committee/participants/export/pdf",
    requireAuth,
    requireRegistrationCommittee,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const filterMy = req.query.my === 'true';
        const participants = await storage.getOnSpotParticipantsByCreator(filterMy ? user.id : undefined)

        const doc = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" })

        res.setHeader("Content-Type", "application/pdf")
        res.setHeader("Content-Disposition", 'attachment; filename="participants-credentials.pdf"')

        doc.pipe(res)

        doc.fontSize(20).font("Helvetica-Bold").text("Participant Credentials - BootFete 2K26", { align: "center" })
        doc.moveDown(0.5)

        const generatedDate = new Date().toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        })
        doc.fontSize(10).font("Helvetica").text(`Generated: ${generatedDate}`, { align: "center" })
        doc.moveDown(1.5)

        const tableTop = doc.y
        const colWidths = [120, 150, 80, 120, 120, 100]
        const rowHeight = 25
        let currentY = tableTop

        const drawTableHeader = (y: number) => {
          doc.font("Helvetica-Bold").fontSize(9)

          doc.rect(50, y, colWidths[0], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Participant Name", 55, y + 8, { width: colWidths[0] - 10 })

          let xPos = 50 + colWidths[0]
          doc.rect(xPos, y, colWidths[1], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Email", xPos + 5, y + 8, { width: colWidths[1] - 10 })

          xPos += colWidths[1]
          doc.rect(xPos, y, colWidths[2], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Phone", xPos + 5, y + 8, { width: colWidths[2] - 10 })

          xPos += colWidths[2]
          doc.rect(xPos, y, colWidths[3], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Event", xPos + 5, y + 8, { width: colWidths[3] - 10 })

          xPos += colWidths[3]
          doc.rect(xPos, y, colWidths[4], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Username", xPos + 5, y + 8, { width: colWidths[4] - 10 })

          xPos += colWidths[4]
          doc.rect(xPos, y, colWidths[5], rowHeight).fillAndStroke("#4A5568", "#000")
          doc.fillColor("#FFF").text("Password", xPos + 5, y + 8, { width: colWidths[5] - 10 })

          return y + rowHeight
        }

        currentY = drawTableHeader(currentY)

        doc.font("Helvetica").fontSize(8)
        let rowIndex = 0

        for (const participant of participants) {
          const { fullName, email, phone, eventCredentials } = participant

          if (eventCredentials && eventCredentials.length > 0) {
            for (const credential of eventCredentials) {
              if (currentY > 500) {
                doc.addPage({ margin: 50, size: "A4", layout: "landscape" })
                currentY = 50
                currentY = drawTableHeader(currentY)
                rowIndex = 0
              }

              const bgColor = rowIndex % 2 === 0 ? "#F7FAFC" : "#FFFFFF"

              doc.rect(50, currentY, colWidths[0], rowHeight).fillAndStroke(bgColor, "#000")
              doc.fillColor("#000").text(fullName, 55, currentY + 8, { width: colWidths[0] - 10, ellipsis: true })

              let xPos = 50 + colWidths[0]
              doc.rect(xPos, currentY, colWidths[1], rowHeight).fillAndStroke(bgColor, "#000")
              doc.fillColor("#000").text(email, xPos + 5, currentY + 8, { width: colWidths[1] - 10, ellipsis: true })

              xPos += colWidths[1]
              doc.rect(xPos, currentY, colWidths[2], rowHeight).fillAndStroke(bgColor, "#000")
              doc
                .fillColor("#000")
                .text(phone || "", xPos + 5, currentY + 8, { width: colWidths[2] - 10, ellipsis: true })

              xPos += colWidths[2]
              doc.rect(xPos, currentY, colWidths[3], rowHeight).fillAndStroke(bgColor, "#000")
              doc
                .fillColor("#000")
                .text(credential.event.name, xPos + 5, currentY + 8, { width: colWidths[3] - 10, ellipsis: true })

              xPos += colWidths[3]
              doc.rect(xPos, currentY, colWidths[4], rowHeight).fillAndStroke(bgColor, "#000")
              doc
                .fillColor("#000")
                .text(credential.eventUsername, xPos + 5, currentY + 8, { width: colWidths[4] - 10, ellipsis: true })

              xPos += colWidths[4]
              doc.rect(xPos, currentY, colWidths[5], rowHeight).fillAndStroke(bgColor, "#000")
              doc
                .fillColor("#000")
                .text(credential.eventPassword, xPos + 5, currentY + 8, { width: colWidths[5] - 10, ellipsis: true })

              currentY += rowHeight
              rowIndex++
            }
          }
        }

        doc.end()
      } catch (error) {
        console.error("PDF export error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/events/:eventId/event-credentials", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      const { eventId } = req.params

      if (user.role === "event_admin") {
        const isEventAdmin = await storage.isUserEventAdmin(user.id, eventId)
        if (!isEventAdmin) {
          return res.status(403).json({ message: "Not authorized for this event" })
        }
      } else if (user.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const credentials = await storage.getEventCredentialsByEvent(eventId)
      res.json(credentials)
    } catch (error) {
      console.error("Get event credentials error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.get("/api/event-credentials/:credentialId/id-pass", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      const { credentialId } = req.params

      const credential = await storage.getEventCredential(credentialId)
      if (!credential) {
        return res.status(404).json({ message: "Credential not found" })
      }

      const participant = await storage.getUserById(credential.participantUserId)
      const event = await storage.getEventById(credential.eventId)

      if (!participant || !event) {
        return res.status(404).json({ message: "Participant or event not found" })
      }

      if (user.role === "event_admin") {
        const isEventAdmin = await storage.isUserEventAdmin(user.id, event.id)
        if (!isEventAdmin) {
          return res.status(403).json({ message: "Not authorized for this event" })
        }
      } else if (user.role !== "super_admin" && user.role !== "registration_committee") {
        return res.status(403).json({ message: "Forbidden" })
      }

      // Registration status - since we're generating ID pass, assume confirmed
      const registrationStatus = "confirmed"

      const doc = new PDFDocument({
        size: [400, 600],
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      })

      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename="id-pass-${participant.fullName.replace(/\s+/g, '-')}-${event.name.replace(/\s+/g, '-')}.pdf"`)

      doc.pipe(res)

      doc.rect(0, 0, 400, 600).fillAndStroke("#f8f9fa")

      doc.rect(0, 0, 400, 120).fillAndStroke("#4A5568")

      doc.fontSize(24).fillColor("#FFF").font("Helvetica-Bold")
      doc.text("SYMPOSIUM", 0, 30, { align: "center", width: 400 })
      doc.fontSize(12).font("Helvetica")
      doc.text("ID PASS", 0, 60, { align: "center", width: 400 })

      doc.fillColor("#000").fontSize(14).font("Helvetica-Bold")
      doc.text("Participant Details", 40, 140)

      doc.fontSize(10).font("Helvetica")
      let yPos = 165

      doc.fillColor("#4A5568").text("Name:", 40, yPos, { continued: true })
      doc.fillColor("#000").font("Helvetica-Bold").text(` ${participant.fullName}`, { continued: false })
      yPos += 25

      doc.fillColor("#4A5568").font("Helvetica").text("Email:", 40, yPos, { continued: true })
      doc.fillColor("#000").text(` ${participant.email}`, { continued: false })
      yPos += 25

      doc.fillColor("#4A5568").text("Event:", 40, yPos, { continued: true })
      doc.fillColor("#000").font("Helvetica-Bold").text(` ${event.name}`, { continued: false })
      yPos += 30

      doc.strokeColor("#E2E8F0").moveTo(40, yPos).lineTo(360, yPos).stroke()
      yPos += 20

      doc.fontSize(14).fillColor("#000").font("Helvetica-Bold")
      doc.text("Event Credentials", 40, yPos)
      yPos += 25

      doc.fontSize(11).font("Helvetica")
      doc.fillColor("#4A5568").text("Username:", 40, yPos, { continued: true })
      doc.fillColor("#000").font("Helvetica-Bold").text(` ${credential.eventUsername}`, { continued: false })
      yPos += 25

      doc.fillColor("#4A5568").font("Helvetica").text("Password:", 40, yPos, { continued: true })
      doc.fillColor("#000").font("Helvetica-Bold").text(` ${credential.eventPassword}`, { continued: false })
      yPos += 30

      doc.strokeColor("#E2E8F0").moveTo(40, yPos).lineTo(360, yPos).stroke()
      yPos += 20

      doc.fontSize(14).fillColor("#000").font("Helvetica-Bold")
      doc.text("Status", 40, yPos)
      yPos += 25

      const statusColor = registrationStatus === "confirmed" ? "#10B981" : registrationStatus === "pending" ? "#F59E0B" : "#EF4444"
      doc.fontSize(11).font("Helvetica")
      doc.fillColor("#4A5568").text("Registration:", 40, yPos, { continued: true })
      doc.fillColor(statusColor).font("Helvetica-Bold").text(` ${registrationStatus.toUpperCase()}`, { continued: false })
      yPos += 25

      doc.fillColor("#4A5568").font("Helvetica").text("Participant ID:", 40, yPos, { continued: true })
      doc.fillColor("#000").text(` ${credential.id.substring(0, 8).toUpperCase()}`, { continued: false })
      yPos += 35

      const qrData = JSON.stringify({
        participantId: participant.id,
        eventId: event.id,
        credentialId: credential.id,
        username: credential.eventUsername,
        status: registrationStatus
      })

      try {
        const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
          width: 120,
          margin: 1,
          color: {
            dark: "#000000",
            light: "#FFFFFF"
          }
        })

        const qrBuffer = Buffer.from(qrCodeDataUrl.split(",")[1], "base64")
        doc.image(qrBuffer, 140, yPos, { width: 120, height: 120 })
        yPos += 130

        doc.fontSize(8).fillColor("#6B7280").font("Helvetica")
        doc.text("Scan for verification", 0, yPos, { align: "center", width: 400 })
      } catch (qrError) {
        console.error("QR code generation error:", qrError)
      }

      doc.fontSize(8).fillColor("#9CA3AF")
      doc.text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
        0,
        560,
        { align: "center", width: 400 }
      )

      doc.end()
    } catch (error) {
      console.error("Generate ID Pass error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  app.patch(
    "/api/event-credentials/:credentialId/enable-test",
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { credentialId } = req.params

        const credential = await storage.getEventCredential(credentialId)
        if (!credential) {
          return res.status(404).json({ message: "Event credential not found" })
        }

        if (user.role === "event_admin") {
          const isEventAdmin = await storage.isUserEventAdmin(user.id, credential.eventId)
          if (!isEventAdmin) {
            return res.status(403).json({ message: "Not authorized for this event" })
          }
        } else if (user.role !== "super_admin") {
          return res.status(403).json({ message: "Forbidden" })
        }

        const updatedCredential = await storage.updateEventCredentialTestStatus(credentialId, true, user.id)
        res.json(updatedCredential)
      } catch (error) {
        console.error("Enable test access error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.patch(
    "/api/event-credentials/:credentialId/disable-test",
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { credentialId } = req.params

        const credential = await storage.getEventCredential(credentialId)
        if (!credential) {
          return res.status(404).json({ message: "Event credential not found" })
        }

        if (user.role === "event_admin") {
          const isEventAdmin = await storage.isUserEventAdmin(user.id, credential.eventId)
          if (!isEventAdmin) {
            return res.status(403).json({ message: "Not authorized for this event" })
          }
        } else if (user.role !== "super_admin") {
          return res.status(403).json({ message: "Forbidden" })
        }

        const updatedCredential = await storage.updateEventCredentialTestStatus(credentialId, false, user.id)
        res.json(updatedCredential)
      } catch (error) {
        console.error("Disable test access error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // Bulk enable test access for all event credentials
  app.patch(
    "/api/events/:eventId/credentials/enable-all-tests",
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { eventId } = req.params

        if (user.role === "event_admin") {
          const isEventAdmin = await storage.isUserEventAdmin(user.id, eventId)
          if (!isEventAdmin) {
            return res.status(403).json({ message: "Not authorized for this event" })
          }
        } else if (user.role !== "super_admin") {
          return res.status(403).json({ message: "Forbidden" })
        }

        const credentials = await storage.getEventCredentialsByEvent(eventId)
        let updatedCount = 0

        for (const credential of credentials) {
          if (!credential.testEnabled) {
            await storage.updateEventCredentialTestStatus(credential.id, true, user.id)
            updatedCount++
          }
        }

        res.json({
          success: true,
          message: `Test access enabled for ${updatedCount} participant(s)`,
          updatedCount,
          totalCount: credentials.length
        })
      } catch (error) {
        console.error("Bulk enable test access error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // Bulk disable test access for all event credentials
  app.patch(
    "/api/events/:eventId/credentials/disable-all-tests",
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const { eventId } = req.params

        if (user.role === "event_admin") {
          const isEventAdmin = await storage.isUserEventAdmin(user.id, eventId)
          if (!isEventAdmin) {
            return res.status(403).json({ message: "Not authorized for this event" })
          }
        } else if (user.role !== "super_admin") {
          return res.status(403).json({ message: "Forbidden" })
        }

        const credentials = await storage.getEventCredentialsByEvent(eventId)
        let updatedCount = 0

        for (const credential of credentials) {
          if (credential.testEnabled) {
            await storage.updateEventCredentialTestStatus(credential.id, false, user.id)
            updatedCount++
          }
        }

        res.json({
          success: true,
          message: `Test access disabled for ${updatedCount} participant(s)`,
          updatedCount,
          totalCount: credentials.length
        })
      } catch (error) {
        console.error("Bulk disable test access error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  app.get("/api/events/:eventId/credentials-status", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      const { eventId } = req.params

      if (user.role === "event_admin") {
        const isEventAdmin = await storage.isUserEventAdmin(user.id, eventId)
        if (!isEventAdmin) {
          return res.status(403).json({ message: "Not authorized for this event" })
        }
      } else if (user.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const credentialsWithParticipants = await storage.getEventCredentialsWithParticipants(eventId)

      const result = credentialsWithParticipants.map((cred) => ({
        id: cred.id,
        participantUserId: cred.participantUserId,
        eventUsername: cred.eventUsername,
        testEnabled: cred.testEnabled,
        enabledAt: cred.enabledAt,
        enabledBy: cred.enabledBy,
        participantFullName: cred.participant.fullName,
        participantEmail: cred.participant.email,
      }))

      res.json(result)
    } catch (error) {
      console.error("Get credentials status error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Analytics for Super Admin
  app.get("/api/admin/stats", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" })
      }
      const stats = await storage.getRegistrationStats()
      console.log("Admin stats response:", JSON.stringify(stats, null, 2))
      // Disable caching for stats endpoint
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.json(stats)
    } catch (error) {
      console.error("Admin stats error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Analytics for Event Admin
  app.get("/api/event-admin/stats", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!
      if (user.role !== "event_admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden" })
      }

      const stats = await storage.getRegistrationStats(user.role === 'event_admin' ? user.id : undefined)
      res.json(stats)
    } catch (error) {
      console.error("Event admin stats error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Serve list of colleges
  app.get("/api/colleges", async (_req, res) => {
    try {
      const collegesPath = path.join(process.cwd(), "server", "data", "colleges.json");
      const data = await fs.promises.readFile(collegesPath, "utf-8");
      const colleges = JSON.parse(data);
      res.json(colleges);
    } catch (error) {
      console.error("Failed to load colleges:", error);
      res.status(500).json({ message: "Failed to load colleges list" });
    }
  });

  // Serve paper presentation topics for registration form
  app.get("/api/paper-topics", async (_req, res) => {
    res.json(PAPER_PRESENTATION_TOPICS);
  });

  // Serve food type options for registration form
  app.get("/api/food-types", async (_req, res) => {
    res.json(FOOD_TYPES);
  });

  // Lookup participant by roll number (for pre-filling food preference)
  app.get("/api/participants/by-roll/:rollNo", publicApiLimiter, async (req, res) => {
    try {
      const { rollNo } = req.params;

      if (!rollNo || rollNo.trim().length === 0) {
        return res.status(400).json({ found: false, message: "Roll number is required" });
      }

      const participant = await storage.getParticipantRegistryByRollNo(rollNo);

      if (participant) {
        return res.json({
          found: true,
          participant: {
            id: participant.id,
            rollNo: participant.rollNo,
            name: participant.name,
            foodType: participant.foodType
          }
        });
      } else {
        return res.status(404).json({ found: false });
      }
    } catch (error: any) {
      console.error("Error looking up participant by roll number:", error);
      res.status(500).json({ found: false, message: "Internal server error" });
    }
  });

  app.get(
    "/api/reports/export/event/:eventId/excel",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params

        const event = await storage.getEvent(eventId)
        if (!event) {
          return res.status(404).json({ message: "Event not found" })
        }

        const rounds = await storage.getRoundsByEvent(eventId)
        const participants = await storage.getParticipantsByEvent(eventId)
        const leaderboard = await storage.getEventLeaderboard(eventId)

        const workbook = new ExcelJS.Workbook()

        const sheet1 = workbook.addWorksheet("Event Overview")
        sheet1.columns = [
          { header: "Metric", key: "metric", width: 30 },
          { header: "Value", key: "value", width: 40 },
        ]

        const completedAttempts = leaderboard.length
        const avgCompletionRate =
          participants.length > 0 ? ((completedAttempts / participants.length) * 100).toFixed(2) : "0"

        sheet1.addRows([
          { metric: "Event Name", value: event.name },
          { metric: "Event Type", value: event.type },
          { metric: "Event Status", value: event.status },
          { metric: "Total Participants", value: participants.length },
          { metric: "Total Rounds", value: rounds.length },
          { metric: "Average Completion Rate", value: `${avgCompletionRate}%` },
        ])

        sheet1.getRow(1).font = { bold: true }
        sheet1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const sheet2 = workbook.addWorksheet("Round Details")
        sheet2.columns = [
          { header: "Round Name", key: "name", width: 20 },
          { header: "Duration (min)", key: "duration", width: 15 },
          { header: "Start Time", key: "startTime", width: 25 },
          { header: "End Time", key: "endTime", width: 25 },
          { header: "Participants Attempted", key: "attempted", width: 25 },
          { header: "Avg Score", key: "avgScore", width: 15 },
          { header: "Completion Rate", key: "completionRate", width: 20 },
        ]

        for (const round of rounds) {
          const roundLeaderboard = await storage.getRoundLeaderboard(round.id)
          const avgScore =
            roundLeaderboard.length > 0
              ? (roundLeaderboard.reduce((sum, r) => sum + (r.totalScore || 0), 0) / roundLeaderboard.length).toFixed(2)
              : "0"
          const completionRate =
            participants.length > 0 ? ((roundLeaderboard.length / participants.length) * 100).toFixed(2) : "0"

          sheet2.addRow({
            name: round.name,
            duration: round.duration,
            startTime: round.startTime ? new Date(round.startTime).toLocaleString() : "Not set",
            endTime: round.endTime ? new Date(round.endTime).toLocaleString() : "Not set",
            attempted: roundLeaderboard.length,
            avgScore: avgScore,
            completionRate: `${completionRate}%`,
          })
        }

        sheet2.getRow(1).font = { bold: true }
        sheet2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const sheet3 = workbook.addWorksheet("Participant Scores")
        const columns: any[] = [
          { header: "Rank", key: "rank", width: 10 },
          { header: "Participant Name", key: "name", width: 30 },
          { header: "Email", key: "email", width: 30 },
        ]

        rounds.forEach((round, idx) => {
          columns.push({ header: `Round ${idx + 1} Score`, key: `round${idx + 1}`, width: 18 })
        })

        columns.push({ header: "Total Score", key: "totalScore", width: 15 })
        columns.push({ header: "Status", key: "status", width: 15 })

        sheet3.columns = columns

        for (const entry of leaderboard) {
          const user = await storage.getUser(entry.userId)
          const participant = participants.find((p) => p.userId === entry.userId)

          const rowData: any = {
            rank: entry.rank,
            name: entry.userName,
            email: user?.email || "N/A",
            totalScore: entry.totalScore || 0,
            status: participant?.status || "N/A",
          }

          for (let i = 0; i < rounds.length; i++) {
            const roundAttempt = await storage.getTestAttemptByUserAndRound(entry.userId, rounds[i].id)
            rowData[`round${i + 1}`] = roundAttempt?.totalScore || 0
          }

          sheet3.addRow(rowData)
        }

        sheet3.getRow(1).font = { bold: true }
        sheet3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const sheet4 = workbook.addWorksheet("Leaderboard")
        sheet4.columns = [
          { header: "Rank", key: "rank", width: 10 },
          { header: "Name", key: "name", width: 30 },
          { header: "Total Score", key: "totalScore", width: 15 },
          { header: "Completion Time", key: "completionTime", width: 25 },
        ]

        leaderboard.forEach((entry) => {
          sheet4.addRow({
            rank: entry.rank,
            name: entry.userName,
            totalScore: entry.totalScore || 0,
            completionTime: entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : "N/A",
          })
        })

        sheet4.getRow(1).font = { bold: true }
        sheet4.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const fileName = `Event_Report_${event.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)

        await workbook.xlsx.write(res)
        res.end()
      } catch (error) {
        console.error("Export event Excel error:", error)
        res.status(500).json({ message: "Failed to generate Excel report" })
      }
    },
  )

  app.get(
    "/api/reports/export/event/:eventId/pdf",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params

        const event = await storage.getEvent(eventId)
        if (!event) {
          return res.status(404).json({ message: "Event not found" })
        }

        const rounds = await storage.getRoundsByEvent(eventId)
        const participants = await storage.getParticipantsByEvent(eventId)
        const leaderboard = await storage.getEventLeaderboard(eventId)

        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 50 })
        const fileName = `Event_Report_${event.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`

        res.setHeader("Content-Type", "application/pdf")
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)

        doc.pipe(res)

        doc.fontSize(20).font("Helvetica-Bold").text(`Event Report: ${event.name}`, { align: "center" })
        doc.moveDown()

        doc.fontSize(14).font("Helvetica-Bold").text("Event Statistics", { underline: true })
        doc.moveDown(0.5)

        const completedAttempts = leaderboard.length
        const avgCompletionRate =
          participants.length > 0 ? ((completedAttempts / participants.length) * 100).toFixed(2) : "0"

        doc.fontSize(10).font("Helvetica")
        let y = doc.y
        const tableTop = y
        const col1X = 50
        const col2X = 300

        doc.rect(col1X, y, 250, 20).stroke()
        doc.rect(col2X, y, 250, 20).stroke()
        doc.font("Helvetica-Bold").text("Metric", col1X + 5, y + 5, { width: 240 })
        doc.text("Value", col2X + 5, y + 5, { width: 240 })
        y += 20

        const stats = [
          ["Event Type", event.type],
          ["Event Status", event.status],
          ["Total Participants", participants.length.toString()],
          ["Total Rounds", rounds.length.toString()],
          ["Completion Rate", `${avgCompletionRate}%`],
        ]

        doc.font("Helvetica")
        stats.forEach((stat, idx) => {
          const fillColor = idx % 2 === 0 ? "#f0f0f0" : "#ffffff"
          doc.rect(col1X, y, 250, 20).fillAndStroke(fillColor, "#000000")
          doc.rect(col2X, y, 250, 20).fillAndStroke(fillColor, "#000000")
          doc.fillColor("#000000").text(stat[0], col1X + 5, y + 5, { width: 240 })
          doc.text(stat[1], col2X + 5, y + 5, { width: 240 })
          y += 20
        })

        doc.addPage()
        doc.fontSize(14).font("Helvetica-Bold").text("Round Details", { underline: true })
        doc.moveDown(0.5)

        y = doc.y
        const headers = ["Round", "Duration", "Participants", "Avg Score", "Completion"]
        const colWidths = [120, 80, 100, 80, 100]
        let x = 50

        doc.fontSize(9).font("Helvetica-Bold")
        headers.forEach((header, i) => {
          doc.rect(x, y, colWidths[i], 20).stroke()
          doc.text(header, x + 5, y + 5, { width: colWidths[i] - 10 })
          x += colWidths[i]
        })
        y += 20

        doc.font("Helvetica")
        for (const round of rounds) {
          const roundLeaderboard = await storage.getRoundLeaderboard(round.id)
          const avgScore =
            roundLeaderboard.length > 0
              ? (roundLeaderboard.reduce((sum, r) => sum + (r.totalScore || 0), 0) / roundLeaderboard.length).toFixed(2)
              : "0"
          const completionRate =
            participants.length > 0 ? ((roundLeaderboard.length / participants.length) * 100).toFixed(2) : "0"

          x = 50
          const rowData = [
            round.name,
            `${round.duration} min`,
            roundLeaderboard.length.toString(),
            avgScore,
            `${completionRate}%`,
          ]

          rowData.forEach((data, i) => {
            doc.rect(x, y, colWidths[i], 20).stroke()
            doc.text(data, x + 5, y + 5, { width: colWidths[i] - 10 })
            x += colWidths[i]
          })
          y += 20

          if (y > 500) {
            doc.addPage()
            y = 50
          }
        }

        doc.addPage()
        doc.fontSize(14).font("Helvetica-Bold").text("Participant Scores", { underline: true })
        doc.moveDown(0.5)

        const participantScores = []
        for (const participant of participants) {
          const user = await storage.getUser(participant.userId)
          if (!user) continue

          const roundScores = []
          let totalScore = 0

          for (const round of rounds) {
            const attempt = await storage.getTestAttemptByUserAndRound(participant.userId, round.id)
            const score = attempt && attempt.status === "completed" ? attempt.totalScore || 0 : 0
            roundScores.push(score)
            totalScore += score
          }

          participantScores.push({
            name: user.fullName,
            email: user.email,
            roundScores,
            totalScore,
            status: participant.status,
          })
        }

        participantScores.sort((a, b) => b.totalScore - a.totalScore)

        y = doc.y
        const psHeaders = ["Rank", "Name", "Email"]
        rounds.forEach((round, idx) => {
          psHeaders.push(`R${idx + 1}`)
        })
        psHeaders.push("Total")
        psHeaders.push("Status")

        const psColWidths = [60, 150, 150]
        rounds.forEach(() => {
          psColWidths.push(80)
        })
        psColWidths.push(80)
        psColWidths.push(80)

        x = 50
        doc.fontSize(9).font("Helvetica-Bold")
        psHeaders.forEach((header, i) => {
          doc.rect(x, y, psColWidths[i], 20).fillAndStroke("#f0f0f0", "#000000")
          doc.fillColor("#000000").text(header, x + 5, y + 5, { width: psColWidths[i] - 10 })
          x += psColWidths[i]
        })
        y += 20

        doc.font("Helvetica")
        participantScores.slice(0, 50).forEach((entry, idx) => {
          x = 50
          const rank = idx + 1
          const rowData = [rank.toString(), entry.name, entry.email]

          entry.roundScores.forEach((score) => {
            rowData.push(score.toString())
          })

          rowData.push(entry.totalScore.toString())
          rowData.push(entry.status)

          const fillColor = idx % 2 === 0 ? "#ffffff" : "#f9f9f9"
          rowData.forEach((data, i) => {
            doc.rect(x, y, psColWidths[i], 20).fillAndStroke(fillColor, "#000000")
            doc.fillColor("#000000").text(data, x + 5, y + 5, { width: psColWidths[i] - 10 })
            x += psColWidths[i]
          })
          y += 20

          if (y > 500) {
            doc.addPage()
            y = 50
          }
        })

        doc.addPage()
        doc.fontSize(14).font("Helvetica-Bold").text("Leaderboard", { underline: true })
        doc.moveDown(0.5)

        y = doc.y
        const lbHeaders = ["Rank", "Name", "Total Score", "Completion Time"]
        const lbColWidths = [60, 200, 100, 150]
        x = 50

        doc.fontSize(9).font("Helvetica-Bold")
        lbHeaders.forEach((header, i) => {
          doc.rect(x, y, lbColWidths[i], 20).stroke()
          doc.text(header, x + 5, y + 5, { width: lbColWidths[i] - 10 })
          x += lbColWidths[i]
        })
        y += 20

        doc.font("Helvetica")
        leaderboard.slice(0, 20).forEach((entry) => {
          x = 50
          const rowData = [
            entry.rank.toString(),
            entry.userName,
            (entry.totalScore || 0).toString(),
            entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : "N/A",
          ]

          rowData.forEach((data, i) => {
            doc.rect(x, y, lbColWidths[i], 20).stroke()
            doc.text(data, x + 5, y + 5, { width: lbColWidths[i] - 10 })
            x += lbColWidths[i]
          })
          y += 20

          if (y > 500) {
            doc.addPage()
            y = 50
          }
        })

        doc.end()
      } catch (error) {
        console.error("Export event PDF error:", error)
        res.status(500).json({ message: "Failed to generate PDF report" })
      }
    },
  )

  app.get(
    "/api/reports/export/symposium/excel",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const events = await storage.getEvents()
        const allUsers = await storage.getUsers()
        const participants = allUsers.filter((u) => u.role === "participant")

        const workbook = new ExcelJS.Workbook()

        const sheet1 = workbook.addWorksheet("Symposium Overview")
        sheet1.columns = [
          { header: "Metric", key: "metric", width: 30 },
          { header: "Value", key: "value", width: 40 },
        ]

        let totalRounds = 0
        let totalCompletedAttempts = 0
        let totalParticipants = 0

        for (const event of events) {
          const rounds = await storage.getRoundsByEvent(event.id)
          const eventParticipants = await storage.getParticipantsByEvent(event.id)
          const leaderboard = await storage.getEventLeaderboard(event.id)

          totalRounds += rounds.length
          totalCompletedAttempts += leaderboard.length
          totalParticipants += eventParticipants.length
        }

        const overallCompletionRate =
          totalParticipants > 0 ? ((totalCompletedAttempts / totalParticipants) * 100).toFixed(2) : "0"

        sheet1.addRows([
          { metric: "Total Events", value: events.length },
          { metric: "Total Participants", value: participants.length },
          { metric: "Total Rounds", value: totalRounds },
          { metric: "Overall Completion Rate", value: `${overallCompletionRate}%` },
        ])

        sheet1.getRow(1).font = { bold: true }
        sheet1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const sheet2 = workbook.addWorksheet("Event Summaries")
        sheet2.columns = [
          { header: "Event Name", key: "name", width: 30 },
          { header: "Type", key: "type", width: 15 },
          { header: "Participants", key: "participants", width: 15 },
          { header: "Rounds", key: "rounds", width: 15 },
          { header: "Avg Score", key: "avgScore", width: 15 },
          { header: "Completion Rate", key: "completionRate", width: 20 },
        ]

        for (const event of events) {
          const rounds = await storage.getRoundsByEvent(event.id)
          const eventParticipants = await storage.getParticipantsByEvent(event.id)
          const leaderboard = await storage.getEventLeaderboard(event.id)

          const avgScore =
            leaderboard.length > 0
              ? (leaderboard.reduce((sum, e) => sum + (e.totalScore || 0), 0) / leaderboard.length).toFixed(2)
              : "0"
          const completionRate =
            eventParticipants.length > 0 ? ((leaderboard.length / eventParticipants.length) * 100).toFixed(2) : "0"

          sheet2.addRow({
            name: event.name,
            type: event.type,
            participants: eventParticipants.length,
            rounds: rounds.length,
            avgScore: avgScore,
            completionRate: `${completionRate}%`,
          })
        }

        sheet2.getRow(1).font = { bold: true }
        sheet2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const sheet3 = workbook.addWorksheet("Top Performers")
        sheet3.columns = [
          { header: "Rank", key: "rank", width: 10 },
          { header: "Name", key: "name", width: 30 },
          { header: "Total Score", key: "totalScore", width: 15 },
          { header: "Events Participated", key: "eventsCount", width: 20 },
        ]

        const userScores = new Map<string, { name: string; totalScore: number; eventsCount: number }>()

        for (const event of events) {
          const leaderboard = await storage.getEventLeaderboard(event.id)

          for (const entry of leaderboard) {
            const existing = userScores.get(entry.userId)
            if (existing) {
              existing.totalScore += entry.totalScore || 0
              existing.eventsCount += 1
            } else {
              userScores.set(entry.userId, {
                name: entry.userName,
                totalScore: entry.totalScore || 0,
                eventsCount: 1,
              })
            }
          }
        }

        const topPerformers = Array.from(userScores.values())
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 20)

        topPerformers.forEach((performer, index) => {
          sheet3.addRow({
            rank: index + 1,
            name: performer.name,
            totalScore: performer.totalScore,
            eventsCount: performer.eventsCount,
          })
        })

        sheet3.getRow(1).font = { bold: true }
        sheet3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } }

        const fileName = `Symposium_Report_${new Date().toISOString().split("T")[0]}.xlsx`

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)

        await workbook.xlsx.write(res)
        res.end()
      } catch (error) {
        console.error("Export symposium Excel error:", error)
        res.status(500).json({ message: "Failed to generate Symposium Excel report" })
      }
    },
  )

  app.get(
    "/api/reports/export/symposium/pdf",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const events = await storage.getEvents()
        const allUsers = await storage.getUsers()
        const participants = allUsers.filter((u) => u.role === "participant")

        const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 50 })
        const fileName = `Symposium_Report_${new Date().toISOString().split("T")[0]}.pdf`

        res.setHeader("Content-Type", "application/pdf")
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)

        doc.pipe(res)

        doc.fontSize(20).font("Helvetica-Bold").text("Symposium-wide Report", { align: "center" })
        doc.moveDown()

        doc.fontSize(14).font("Helvetica-Bold").text("Symposium Overview", { underline: true })
        doc.moveDown(0.5)

        let totalRounds = 0
        let totalCompletedAttempts = 0
        let totalParticipants = 0

        for (const event of events) {
          const rounds = await storage.getRoundsByEvent(event.id)
          const eventParticipants = await storage.getParticipantsByEvent(event.id)
          const leaderboard = await storage.getEventLeaderboard(event.id)

          totalRounds += rounds.length
          totalCompletedAttempts += leaderboard.length
          totalParticipants += eventParticipants.length
        }

        const overallCompletionRate =
          totalParticipants > 0 ? ((totalCompletedAttempts / totalParticipants) * 100).toFixed(2) : "0"

        doc.fontSize(10).font("Helvetica")
        let y = doc.y
        const col1X = 50
        const col2X = 300

        doc.rect(col1X, y, 250, 20).stroke()
        doc.rect(col2X, y, 250, 20).stroke()
        doc.font("Helvetica-Bold").text("Metric", col1X + 5, y + 5, { width: 240 })
        doc.text("Value", col2X + 5, y + 5, { width: 240 })
        y += 20

        const stats = [
          ["Total Events", events.length.toString()],
          ["Total Participants", participants.length.toString()],
          ["Total Rounds", totalRounds.toString()],
          ["Overall Completion Rate", `${overallCompletionRate}%`],
        ]

        doc.font("Helvetica")
        stats.forEach((stat, idx) => {
          const fillColor = idx % 2 === 0 ? "#f0f0f0" : "#ffffff"
          doc.rect(col1X, y, 250, 20).fillAndStroke(fillColor, "#000000")
          doc.rect(col2X, y, 250, 20).fillAndStroke(fillColor, "#000000")
          doc.fillColor("#000000").text(stat[0], col1X + 5, y + 5, { width: 240 })
          doc.text(stat[1], col2X + 5, y + 5, { width: 240 })
          y += 20
        })

        doc.addPage()
        doc.fontSize(14).font("Helvetica-Bold").text("Event Summaries", { underline: true })
        doc.moveDown(0.5)

        y = doc.y
        const headers = ["Event", "Type", "Participants", "Rounds", "Completion"]
        const colWidths = [150, 80, 100, 70, 110]
        let x = 50

        doc.fontSize(9).font("Helvetica-Bold")
        headers.forEach((header, i) => {
          doc.rect(x, y, colWidths[i], 20).stroke()
          doc.text(header, x + 5, y + 5, { width: colWidths[i] - 10 })
          x += colWidths[i]
        })
        y += 20

        doc.font("Helvetica")
        for (const event of events) {
          const rounds = await storage.getRoundsByEvent(event.id)
          const eventParticipants = await storage.getParticipantsByEvent(event.id)
          const leaderboard = await storage.getEventLeaderboard(event.id)

          const completionRate =
            eventParticipants.length > 0 ? ((leaderboard.length / eventParticipants.length) * 100).toFixed(2) : "0"

          x = 50
          const rowData = [
            event.name,
            event.type,
            eventParticipants.length.toString(),
            rounds.length.toString(),
            `${completionRate}%`,
          ]

          rowData.forEach((data, i) => {
            doc.rect(x, y, colWidths[i], 20).stroke()
            doc.text(data, x + 5, y + 5, { width: colWidths[i] - 10 })
            x += colWidths[i]
          })
          y += 20

          if (y > 500) {
            doc.addPage()
            y = 50
          }
        }

        doc.addPage()
        doc.fontSize(14).font("Helvetica-Bold").text("Top Performers", { underline: true })
        doc.moveDown(0.5)

        const userScores = new Map<string, { name: string; totalScore: number; eventsCount: number }>()

        for (const event of events) {
          const leaderboard = await storage.getEventLeaderboard(event.id)

          for (const entry of leaderboard) {
            const existing = userScores.get(entry.userId)
            if (existing) {
              existing.totalScore += entry.totalScore || 0
              existing.eventsCount += 1
            } else {
              userScores.set(entry.userId, {
                name: entry.userName,
                totalScore: entry.totalScore || 0,
                eventsCount: 1,
              })
            }
          }
        }

        const topPerformers = Array.from(userScores.values())
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 20)

        y = doc.y
        const tpHeaders = ["Rank", "Name", "Total Score", "Events"]
        const tpColWidths = [60, 200, 120, 100]
        x = 50

        doc.fontSize(9).font("Helvetica-Bold")
        tpHeaders.forEach((header, i) => {
          doc.rect(x, y, tpColWidths[i], 20).stroke()
          doc.text(header, x + 5, y + 5, { width: tpColWidths[i] - 10 })
          x += tpColWidths[i]
        })
        y += 20

        doc.font("Helvetica")
        topPerformers.forEach((performer, index) => {
          x = 50
          const rowData = [
            (index + 1).toString(),
            performer.name,
            performer.totalScore.toString(),
            performer.eventsCount.toString(),
          ]

          rowData.forEach((data, i) => {
            doc.rect(x, y, tpColWidths[i], 20).stroke()
            doc.text(data, x + 5, y + 5, { width: tpColWidths[i] - 10 })
            x += tpColWidths[i]
          })
          y += 20

          if (y > 500) {
            doc.addPage()
            y = 50
          }
        })

        doc.end()
      } catch (error) {
        console.error("Export symposium PDF error:", error)
        res.status(500).json({ message: "Failed to generate Symposium PDF report" })
      }
    },
  )

  // ==================== Additional Data Fetching Routes ====================

  // Note: GET /api/events/:eventId/rounds and GET /api/rounds/:roundId/questions
  // are defined earlier with proper access-control middleware.

  // ==================== Super Admin Override Routes ====================

  // DELETE /api/super-admin/reset-participants - Clear all participant data
  app.delete(
    "/api/super-admin/reset-participants",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = req.user!
        const ipAddress = getClientIp(req)
        const { reason } = req.body

        // Delete in order (respecting foreign keys)
        // 1. Team members
        const teamMembersDeleted = await db.delete(teamMembers).returning({ id: teamMembers.id })

        // 2. Registrations
        const registrationsDeleted = await db.delete(registrations).returning({ id: registrations.id })

        // 3. Participant registry
        const registryDeleted = await db.delete(participantRegistry).returning({ id: participantRegistry.id })

        // 4. Event credentials
        const credentialsDeleted = await db.delete(eventCredentials).returning({ id: eventCredentials.id })

        // 5. Participant users (keep admins)
        const participantsDeleted = await db.delete(users).where(eq(users.role, 'participant')).returning({ id: users.id })

        // Clear ALL caches
        await cacheService.deletePattern('registrations:*')
        await cacheService.deletePattern('participants:*')
        await cacheService.deletePattern('leaderboard:*')

        // Log audit
        await logSuperAdminAction(
          user.id,
          user.username,
          "reset_participants",
          "system",
          "all",
          "Reset all participant data",
          {
            teamMembers: teamMembersDeleted.length,
            registrations: registrationsDeleted.length,
            registry: registryDeleted.length,
            credentials: credentialsDeleted.length,
            participants: participantsDeleted.length
          },
          reason || "Admin reset",
          ipAddress
        )

        res.json({
          message: "All participant data has been reset",
          deleted: {
            teamMembers: teamMembersDeleted.length,
            registrations: registrationsDeleted.length,
            participantRegistry: registryDeleted.length,
            eventCredentials: credentialsDeleted.length,
            participantUsers: participantsDeleted.length
          }
        })
      } catch (error) {
        console.error("Reset participants error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    }
  )

  // PUT /api/super-admin/events/:eventId/override - Update any event
  app.put(
    "/api/super-admin/events/:eventId/override",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params
        const { name, description, type, category, status, reason } = req.body
        const user = req.user!
        const ipAddress = getClientIp(req)

        // Get existing event
        const existingEvent = await storage.getEvent(eventId)
        if (!existingEvent) {
          return res.status(404).json({ message: "Event not found" })
        }

        // Prepare update data
        const updateData: any = {}
        if (name !== undefined) updateData.name = name
        if (description !== undefined) updateData.description = description
        if (type !== undefined) updateData.type = type
        if (category !== undefined) updateData.category = category
        if (status !== undefined) updateData.status = status

        // Store before/after values
        const before = {
          name: existingEvent.name,
          description: existingEvent.description,
          type: existingEvent.type,
          category: existingEvent.category,
          status: existingEvent.status,
        }

        // Update event
        const updatedEvent = await storage.updateEvent(eventId, updateData)
        if (!updatedEvent) {
          return res.status(500).json({ message: "Failed to update event" })
        }

        const after = {
          name: updatedEvent.name,
          description: updatedEvent.description,
          type: updatedEvent.type,
          category: updatedEvent.category,
          status: updatedEvent.status,
        }

        // Log audit entry
        await logSuperAdminAction(
          user.id,
          user.username,
          "override_event",
          "event",
          eventId,
          updatedEvent.name,
          { before, after },
          reason || null,
          ipAddress,
        )

        // Invalidate cache
        await cacheService.delete(`event:${eventId}`);
        await cacheService.deletePattern('events:list*');
        await cacheService.deletePattern('leaderboard:*');

        // Notify via WebSocket
        WebSocketService.notifyOverrideAction("override_event", "event", eventId, { before, after })

        res.json(updatedEvent)
      } catch (error) {
        console.error("Override event error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // DELETE /api/super-admin/events/:eventId/override - Delete any event
  app.delete(
    "/api/super-admin/events/:eventId/override",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params
        const { reason } = req.body
        const user = req.user!
        const ipAddress = getClientIp(req)

        // Get existing event details
        const existingEvent = await storage.getEvent(eventId)
        if (!existingEvent) {
          return res.status(404).json({ message: "Event not found" })
        }

        // Delete event
        await storage.deleteEvent(eventId)

        // Log audit entry
        await logSuperAdminAction(
          user.id,
          user.username,
          "delete_event",
          "event",
          eventId,
          existingEvent.name,
          null,
          reason || null,
          ipAddress,
        )

        // Invalidate cache
        await cacheService.delete(`event:${eventId}`);
        await cacheService.deletePattern('events:list*');
        await cacheService.deletePattern(`rounds:${eventId}*`);
        await cacheService.deletePattern('leaderboard:*');

        // Notify via WebSocket
        WebSocketService.notifyOverrideAction("delete_event", "event", eventId, { eventName: existingEvent.name })

        res.status(204).send()
      } catch (error) {
        console.error("Delete event override error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // PUT /api/super-admin/questions/:questionId/override - Update any question
  app.put(
    "/api/super-admin/questions/:questionId/override",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { questionId } = req.params
        const { questionText, points, correctAnswer, options, expectedOutput, testCases, reason, ...otherFields } =
          req.body
        const user = req.user!
        const ipAddress = getClientIp(req)

        // Get existing question
        const existingQuestion = await storage.getQuestion(questionId)
        if (!existingQuestion) {
          return res.status(404).json({ message: "Question not found" })
        }

        // Get round and event info for context
        const round = await storage.getRound(existingQuestion.roundId)
        const event = round ? await storage.getEvent(round.eventId) : null
        const targetName = `${event?.name || "Unknown Event"} - ${round?.name || "Unknown Round"} - Q${existingQuestion.questionNumber}`

        // Prepare update data
        const updateData: any = { ...otherFields }
        if (questionText !== undefined) updateData.questionText = questionText
        if (points !== undefined) updateData.points = points
        if (correctAnswer !== undefined) updateData.correctAnswer = correctAnswer
        if (options !== undefined) updateData.options = options
        if (expectedOutput !== undefined) updateData.expectedOutput = expectedOutput
        if (testCases !== undefined) updateData.testCases = testCases

        // Store before/after values
        const before = {
          questionText: existingQuestion.questionText,
          points: existingQuestion.points,
          correctAnswer: existingQuestion.correctAnswer,
          options: existingQuestion.options,
          expectedOutput: existingQuestion.expectedOutput,
          testCases: existingQuestion.testCases,
        }

        // Update question
        const updatedQuestion = await storage.updateQuestion(questionId, updateData)
        if (!updatedQuestion) {
          return res.status(500).json({ message: "Failed to update question" })
        }

        const after = {
          questionText: updatedQuestion.questionText,
          points: updatedQuestion.points,
          correctAnswer: updatedQuestion.correctAnswer,
          options: updatedQuestion.options,
          expectedOutput: updatedQuestion.expectedOutput,
          testCases: updatedQuestion.testCases,
        }

        // Log audit entry
        await logSuperAdminAction(
          user.id,
          user.username,
          "override_question",
          "question",
          questionId,
          targetName,
          { before, after },
          reason || null,
          ipAddress,
        )

        // Invalidate cache
        await cacheService.delete(`questions:${existingQuestion.roundId}`);

        // Notify via WebSocket
        WebSocketService.notifyOverrideAction("override_question", "question", questionId, { before, after })

        res.json(updatedQuestion)
      } catch (error) {
        console.error("Override question error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // DELETE /api/super-admin/questions/:questionId/override - Delete any question
  app.delete(
    "/api/super-admin/questions/:questionId/override",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { questionId } = req.params
        const { reason } = req.body
        const user = req.user!
        const ipAddress = getClientIp(req)

        // Get existing question details
        const existingQuestion = await storage.getQuestion(questionId)
        if (!existingQuestion) {
          return res.status(404).json({ message: "Question not found" })
        }

        // Delete question
        await storage.deleteQuestion(questionId)

        // Log audit entry
        await logSuperAdminAction(
          user.id,
          user.username,
          "delete_question",
          "question",
          questionId,
          existingQuestion.questionText,
          null,
          reason || null,
          ipAddress,
        )

        // Invalidate cache
        await cacheService.delete(`questions:${existingQuestion.roundId}`);

        // Notify via WebSocket
        WebSocketService.notifyOverrideAction("delete_question", "question", questionId, {
          questionText: existingQuestion.questionText,
        })

        res.status(204).send()
      } catch (error) {
        console.error("Delete question override error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // PUT /api/super-admin/rounds/:roundId/override - Override round settings
  app.put(
    "/api/super-admin/rounds/:roundId/override",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { roundId } = req.params
        const { duration, startTime, endTime, status, reason } = req.body
        const user = req.user!
        const ipAddress = getClientIp(req)

        // Get existing round
        const existingRound = await storage.getRound(roundId)
        if (!existingRound) {
          return res.status(404).json({ message: "Round not found" })
        }

        // Get event info for context
        const event = await storage.getEvent(existingRound.eventId)
        const targetName = `${event?.name || "Unknown Event"} - ${existingRound.name}`

        // Prepare update data
        const updateData: any = {}
        if (duration !== undefined) updateData.duration = duration
        if (startTime !== undefined) updateData.startTime = startTime
        if (endTime !== undefined) updateData.endTime = endTime
        if (status !== undefined) updateData.status = status

        // Store before/after values
        const before = {
          duration: existingRound.duration,
          startTime: existingRound.startTime,
          endTime: existingRound.endTime,
          status: existingRound.status,
        }

        // Update round
        const updatedRound = await storage.updateRound(roundId, updateData)
        if (!updatedRound) {
          return res.status(500).json({ message: "Failed to update round" })
        }

        const after = {
          duration: updatedRound.duration,
          startTime: updatedRound.startTime,
          endTime: updatedRound.endTime,
          status: updatedRound.status,
        }

        // Log audit entry
        await logSuperAdminAction(
          user.id,
          user.username,
          "override_round",
          "round",
          roundId,
          targetName,
          { before, after },
          reason || null,
          ipAddress,
        )

        // Invalidate cache
        await cacheService.delete(`rounds:${existingRound.eventId}`);
        await cacheService.deletePattern('leaderboard:*');

        // Notify via WebSocket
        WebSocketService.notifyOverrideAction("override_round", "round", roundId, { before, after })

        res.json(updatedRound)
      } catch (error) {
        console.error("Override round error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // GET /api/super-admin/audit-logs - Retrieve audit logs with filters
  app.get("/api/super-admin/audit-logs", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { adminId, targetType, startDate, endDate } = req.query

      const filters: any = {}
      if (adminId) filters.adminId = adminId as string
      if (targetType) filters.targetType = targetType as string
      if (startDate) filters.startDate = new Date(startDate as string)
      if (endDate) filters.endDate = new Date(endDate as string)

      const logs = await storage.getAuditLogs(filters)
      res.json(logs)
    } catch (error) {
      console.error("Get audit logs error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // GET /api/super-admin/audit-logs/target/:targetType/:targetId - Get audit history for a specific resource
  app.get(
    "/api/super-admin/audit-logs/target/:targetType/:targetId",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { targetType, targetId } = req.params

        const logs = await storage.getAuditLogsByTarget(targetType, targetId)
        res.json(logs)
      } catch (error) {
        console.error("Get audit logs by target error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // GET /api/email-logs - Retrieve email logs with filters (Super Admin only)
  app.get("/api/email-logs", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status, templateType, startDate, endDate, limit, offset } = req.query

      const filters: any = {}
      if (status) filters.status = status as string
      if (templateType) filters.templateType = templateType as string
      if (startDate) filters.startDate = new Date(startDate as string)
      if (endDate) filters.endDate = new Date(endDate as string)
      if (limit) filters.limit = Math.min(parseInt(limit as string, 10), 100) // Cap at 100
      if (offset) filters.offset = parseInt(offset as string, 10)

      const logs = await storage.getEmailLogs(filters)
      res.json(logs)
    } catch (error) {
      console.error("Get email logs error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // GET /api/email-logs/count - Get total count of email logs (Super Admin only)
  app.get("/api/email-logs/count", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status, templateType, startDate, endDate } = req.query

      const filters: any = {}
      if (status) filters.status = status as string
      if (templateType) filters.templateType = templateType as string
      if (startDate) filters.startDate = new Date(startDate as string)
      if (endDate) filters.endDate = new Date(endDate as string)

      const count = await storage.getEmailLogsCount(filters)
      res.json({ count })
    } catch (error) {
      console.error("Get email logs count error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // GET /api/email-logs/:id - Get single email log with full details (Super Admin only)
  app.get("/api/email-logs/:id", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params
      const log = await storage.getEmailLogById(id)

      if (!log) {
        return res.status(404).json({ message: "Email log not found" })
      }

      res.json(log)
    } catch (error) {
      console.error("Get email log by ID error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // GET /api/email-logs/recipient/:email - Get email logs for a specific recipient
  app.get(
    "/api/email-logs/recipient/:email",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { email } = req.params

        const logs = await storage.getEmailLogsByRecipient(email)
        res.json(logs)
      } catch (error) {
        console.error("Get email logs by recipient error:", error)
        res.status(500).json({ message: "Internal server error" })
      }
    },
  )

  // POST /api/test-email - Send a test email (admin only)
  app.post("/api/test-email", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { to, name } = req.body

      if (!to || !name) {
        return res.status(400).json({ message: "Email address and name are required" })
      }

      const result = await emailService.sendRegistrationApproved(
        to,
        name,
        "BootFeet 2K26 Test Event",
        "test-user-001",
        "testpass123"
      )

      if (result.success) {
        res.json({
          success: true,
          message: "Test email sent successfully",
          messageId: result.messageId
        })
      } else {
        // Return 200 with success: false so frontend can parse the error message
        // instead of throwing generic 500 error
        console.error("Test email failed:", result.error);
        res.json({
          success: false,
          message: "Failed to send test email",
          error: result.error || "No error detail provided"
        })
      }
    } catch (error) {
      console.error("Test email error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  const httpServer = createServer(app)

  // Admin cache stats
  app.get("/api/admin/cache-stats", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    res.json(cacheService.getStats());
  });

  // Admin cache flush
  app.post("/api/admin/cache-flush", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    await cacheService.flushAll();
    res.json({ message: "Cache flushed successfully" });
  });

  // Queue Admin Routes
  app.get("/api/admin/failed-emails", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const jobs = await queueService.getFailedJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get failed jobs" });
    }
  });

  app.post("/api/admin/retry-email/:jobId", requireAuth, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const success = await queueService.retryJob(req.params.jobId);
      if (success) {
        res.json({ message: "Job retry triggered" });
      } else {
        res.status(404).json({ message: "Job not found or failed to retry" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to retry job" });
    }
  })

  // Get all participants for event admin (grouped by teams)
  // GET /api/event-admin/participants/export - Export participants with credentials
  app.get("/api/event-admin/participants/export", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!;

      if (user.role !== "event_admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Forbidden - Admin access only" });
      }

      // Get events allowed for this admin
      let eventIds: string[] = [];
      if (user.role === "super_admin") {
        const allEvents = await storage.getEvents();
        eventIds = allEvents.map(e => e.id);
      } else {
        const adminEvents = await storage.getEventsByAdmin(user.id);
        eventIds = adminEvents.map(e => e.id);
      }

      if (eventIds.length === 0) {
        return res.status(404).json({ message: "No events found" });
      }

      // Fetch all credentials
      let allData: any[] = [];
      for (const eventId of eventIds) {
        const creds = await storage.getEventCredentialsByEvent(eventId);
        allData.push(...creds);
      }

      // Generate CSV
      const csvRows = [
        ['Event Name', 'Participant Name', 'Roll No', 'Email', 'Username', 'Password', 'Test Enabled', 'Paper Topic']
      ];

      for (const item of allData) {
        csvRows.push([
          `"${item.event.name}"`,
          `"${item.participant.fullName}"`,
          `"${item.realRollNo}"`,
          `"${item.participant.email}"`,
          `"${item.eventUsername}"`,
          `"${item.eventPassword}"`,
          item.testEnabled ? 'Yes' : 'No',
          `"${item.paperTopic || ''}"`
        ]);
      }

      const csvContent = csvRows.map(e => e.join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="participants_credentials.csv"');
      res.send(csvContent);

    } catch (error) {
      console.error("Export participants error:", error);
      res.status(500).json({ message: "Failed to export participants" });
    }
  });

  app.get("/api/event-admin/participants", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const user = req.user!

      // Only event admins can use this endpoint
      if (user.role !== "event_admin") {
        return res.status(403).json({ message: "Forbidden - Event admin only" })
      }

      // Get all events this user is admin of
      const adminEvents = await storage.getEventsByAdmin(user.id)
      const eventIds = adminEvents.map(e => e.id)

      if (eventIds.length === 0) {
        return res.json([])
      }

      // Get all registrations for these events
      const allRegistrations = await storage.getRegistrations()
      const relevantRegistrations = allRegistrations.filter(r => eventIds.includes(r.eventId))

      // Fetch all credentials for these events to map them
      let allCredentials: any[] = [];
      for (const eventId of eventIds) {
        const creds = await storage.getEventCredentialsByEvent(eventId);
        allCredentials.push(...creds);
      }

      // Group by teams and format response
      const groupedParticipants = relevantRegistrations.map(registration => {
        const teamSize = 1 + (registration.teamMembers?.length || 0)
        const registrationType = teamSize > 1 ? 'team' : 'solo'
        const displayName = registrationType === 'team'
          ? `${registration.organizerName}'s Team`
          : registration.organizerName

        // Find credential for this registration's organizer
        const credential = allCredentials.find(c =>
          c.eventId === registration.eventId &&
          c.participant.email === registration.organizerEmail
        );

        return {
          id: registration.id,
          displayName,
          teamSize,
          registrationType,
          eventId: registration.eventId,
          eventName: registration.event?.name || 'Unknown Event',
          paperTopic: registration.paperTopic || null,
          status: registration.status,
          registeredAt: registration.createdAt,
          // Include user details for search/filter
          user: {
            fullName: registration.organizerName,
            email: registration.organizerEmail,
          },
          event: registration.event,
          teamMembers: registration.teamMembers,
          // Attach credentials
          credentials: credential ? {
            username: credential.eventUsername,
            password: credential.eventPassword,
            rollNo: credential.realRollNo
          } : null
        };
      })

      res.json(groupedParticipants)
    } catch (error) {
      console.error("Get event admin participants error:", error)
      res.status(500).json({ message: "Internal server error" })
    }
  })

  // Get round statistics for live monitoring
  app.get("/api/rounds/:roundId/statistics", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { roundId } = req.params;

      // Get round details
      const round = await storage.getRound(roundId);
      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      // Get all participants for this round's event
      const participants = await storage.getParticipantsByEventId(round.eventId);
      const totalParticipants = participants.length;

      // Get all test attempts for this round
      const attempts = await storage.getTestAttemptsByRound(roundId);

      // Calculate statistics
      const completedParticipants = attempts.filter(a => a.submittedAt !== null).length;
      const activeParticipants = attempts.filter(a => a.startedAt !== null && a.submittedAt === null).length;
      const pendingParticipants = totalParticipants - (completedParticipants + activeParticipants);

      // Check if round is complete (strict: all participants submitted)
      const canShareResults = totalParticipants > 0 && completedParticipants === totalParticipants;

      res.json({
        roundId: round.id,
        roundName: round.name,
        status: round.status,
        totalParticipants,
        activeParticipants,
        completedParticipants,
        pendingParticipants,
        testDuration: round.duration || 60,
        startedAt: round.startedAt,
        endsAt: round.endTime,
        canShareResults,
        showAnswers: round.showAnswers
      });
    } catch (error) {
      console.error("Get round statistics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get leaderboard for a round with role-based visibility
  app.get("/api/rounds/:roundId/leaderboard", requireAuth, requireRoundAccess, async (req: AuthRequest, res: Response) => {
    try {
      const { roundId } = req.params;
      const round = await storage.getRound(roundId);

      if (!round) {
        return res.status(404).json({ message: "Round not found" });
      }

      const leaderboard = await cacheService.get(
        `leaderboard:round:${roundId}`,
        () => storage.getRoundLeaderboard(roundId),
        30,
      );

      const isAdmin = req.user!.role === "super_admin" || req.user!.role === "event_admin";

      if (isAdmin) {
        return res.json({
          scope: "admin",
          answersVisible: round.showAnswers,
          canSelectParticipants: true,
          leaderboard,
        });
      }

      if (!round.showAnswers) {
        return res.json({
          scope: "participant",
          answersVisible: false,
          participantResult: null,
          message: "Results not yet published",
        });
      }

      const attempt = await storage.getTestAttemptByUserAndRound(req.user!.id, roundId);

      if (!attempt || attempt.status !== "completed") {
        return res.json({
          scope: "participant",
          answersVisible: true,
          participantResult: null,
          message: "No completed attempt found for this round",
        });
      }

      const answers = await storage.getAnswersByAttempt(attempt.id);
      const questions = await storage.getQuestionsByRound(roundId);
      const questionTextMap = new Map(questions.map((question) => [question.id, question.questionText]));

      const formattedAnswers = answers.map((answer) => ({
        id: answer.id,
        questionId: answer.questionId,
        answer: answer.answer,
        isCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
        answeredAt: answer.answeredAt,
        questionText: questionTextMap.get(answer.questionId) || null,
      }));

      const participantEntry = leaderboard.find((entry) => entry.userId === req.user!.id) || null;

      return res.json({
        scope: "participant",
        answersVisible: true,
        participantResult: participantEntry
          ? {
            ...participantEntry,
            answers: formattedAnswers,
          }
          : {
            rank: null,
            userId: req.user!.id,
            userName: req.user!.fullName,
            totalScore: attempt.totalScore || 0,
            maxScore: attempt.maxScore,
            submittedAt: attempt.submittedAt,
            answers: formattedAnswers,
          },
      });
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================================================
  // EMAIL PROVIDER MANAGEMENT (Super Admin Only)
  // Supports switching between Brevo (300/day) and Resend (200/day)
  // ============================================================================

  // GET /api/email-provider - Get current provider status and limits
  app.get(
    "/api/email-provider",
    requireAuth,
    requireSuperAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        const stats = await emailService.getProviderStats();
        res.json(stats);
      } catch (error) {
        console.error("Get email provider error:", error);
        res.status(500).json({ message: "Failed to get email provider status" });
      }
    }
  );

  // POST /api/email-provider - Switch email provider
  app.post(
    "/api/email-provider",
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { provider } = req.body;

        if (!provider || (provider !== 'brevo' && provider !== 'resend')) {
          return res.status(400).json({
            message: "Invalid provider. Must be 'brevo' or 'resend'"
          });
        }

        // Check if the requested provider has capacity
        const hasCapacity = await emailService.hasCapacity(provider);
        if (!hasCapacity) {
          return res.status(400).json({
            message: `Provider '${provider}' has reached its daily limit. Try the other provider.`
          });
        }

        await emailService.setPreferredProvider(provider);
        const stats = await emailService.getProviderStats();

        res.json({
          success: true,
          message: `Switched to ${provider}`,
          ...stats
        });
      } catch (error) {
        console.error("Switch email provider error:", error);
        res.status(500).json({ message: "Failed to switch email provider" });
      }
    }
  );

  // ============================================================================
  // EVENT REGISTRATIONS (Event Admin / Super Admin)
  // View all registrations including pending before credential generation
  // ============================================================================

  // GET /api/events/:eventId/registrations - Get all registrations for an event
  app.get(
    "/api/events/:eventId/registrations",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const registrations = await storage.getRegistrationsByEvent(eventId);
        res.json(registrations);
      } catch (error) {
        console.error("Get event registrations error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // ============================================================================
  // MANUAL ROUND RESULTS & EVENT WINNERS (Event Admin / Super Admin)
  // For physical/offline round results and winner declaration
  // ============================================================================

  // GET /api/events/:eventId/round1-qualifiers - Get Round 1 qualifiers from online tests
  app.get(
    "/api/events/:eventId/round1-qualifiers",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const qualifiers = await storage.getRound1Qualifiers(eventId, limit);
        res.json(qualifiers);
      } catch (error) {
        console.error("Get round 1 qualifiers error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // GET /api/events/:eventId/manual-rounds - Get all manual round entries
  app.get(
    "/api/events/:eventId/manual-rounds",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const roundNumber = req.query.round ? parseInt(req.query.round as string) : undefined;

        let entries;
        if (roundNumber) {
          entries = await storage.getManualRoundEntriesByEventAndRound(eventId, roundNumber);
        } else {
          entries = await storage.getManualRoundEntriesByEvent(eventId);
        }

        res.json(entries);
      } catch (error) {
        console.error("Get manual round entries error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // POST /api/events/:eventId/manual-rounds - Add manual round entries (bulk)
  app.post(
    "/api/events/:eventId/manual-rounds",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const { roundNumber, roundName, entries } = req.body;

        if (!roundNumber || !roundName || !entries || !Array.isArray(entries)) {
          return res.status(400).json({ message: "roundNumber, roundName, and entries array required" });
        }

        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        const createdEntries = await Promise.all(
          entries.map(async (entry: any) => {
            return await storage.createManualRoundEntry({
              eventId,
              roundNumber: parseInt(roundNumber),
              roundName,
              participantName: entry.name || entry.participantName,
              participantRollNo: entry.rollNo || entry.participantRollNo,
              participantCollege: entry.college || entry.participantCollege,
              participantDept: entry.dept || entry.participantDept,
              score: entry.score ? parseInt(entry.score) : null,
              rank: entry.rank ? parseInt(entry.rank) : null,
              notes: entry.notes,
              enteredBy: req.user!.id,
            });
          })
        );

        res.status(201).json({
          success: true,
          count: createdEntries.length,
          entries: createdEntries
        });
      } catch (error) {
        console.error("Create manual round entries error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // PATCH /api/events/:eventId/manual-rounds/:entryId - Update a manual round entry
  app.patch(
    "/api/events/:eventId/manual-rounds/:entryId",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { entryId } = req.params;
        const updates = req.body;

        const updated = await storage.updateManualRoundEntry(entryId, updates);
        if (!updated) {
          return res.status(404).json({ message: "Entry not found" });
        }

        res.json(updated);
      } catch (error) {
        console.error("Update manual round entry error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // DELETE /api/events/:eventId/manual-rounds/:entryId - Delete a manual round entry
  app.delete(
    "/api/events/:eventId/manual-rounds/:entryId",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { entryId } = req.params;
        await storage.deleteManualRoundEntry(entryId);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete manual round entry error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // GET /api/events/:eventId/winners - Get event winners
  app.get(
    "/api/events/:eventId/winners",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        if (req.user!.role === 'event_admin') {
          const isAssigned = await storage.isUserEventAdmin(req.user!.id, eventId);
          if (!isAssigned) {
            return res.status(403).json({ message: "Forbidden: You are not an admin for this event" });
          }
        }
        const winners = await storage.getEventWinners(eventId);
        res.json(winners);
      } catch (error) {
        console.error("Get event winners error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );


  // GET /api/events/:eventId/confirmed-participants - Get confirmed participants for winner declaration
  app.get(
    "/api/events/:eventId/confirmed-participants",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        if (req.user!.role === 'event_admin') {
          const isAssigned = await storage.isUserEventAdmin(req.user!.id, eventId);
          if (!isAssigned) {
            return res.status(403).json({ message: "Forbidden: You are not an admin for this event" });
          }
        }
        const participants = await storage.getConfirmedParticipantsForEvent(eventId);
        res.json(participants);
      } catch (error) {
        console.error("Get confirmed participants error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // POST /api/events/:eventId/winners - Declare winners (bulk)
  app.post(
    "/api/events/:eventId/winners",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const { winners } = req.body;

        if (req.user!.role === 'event_admin') {
          const isAssigned = await storage.isUserEventAdmin(req.user!.id, eventId);
          if (!isAssigned) {
            return res.status(403).json({ message: "Forbidden: You are not an admin for this event" });
          }
        }

        if (!winners || !Array.isArray(winners)) {
          return res.status(400).json({ message: "winners array required" });
        }

        const event = await storage.getEvent(eventId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // H-02: delete-then-bulk-create runs in one transaction — a failure
        // mid-way no longer leaves the event with zero winners.
        const createdWinners = await storage.replaceEventWinners(
          eventId,
          winners.map((winner: any) => ({
            eventId,
            position: parseInt(winner.position),
            participantName: winner.name || winner.participantName,
            participantRollNo: winner.rollNo || winner.participantRollNo,
            participantCollege: winner.college || winner.participantCollege,
            participantDept: winner.dept || winner.participantDept,
            finalScore: winner.score ? parseInt(winner.score) : null,
            winningRound: winner.winningRound || winner.round,
            teamMembers: winner.teamMembers || null,
            declaredBy: req.user!.id,
          }))
        );

        // Auto-publish results on the final round and notify clients
        try {
          const rounds = await storage.getRoundsByEvent(eventId);
          if (rounds.length > 0) {
            const sortedRounds = [...rounds].sort((a, b) => b.roundNumber - a.roundNumber);
            const finalRound = sortedRounds[0];
            if (!finalRound.resultsPublished) {
              const updated = await storage.updateRoundResultsPublished(finalRound.id, true);
              WebSocketService.notifyRoundStatus(eventId, finalRound.id, finalRound.status, updated || { ...finalRound, resultsPublished: true });
            }
          }
        } catch (roundPubErr) {
          console.error("Error auto-publishing final round results on winner declaration:", roundPubErr);
        }

        res.status(201).json({
          success: true,
          count: createdWinners.length,
          winners: createdWinners
        });
      } catch (error) {
        console.error("Declare winners error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // DELETE /api/events/:eventId/winners/:winnerId - Delete a winner
  app.delete(
    "/api/events/:eventId/winners/:winnerId",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { eventId, winnerId } = req.params;
        if (req.user!.role === 'event_admin') {
          const isAssigned = await storage.isUserEventAdmin(req.user!.id, eventId);
          if (!isAssigned) {
            return res.status(403).json({ message: "Forbidden: You are not an admin for this event" });
          }
        }
        await storage.deleteEventWinner(winnerId);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete winner error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // Note: GET /api/events/:eventId/rounds/:roundNumber/selection-pool is defined
  // earlier (with leaderboard/manual-qualifier resolution).
  // Note: POST /api/events/:eventId/rounds/:roundNum/results is defined earlier with full qualifier persistence

  // ============================================
  // IMAGE QUESTION & MANUAL EVALUATION APIs
  // ============================================

  // Serve uploaded images statically
  app.use('/uploads/questions', express.static(path.join(process.cwd(), 'uploads', 'questions')));

  // GET /api/rounds/:roundId/submissions - Get all completed test attempts with answers
  app.get(
    "/api/rounds/:roundId/submissions",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { roundId } = req.params;

        // Get round to verify access
        const round = await storage.getRound(roundId);
        if (!round) {
          return res.status(404).json({ message: "Round not found" });
        }

        // Get all test attempts for this round
        const attempts = await storage.getTestAttemptsByRound(roundId);

        // Filter to completed/submitted attempts
        const completedAttempts = attempts.filter(
          a => a.status === 'completed' || a.status === 'auto_submitted'
        );

        // Batch fetch all required data
        const userIds = completedAttempts.map(a => a.userId);
        const attemptIds = completedAttempts.map(a => a.id);

        const [users, allAnswers, allRegs] = await Promise.all([
          storage.getUsersByIds(userIds),
          storage.getAnswersByAttemptIds(attemptIds),
          storage.getRegistrationsByEvent(round.eventId)
        ]);

        // Create lookup maps
        const userMap = new Map(users.map(u => [u.id, u]));
        const regMap = new Map(allRegs.map(r => [r.organizerEmail, r]));

        // Group answers by attemptId
        const answersMap = new Map<string, typeof allAnswers>();
        allAnswers.forEach(a => {
          const attemptAnswers = answersMap.get(a.attemptId) || [];
          attemptAnswers.push(a);
          answersMap.set(a.attemptId, attemptAnswers);
        });

        // Build response
        const submissions = completedAttempts.map(attempt => {
          const user = userMap.get(attempt.userId);
          const answers = answersMap.get(attempt.id) || [];
          const registration = user?.email ? regMap.get(user.email) : null;

          // Calculate evaluation status
          const totalQuestions = answers.length;
          const evaluatedQuestions = answers.filter(a => a.isCorrect !== null).length;
          const correctCount = answers.filter(a => a.isCorrect === true).length;
          const wrongCount = answers.filter(a => a.isCorrect === false).length;

          return {
            attemptId: attempt.id,
            userId: attempt.userId,
            userName: user?.fullName || 'Unknown',
            userEmail: user?.email || '',
            college: registration?.organizerCollege || '',
            department: registration?.organizerDept || '',
            rollNo: registration?.organizerRollNo || '',
            submittedAt: attempt.submittedAt || attempt.completedAt,
            status: attempt.status,
            totalQuestions,
            evaluatedQuestions,
            correctCount,
            wrongCount,
            isFullyEvaluated: totalQuestions === evaluatedQuestions,
            totalScore: attempt.totalScore || 0,
            answers: answers.map(a => ({
              id: a.id,
              questionId: a.questionId,
              answer: a.answer,
              isCorrect: a.isCorrect,
              pointsAwarded: a.pointsAwarded
            }))
          };
        });

        res.json(submissions);
      } catch (error) {
        console.error("Get submissions error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // GET /api/attempts/:attemptId/details - Get single attempt with full details for evaluation
  app.get(
    "/api/attempts/:attemptId/details",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { attemptId } = req.params;

        const attempt = await storage.getTestAttempt(attemptId);
        if (!attempt) {
          return res.status(404).json({ message: "Attempt not found" });
        }

        const round = await storage.getRound(attempt.roundId);
        const user = await storage.getUser(attempt.userId);
        const answers = await storage.getAnswersByAttempt(attemptId);
        const questions = await storage.getQuestionsByRound(attempt.roundId);

        // Get registration info
        let registration = null;
        if (round && user?.email) {
          const allRegs = await storage.getRegistrationsByEvent(round.eventId);
          registration = allRegs.find(r => r.organizerEmail === user.email);
        }

        // Combine questions with answers
        const questionAnswers = questions.map(q => {
          const answer = answers.find(a => a.questionId === q.id);
          return {
            questionId: q.id,
            questionNumber: q.questionNumber,
            questionType: q.questionType,
            questionText: q.questionText, // This will be image URL for image_text type
            expectedAnswer: q.correctAnswer || q.expectedOutput, // Admin hint
            points: q.points,
            answer: answer ? {
              id: answer.id,
              text: answer.answer,
              isCorrect: answer.isCorrect,
              pointsAwarded: answer.pointsAwarded
            } : null
          };
        });

        res.json({
          attemptId: attempt.id,
          roundId: attempt.roundId,
          roundName: round?.name || '',
          userId: attempt.userId,
          userName: user?.fullName || 'Unknown',
          userEmail: user?.email || '',
          college: registration?.organizerCollege || '',
          department: registration?.organizerDept || '',
          rollNo: registration?.organizerRollNo || '',
          submittedAt: attempt.submittedAt,
          status: attempt.status,
          questionAnswers
        });
      } catch (error) {
        console.error("Get attempt details error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // PUT /api/answers/:answerId/evaluate - Evaluate a single answer
  app.put(
    "/api/answers/:answerId/evaluate",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { answerId } = req.params;
        const { isCorrect, pointsAwarded } = req.body;

        if (typeof isCorrect !== 'boolean') {
          return res.status(400).json({ message: "isCorrect (boolean) is required" });
        }

        const answer = await storage.getAnswer(answerId);
        if (!answer) {
          return res.status(404).json({ message: "Answer not found" });
        }

        // Get question for points
        const question = await storage.getQuestion(answer.questionId);
        // BUG-D-02: honor the grader's explicit points, else the question's
        // configured points — not a hardcoded 1 per question.
        const points = typeof pointsAwarded === 'number' && Number.isFinite(pointsAwarded)
          ? pointsAwarded
          : isCorrect ? (question?.points ?? 1) : 0;

        // Update the answer
        const updated = await storage.updateAnswer(answerId, {
          isCorrect,
          pointsAwarded: points
        });

        // Recalculate attempt total score
        const attempt = await storage.getTestAttempt(answer.attemptId);
        if (attempt) {
          const allAnswers = await storage.getAnswersByAttempt(attempt.id);
          const totalScore = allAnswers.reduce((sum, a) => sum + (a.pointsAwarded || 0), 0);
          await storage.updateTestAttempt(attempt.id, { totalScore });
        }

        res.json(updated);
      } catch (error) {
        console.error("Evaluate answer error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // PUT /api/attempts/:attemptId/evaluate - Batch evaluate all answers for an attempt
  app.put(
    "/api/attempts/:attemptId/evaluate",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { attemptId } = req.params;
        const { evaluations } = req.body;

        if (!Array.isArray(evaluations)) {
          return res.status(400).json({ message: "evaluations array is required" });
        }

        const attempt = await storage.getTestAttempt(attemptId);
        if (!attempt) {
          return res.status(404).json({ message: "Attempt not found" });
        }

        // Update each answer
        for (const eval_ of evaluations) {
          const { answerId, isCorrect, pointsAwarded } = eval_;
          if (answerId && typeof isCorrect === 'boolean') {
            const answer = await storage.getAnswer(answerId);
            if (answer) {
              const question = await storage.getQuestion(answer.questionId);
              // BUG-D-02: honor the grader's explicit points, else the
              // question's configured points — not a hardcoded 1.
              const points = typeof pointsAwarded === 'number' && Number.isFinite(pointsAwarded)
                ? pointsAwarded
                : isCorrect ? (question?.points ?? 1) : 0;
              await storage.updateAnswer(answerId, { isCorrect, pointsAwarded: points });
            }
          }
        }

        // Recalculate total score
        const allAnswers = await storage.getAnswersByAttempt(attemptId);
        const totalScore = allAnswers.reduce((sum, a) => sum + (a.pointsAwarded || 0), 0);
        await storage.updateTestAttempt(attemptId, { totalScore });

        res.json({ success: true, totalScore });
      } catch (error) {
        console.error("Batch evaluate error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // GET /api/rounds/:roundId/evaluated-leaderboard - Get leaderboard sorted by correct answers
  app.get(
    "/api/rounds/:roundId/evaluated-leaderboard",
    requireAuth,
    requireEventAdminOrSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const { roundId } = req.params;

        const round = await storage.getRound(roundId);
        if (!round) {
          return res.status(404).json({ message: "Round not found" });
        }

        // Get all completed attempts
        const attempts = await storage.getTestAttemptsByRound(roundId);
        const completedAttempts = attempts.filter(
          a => a.status === 'completed' || a.status === 'auto_submitted'
        );

        // Build leaderboard entries
        // Batch fetch all required data
        const userIds = completedAttempts.map(a => a.userId);
        const attemptIds = completedAttempts.map(a => a.id);

        const [users, allAnswers, allRegs, qualifiers] = await Promise.all([
          storage.getUsersByIds(userIds),
          storage.getAnswersByAttemptIds(attemptIds),
          storage.getRegistrationsByEvent(round.eventId),
          storage.getManualRoundEntriesByEventAndRound(round.eventId, round.roundNumber)
        ]);

        const qualifiedUserIds = new Set(qualifiers.map(q => q.participantUserId));

        // Create lookup maps
        const userMap = new Map(users.map(u => [u.id, u]));
        const regMap = new Map(allRegs.map(r => [r.organizerEmail, r]));

        // Batch fetch all team members
        const regIds = allRegs.map(r => r.id);
        const allTeamMembers = await storage.getTeamMembersByRegistrationIds(regIds);
        const teamMemberMap = new Map<string, any[]>();
        allTeamMembers.forEach(m => {
          const list = teamMemberMap.get(m.registrationId) || [];
          list.push({
            name: m.memberName,
            rollNo: m.memberRollNo,
            email: m.memberEmail
          });
          teamMemberMap.set(m.registrationId, list);
        });

        // Group answers by attemptId
        const answersMap = new Map<string, typeof allAnswers>();
        allAnswers.forEach(a => {
          const attemptAnswers = answersMap.get(a.attemptId) || [];
          attemptAnswers.push(a);
          answersMap.set(a.attemptId, attemptAnswers);
        });

        // Build leaderboard entries
        const leaderboard = completedAttempts.map((attempt) => {
          const user = userMap.get(attempt.userId);
          const answers = answersMap.get(attempt.id) || [];

          // Get registration info
          let registration = null;
          let teamMembersList: any[] = [];

          if (user?.email) {
            registration = regMap.get(user.email);
            if (registration) {
              teamMembersList = teamMemberMap.get(registration.id) || [];
            }
          }

          const correctCount = answers.filter(a => a.isCorrect === true).length;
          const wrongCount = answers.filter(a => a.isCorrect === false).length;
          const pendingCount = answers.filter(a => a.isCorrect === null).length;
          const totalScore = answers.reduce((sum, a) => sum + (a.pointsAwarded || 0), 0);

          return {
            attemptId: attempt.id,
            userId: attempt.userId,
            name: user?.fullName || 'Unknown',
            email: user?.email || '',
            college: registration?.organizerCollege || '',
            department: registration?.organizerDept || '',
            rollNo: registration?.organizerRollNo || '',
            correctCount,
            wrongCount,
            pendingCount,
            totalScore,
            submittedAt: attempt.submittedAt || attempt.completedAt,
            isFullyEvaluated: pendingCount === 0,
            teamMembers: teamMembersList,
            isQualified: user ? qualifiedUserIds.has(user.id) : false
          };
        });

        // Sort by correct count DESC, then by submission time ASC
        leaderboard.sort((a, b) => {
          if (b.correctCount !== a.correctCount) {
            return b.correctCount - a.correctCount;
          }
          const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity;
          const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : Infinity;
          return timeA - timeB;
        });

        // Add rank
        const rankedLeaderboard = leaderboard.map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));

        res.json(rankedLeaderboard);
      } catch (error) {
        console.error("Get evaluated leaderboard error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  return httpServer
}

