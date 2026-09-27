import { lazy, Suspense, Component, type ComponentType, type ReactNode } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, getPostLoginPath } from "@/lib/auth";
import { BrandingProvider } from "@/lib/branding";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import AppHeader from "@/components/Header";
// Track-4: the exam-taking flow and its immediate dependencies stay in the
// initial chunk — a participant must reach a live exam with zero lazy-load
// latency. Everything admin-side is route-split.
import NotFound from "@/pages/not-found";
import UltimateLoginPage from "@/pages/ultimate-login";
import PublicRegistrationFormPage from "@/pages/public/registration-form";
import EventRegistrationPage from "@/pages/public/event-registration";
import ParticipantDashboard from "@/pages/participant/dashboard";
import ParticipantEventsPage from "@/pages/participant/events";
import ParticipantEventDetailsPage from "@/pages/participant/event-details";
import TakeTestPage from "@/pages/participant/take-test";
import TestResultsPage from "@/pages/participant/test-results";
import MyTestsPage from "@/pages/participant/my-tests";
// Route chunks are fetched on navigation. On a flaky network the fetch can
// fail outright (connection reset) or hang (a dead middlebox holding the
// connection open with no bytes). Retry a few times with a per-attempt
// timeout so one bad fetch can't wedge the page on "Loading..." forever or
// blank the app. The timeout race also guards the hang case: a wedged
// connection becomes a rejection, which is then retried on a fresh one.
function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  timeoutMs = 15000,
) {
  const attempt = (remaining: number): Promise<{ default: T }> => {
    const pending = importFn();
    // If the timeout wins the race below, the late rejection must not
    // surface as an unhandled rejection.
    pending.catch(() => {});
    return Promise.race([
      pending,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("route chunk load timed out")), timeoutMs),
      ),
    ]).catch((err) => {
      if (remaining <= 0) throw err;
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          attempt(remaining - 1).then(resolve, reject);
        }, 700);
      });
    });
  };
  return lazy(() => attempt(retries));
}

// If every chunk retry fails, the page can't render. On a flaky tunnel this
// is usually a transient relay drop, not a broken build — so instead of
// parking on a dead error card, the boundary auto-recovers: it shows a
// "Reconnecting…" state and reloads the page with backoff. A fresh page load
// re-runs every chunk import from scratch (no stale React.lazy rejection
// cache), so the page comes up by itself once the tunnel has a good window.
// The attempt count survives reloads via sessionStorage and is capped, so a
// genuinely missing chunk (e.g. a stale cached page) falls back to a manual
// Retry card instead of reloading forever. Keyed by location so navigating
// away resets it.
const CHUNK_MAX_AUTO_RETRIES = 6;
const CHUNK_AUTO_DELAYS = [2000, 4000, 8000, 15000, 30000, 30000];
const CHUNK_RETRY_WINDOW_MS = 10 * 60 * 1000;

