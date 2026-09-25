# BootFete 2K26 — End-to-End Architecture Report

> Reverse-engineered read-only investigation. No files, services, or data were modified.
> Where something could not be determined from the repository, it is explicitly marked `UNKNOWN`.

---

## 1. Executive Summary

BootFete 2K26 (repo `bootfete`, npm package name `rest-express`) is a **single-application, full-stack TypeScript web platform** for running a college symposium ("Quantek / BootFete 2K26" by PG Department of Computer Applications, Bishop Heber College). It is built as one Express server that serves both the JSON API and the compiled React frontend from the same process/port.

The system implements a **role-based symposium lifecycle**:

- Super Admin creates events and manages event admins, registration committee members, registration forms, reports, email logs, and performs audited overrides.
- Event Admin manages rounds, questions, proctoring rules, participants, leaderboards, results, and winner declaration for their assigned event(s).
- Registration Committee reviews/confirms registrations and performs on-spot registration, credential generation, and CSV/PDF export.
- Participant registers via public forms, receives event credentials, takes proctored online tests, and views results/leaderboards.

Notable characteristics:

- **Single `server/routes.ts` monolith (~7,990 lines)** contains nearly all HTTP handlers inline — there are no separate controllers/router modules.
- **Two registration systems coexist**: an older form-based system (deprecated, `POST /api/registration-forms/:slug/submit` returns 410) and the current team-based system (`registrations` + `teamMembers` + `participantRegistry` + `eventCredentials`).
- **Two authentication paths**: normal `users` login (bcrypt) and per-event participant credentials (`event_credentials`), which supports both bcrypt hashes and legacy plaintext passwords.
- **Real-time layer**: Socket.io with a Redis adapter, plus Redis-backed sessions and a Redis-backed Bull email queue.
- **Monitoring**: Winston daily-rotating logs, Prometheus metrics via `prom-client`, and a lightweight in-process monitoring/alert service (mostly placeholders).

---

## 2. Complete Directory Structure

```
bootfete/
├── .commandcode/                 # Tooling metadata (taste preferences only)
│   └── taste/
├── .git/                         # Git repository metadata
├── client/                       # React frontend (Vite root)
│   ├── index.html                # HTML entry, font preconnect, #root, /src/main.tsx
│   └── src/
│       ├── main.tsx              # ReactDOM.createRoot render
│       ├── App.tsx               # Providers + Wouter router + route table
│       ├── index.css             # Tailwind/theme CSS
│       ├── header.jpeg           # Loose image (see client/src/assets for used asset)
│       ├── assets/
│       │   └── college-header.jpg# Header banner image
│       ├── components/
│       │   ├── AppHeader.tsx     # Global fixed header banner
│       │   ├── layouts/          # 4 role layouts
│       │   │   ├── AdminLayout.tsx
│       │   │   ├── EventAdminLayout.tsx
│       │   │   ├── ParticipantLayout.tsx
│       │   │   └── RegistrationCommitteeLayout.tsx
│       │   └── ui/               # 47 shadcn/ui components
│       ├── contexts/
│       │   └── WebSocketContext.tsx # Socket.io client + query refetch wiring
│       ├── hooks/
│       │   ├── use-mobile.tsx
│       │   └── use-toast.ts
│       ├── lib/
│       │   ├── auth.tsx          # AuthProvider / useAuth
│       │   ├── queryClient.ts    # TanStack Query client + apiRequest
│       │   └── utils.ts          # cn() classname helper
│       └── pages/
│           ├── login.tsx
│           ├── not-found.tsx
│           ├── reports.tsx       # shared download page
│           ├── admin/            # 22 files (super admin)
│           ├── event-admin/      # 21 files
│           ├── participant/      # 7 files
│           ├── public/           # 2 files (registration forms)
│           └── registration-committee/ # 3 files
├── deployment/
│   └── nginx/
│       └── sympodupli            # Nginx reverse-proxy config (regular file, NOT a symlink)
├── dist/                         # Build output (generated)
│   ├── index.js                  # Bundled server
│   └── public/                   # Vite client build
├── docs/
│   ├── COLLEGE_SERVER_DEPLOYMENT.md
│   ├── DATABASE_STRUCTURE.md
│   ├── VERCEL_DEPLOYMENT.md
│   ├── websocket-validation-report.md
│   └── websockets.md
├── logs/                         # Winston daily-rotating logs (generated, gitignored)
├── scripts/                      # 16 diagnostic/utility scripts
├── server/                       # Backend
│   ├── index.ts                  # Server bootstrap
│   ├── routes.ts                 # ALL API routes (monolith)
│   ├── storage.ts                # DatabaseStorage (data access layer)
│   ├── db.ts                     # Drizzle + Neon HTTP client
│   ├── websocket.ts              # Socket.io setup + Redis adapter
│   ├── vite.ts                   # Vite middleware (dev) / static serve (prod)
│   ├── seed.ts                   # Super-admin-only seed
│   ├── create-indexes.js         # Manual index creation
│   ├── run-migration.ts          # Adds organizer_college column
│   ├── run-department-migrations.ts # Runs dept migration SQL
│   ├── verify-department-limit.ts   # Verification script
│   ├── add-college-field.sql
│   ├── add-performance-indexes.sql
│   ├── check-college-data.sql
│   ├── db-indexes.sql
│   ├── config/
│   │   └── resend.config.ts      # DEPRECATED (empty export)
│   ├── data/
│   │   └── colleges.json         # Static college list
│   ├── lib/
│   │   └── departmentUtils.ts    # normalizeDepartment + validation
│   ├── middleware/
│   │   ├── auth.ts               # All RBAC middleware
│   │   └── correlation.ts        # X-Correlation-Id
│   ├── migrations/
│   │   ├── add-department-limit-indexes.sql
│   │   └── normalize-department-data.sql
│   ├── services/
│   │   ├── alertService.ts       # Alert placeholders
│   │   ├── cacheService.ts       # Redis-backed cache
│   │   ├── emailService.ts       # Brevo + Resend dual provider
│   │   ├── loggerService.ts      # Winston
│   │   ├── metricsService.ts     # prom-client
│   │   ├── monitoringService.ts  # 60s interval checks
│   │   ├── queueService.ts       # Bull email queue
│   │   ├── redisClient.ts        # ioredis singleton
│   │   └── websocketService.ts   # Typed WS broadcasting
│   ├── templates/
│   │   └── emailTemplates.ts     # HTML email templates
│   └── tests/
│       ├── cacheTest.ts
│       ├── queueTest.ts
│       └── websocketStressTest.ts
├── shared/
│   └── schema.ts                 # Drizzle tables + Zod schemas + TS types
├── tests/
│   ├── setup.ts
│   ├── e2e/                      # Playwright (proctored-test.spec.ts)
│   ├── fixtures/                 # Sample question JSON/CSV
│   ├── integration/              # Jest (3 suites)
│   ├── mocks/
│   │   └── nanoid.js
│   ├── reports/                  # Generated test reports
│   ├── unit/                     # Jest (auth.test.ts)
│   └── utils/
│       └── testHelpers.ts
├── uploads/
│   └── questions/                # Uploaded question images (generated)
├── .env                          # Environment secrets (not committed; ignored? see §17)
├── .gitignore
├── .nycrc.json                   # Coverage config
├── .replit                       # Replit config (CONTAINS SECRETS)
├── DEPLOYMENT_GUIDE.md
├── PAGES_AND_FUNCTIONALITIES_AUDIT.md
├── PAGES_FUNCTIONALITIES_AUDIT.md
├── README.md
├── REGISTRATION_FORM_PATCH.txt
├── SETUP.md
├── components.json               # shadcn/ui config
├── drizzle.config.ts             # Drizzle Kit config
├── ecosystem.config.cjs          # PM2 cluster config (2 instances, port 3000)
├── ecosystem.config.js.save      # Saved PM2 config variant
├── jest.config.js
├── package.json
├── package-lock.json
├── playwright.config.ts
├── postcss.config.js
├── replit.md                     # Project overview/status notes
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json                   # Vercel config (deprecated vs nginx/PM2)
└── vite.config.ts                # Vite build config
```

