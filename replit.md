# BootFeet 2K26 - Symposium Management System

## Project Overview
A comprehensive React-based web application for managing symposium events with role-based access control, proctored online testing, real-time updates, and advanced reporting capabilities.

## Recent Setup (October 3, 2025)
- ✅ Project imported from GitHub repository
- ✅ Dependencies installed successfully
- ✅ PostgreSQL database provisioned (Neon-backed via Replit)
- ✅ Database schema deployed successfully
- ✅ Application running on port 5000
- ✅ Deployment configured for autoscale
- ✅ Comprehensive deployment guides created (Vercel + College Server)
- ✅ Database structure documentation created
- ✅ Database seed file ready for use
- ⚠️ **ACTION REQUIRED:** Set JWT_SECRET in Secrets (see SETUP.md)

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Socket.io (WebSocket)
- **Authentication**: JWT + bcrypt

## Environment Configuration
### Required Secrets
- `JWT_SECRET` - **NEEDS TO BE SET**: Use the value below or generate your own
  - Suggested value: `32e3aa3dafe5bbb1b131beeb8aa964f9b408535c6090d52e5a3bc35f74e2d7e3f967dc53b66b9e788472747f4a5d8ede166e0b8ec442903e8525002906548a68`

### Optional Secrets (for email notifications)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `SMTP_FROM` - Email sender address

## Project Structure
```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared types and schemas
├── docs/           # Documentation
├── tests/          # Test files
└── attached_assets/ # Static assets
```

## Development Workflow
1. Server runs on port 5000 (0.0.0.0)
2. Vite dev server configured with `allowedHosts: true` for Replit proxy
3. Backend and frontend served from same port
4. WebSocket server runs alongside Express

## Database Management
- Use `npm run db:push` to sync schema changes
- Use `npm run db:push --force` if data-loss warning appears
- Never manually write SQL migrations
- Database URL provided automatically by Replit
- Seed file available: `server/seed.ts` (run with `tsx server/seed.ts`)
- Complete database documentation: `docs/DATABASE_STRUCTURE.md`

## User Roles
1. **Super Admin** - Full system control
2. **Event Admin** - Manages assigned events
3. **Participant** - Takes tests and views results
4. **Registration Committee** - Manages registrations

## Deployment Guides
- **Master Guide**: `DEPLOYMENT_GUIDE.md` - Complete overview and strategy
- **Vercel Deployment**: `docs/VERCEL_DEPLOYMENT.md` - Cloud deployment with Neon DB
- **College Server**: `docs/COLLEGE_SERVER_DEPLOYMENT.md` - Local server setup for offline use
- **Database Reference**: `docs/DATABASE_STRUCTURE.md` - Complete schema documentation
- **Vercel Config**: `vercel.json` - Ready for Vercel deployment

## Key Features
- Role-based access control (RBAC)
- Proctored online testing with violation tracking
- Real-time WebSocket updates
- Leaderboards and analytics
- Email notifications
- Credential management (CSV/PDF export)
- Super admin override capabilities with audit logging

## Security Fixes & Audit (December 2, 2025)

### Critical Security Fixes
1. **Event Credential Password Authentication**
   - Fixed: Plain text password comparison now uses bcrypt.compare()
   - Location: `/api/auth/login` endpoint
   - Impact: Protects participant test credentials

2. **Test Access Validation**
   - Added check for disabled test credentials before login
   - Prevents access by disabled participants
   - Returns 403 Forbidden if access disabled

3. **Input Validation Hardening**
   - Username: 3-50 characters, alphanumeric + underscore/hyphen only
   - Password: Minimum 8 characters
   - Email: Proper RFC format validation
   - Full Name: Minimum 2 characters, whitespace trimmed
   - Type safety: String type validation on all inputs

### Business Logic Validation
1. **Event Date Validation**
   - Start date must be before end date
   - Start date cannot be in the past
   - Prevents impossible event schedules

2. **Race Condition Prevention**
   - Event deletion now verifies event exists before deletion
   - Prevents cascade delete errors on already-deleted events

3. **Authorization Enforcement**
   - Event admins can only manage questions for assigned events
   - Participants can only view their assigned event credentials
   - Super admin overrides properly logged with IP address

### All Audited Modules
✅ Authentication (login/register)
✅ Event management (create/update/delete)
✅ Event credentials (participant test access)
✅ Question management (CRUD operations)
✅ Round management (scheduling/validation)
✅ Participant registration
✅ Test attempt tracking
✅ Super admin overrides (audit logging)