function readChunkAttempts(pathname: string): number {
  try {
    const raw = sessionStorage.getItem(`chunk-retry:${pathname}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { attempts: number; firstAt: number };
    if (Date.now() - parsed.firstAt > CHUNK_RETRY_WINDOW_MS) return 0;
    return parsed.attempts;
  } catch {
    return 0;
  }
}

function writeChunkAttempts(pathname: string, attempts: number) {
  try {
    if (attempts <= 0) sessionStorage.removeItem(`chunk-retry:${pathname}`);
    else sessionStorage.setItem(`chunk-retry:${pathname}`, JSON.stringify({ attempts, firstAt: Date.now() }));
  } catch {}
}

class ChunkErrorBoundary extends Component<
  { children: ReactNode; pathname: string },
  { failed: boolean; autoRetrying: boolean }
> {
  state = { failed: false, autoRetrying: false };
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    const attempts = readChunkAttempts(this.props.pathname) + 1;
    writeChunkAttempts(this.props.pathname, attempts);
    if (attempts <= CHUNK_MAX_AUTO_RETRIES) {
      this.setState({ autoRetrying: true });
      const delay = CHUNK_AUTO_DELAYS[Math.min(attempts - 1, CHUNK_AUTO_DELAYS.length - 1)];
      this.reloadTimer = setTimeout(() => window.location.reload(), delay);
    } else {
      // Genuinely stuck (e.g. stale cached page referencing a missing chunk):
      // stop auto-reloading and let the user retry manually with a clean slate.
      writeChunkAttempts(this.props.pathname, 0);
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  private manualRetry = () => {
    writeChunkAttempts(this.props.pathname, 0);
    window.location.reload();
  };

  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            {this.state.autoRetrying ? (
              <>
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="font-semibold text-lg mb-2">Reconnecting…</p>
                <p className="text-sm text-muted-foreground mb-5">
                  The connection dropped while loading this page. Trying again automatically — nothing was lost.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-lg mb-2">This page didn&apos;t finish loading</p>
                <p className="text-sm text-muted-foreground mb-5">
                  The connection dropped while fetching it. Nothing was lost — try again.
                </p>
                <button
                  type="button"
                  onClick={this.manualRetry}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Super-admin surfaces (lazy)
const AdminDashboard = lazyWithRetry(() => import("@/pages/admin/dashboard"));
const EventsPage = lazyWithRetry(() => import("@/pages/admin/events"));
const EventCreatePage = lazyWithRetry(() => import("@/pages/admin/event-create"));
const EventEditPage = lazyWithRetry(() => import("@/pages/admin/event-edit"));
const TestManagerPage = lazyWithRetry(() => import("@/pages/admin/test-manager"));
const AdminEventDetails = lazyWithRetry(() => import("@/pages/admin/event-details"));
const EventAdminsPage = lazyWithRetry(() => import("@/pages/admin/event-admins"));
const EventAdminCreatePage = lazyWithRetry(() => import("@/pages/admin/event-admin-create"));
const EventAdminEditPage = lazyWithRetry(() => import("@/pages/admin/event-admin-edit"));
const ReportsPage = lazyWithRetry(() => import("@/pages/admin/reports"));
const ReportGenerateEventPage = lazyWithRetry(() => import("@/pages/admin/report-generate-event"));
const ReportGenerateSymposiumPage = lazyWithRetry(() => import("@/pages/admin/report-generate-symposium"));
const DownloadReportsPage = lazyWithRetry(() => import("@/pages/reports"));
const RegistrationFormsPage = lazyWithRetry(() => import("@/pages/admin/registration-forms"));
const RegistrationFormCreatePage = lazyWithRetry(() => import("@/pages/admin/registration-form-create"));
const RegistrationFormEditPage = lazyWithRetry(() => import("@/pages/admin/registration-form-edit"));
const AdminRegistrationsPage = lazyWithRetry(() => import("@/pages/admin/registrations"));
const RegistrationCommitteePage = lazyWithRetry(() => import("@/pages/admin/registration-committee"));
const RegistrationCommitteeCreatePage = lazyWithRetry(() => import("@/pages/admin/registration-committee-create"));
const RegistrationCommitteeEditPage = lazyWithRetry(() => import("@/pages/admin/registration-committee-edit"));
const SuperAdminOverridesPage = lazyWithRetry(() => import("@/pages/admin/super-admin-overrides"));
const EmailLogsPage = lazyWithRetry(() => import("@/pages/admin/email-logs"));
const AdminSettingsPage = lazyWithRetry(() => import("@/pages/admin/settings"));
// Ultimate-admin surfaces (lazy) — Phase B branding settings, strict ultimate-only.
const UltimateAdminBrandingPage = lazyWithRetry(() => import("@/pages/ultimate-admin/settings"));
// Phase 2: ultimate-admin landing (symposium provisioning dashboard).
const UltimateAdminDashboardPage = lazyWithRetry(() => import("@/pages/ultimate-admin/dashboard"));
// Phase 2: public per-symposium landing + per-symposium login.
const SymposiumLandingPage = lazyWithRetry(() => import("@/pages/public/symposium-landing"));
const SymposiumLoginPage = lazyWithRetry(() => import("@/pages/public/symposium-login"));
const ForcePasswordChangePage = lazyWithRetry(() => import("@/pages/force-password-change"));
// Event-admin surfaces (lazy)
const EventAdminDashboard = lazyWithRetry(() => import("@/pages/event-admin/dashboard"));
const EventAdminEventsPage = lazyWithRetry(() => import("@/pages/event-admin/events"));
const EventAdminEventDetailsPage = lazyWithRetry(() => import("@/pages/event-admin/event-details"));
const EventRulesPage = lazyWithRetry(() => import("@/pages/event-admin/event-rules"));
const EventRoundsPage = lazyWithRetry(() => import("@/pages/event-admin/event-rounds"));
const RoundCreatePage = lazyWithRetry(() => import("@/pages/event-admin/round-create"));
const RoundEditPage = lazyWithRetry(() => import("@/pages/event-admin/round-edit"));
const RoundQuestionsPage = lazyWithRetry(() => import("@/pages/event-admin/round-questions"));
const RoundRulesPage = lazyWithRetry(() => import("@/pages/event-admin/round-rules"));
const QuestionCreatePage = lazyWithRetry(() => import("@/pages/event-admin/question-create"));
const QuestionEditPage = lazyWithRetry(() => import("@/pages/event-admin/question-edit"));
const QuestionsBulkUploadPage = lazyWithRetry(() => import("@/pages/event-admin/questions-bulk-upload"));
const EventParticipantsPage = lazyWithRetry(() => import("@/pages/event-admin/event-participants"));
const AllParticipantsPage = lazyWithRetry(() => import("@/pages/event-admin/all-participants"));
const RoundMonitorPage = lazyWithRetry(() => import("@/pages/event-admin/round-monitor"));
const EventAdminLeaderboardPage = lazyWithRetry(() => import("@/pages/event-admin/leaderboard"));
const EventResultsPage = lazyWithRetry(() => import("@/pages/event-admin/event-results"));
const RoundSubmissionsPage = lazyWithRetry(() => import("@/pages/event-admin/round-submissions"));
const EvaluateSubmissionPage = lazyWithRetry(() => import("@/pages/event-admin/evaluate-submission"));
const EvaluatedLeaderboardPage = lazyWithRetry(() => import("@/pages/event-admin/evaluated-leaderboard"));
// Registration-committee surfaces (lazy)
const RegistrationCommitteeDashboard = lazyWithRetry(() => import("@/pages/registration-committee/dashboard"));
const RegistrationCommitteeRegistrationsPage = lazyWithRetry(() => import("@/pages/registration-committee/registrations"));
const OnSpotRegistrationPage = lazyWithRetry(() => import("@/pages/registration-committee/on-spot-registration"));

function ProtectedRoute({
  component: Component,
  allowedRoles
}: {
  component: ComponentType;
  allowedRoles?: string[]
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role) &&
      !(user.role === 'ultimate_admin' && allowedRoles.includes('super_admin'))) {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [pathname] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <ChunkErrorBoundary key={pathname} pathname={pathname}>
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">Loading...</div>
        </div>
      }
    >
      {/* Trailing slashes are not distinct routes: normalize them so
          "/admin/dashboard/" lands on "/admin/dashboard" instead of the
          404 page. The query string is preserved. */}
      {pathname.length > 1 && pathname.endsWith('/') ? (
        <Redirect to={pathname.slice(0, -1) + window.location.search} />
      ) : (
      <Switch>
      {/* The bare /login is gone: the platform login lives at "/". */}
      <Route path="/login">
        <Redirect to="/" />
      </Route>

      {/* Phase 2: forced password change for provisioned staff accounts. */}
      <Route path="/force-password-change">
        {user ? <ForcePasswordChangePage /> : <Redirect to="/" />}
      </Route>

      {/* Phase 2: ultimate-admin landing — symposium provisioning dashboard. */}
      <Route path="/ultimate-admin">
        <ProtectedRoute component={UltimateAdminDashboardPage} allowedRoles={['ultimate_admin']} />
      </Route>

      {/* Phase 2: public per-symposium landing page, keyed by locked slug. */}
      {/* The symposium's own login lives at /s/:slug/login (before the
          parameterized landing route). */}
      <Route path="/s/:slug/login" component={SymposiumLoginPage} />
      <Route path="/s/:slug" component={SymposiumLandingPage} />

      <Route path="/">
        {user ? (
          // Single-sourced post-auth routing: ultimate_admin -> /ultimate-admin,
          // mustChangePassword -> /force-password-change (never bypassed).
          <Redirect to={getPostLoginPath(user)} />
        ) : (
          // Bare "/" is the platform (ultimate-admin) login — generic
          // BootFete chrome, no symposium or college identity.
          <UltimateLoginPage />
        )}
      </Route>

      <Route path="/register/:slug" component={PublicRegistrationFormPage} />
      <Route path="/register/event/:eventId" component={EventRegistrationPage} />
      <Route path="/admin/tests">
        <ProtectedRoute component={TestManagerPage} allowedRoles={['super_admin']} />
      </Route>

      <Route path="/admin/dashboard">
        <ProtectedRoute component={AdminDashboard} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/events">
        <ProtectedRoute component={EventsPage} allowedRoles={['super_admin']} />
      </Route>
      {/* IMPORTANT: Specific routes must come BEFORE parameterized routes */}
      <Route path="/admin/events/new">
        <ProtectedRoute component={EventCreatePage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/events/:id/edit">
        <ProtectedRoute component={EventEditPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/events/:id">
        <ProtectedRoute component={AdminEventDetails} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/event-admins">
        <ProtectedRoute component={EventAdminsPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/event-admins/create">
        <ProtectedRoute component={EventAdminCreatePage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/event-admins/:id/edit">
        <ProtectedRoute component={EventAdminEditPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/reports">
        <ProtectedRoute component={ReportsPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/reports/generate/event">
        <ProtectedRoute component={ReportGenerateEventPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/reports/generate/symposium">
        <ProtectedRoute component={ReportGenerateSymposiumPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-forms">
        <ProtectedRoute component={RegistrationFormsPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-forms/create">
        <ProtectedRoute component={RegistrationFormCreatePage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-forms/:id/edit">
        <ProtectedRoute component={RegistrationFormEditPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registrations">
        <ProtectedRoute component={AdminRegistrationsPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-committee">
        <ProtectedRoute component={RegistrationCommitteePage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-committee/create">
        <ProtectedRoute component={RegistrationCommitteeCreatePage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/registration-committee/:id/edit">
        <ProtectedRoute component={RegistrationCommitteeEditPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/super-admin-overrides">
        <ProtectedRoute component={SuperAdminOverridesPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/email-logs">
        <ProtectedRoute component={EmailLogsPage} allowedRoles={['super_admin']} />
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute component={AdminSettingsPage} allowedRoles={['super_admin']} />
      </Route>
      {/* Phase B: strict ultimate_admin only — inheritance does NOT grant
          super_admin access here (allowedRoles has no 'super_admin'). */}
      <Route path="/ultimate-admin/settings">
        <ProtectedRoute component={UltimateAdminBrandingPage} allowedRoles={['ultimate_admin']} />
      </Route>

      <Route path="/registration-committee/dashboard">
        <ProtectedRoute component={RegistrationCommitteeDashboard} allowedRoles={['registration_committee']} />
      </Route>
      <Route path="/registration-committee/registrations">
        <ProtectedRoute component={RegistrationCommitteeRegistrationsPage} allowedRoles={['registration_committee']} />
      </Route>
      <Route path="/registration-committee/on-spot-registration">
        <ProtectedRoute component={OnSpotRegistrationPage} allowedRoles={['registration_committee']} />
      </Route>

      <Route path="/event-admin/dashboard">
        <ProtectedRoute component={EventAdminDashboard} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events">
        <ProtectedRoute component={EventAdminEventsPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/rules">
        <ProtectedRoute component={EventRulesPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/rounds/new">
        <ProtectedRoute component={RoundCreatePage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/rounds/:roundId/edit">
        <ProtectedRoute component={RoundEditPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/rounds">
        <ProtectedRoute component={EventRoundsPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/questions/new">
        <ProtectedRoute component={QuestionCreatePage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/questions/bulk-upload">
        <ProtectedRoute component={QuestionsBulkUploadPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/questions/:questionId/edit">
        <ProtectedRoute component={QuestionEditPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/questions">
        <ProtectedRoute component={RoundQuestionsPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/rules">
        <ProtectedRoute component={RoundRulesPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/monitor">
        <ProtectedRoute component={RoundMonitorPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/participants">
        <ProtectedRoute component={EventParticipantsPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId">
        <ProtectedRoute component={EventAdminEventDetailsPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/participants">
        <ProtectedRoute component={AllParticipantsPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/leaderboard">
        <ProtectedRoute component={EventAdminLeaderboardPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/leaderboard">
        <ProtectedRoute component={EventAdminLeaderboardPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/results">
        <ProtectedRoute component={EventResultsPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/submissions">
        <ProtectedRoute component={RoundSubmissionsPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/attempts/:attemptId/evaluate">
        <ProtectedRoute component={EvaluateSubmissionPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>
      <Route path="/event-admin/rounds/:roundId/evaluated-leaderboard">
        <ProtectedRoute component={EvaluatedLeaderboardPage} allowedRoles={['event_admin', 'super_admin']} />
      </Route>

      <Route path="/reports">
        <ProtectedRoute component={DownloadReportsPage} allowedRoles={['super_admin', 'event_admin']} />
      </Route>

      <Route path="/participant/dashboard">
        <ProtectedRoute component={ParticipantDashboard} allowedRoles={['participant']} />
      </Route>
      <Route path="/participant/rounds/:roundId/test">
        <Redirect to="/participant/dashboard" />
      </Route>
      <Route path="/participant/events/:eventId">
        <ProtectedRoute component={ParticipantEventDetailsPage} allowedRoles={['participant']} />
      </Route>
      <Route path="/participant/events">
        <ProtectedRoute component={ParticipantEventsPage} allowedRoles={['participant']} />
      </Route>
      <Route path="/participant/test/:attemptId">
        <ProtectedRoute component={TakeTestPage} allowedRoles={['participant']} />
      </Route>
      <Route path="/participant/results/:attemptId">
        <ProtectedRoute component={TestResultsPage} allowedRoles={['participant']} />
      </Route>
      <Route path="/participant/my-tests">
        <ProtectedRoute component={MyTestsPage} allowedRoles={['participant']} />
      </Route>


      <Route component={NotFound} />
      </Switch>
      )}
    </Suspense>
    </ChunkErrorBoundary>
  );
}

function App() {
  const [location] = useLocation();
  // Phase 1 prep for exam isolation (Phase 3): the global identity bar is
  // hidden on the active exam route. Exam component internals untouched.
  // Login surfaces also hide it: the platform login ("/") must show no
  // tenant identity at all, and a symposium login shows only its own brand
  // inside the card — never the default symposium's brand from the header.
  const isSymposiumLogin = /^\/s\/[^/]+\/login\/?$/.test(location);
  const hideChrome =
    location.startsWith('/participant/test/') ||
    location === '/' ||
    location === '/login' ||
    isSymposiumLogin;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <BrandingProvider>
        <WebSocketProvider>
          <TooltipProvider>
            <div className="min-h-screen flex flex-col">
              {!hideChrome && <AppHeader />}
              <div className="flex-1 flex flex-col">
                <Toaster />
                <Router />
              </div>
            </div>
          </TooltipProvider>
        </WebSocketProvider>
      </BrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