---

## 3. Technology Stack

Determined from `package.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`, and source imports.

**Languages / runtime**
- TypeScript (strict mode, ESM, `"type": "module"`)
- Node.js 20 (per `.replit` `nodejs-20` module and `@types/node@^20`)

**Frontend**
- React 18.3
- Vite 5 (with `@vitejs/plugin-react`)
- Wouter 3 (lightweight routing)
- TanStack Query v5
- Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`
- shadcn/ui (Radix UI primitives), `class-variance-authority`, `clsx`, `tailwind-merge`
- React Hook Form + Zod (`@hookform/resolvers`)
- Framer Motion, Recharts, Lucide React, React Icons, Embla carousel, react-day-picker, input-otp, vaul, next-themes

**Backend**
- Express 4.21
- Socket.io 4.8 (`socket.io` + `socket.io-client`)
- `@socket.io/redis-adapter`
- Multer (question image uploads)
- Passport / passport-local (declared in deps but **not used** in app code)

**Database**
- PostgreSQL (Neon, serverless HTTP driver `@neondatabase/serverless`)
- Drizzle ORM 0.39 (`drizzle-orm/neon-http`)
- Drizzle Kit (schema push)
- Zod validation (manual + `drizzle-zod`)

**Caching / sessions / queue**
- Redis via `ioredis`
- `connect-redis` (Express sessions)
- Bull (email queue)
- Custom `CacheService`

**Email / external**
- Resend (`resend` package) + Brevo (`sib-api-v3-sdk` declared but SDK usage removed; Brevo is called via raw `fetch`)
- Nodemailer (declared but **not used** by the active `emailService.ts`)

**Observability**
- Winston + `winston-daily-rotate-file`
- Prometheus `prom-client`

**Document/report generation**
- PDFKit, ExcelJS, QRCode

**Testing**
- Jest + ts-jest + supertest (unit/integration)
- Playwright (e2e)
- nyc coverage
- autocannon (load test)
- `jest-junit`

**Deployment / process**
- PM2 (`ecosystem.config.cjs`, cluster mode)
- Nginx (`deployment/nginx/sympodupli`)
- Replit (`autoscale` target)
- Vercel (`vercel.json`, though WebSocket support is flagged as limited)

---

## 4. Application Architecture

Logical flow:

```
Participant/Admin Browser
        │  HTTP + WebSocket (single origin)
        ▼
Nginx reverse proxy (optional, production)
        │  proxy_pass + socket.io upgrade
        ▼
