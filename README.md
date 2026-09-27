# 🎓 BootFete — Multi-Tenant Symposium Management Platform

> Run entire college symposiums end-to-end: registrations, proctored online exams, live leaderboards, certificates, and reports — with strict tenant isolation between symposiums.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-c5f74f)](https://orm.drizzle.team/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-realtime-black?logo=socketdotio)](https://socket.io/)

---

## What this is

BootFete is a full-stack web platform for running technical symposiums (think college tech-fests). One deployment hosts **multiple independent symposiums** — each with its own branding, events, admins, participants, and data — fully isolated from the others.

**End-to-end flow:**

```
📢 Public site → 📝 Registration → 👤 Credentials → 🖥️ Proctored exam
   → 🏆 Live leaderboard → 📜 Certificates → 📊 Reports
```

- **Ultimate admins** provision symposiums (each gets a scoped super-admin + one-time password).
- **Super admins** run their symposium: events, event admins, registration committee, forms, reports.
- **Event admins** own their events: rounds, questions, proctoring rules, live monitoring, evaluation.
- **Registration committee** handles on-spot registrations and credentials.
- **Participants** register publicly, take proctored tests, and download certificates.

---

## ✨ Feature highlights

### 🏟️ Multi-tenancy (the core invariant)
- Every symposium is a tenant: `symposiums` table with slug-based public URLs (`/s/:slug`).
- **NULL-scope invariant** (migration `006`): scoped roles (`super_admin`, `event_admin`, `registration_committee`) *must* belong to a symposium — enforced by a DB `CHECK` constraint, not just app code. `ultimate_admin` is unscoped by role.
- Cross-tenant access returns `403` everywhere: APIs, WebSocket rooms, reports, certificates.
- Event names are unique **per symposium** (`UNIQUE(symposium_id, name)`) — the same name can exist in different symposiums.

### 🖥️ Proctored exam engine
- Round lifecycle: `not_started → in_progress → completed`, admin-controlled.
- Question types: multiple-choice, true/false, image MCQ, coding, descriptive.
- **Proctoring**: fullscreen enforcement, tab-switch/refresh detection, violation logging, configurable strike threshold → auto-disqualification at 3 strikes, with `attempt_disqualification_reset` audit trail.
- Answer auto-save with a save queue, server-authoritative timers, submit-vs-disqualify race handled transactionally.
- Evaluation workflow: event admins evaluate submissions → evaluated leaderboards.

### 📝 Registration system
- Public registration forms with custom slugs, roll-number validation, college/food-preference capture.
- Team (`solo`/`team`) and event-type (`technical`/`non_technical`) support with selection rules.
- On-spot registration by the committee, bulk confirm with compare-and-swap safety.
- Human-readable credential export (CSV/PDF), credential status tracking.

### 🏆 Leaderboards, certificates, reports
- Real-time round + event leaderboards (Socket.IO), evaluated leaderboards post-evaluation.
- Dynamic certificates (PNG/PDF) with per-event branding snapshots, rank reconciliation, strict access gates (unpublished → 403, disqualified → 403, cross-owner → 403).
- Event-wise and symposium-wide reports (JSON/Excel/PDF) with question-wise analysis and violation logs.

### ⚡ Realtime
- Socket.IO with Redis adapter (multi-instance safe), JWT-authenticated, RBAC-filtered rooms (`super_admin`, `event:{id}`, `participant:{id}`, `registration_committee`).
- Live round monitor with polling fallback + freshness indicator when sockets drop.

### 🔒 Security
- JWT auth, bcrypt hashing, forced password change on first login for provisioned accounts.
- Rate limiting (including IPv6-aware keys and per-user exam limiters), `trust proxy` hardening.
- Advisory locks for credential generation, transactional grading/disqualification, audit logs for overrides and disqualifications.

---

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────────────────────────────────────┐
│   Client    │      │                    Server                    │
│ React 18    │◄────►│  Express + TypeScript                        │
│ Vite        │ HTTP │  ┌──────────┐  ┌───────────┐  ┌───────────┐ │
│ Tailwind    │  WS  │  │ REST API │  │ Socket.IO │  │ Services  │ │
│ shadcn/Radix│      │  │ (RBAC +  │  │ (Redis    │  │ email,    │ │
│ TanStack    │      │  │ tenant   │  │  adapter) │  │ reports,  │ │
│ Query v5    │      │  │ scoped)  │  │           │  │ certs,    │ │
│ Wouter      │      │  └──────────┘  └───────────┘  │ branding) │ │
└─────────────┘      └──────────────┬───────────────────────────┘ │
                                    │ Drizzle ORM                 │
                            ┌───────▼────────┐   ┌──────────────┐ │
                            │  PostgreSQL    │   │    Redis     │ │
                            │ (Neon / local) │   │ (queue, WS,  │ │
                            └────────────────┘   │ rate limit)  │ │
                                                 └──────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Code layout:**

