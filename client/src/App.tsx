import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import AppHeader from "@/components/Header";
// Track-4: the exam-taking flow and its immediate dependencies stay in the
// initial chunk — a participant must reach a live exam with zero lazy-load
// latency. Everything admin-side is route-split.
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import LandingPage from "@/pages/public/landing";
import ParticipantRegisterPage from "@/pages/public/register";
import PublicRegistrationFormPage from "@/pages/public/registration-form";
import EventRegistrationPage from "@/pages/public/event-registration";
import ParticipantDashboard from "@/pages/participant/dashboard";
import ParticipantEventsPage from "@/pages/participant/events";
import ParticipantEventDetailsPage from "@/pages/participant/event-details";
import TakeTestPage from "@/pages/participant/take-test";
import TestResultsPage from "@/pages/participant/test-results";
import MyTestsPage from "@/pages/participant/my-tests";
// Super-admin surfaces (lazy)
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const EventsPage = lazy(() => import("@/pages/admin/events"));
const EventCreatePage = lazy(() => import("@/pages/admin/event-create"));
const EventEditPage = lazy(() => import("@/pages/admin/event-edit"));
const TestManagerPage = lazy(() => import("@/pages/admin/test-manager"));
const AdminEventDetails = lazy(() => import("@/pages/admin/event-details"));
const EventAdminsPage = lazy(() => import("@/pages/admin/event-admins"));
const EventAdminCreatePage = lazy(() => import("@/pages/admin/event-admin-create"));
const EventAdminEditPage = lazy(() => import("@/pages/admin/event-admin-edit"));
const ReportsPage = lazy(() => import("@/pages/admin/reports"));
const ReportGenerateEventPage = lazy(() => import("@/pages/admin/report-generate-event"));
const ReportGenerateSymposiumPage = lazy(() => import("@/pages/admin/report-generate-symposium"));
const DownloadReportsPage = lazy(() => import("@/pages/reports"));
const RegistrationFormsPage = lazy(() => import("@/pages/admin/registration-forms"));
const RegistrationFormCreatePage = lazy(() => import("@/pages/admin/registration-form-create"));
const RegistrationFormEditPage = lazy(() => import("@/pages/admin/registration-form-edit"));
const AdminRegistrationsPage = lazy(() => import("@/pages/admin/registrations"));
const RegistrationCommitteePage = lazy(() => import("@/pages/admin/registration-committee"));
const RegistrationCommitteeCreatePage = lazy(() => import("@/pages/admin/registration-committee-create"));
const RegistrationCommitteeEditPage = lazy(() => import("@/pages/admin/registration-committee-edit"));
const SuperAdminOverridesPage = lazy(() => import("@/pages/admin/super-admin-overrides"));
const EmailLogsPage = lazy(() => import("@/pages/admin/email-logs"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
// Event-admin surfaces (lazy)
const EventAdminDashboard = lazy(() => import("@/pages/event-admin/dashboard"));
const EventAdminEventsPage = lazy(() => import("@/pages/event-admin/events"));
const EventAdminEventDetailsPage = lazy(() => import("@/pages/event-admin/event-details"));
const EventRulesPage = lazy(() => import("@/pages/event-admin/event-rules"));
const EventRoundsPage = lazy(() => import("@/pages/event-admin/event-rounds"));
const RoundCreatePage = lazy(() => import("@/pages/event-admin/round-create"));
const RoundEditPage = lazy(() => import("@/pages/event-admin/round-edit"));
const RoundQuestionsPage = lazy(() => import("@/pages/event-admin/round-questions"));
const RoundRulesPage = lazy(() => import("@/pages/event-admin/round-rules"));
const QuestionCreatePage = lazy(() => import("@/pages/event-admin/question-create"));
const QuestionEditPage = lazy(() => import("@/pages/event-admin/question-edit"));
const QuestionsBulkUploadPage = lazy(() => import("@/pages/event-admin/questions-bulk-upload"));
const EventParticipantsPage = lazy(() => import("@/pages/event-admin/event-participants"));
const AllParticipantsPage = lazy(() => import("@/pages/event-admin/all-participants"));
const RoundMonitorPage = lazy(() => import("@/pages/event-admin/round-monitor"));
const EventAdminLeaderboardPage = lazy(() => import("@/pages/event-admin/leaderboard"));
const EventResultsPage = lazy(() => import("@/pages/event-admin/event-results"));
const RoundSubmissionsPage = lazy(() => import("@/pages/event-admin/round-submissions"));
const EvaluateSubmissionPage = lazy(() => import("@/pages/event-admin/evaluate-submission"));
const EvaluatedLeaderboardPage = lazy(() => import("@/pages/event-admin/evaluated-leaderboard"));
// Registration-committee surfaces (lazy)
const RegistrationCommitteeDashboard = lazy(() => import("@/pages/registration-committee/dashboard"));
const RegistrationCommitteeRegistrationsPage = lazy(() => import("@/pages/registration-committee/registrations"));
const OnSpotRegistrationPage = lazy(() => import("@/pages/registration-committee/on-spot-registration"));

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
    return <Redirect to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">Loading...</div>
        </div>
      }
    >
      <Switch>
      <Route path="/login" component={Login} />

      <Route path="/">
        {user ? (
          user.role === 'super_admin' ? <Redirect to="/admin/dashboard" /> :
            user.role === 'event_admin' ? <Redirect to="/event-admin/dashboard" /> :
              user.role === 'registration_committee' ? <Redirect to="/registration-committee/dashboard" /> :
                <Redirect to="/participant/dashboard" />
        ) : (
          <LandingPage />
        )}
      </Route>

      <Route path="/register" component={ParticipantRegisterPage} />
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
        <ProtectedRoute component={EventAdminLeaderboardPage} allowedRoles={['event_admin']} />
      </Route>
      <Route path="/event-admin/events/:eventId/leaderboard">
        <ProtectedRoute component={EventAdminLeaderboardPage} allowedRoles={['event_admin']} />
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
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();
  // Phase 1 prep for exam isolation (Phase 3): the global identity bar is
  // hidden on the active exam route. Exam component internals untouched.
  const hideChrome = location.startsWith('/participant/test/');

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