Express app (server/index.ts)
        │
        ├─ correlationMiddleware
        ├─ request log + metrics middleware
        ├─ express.json / urlencoded / uploads static
        ├─ express-session (Redis store)
        ├─ /health, /metrics
        ├─ registerRoutes(app)  → server/routes.ts (all /api routes)
        ├─ setupWebSocket(server) → server/websocket.ts
        ├─ error handler
        └─ setupVite (dev) | serveStatic (prod)
        │
        ├─ Middleware: server/middleware/auth.ts (RBAC)
        ├─ Business/data: server/storage.ts (DatabaseStorage)
        │        └─ server/db.ts (Drizzle) → Neon PostgreSQL
        ├─ Services: cache, email, queue, redis, websocket, metrics, monitoring, alert
        │        └─ Redis (sessions, cache, queue, WS adapter)
        └─ Email: Brevo / Resend APIs
```

**Entry points**
- Frontend dev/prod: `client/index.html` → `client/src/main.tsx` → `client/src/App.tsx`
- Backend: `server/index.ts` (dev via `tsx server/index.ts`; prod via bundled `dist/index.js`)

**Bootstrap sequence (server/index.ts)**
1. Correlation middleware.
2. Request logging + metrics middleware.
3. JSON body parser (10 MB, captures `rawBody`).
4. URL-encoded parser.
5. Static `/uploads`.
6. Redis session store + `express-session`.
7. `GET /health`, `GET /metrics`.
8. `monitoringService.start()`.
9. `registerRoutes(app)` → returns HTTP server.
10. `setupWebSocket(server)` → Socket.io with Redis adapter.
11. Global error handler.
12. Vite dev middleware or static production serving.
13. `server.listen(PORT)` → warm cache + initialize email queue.

**Communication between components**
- Routes → `storage` (DatabaseStorage) for all persistence.
- Routes → `cacheService`, `emailService`, `queueService`, `WebSocketService`.
- Services → `redisClient`, `metricsService`, `loggerService`, `alertService`.
- Shared types/entities all come from `shared/schema.ts` (aliased as `@shared/schema`).

---

## 5. Frontend Architecture

**Entry / providers** (`client/src/App.tsx`)
```
QueryClientProvider
 └─ AuthProvider            (client/src/lib/auth.tsx)
     └─ WebSocketProvider   (client/src/contexts/WebSocketContext.tsx)
         └─ TooltipProvider
             └─ AppHeader + Toaster + Router
```

**Routing** — Wouter `<Switch>` with `ProtectedRoute` wrapper. `ProtectedRoute` checks `useAuth()` `isLoading`/`user` and `allowedRoles`.

Role-based redirect after login:
- `super_admin` → `/admin/dashboard`
- `event_admin` → `/event-admin/dashboard`
- `registration_committee` → `/registration-committee/dashboard`
- `participant` → `/participant/dashboard`

**State management**
- TanStack Query for server state (`client/src/lib/queryClient.ts`), with `staleTime 30s`, `gcTime 5m`, `retry 1`, `refetchOnReconnect true`.
- Local component state via React hooks.
- Auth state via `AuthContext` (`localStorage` JWT token + `user` object).
- WebSocket state via `WebSocketContext`.

**API client** (`client/src/lib/queryClient.ts`)
- `apiRequest(method, url, data)` injects `Authorization: Bearer <token>` from `localStorage` and `Content-Type`.
- `getQueryFn` builds GET fetch with auth header; `on401` behavior configurable.
- `throwIfResNotOk` surfaces backend `message`.

**WebSocket client** (`client/src/contexts/WebSocketContext.tsx`)
- Connects via `io(window.location.origin, { auth: { token } })` when token+user present.
- Auto-disconnect when unauthenticated.
- Listens for `registrationUpdate`, `roundStatus`, `overrideAction`, `resultPublished`, `registrationConfirmed`, `testSubmitted`, `leaderboardUpdate`, `credentialsCreated`, `dataRefresh`, `manualRoundEntry`, `winnerDeclared`, then triggers targeted `queryClient.refetchQueries`.

**Proctored test page** (`participant/take-test.tsx`) enforces:
- Fullscreen entry/re-entry (skipped on iOS/mobile).
- `visibilitychange`, `blur`, `popstate`, `beforeunload`, keyboard shortcut blocking.
- Violation logging via `POST /api/attempts/:id/violations`.
- Auto-submit on round end, timer expiry, or elimination threshold.

---

## 6. Backend Architecture

**Routes** — all in `server/routes.ts`. Key route groups (full API map in §9):

- Auth & users
- Events, event admins, event rules
- Rounds (start/end/pause/resume/restart, results, rules, selection pool)
- Questions (CRUD, bulk, uploads)
- Participants & credentials
- Team-based registrations (register/batch/validate/confirm)
- Test attempts (start, answer, violations, submit, results)
- Leaderboards & statistics
- Reports (JSON generation + Excel/PDF export)
- Registration forms & registration committee
- Super-admin overrides + audit logs
- Email logs & email provider management
- Manual round entries & event winners
- Submission evaluation (manual grading)
- Monitoring/admin (status, queue-stats, cache-stats)

**Data access** — `server/storage.ts` exposes `DatabaseStorage implements IStorage`. The `IStorage` interface is large (~250 method signatures) and is the de facto repository/service layer (business logic is mixed into route handlers, not cleanly separated).

**Middleware** (`server/middleware/auth.ts`)
- `requireAuth` — verifies JWT, loads user, sets `req.user`.
- `requireSuperAdmin`
- `requireEventAdmin` (allows super_admin)
- `requireParticipant`
- `requireRegistrationCommittee` (allows super_admin)
- `requireEventAccess` — role-specific event ownership checks.
- `requireRoundAccess` — round ownership/registration checks.
- `requireEventAdminOrSuperAdmin` — used for event/round-scoped admin actions.

**Error handling** — per-route try/catch returning JSON `{ message }`; a global error handler in `server/index.ts` rethrows after responding.

---

## 7. Database Architecture

Database: **PostgreSQL (Neon)** via Drizzle ORM. Schema is fully defined in `shared/schema.ts`.

**20 tables:**

| Table | Purpose |
|---|---|
| `users` | Accounts, role enum (super_admin, event_admin, participant, registration_committee) |
| `events` | Symposium events |
| `event_admins` | M:N assignment of admins to events |
| `event_rules` | Per-event proctoring rules |
| `rounds` | Test rounds within events |
| `round_rules` | Per-round proctoring rules |
| `questions` | Question bank |
| `participants` | User-to-event participation |
| `test_attempts` | Test sessions + scoring + violations |
| `answers` | Per-question answers |
| `reports` | Generated report records |
| `registration_forms` | Public form definitions |
| `registrations` | Team-based registration records |
| `team_members` | Team members of a registration |
| `participant_registry` | Global participant info keyed by roll number |
| `event_credentials` | Per-event participant credentials |
| `audit_logs` | Super-admin override audit trail |
| `email_logs` | Email delivery tracking |
| `manual_round_entries` | Offline/physical round results |
| `event_winners` | Declared winners |

**Conceptual relationship map:**

```
users 1───N event_admins N───1 events
users 1───N participants N───1 events
users 1───N test_attempts N───1 rounds
users 1───N event_credentials N───1 events
users 1───N audit_logs (adminId)
users 1───N email_logs? (no FK — email_logs has no user FK)
users 1───N reports (generatedBy, SET NULL)