| Path | What lives here |
|---|---|
| `client/src/pages` | Route pages per role (`admin/`, `event-admin/`, `participant/`, `registration-committee/`, `ultimate-admin/`, `public/`) |
| `client/src/components` | Shared UI (`AdminSidebar`, `ExamShell`, `StatusBadge`, `ScrollableTable`, `ReportGenerateShell`) |
| `server/routes.ts` | REST API (tenant-scoped, RBAC-enforced) |
| `server/middleware/auth.ts` | `requireAuth`, tenant-scope assertions, cache invalidation |
| `server/services` | `emailService`, `reportingService`, `brandingService`, `queueService`, metrics/monitoring |
| `server/websocket.ts` | Socket.IO server, room topology |
| `server/migrations` | `001`–`007` SQL migrations (see below) |
| `shared/schema.ts` | Drizzle schema — single source of truth |
| `e2e/` | Exam-flow harness (`exam-flow.mjs`) + runbook |

---

## 👥 Roles & capabilities

| | ultimate_admin | super_admin | event_admin | registration_committee | participant |
|---|---|---|---|---|---|
| Provision symposiums | ✅ | — | — | — | — |
| Manage own symposium (events, admins, forms) | — | ✅ | — | — | — |
| Manage assigned events (rounds, questions, monitor) | — | ✅ | ✅ (assigned only) | — | — |
| Registrations / on-spot signup | — | ✅ | — | ✅ | — |
| Take proctored tests | — | — | — | — | ✅ |
| Certificates & reports | — | ✅ | ✅ (own events) | — | ✅ (own) |
| Tenant scope | none (all) | one symposium | assigned events | one symposium | own data |

**Login routing** is deterministic: after auth the client resolves a single routing table (`getPostLoginPath()`) — provisioned accounts land on `/force-password-change` first, then their role dashboard. No login bounce.

---

## 🗄️ Data model (essentials)

```
symposiums ─┬─ users (scoped roles MUST have symposium_id — CHECK 006)
            ├─ events (UNIQUE per symposium) ─┬─ rounds ─┬─ questions
            │                                 │          └─ testAttempts ── answers
            │                                 └─ eventAdmins, registrations, eventRules
            └─ registrationForms, reports, certificates, auditLogs, emailLogs
```

**Migrations** (`server/migrations/`, run in order):

| # | File | What |
|---|---|---|
| 001 | `timestamptz_and_constraints` | timestamptz normalization + integrity constraints |
| 002 | `system_settings` | system settings table |
| 003 | `global_settings` | global settings / branding defaults |
| 004 | `event_branding_snapshot` | per-event branding snapshots (checked before live settings, backfilled at migration) |
| 005 | `symposiums_multitenant` | symposiums table — multi-tenancy foundation |
| 006 | `nullscope_invariant` | scoped-role `symposium_id` CHECK + per-symposium event-name uniqueness |
| 007 | `provisioning` | ultimate-admin provisioning flow support |

Fresh installs: `npm run db:push` (schema) → migrations `001`–`007` in order → `npm run db:seed`.

---

## 🚀 Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or Neon)
- Redis (email queue, realtime, rate limiting)

### 1. Configure

```bash
cp .env.example .env
```

Required variables (see `.env.example` for the full list):

```bash
APP_URL=https://your-domain            # used for links inside emails (no fallback)
SENDER_EMAIL=info@your-domain           # must be on a domain you control (SPF/DKIM)
DATABASE_URL=postgresql://...          # Neon, or use LOCAL_DATABASE_URL for local pg
JWT_SECRET=<strong-random>             # auth signing
SESSION_SECRET=<strong-random>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# SMTP_*/BREVO_* for email delivery
```

> Never commit a filled-in `.env`. The server fails loudly on missing required config instead of silently degrading.

### 2. Install & set up the database