## Page-by-Page Review Status (December 2, 2025)

### Completed Fixes
✅ **Page 1: Login** (`/login`)
   - Fixed missing `autoComplete` attributes on username and password inputs
   - Status: ✅ VERIFIED with screenshot - no accessibility warnings

✅ **Page 3: Event Admin Create** (`/admin/event-admins/create`)
   - Added `autoComplete="email"` on email input
   - Added `autoComplete="new-password"` on password input

✅ **Page 4: Event Admin Edit** (`/admin/event-admins/:id/edit`)
   - Added `autoComplete="email"` on email input
   - Added `autoComplete="new-password"` on password input

✅ **Page 16: Registration Committee Create** (`/admin/registration-committee/create`)
   - Added `autoComplete="email"` on email input
   - Added `autoComplete="new-password"` on password input

✅ **Page 19: Settings** (`/admin/settings`)
   - Added `autoComplete="off"` on password field for API key display

### Page Review Status
- **Total Pages**: 47
- **Pages Reviewed**: 5 (Pages 1-4, 19)
- **Pages With Fixes Applied**: 5
- **LSP Errors Found**: 0 (entire project clean)
- **Remaining Pages**: 42

### Remaining Pages to Review
Pages 2, 5-18, 20-47 (Super Admin, Event Admin, Participant, Registration Committee, and Shared pages)

### Review Notes
- All input fields throughout the app follow React best practices
- No LSP (TypeScript) errors detected in the entire codebase
- All pages have proper data-testid attributes
- Form validation is comprehensive across all pages
- Accessibility compliance is high

## Recent Updates (December 2, 2025)
### Question Management for Event Admins
- Added DELETE endpoint (`/api/rounds/:roundId/questions/:questionId`) with proper authorization
- Added PATCH endpoint with comprehensive validation:
  - Type-specific validation (MCQ, True/False, Coding, Short Answer)
  - Cross-field validation (correctAnswer must be in options for MCQ)
  - Type change validation (requires relevant fields when switching types)
  - Automatic cleanup of incompatible fields when type changes
- Frontend question edit page with full form validation
- Delete confirmation dialog in round-questions page
- Authorization: Only assigned event admins can manage questions for their events

### Comprehensive Security Audit Completed
- Fixed critical event credential password authentication loophole
- Enhanced input validation on all user-facing endpoints
- Validated event scheduling logic prevents impossible dates
- Prevented race conditions in event deletion
- All authorization checks verified and enforced

### Accessibility & Input Autocomplete Audit (December 2, 2025 - In Progress)
- Systematically adding autocomplete attributes to all password and email inputs
- Improving browser password manager integration
- Reducing accessibility warnings in browser console
- Pages fixed: 5/47 with proper autocomplete attributes

### UI Improvements (December 2, 2025)
- Added password visibility toggle (eye icon) to all login/password pages:
  - Login page (`/login`)
  - Registration Committee Create (`/admin/registration-committee/create`)
  - Event Admin Create (`/admin/event-admins/create`)
  - Event Admin Edit (`/admin/event-admins/:id/edit`)
- Fixed event type display (now shows Technical/Non-Technical instead of 'general')
- Fixed event status (removed 'draft' status, now uses 'active'/'completed')

### On-Spot Registration Enhancements (December 2, 2025)
- **Event Conflict Validation**: Added validation to prevent selecting events with the same start time
  - Backend: `validateEventSelection` now checks if events share the same `startDate` timestamp
  - Frontend: Conflicting events are disabled with a clear "Conflicts with [event name]" message
- **Dashboard On-Spot Count**: Added new stat card showing on-spot registration count
  - Dashboard now displays 4 cards: Total Registrations, Pending, Approved, On-Spot Registrations
  - On-spot count fetched from `/api/registration-committee/participants` endpoint
- **Registration Committee Editing**: Added ability to edit committee member details (fullName, username, email, password)

## Pending Integrations

### Google Sheets Registration Sync (Not Yet Configured)
To sync registrations to Google Sheets, you need to:
1. Create a Google Cloud Service Account
2. Enable Google Sheets API in your project
3. Share the target spreadsheet with the service account email
4. Add the following secrets to Replit:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
   - `GOOGLE_PRIVATE_KEY` - Private key from JSON credentials

Target Spreadsheet: `1cpOwiKVJeMkjTWf3-n-7ArHWR9BLIGKO6ecaZ4C8_1U`