events 1───1 event_rules
events 1───N rounds 1───1 round_rules
events 1───N reports
events 1───N registrations
events 1───N event_credentials
events 1───N manual_round_entries
events 1───N event_winners

rounds 1───N questions
rounds 1───N test_attempts

test_attempts 1───N answers
questions 1───N answers

registrations 1───N team_members

participant_registry — standalone global registry (unique roll_no)
registration_forms — standalone form definitions (not FK-linked to registrations)
```

Key foreign-key behaviors:
- `events.createdBy`, `reports.generatedBy`, `registrations.confirmedBy`, `event_credentials.enabledBy`, `audit_logs.adminId`, `manual_round_entries.*`, `event_winners.*` use `ON DELETE SET NULL`.
- Child ownership rows use `ON DELETE CASCADE`.

Indexes are defined in `server/db-indexes.sql`, `server/add-performance-indexes.sql`, `server/migrations/add-department-limit-indexes.sql`, and applied via `server/create-indexes.js` / migration runners.

---

## 8. Authentication & Security

**Login flow** (`POST /api/auth/login`, `server/routes.ts`)
1. Validate username/password presence and type.
2. Try event credential lookup by username (`storage.getEventCredentialByUsername`).
   - If found, detect bcrypt hash (length 60 + `$2` prefix) and use `bcrypt.compare`; otherwise plaintext comparison (legacy path).
   - Load the participant user, sign JWT with `eventId`.
3. Otherwise normal user lookup by username, `bcrypt.compare`, sign JWT with role.
4. Return `{ message, user, token }` (no password).

**Registration flow** (`POST /api/auth/register`)
- Validates username (3–50, `[a-zA-Z0-9_-]`), password (≥8), email format, fullName (≥2), role enum.
- Checks uniqueness, hashes with bcrypt(10), creates user, returns JWT.

**Password handling**
- bcrypt cost 10 for `users`.
- `event_credentials.event_password` supports both bcrypt and legacy plaintext.

**Tokens/sessions**
- JWT signed with `JWT_SECRET`, expires 7 days.
- Stored client-side in `localStorage` and sent as `Authorization: Bearer`.
- Express session also configured (Redis-backed, `sympo.sid`, 24 h), but the actual app auth uses JWT headers, not the session cookie for API auth.

**Roles / permissions** — enforced by middleware in `server/middleware/auth.ts` and by role checks inside route handlers.

**Frontend route protection** — `ProtectedRoute` with `allowedRoles`.

**Security-sensitive areas / risks (see §19)**
- Hardcoded API keys and secrets present in committed files (see §19).
- `server/routes.ts` uses `JWT_SECRET` fallback value in non-production.
- Some routes use inline role checks (`if user.role !== ...`) instead of reusable middleware.
- `server/vite.ts` production static fallback excludes `/api` and `/uploads` but relies on route ordering.

---

## 9. API Map

Format: `METHOD path` → auth → behavior.

**Health / monitoring**
- `GET /health` — public (redis/memory checks).
- `GET /metrics` — public Prometheus.
- `GET /api/health` — public status.
- `GET /api/admin/status`, `GET /api/admin/queue-stats`, `GET /api/admin/cache-stats`, `POST /api/admin/cache-flush` — super_admin.

**Auth / users**
- `POST /api/auth/register`, `POST /api/auth/login` — public.
- `GET /api/auth/me` — requireAuth.
- `GET /api/users` — requireAuth + super_admin.
- `PATCH /api/users/:id/credentials`, `DELETE /api/users/:id` — super_admin.
- `GET /api/admin/orphaned-admins` — super_admin.
- `GET /api/admin/system-settings` — super_admin.
- `GET /api/users/:userId/assigned-events` — super_admin.

**Events**
- `GET /api/events` — requireAuth (role-filtered).
- `POST /api/events` — super_admin.
- `GET /api/events/unassigned` — super_admin.
- `GET /api/events/for-registration`, `GET /api/events/for-registration-grouped` — public.
- `GET /api/events/:id` — requireAuth + requireEventAccess.
- `PATCH /api/events/:id` — super_admin.
- `DELETE /api/events/:id` — super_admin.
- `GET/POST /api/events/:eventId/admins`, `DELETE /api/events/:eventId/admins/:adminId`.
- `GET/PATCH /api/events/:eventId/rules`.
- `GET/POST /api/events/:eventId/rounds`.
- `GET /api/events/:eventId/participants`, `POST /api/events/:eventId/participants`.
- `GET /api/events/:eventId/leaderboard`.
- `GET /api/events/:eventId/registrations`.
- `GET /api/events/:eventId/event-credentials`.
- `PATCH /api/events/:eventId/credentials/enable-all-tests`, `.../disable-all-tests`, `GET /api/events/:eventId/credentials-status`.
- `GET /api/events/:eventId/round1-qualifiers`.
- `GET/POST /api/events/:eventId/manual-rounds`, `PATCH/DELETE /api/events/:eventId/manual-rounds/:entryId`.
- `GET/POST /api/events/:eventId/winners`, `DELETE /api/events/:eventId/winners/:winnerId`.
- `GET /api/events/:eventId/confirmed-participants`.
- `GET /api/events/:eventId/rounds/:roundNumber/selection-pool`.

**Rounds**
- `GET /api/rounds/:roundId`.
- `DELETE /api/rounds/:roundId`.
- `PATCH /api/rounds/:roundId`.
- `DELETE /api/rounds/:roundId/test-data`.
- `POST /api/rounds/:roundId/start`, `/end`, `/restart`, `/pause`, `/resume`.
- `POST /api/rounds/:roundId/publish-results` (two variants).
- `GET/PATCH /api/rounds/:roundId/rules`.
- `POST /api/rounds/:roundId/toggle-answers`.
- `GET /api/rounds/:roundId/statistics`.
- `GET /api/rounds/:roundId/leaderboard`.
- `GET /api/rounds/:roundId/submissions`.
- `GET /api/rounds/:roundId/evaluated-leaderboard`.
- `GET /api/events/:eventId/rounds/:roundNum/selection-pool`.
- `POST /api/events/:eventId/rounds/:roundNum/results`.

**Questions**
- `GET/POST /api/rounds/:roundId/questions`.
- `GET/PATCH/DELETE /api/rounds/:roundId/questions/:questionId`.
- `POST /api/rounds/:roundId/questions/bulk`.
- `POST /api/upload/question-image` (single + multi).

**Participants / credentials**
- `GET /api/participants/my-credential`.
- `PATCH /api/participants/:participantId/disqualify`.
- `GET /api/participants/my-registrations`.
- `GET /api/participants/:id`.
- `GET /api/event-credentials/:credentialId/id-pass`.
- `PATCH /api/event-credentials/:credentialId/enable-test` / `disable-test`.

**Registrations (team-based)**
- `POST /api/validate-rollno`.
- `POST /api/check-registration-status`.
- `GET /api/registrations` (super_admin / registration_committee).
- `PATCH /api/registrations/:id`.
- `DELETE /api/registrations/:id`.
- `PATCH /api/registrations/:id/confirm`.
- `POST /api/registrations/bulk-confirm`.
- `GET /api/registrations/download-excel`.
- `GET /api/registrations/colleges`.
- `POST /api/register` (single).
- `POST /api/register/batch`.
- `GET /api/student-registrations/:rollNo`.

**Registration forms**
- `POST /api/registration-forms` (super_admin).
- `GET /api/registration-forms/active`, `GET /api/registration-forms/all`, `GET /api/registration-forms/:id/details`, `GET /api/registration-forms/:slug`.
- `PATCH /api/registration-forms/:id`, `DELETE /api/registration-forms/:id`.
- `POST /api/registration-forms/:slug/submit` → 410 (deprecated).

**Registration committee**
- `GET/POST /api/registration-committee/participants`.
- `PATCH/DELETE /api/registration-committee/participants/:id`.
- `GET .../participants/export/csv`, `.../export/pdf`.

**Test attempts**
- `POST /api/events/:eventId/rounds/:roundId/start`.
- `GET /api/participants/rounds/:roundId/my-attempt`.
- `GET /api/attempts/:attemptId`.
- `POST /api/attempts/:attemptId/answers`.
- `POST /api/attempts/:attemptId/violations`.
- `POST /api/attempts/:attemptId/submit`.
- `GET /api/participants/my-attempts`.
- `GET /api/attempts/:attemptId/details`.
- `PUT /api/answers/:answerId/evaluate`.
- `PUT /api/attempts/:attemptId/evaluate`.

**Reports**
- `GET /api/reports`.
- `POST /api/reports/generate/event`, `POST /api/reports/generate/symposium`.
- `GET /api/reports/:id/download`.
- `GET /api/reports/export/event/:eventId/excel|pdf`.
- `GET /api/reports/export/symposium/excel|pdf`.

**Super-admin overrides / audit**
- `PUT /api/super-admin/events/:eventId/override`, `DELETE ...`.
- `PUT /api/super-admin/questions/:questionId/override`, `DELETE ...`.
- `PUT /api/super-admin/rounds/:roundId/override`.
- `GET /api/super-admin/audit-logs`, `GET /api/super-admin/audit-logs/target/:targetType/:targetId`.
- `DELETE /api/super-admin/reset-participants`.

**Email / email provider**
- `GET /api/email-logs`, `GET /api/email-logs/count`, `GET /api/email-logs/:id`, `GET /api/email-logs/recipient/:email`.
- `POST /api/test-email`.
- `GET /api/email-provider`, `POST /api/email-provider`.

**Event admin**
- `GET /api/event-admin/events`, `GET /api/event-admin/my-event`, `GET /api/event-admin/stats`.
- `GET /api/event-admin/participants`, `GET /api/event-admin/participants/export`.

**Static/data**
- `GET /api/colleges`, `GET /api/paper-topics`, `GET /api/food-types`, `GET /api/participants/by-roll/:rollNo`.

---

## 10. File Dependency Map

Core "hub" files:

```
shared/schema.ts          ← imported by server/db.ts, server/storage.ts, server/routes.ts,
                             server/seed.ts, many client pages (types/constants), scripts