```bash
npm install
npm run db:push          # push Drizzle schema
# run server/migrations/001-007 in order against the DB
npm run db:seed          # creates "BootFete 2K26" symposium + superadmin
```

`db:seed` prints a **one-time random superadmin password** — save it, it's never stored in source. (It wipes existing data first — dev only.)

### 3. Run

```bash
npm run dev      # development (Vite + tsx)
npm run build    # production build (vite + esbuild → dist/)
npm start        # serve production build
```

Open `http://localhost:5000`, log in as `superadmin` with the seeded password, change it when prompted.

### First-time flow
1. **Ultimate admin** provisions a symposium → scoped super-admin created with a one-time password panel.
2. **Super admin** creates events, assigns event admins, sets up registration forms.
3. **Event admin** builds rounds + questions, configures proctoring, starts the round.
4. **Participants** register at `/s/:slug` or `/register`, get credentials, take the test.
5. **Results**: live leaderboard → evaluation → certificates → reports.

---

## 📡 API overview

All `/api/*` routes are JWT-authenticated (unless marked public) and tenant-scoped.

| Group | Examples |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/change-password`, `GET /api/auth/me` |
| Symposiums | `GET /api/symposiums/by-slug/:slug` (public), `POST /api/ultimate-admin/symposiums` |
| Events | `GET/POST /api/events`, `PATCH /api/events/:id`, `GET /api/events/:id/leaderboard` |
| Rounds | `POST /api/events/:eventId/rounds`, `GET /api/rounds/:roundId/statistics`, `.../leaderboard`, `.../monitor` |
| Questions | `POST /api/rounds/:roundId/questions`, bulk upload, `PATCH .../questions/:questionId` |
| Exam | answer save, submit, violations, disqualify (`PATCH /api/participants/:id/disqualify`) |
| Registration | `POST /api/registration-forms/:slug/submit`, `POST /api/registrations/bulk-confirm`, on-spot |
| Participants | `GET /api/participants/my-attempts`, credential + id-pass endpoints |
| Certificates | `GET /api/rounds/:roundId/certificate/:attemptId`, template management |
| Reports | `POST /api/reports/generate/event`, `POST /api/reports/generate/symposium`, `GET /api/reports/:id/download` |
| Admin | audit logs, email logs + retry, cache flush, system settings, branding |

**Realtime events** (Socket.IO, RBAC-filtered rooms): `roundStatus`, `registrationUpdate`, `overrideAction`, `resultPublished`, leaderboard ticks.

---

## 🧪 Testing

```bash
npm run check       # tsc --noEmit
npm run test        # Jest unit tests (tests/unit)
npm run test:e2e    # exam-flow harness (e2e/exam-flow.mjs)
```

The repo also carries Playwright verification harnesses under `e2e/` from prior hardening passes. Verification standard here is **demonstrated, not reasoned**: fixes ship with live browser/DB evidence, and honest gaps are documented, not glossed over.

---

## 📦 Deployment notes

- `npm run build && npm start` — serves API + static client from `dist/`.
- Multi-instance: Socket.IO uses the Redis adapter; `trust proxy` is set for correct client IPs behind nginx.
- PM2 + nginx (`ip_hash` for socket stickiness) is the documented production topology — see `docs/`.
- Email queue, rate limiting, and WS fan-out all go through Redis — it must be reachable in prod.
- Run migrations `001`–`007` in order on deploy; `001` needs base tables to exist (fresh installs use `db:push` first).

---

## 📚 Docs

- `e2e/RUNBOOK.md` — local dev, test users, rate-limiter notes
- `docs/websockets.md` / `docs/websocket-validation-report.md` — realtime topology + validation
- `docs/DATABASE_STRUCTURE.md` — schema reference
- `docs/COLLEGE_SERVER_DEPLOYMENT.md`, `docs/VERCEL_DEPLOYMENT.md` — deployment guides

---

## 🔒 Security model (short version)

- Tenant isolation is enforced at **three layers**: DB constraints (`006`), API middleware (role-first scope checks), and WS room filtering.
- Provisioned accounts must change passwords on first login; `/me` responses are cache-invalidated on write.
- Exam integrity: server-side timers, transactional submit/disqualify, violation strikes with audit trail, no client-trusted scoring.
- Secrets live in env, never in source. One-time deploy tokens are single-use.

---

*Built for running symposiums at scale — registrations to certificates, one platform.*