server/db.ts              ← imported by server/storage.ts, server/routes.ts, server/seed.ts,
                             scripts, migration runners

server/storage.ts         ← imported by server/routes.ts, server/websocket.ts,
                             server/middleware/auth.ts, server/services/{cache,email,websocket}Service,
                             tests

server/routes.ts          ← imports storage, db, middleware, services, schema
                           ← called by server/index.ts (registerRoutes)

server/index.ts           ← imports routes, vite, websocket, session, redis, middleware, services

server/middleware/auth.ts ← imports storage
                           ← used by server/routes.ts

server/websocket.ts       ← imports storage, redisClient
                           ← used by server/index.ts (setupWebSocket/setIO)

server/services/websocketService.ts ← imports websocket.ts (io), storage
                                     ← used by server/routes.ts

server/services/redisClient.ts      ← used by cache, email, queue, websocket, index
server/services/cacheService.ts     ← used by routes, index
server/services/queueService.ts     ← used by routes, index
server/services/emailService.ts     ← used by queue, routes
```

Frontend hubs:

```
client/src/App.tsx           ← imports all pages, providers, layouts
client/src/lib/auth.tsx      ← used by App, login, WebSocketContext
client/src/lib/queryClient.ts← used by every page (apiRequest / queryClient)
client/src/contexts/WebSocketContext.tsx ← used by App (provider), components (useWebSocket)
shared/schema.ts             ← used by pages for types/constants (DEPARTMENT_OPTIONS, etc.)
```

---

## 11. Major User Flows

### Registration (public, team-based)
```
Public /register/event/:eventId
 → client/src/pages/public/event-registration.tsx
 → GET /api/events/:id (event details)
 → POST /api/validate-rollno (per organizer + member)
 → POST /api/register
 → server/routes.ts (validate team size, category conflicts, dept limit)
 → storage.createTeamRegistrationAtomic (dept limit check + insert registration + team_members)
 → WebSocket notifyRegistrationUpdate + queueService.addEmailJob
 → 201 { registration }
```

### Registration confirmation → credentials
```
Admin/Committee confirms pending registration
 → PATCH /api/registrations/:id/confirm (or /bulk-confirm)
 → create user (if missing) + participant record + event_credentials
 → queue consolidated credentials email
 → WebSocket notifyRegistrationConfirmed / credentialsCreated
 → 200 { registration, eventCredentials }
```

### Online test
```
Participant dashboard → start round
 → POST /api/events/:eventId/rounds/:roundId/start (creates testAttempt)
 → TakeTestPage: fullscreen/proctoring + timer
 → POST /api/attempts/:attemptId/answers (auto-save per answer)
 → POST /api/attempts/:attemptId/violations (on violations)
 → POST /api/attempts/:attemptId/submit (auto-grades, updates score)
 → redirect /participant/results/:attemptId
```

### Round lifecycle (admin)
```
Event Admin/Super Admin
 → POST /api/rounds/:roundId/start (sets in_progress, enables credentials, WS roundStatus)
 → POST /api/rounds/:roundId/pause / resume / end / restart
 → questions CRUD + bulk upload
 → GET /api/rounds/:roundId/statistics + leaderboard (live monitoring)
 → POST /api/rounds/:roundId/toggle-answers (show answers after all submit)
 → POST /api/events/:eventId/rounds/:roundNum/results (persist qualifiers/winners + emails)
```

### Reporting
```
Super Admin/Event Admin
 → POST /api/reports/generate/event|symposium (storage generates JSON report)
 → GET /api/reports/:id/download (JSON)
 → GET /api/reports/export/event/:eventId/excel|pdf (ExcelJS / PDFKit streams)
```

---

## 12. External Services

| Service | Purpose | Config | Called from | Notes |
|---|---|---|---|---|
| Neon PostgreSQL | Database | `DATABASE_URL`, `PG*` env | `server/db.ts` (Drizzle) | Serverless HTTP driver |
| Redis | Sessions, cache, queue, WS adapter | `REDIS_HOST/PORT/PASSWORD` | `redisClient.ts`, `cacheService.ts`, `queueService.ts`, `websocket.ts` | Optional; falls back if missing |
| Brevo | Email (primary, 300/day) | Hardcoded API key in `emailService.ts` | `sendViaBREVO()` via `fetch` | SDK removed |
| Resend | Email (fallback, 200/day) | Hardcoded API key in `emailService.ts` | `sendViaResend()` | |
| Socket.io | Real-time | JWT in `handshake.auth` | `websocket.ts` | Redis adapter for multi-instance |
| Prometheus | Metrics endpoint | None | `metricsService.ts` | `/metrics` |

Failure behavior:
- Redis unavailable → cache falls back to DB, queue falls back to direct send, WS runs single-instance.
- Email provider failure → attempts fallback provider; logs failure to `email_logs`.
- Database missing → `server/db.ts` throws at startup (`DATABASE_URL must be set`).

---

## 13. Configuration

**Environment variables (names only — values intentionally omitted):**

From `.env`: `APP_URL`, `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PGDATABASE`, `PGHOST`, `PGPASSWORD`, `PGPORT`, `PGUSER`, `PORT`, `REDIS_HOST`, `REDIS_PASSWORD`, `REDIS_PORT`, `SMTP_FROM_EMAIL`, `SMTP_HOST`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`.

From `.replit`: additionally `RESEND_FROM_EMAIL`, plus a duplicate database/`PG*` set.

Referenced in code but not present in `.env` (optional/unset): `INSTANCE_ID`, `DISABLE_REDIS`, `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (Google Sheets sync is documented but **not implemented**).

**Development** → `npm run dev` → `cross-env NODE_ENV=development tsx server/index.ts` (Vite HMR middleware, port 5000).

**Production** → `npm run build` → Vite build (`dist/public`) + esbuild bundle (`dist/index.js`); `npm run start` → `cross-env NODE_ENV=production node dist/index.js`.

**Test** → `NODE_ENV=test`, Redis disabled via `redisClient.ts` guard.

**Config files**: `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `drizzle.config.ts`, `jest.config.js`, `playwright.config.ts`, `.nycrc.json`, `vercel.json`, `ecosystem.config.cjs`, `.replit`, `deployment/nginx/sympodupli`.

---

## 14. Deployment Architecture

There are **three deployment descriptions** in the repo, with some inconsistency:

1. **Replit (autoscale)** — `.replit`: `build = npm run build`, `run = npm run start`, port 5000, nodejs-20 + postgresql-16 modules.
2. **PM2 + Nginx (college server)** — `ecosystem.config.cjs` runs 2 cluster instances on port 3000; Nginx config (`deployment/nginx/sympodupli`) upstreams to `127.0.0.1:3001/3002/3003` (note: **mismatch** — PM2 config uses port 3000, nginx upstreams to 3001–3003).
3. **Vercel** — `vercel.json` builds `@vercel/node` and routes `/api`, `/socket.io`, and `/(.*)` to `/dist/index.js`; docs note WebSocket support is limited on Vercel.

Production flow (college server):
```
Internet → DNS → Nginx (80/443, rate limiting, WebSocket upgrade)
  → upstream nodejs_backend (127.0.0.1:3001/3002/3003)
  → Node.js (PM2 cluster) → Neon/PostgreSQL
```

Ports referenced: 5000 (dev/prod default), 3000 (PM2 env), 3001–3003 (nginx upstream), 5432 (PostgreSQL).

---

## 15. Scripts & Commands

From `package.json`:

- `npm run dev` — start dev server (tsx + Vite HMR).
- `npm run build` — Vite build client + esbuild bundle server to `dist/`.
- `npm run start` — run production `dist/index.js`.
- `npm run check` — `tsc` type check (no emit).
- `npm test` — Jest, `tests/unit` only.
- `npm run test:all` — Jest, all tests.
- `npm run db:push` — Drizzle Kit push schema.
- `npm run db:seed` — `tsx server/seed.ts` (note: seed currently creates **only** a superadmin, not full sample data).
- `npm run test:websocket` — WebSocket stress test.

Lifecycle:
```
npm install → npm run db:push → (optional seed) → npm run dev
npm run build → npm start (production)
npm run check / test / test:all (validation)
```

Utility/migration scripts (not wired into npm scripts): `server/run-migration.ts`, `server/run-department-migrations.ts`, `server/verify-department-limit.ts`, `server/create-indexes.js`, and 16 files under `scripts/`.

---

## 16. Symlinks / Special Files

- `deployment/nginx/sympodupli` is a **regular file**, not a symlink (verified via `LinkType` empty). Its name suggests it may have been intended as a duplicate/alternate nginx config, but there is no symlink target.
- No other symlinks detected among inspected source/config directories.

---

## 17. Generated / Ignored Files

**Generated (not source-controlled):**
- `dist/` (Vite + esbuild output; gitignored)
- `logs/` (Winston daily logs; gitignored)
- `uploads/questions/` (multer uploads; the directory is present in working tree; not in `.gitignore` explicitly)
- `tests/reports/` (coverage/playwright/junit outputs)
- `node_modules/` (gitignored)

**`.gitignore` contents:** `node_modules`, `dist`, `.DS_Store`, `server/public`, `vite.config.ts.*`, `*.tar.gz`, `*.log`, `logs/`, `migrations/`.

**Git state note:** `git status` shows a large number of modified files plus untracked files (`client/src/assets`, `AppHeader.tsx`, several new pages, `ecosystem.config.cjs`, `scripts/*`, `server/lib`, `server/data`, `uploads`). `.env` is tracked/modified (it is NOT listed in `.gitignore`), which is a security concern.

---

## 18. Documentation vs. Real Code

- `README.md` and `docs/*` are generally accurate on the high-level feature set, roles, and tech stack.
- `README.md` describes a `participants` table with a JSON `selected_events` array and an "old form-based registration"; the actual current schema uses the `registrations` + `team_members` + `participant_registry` + `event_credentials` design. Some README schema/relationship prose is therefore **outdated**.
- `docs/DATABASE_STRUCTURE.md` describes `testAttempts` columns (`score`, `totalQuestions`, `correctAnswers`, `timeTaken`, `violationCount`, `violationDetails`) and `registrationForms` columns (`eventId`, `formName`, `slug`, `maxRegistrations`) that **do not match** the current `shared/schema.ts` columns. This file is **outdated** relative to the real schema.
- `replit.md` references `attached_assets/` and Google Sheets sync; `attached_assets/` does not exist and Google Sheets integration is documented as "not yet configured."
- `DEPLOYMENT_GUIDE.md` and `SETUP.md` describe seed data (event admins, committees, sample events) that `server/seed.ts` no longer creates — the seed now creates **only** a superadmin.
- `server/config/resend.config.ts` is deprecated (empty), while `README`/docs imply Resend/SMTP config elsewhere.

---

## 19. Risks / Important Findings

1. **Hardcoded secrets in source** (high severity):
   - Brevo API key embedded in `server/services/emailService.ts` and `scripts/test-brevo.ts`.
   - Resend API key embedded in `server/services/emailService.ts`.
   - Full Neon `DATABASE_URL` and `PGPASSWORD` present in `.replit` (and `.env`).
   These are committed/working-tree files and should be rotated/moved to environment variables.

2. **`.env` is tracked by git** — contains `DATABASE_URL`, `JWT_SECRET`, `PG*`, Redis and SMTP credentials.

3. **Legacy plaintext event credentials** — `event_credentials.event_password` can be compared as plaintext in the login path. This is a migration-compatibility branch but weakens password security for any legacy rows.

4. **Monolithic `server/routes.ts`** (~7,990 lines) — high maintenance/complexity risk; business logic, validation, and I/O are interleaved.

5. **PM2/Nginx port mismatch** — PM2 `ecosystem.config.cjs` sets `PORT=3000`, while `deployment/nginx/sympodupli` upstreams to 3001–3003.

6. **AlertService is mostly stubbed** — email/Slack/SMS alert methods are placeholders; only Winston logging is real.

7. **Question upload route duplication** — `POST /api/upload/question-image` is defined twice in `routes.ts`.

8. **`requireEventAdmin` semantics** — the `requireEventAdmin` middleware allows `super_admin` too, which is intentional but easy to misread.

9. **`PATCH /api/rounds/:roundId`** — event admins silently ignore restricted fields (duration/start/end/status) rather than returning 403.

10. **`GET /api/events/:id`** — frontend `event-registration.tsx` calls this while unauthenticated; however the route requires `requireAuth` + `requireEventAccess`. The public registration flow instead relies on `/api/events/for-registration*`; this may be a latent bug for the `/register/event/:eventId` page.

---

## 20. Unknowns / Things That Could Not Be Determined

- Actual runtime values of secrets (intentionally not read).
- Whether the production environment currently uses Replit, Vercel, or the college-server (PM2+Nginx) deployment; all three configs exist.
- The exact live database state/row data — only the schema and seed script were inspected.
- Whether `passport`, `nodemailer`, `sib-api-v3-sdk`, and `@types/socket.io` (declared deps) are used anywhere beyond declarations — grep evidence suggests they are **not** used by active code, but this was not exhaustively proven across every file.
- Whether untracked files (`scripts/*`, new pages, `uploads/`) are intended production artifacts or in-progress work.

---

## 21. Complete End-to-End Data Flow

```
User opens app
  → Nginx/Express serves client/index.html (Vite dev or dist/public)
  → client/src/main.tsx renders App
  → AuthProvider reads token from localStorage, fetches /api/auth/me
  → WebSocketProvider connects (JWT) and subscribes to rooms by role
  → Role redirect to dashboard

User action (e.g., submit registration)
  → React page calls apiRequest('/api/register', POST)
  → server/routes.ts handler validates
  → storage.createTeamRegistrationAtomic queries/inserts via Drizzle
  → PostgreSQL persists registration + team_members
  → WebSocketService broadcasts registrationUpdate (via Redis adapter)
  → queueService enqueues confirmation email (Bull → Redis)
  → emailService sends via Brevo/Resend, logs to email_logs
  → response JSON returns to client
  → TanStack Query cache updates + WebSocket-triggered refetch
  → UI re-renders

Test submission flow
  → participant starts attempt (POST .../start)
  → answers auto-saved (POST /answers), violations logged (POST /violations)
  → submit auto-grades and stores score (POST .../submit)
  → leaderboard/statistics recompute from testAttempts/answers
  → results/leaderboard surfaced to admins + participants when showAnswers enabled
```

---

## 22. Recommended Next Investigation Steps

1. **Secret rotation & removal** — rotate Brevo/Resend/Neon/JWT/Redis/SMTP credentials; remove them from `.replit`, `.env` (if tracked), `emailService.ts`, and `scripts/test-brevo.ts`; add `.env` to `.gitignore`.
2. **Resolve PM2/Nginx port mismatch** and confirm the actual production process/port topology.
3. **Reconcile documentation** — update `docs/DATABASE_STRUCTURE.md` and `README.md` schema sections to match `shared/schema.ts`; update seed documentation to reflect superadmin-only seed.
4. **Split `server/routes.ts`** into domain routers/controllers to reduce the 7,990-line monolith.
5. **Decide legacy credential migration** — remove or migrate plaintext `event_credentials.event_password` values to bcrypt.
6. **Fix duplicate route definition** (`POST /api/upload/question-image`).
7. **Audit the public event detail fetch** for the unauthenticated registration page.
8. **Decide the deployment target** (Replit vs Vercel vs college server) and align configs/docs accordingly.
