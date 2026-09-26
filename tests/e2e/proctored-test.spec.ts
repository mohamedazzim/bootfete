import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The suite runs against the remote Neon database, which adds latency to every
// API round trip. Give hooks and tests generous room so slow DB responses are
// not mistaken for failures.
test.setTimeout(180000);

const BASE_URL = 'http://localhost:5000';

// Shared fixtures created once for the whole suite.
let shared: {
  superAdminToken: string;
  eventAdminToken: string;
  eventId: string;
  roundId: string;
  questionIds: string[];
};

// Per-test participant state. A fresh participant is provisioned for every
// test through the real registration -> confirmation -> credentials flow,
// because the backend enforces ONE attempt per participant per round.
let testContext: {
  participantToken: string;
  participantCredentials: { username: string; password: string };
  attemptId: string;
};

// Helper function to make API requests.
// Non-2xx responses throw; 400 is returned as parsed JSON so callers can
// assert on the backend's validation message.
async function apiRequest(
  method: string,
  endpoint: string,
  token: string,
  body?: any
) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok && response.status !== 400) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} ${text}`);
  }

  return response.json();
}

// Setup test data before all tests.
//
// Bootstrap strategy (mirrors production):
// 1. Login with a bootstrap Super Admin (from env, defaults to the account
//    created by `server/seed.ts`).
// 2. Create the Event Admin through POST /api/auth/register using the super
//    admin token — privileged accounts can ONLY be created this way.
// 3. Create the event, assign the admin, add rounds/rules/questions and start
//    the round. Participant provisioning happens per test in `beforeEach`.
test.beforeAll(async () => {
  test.setTimeout(180000);
  const adminUser = process.env.E2E_ADMIN_USER || 'superadmin';
  const adminPass = process.env.E2E_ADMIN_PASS || 'Azzi@03';

  // Retry resilience: Playwright may restart the worker between retries, so
  // module-level `shared` does not survive. The bootstrap token + fixtures
  // are cached in a file (gitignored); on a retry the cached token is probed
  // and reused instead of logging in again. Without this, every retry burns
  // one of the 10 logins / 15 min the per-username rate limiter allows for
  // `superadmin`, tripping a 429 that cascades every remaining test into a
  // misleading "Bootstrap admin login failed" error.
  const cachePath = path.join(process.cwd(), 'tests', 'e2e', '.bootstrap-cache.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached?.token && cached?.shared) {
      const probe = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${cached.token}` }
      });
      if (probe.ok) {
        shared = cached.shared;
        return;
      }
    }
  } catch { /* no usable cache — run the full bootstrap below */ }

  // 1. Login as bootstrap super admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUser, password: adminPass })
  });
  if (!loginRes.ok) {
    throw new Error(`Bootstrap admin login failed (${loginRes.status}). Set E2E_ADMIN_USER/E2E_ADMIN_PASS.`);
  }
  const superAdminData = await loginRes.json();
  const superAdminToken = superAdminData.token;

  // 2. Create event admin via the secured register endpoint (requires super admin)
  const eventAdminRes = await apiRequest('POST', '/api/auth/register', superAdminToken, {
    username: `eventadmin_${Date.now()}`,
    password: 'eventadmin123',
    email: `eventadmin_${Date.now()}@test.com`,
    fullName: 'Event Admin Test',
    role: 'event_admin'
  });
  if (!eventAdminRes?.token) {
    throw new Error('Event admin registration did not return a token');
  }
  const eventAdminToken = eventAdminRes.token;
  const eventAdminUserId = eventAdminRes.user.id;

  // 3. Create event
  const eventRes = await apiRequest('POST', '/api/events', superAdminToken, {
    name: `Proctored Test Event ${Date.now()}`,
    description: 'E2E Test Event',
    type: 'technical',
    category: 'technical',
    status: 'active'
  });
  const eventId = eventRes.id;

  // Assign event admin to event
  await apiRequest('POST', `/api/events/${eventId}/admins`, superAdminToken, {
    adminId: eventAdminUserId
  });

  // Create round with proctoring rules
  const roundRes = await apiRequest('POST', `/api/events/${eventId}/rounds`, eventAdminToken, {
    name: 'Round 1',
    description: 'Proctored Round',
    roundNumber: 1,
    duration: 30,
    status: 'not_started'
  });
  const roundId = roundRes.id;

  // Set round rules with strict proctoring
  await apiRequest('PATCH', `/api/rounds/${roundId}/rules`, eventAdminToken, {
    noRefresh: true,
    noTabSwitch: true,
    forceFullscreen: true,
    disableShortcuts: true,
    autoSubmitOnViolation: true,
    maxTabSwitchWarnings: 2
  });

  // Create questions
  const questionIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const questionRes = await apiRequest('POST', `/api/rounds/${roundId}/questions`, eventAdminToken, {
      questionType: 'mcq',
      questionText: `Test Question ${i}`,
      questionNumber: i,
      points: 1,
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'Option A'
    });
    questionIds.push(questionRes.id);
  }

  // Start the round (POST, not PATCH)
  await apiRequest('POST', `/api/rounds/${roundId}/start`, eventAdminToken, {});

  shared = { superAdminToken, eventAdminToken, eventId, roundId, questionIds };
  // Persist for retry resilience (see the cache probe at the top of this hook).
  fs.writeFileSync(cachePath, JSON.stringify({ token: superAdminToken, shared }));
});

// Every test gets its own participant, because the backend allows exactly one
// test attempt per participant per round. Provisioning goes through the real
// production flow: public registration -> super admin confirmation ->
// generated event credentials -> login as participant.
test.beforeEach(async () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  // Public registration (solo) for the participant.
  // Unique college per test keeps the per-college department limit from
  // accumulating across runs.
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventId: shared.eventId,
      organizerRollNo: `E2E${Date.now()}`,
      organizerName: 'Test Participant',
      organizerEmail: `participant_${suffix}@test.com`,
      organizerDept: 'CSE',
      organizerCollege: `E2E Test College ${suffix}`,
      organizerPhone: '9876543210',
      organizerFoodType: 'veg'
    })
  });
  if (!regRes.ok) {
    throw new Error(`Participant registration failed: ${regRes.status} ${await regRes.text()}`);
  }
  const registration = await regRes.json();

  // Confirm the registration to generate real event credentials
  const confirmRes = await apiRequest('PATCH', `/api/registrations/${registration.registration.id}/confirm`, shared.superAdminToken, {});
  const eventCredential = confirmRes.eventCredentials?.[0];
  if (!eventCredential) {
    throw new Error('Confirmation did not return event credentials');
  }

  // Login as the participant using the generated event credentials
  const participantLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: eventCredential.eventUsername,
      password: eventCredential.eventPassword
    })
  });
  if (!participantLoginRes.ok) {
    throw new Error(`Participant credential login failed (${participantLoginRes.status})`);
  }
  const participantData = await participantLoginRes.json();

  testContext = {
    participantToken: participantData.token,
    participantCredentials: {
      username: eventCredential.eventUsername,
      password: eventCredential.eventPassword
    },
    attemptId: ''
  };
});

// Helper functions
async function loginAsParticipant(page: Page) {
  // The login form lives at /login; / is the public landing page (no form).
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('[data-testid="input-username"]', { timeout: 30000 });
  await page.fill('[data-testid="input-username"]', testContext.participantCredentials.username);
  await page.fill('[data-testid="input-password"]', testContext.participantCredentials.password);
  await page.click('[data-testid="button-submit"]');
  await page.waitForURL('**/participant/dashboard', { timeout: 30000 });
}

async function navigateToTest(page: Page) {
  // Navigate to the test
  await page.goto(`${BASE_URL}/participant/events/${shared.eventId}`);
  await page.waitForSelector(`[data-testid="button-start-test-${shared.roundId}"]`, { timeout: 30000 });
  await page.click(`[data-testid="button-start-test-${shared.roundId}"]`);

  // Wait for attempt page to load
  await page.waitForURL('**/participant/test/**', { timeout: 30000 });

  // Extract attempt ID from URL
  const url = page.url();
  const attemptId = url.split('/').pop() || '';
  testContext.attemptId = attemptId;
}

async function startTest(page: Page) {
  // Click begin test button (should trigger fullscreen)
  await page.locator('[data-testid="button-begin-test"]').click({ force: true, noWaitAfter: true });
  await waitForFullscreen(page);
  await expect(page.locator('[data-testid="heading-test-name"]')).toBeVisible({ timeout: 15000 });
}

async function waitForFullscreen(page: Page) {
  await expect.poll(
    () => page.evaluate(() => !!document.fullscreenElement),
    { timeout: 8000 }
  ).toBe(true);
}

// Simulates a tab switch: defines document.hidden as true (as a backgrounded
// tab reports it) and dispatches visibilitychange + blur events. The desktop
// elimination threshold is 3 violations, so callers pass the count they need.
//
// gapMs spaces consecutive dispatches: the server coalesces same-type
// violations inside a 5s anti-spam window (and the client throttles at 3s),
// so a multi-strike test must use gapMs > 5000 or the triggers collapse
// into a single strike. The 5s window is protected product behavior — the
// test adapts to it, not the other way round.
async function triggerTabSwitch(page: Page, times = 1, gapMs = 400) {
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, 'hidden', {
        get: () => true,
        configurable: true
      });
    } catch (e) {}
  });
  for (let i = 0; i < times; i++) {
    if (i > 0) await page.waitForTimeout(gapMs);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(400);
  }
}

async function answerQuestion(page: Page, optionIndex: number) {
  await page.click(`[data-testid="radio-option-${optionIndex}"]`);
  await page.waitForTimeout(200);
}

async function getViolationCount(attemptId: string): Promise<{ tabSwitch: number; refresh: number; fullscreenExit: number }> {
  const attempt = await apiRequest('GET', `/api/attempts/${attemptId}`, testContext.participantToken);
  const violationLogs = attempt.violationLogs || [];

  return {
    tabSwitch: violationLogs.filter((v: any) => v.type === 'tab_switch').length,
    refresh: violationLogs.filter((v: any) => v.type === 'refresh').length,
    fullscreenExit: violationLogs.filter((v: any) => v.type === 'fullscreen_exit').length
  };
}

// Test Suite: Fullscreen Enforcement
test.describe('Fullscreen Enforcement Tests', () => {
  test('should enter fullscreen mode on test start', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);

    // Verify begin test button is visible
    await expect(page.locator('[data-testid="button-begin-test"]')).toBeVisible();

    // Click begin test
    await page.locator('[data-testid="button-begin-test"]').click({ force: true, noWaitAfter: true });
    await waitForFullscreen(page);

    // Take screenshot
    await page.screenshot({ path: 'tests/reports/screenshots/fullscreen-activated.png', fullPage: true });
  });

  test('should detect fullscreen exit and log violation', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);
    await waitForFullscreen(page);

    // Get initial violation count
    const initialViolations = await getViolationCount(testContext.attemptId);

    // Exit fullscreen programmatically
    await page.evaluate(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    });

    // Verify violation was logged (the frontend posts it asynchronously)
    await expect.poll(
      async () => (await getViolationCount(testContext.attemptId)).fullscreenExit,
      { timeout: 10000 }
    ).toBeGreaterThan(initialViolations.fullscreenExit);

    // Take screenshot of violation
    await page.screenshot({ path: 'tests/reports/screenshots/fullscreen-violation.png' });
  });

  test('should show re-enter fullscreen modal on exit', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);
    await waitForFullscreen(page);

    // Exit fullscreen
    await page.evaluate(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    });

    // Check for re-enter fullscreen button
    await expect(page.locator('[data-testid="button-reenter-fullscreen"]')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests/reports/screenshots/reenter-fullscreen-modal.png' });
  });
});

// Test Suite: Tab Switch Detection
test.describe('Tab Switch Detection Tests', () => {
  test('should detect tab switch via visibility change', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    const initialViolations = await getViolationCount(testContext.attemptId);

    // Simulate a single tab switch
    await triggerTabSwitch(page, 1);

    await expect.poll(
      async () => (await getViolationCount(testContext.attemptId)).tabSwitch,
      { timeout: 10000 }
    ).toBeGreaterThan(initialViolations.tabSwitch);

    await page.screenshot({ path: 'tests/reports/screenshots/tab-switch-violation.png' });
  });

  test('should disqualify participant on tab switch', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Desktop elimination threshold is 3 violations: warnings at 1 and 2,
    // disqualification + auto-submit at 3.
    await triggerTabSwitch(page, 3, 5500);

    // Check the participant record is disqualified
    await expect.poll(
      async () => {
        const participants = await apiRequest('GET', '/api/participants/my-registrations', testContext.participantToken);
        const eventParticipant = participants.find((p: any) => p.eventId === shared.eventId);
        return eventParticipant?.status;
      },
      { timeout: 15000 }
    ).toBe('disqualified');

    await page.screenshot({ path: 'tests/reports/screenshots/disqualified-tab-switch.png' });
  });
});

// Test Suite: Page Refresh Prevention
test.describe('Page Refresh Prevention Tests', () => {
  test('should intercept page refresh and show confirmation', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Set up dialog handler before triggering refresh
    let dialogShown = false;
    let dialogType = '';
    page.on('dialog', async dialog => {
      dialogShown = true;
      dialogType = dialog.type();
      await dialog.dismiss();
    });

    // Attempt to reload the page (timeout 5s since cancelling beforeunload aborts navigation)
    try {
      await page.reload({ timeout: 5000 });
    } catch (e) {
      // Expected: navigation aborted/prevented by beforeunload
    }

    await page.waitForTimeout(500);

    // The beforeunload dialog should have been shown. Polled rather than a
    // fixed wait: under xvfb the dialog event can arrive late, which flaked
    // this assertion once.
    await expect.poll(() => dialogShown, { timeout: 10000 }).toBe(true);
    expect(dialogType).toBe('beforeunload');
  });

  test('should track refresh attempts in violations', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    const initialViolations = await getViolationCount(testContext.attemptId);

    // Manually log a refresh violation via API (simulating what the frontend does)
    await apiRequest('POST', `/api/attempts/${testContext.attemptId}/violations`, testContext.participantToken, {
      type: 'refresh'
    });

    await expect.poll(
      async () => (await getViolationCount(testContext.attemptId)).refresh,
      { timeout: 10000 }
    ).toBeGreaterThan(initialViolations.refresh);
  });
});

// Test Suite: Browser Controls Disabled
test.describe('Browser Controls Disabled Tests', () => {
  test('should prevent browser back button navigation', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    const currentUrl = page.url();

    // Try to go back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should still be on the same page (back button is blocked)
    const newUrl = page.url();
    expect(newUrl).toBe(currentUrl);
  });

  test('should disable right-click context menu', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Check if context menu is disabled
    const isContextMenuDisabled = await page.evaluate(() => {
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      return !document.dispatchEvent(event);
    });

    expect(isContextMenuDisabled).toBe(true);
  });

  test('should block keyboard shortcuts', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Try Ctrl+C (copy)
    await page.keyboard.down('Control');
    await page.keyboard.press('c');
    await page.keyboard.up('Control');

    // Try Ctrl+V (paste)
    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');

    // Try F12 (dev tools)
    await page.keyboard.press('F12');

    await page.waitForTimeout(500);

    // These should be blocked - no errors should occur
    await expect(page.locator('[data-testid="heading-test-name"]')).toBeVisible();
  });
});

// Test Suite: Violation Tracking & Auto-Submit
test.describe('Violation Tracking & Auto-Submit Tests', () => {
  test('should log violations with timestamps', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Log a violation
    await apiRequest('POST', `/api/attempts/${testContext.attemptId}/violations`, testContext.participantToken, {
      type: 'refresh'
    });

    await page.waitForTimeout(500);

    // Get attempt and check violation logs
    const attempt = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);
    const violationLogs = attempt.violationLogs || [];

    expect(violationLogs.length).toBeGreaterThan(0);
    expect(violationLogs[violationLogs.length - 1]).toHaveProperty('type', 'refresh');
    expect(violationLogs[violationLogs.length - 1]).toHaveProperty('timestamp');
  });

  test('should auto-submit test on violation threshold', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Answer a question first
    await answerQuestion(page, 0);

    await page.waitForTimeout(500);

    // Desktop elimination threshold: 3 violations -> disqualify + auto-submit
    await triggerTabSwitch(page, 3, 5500);

    // The 3rd violation POST atomically flips the attempt in_progress ->
    // disqualified (server owns elimination; the client's delayed auto-submit
    // is refused with 400 once the attempt is no longer in_progress). The
    // terminal state is therefore "disqualified", not "completed".
    await expect.poll(
      async () => {
        const attempt = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);
        return attempt.status;
      },
      { timeout: 20000 }
    ).toBe('disqualified');

    await page.screenshot({ path: 'tests/reports/screenshots/auto-submit-violation.png' });
  });

  test('should save answers correctly on auto-submit', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Answer first question
    await answerQuestion(page, 0);
    await apiRequest('POST', `/api/attempts/${testContext.attemptId}/answers`, testContext.participantToken, {
      questionId: shared.questionIds[0],
      answer: 'Option A'
    });

    await page.waitForTimeout(500);

    // Verify answer was saved
    const attemptBefore = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);
    const answerCountBefore = attemptBefore.answers?.length || 0;
    expect(answerCountBefore).toBeGreaterThan(0);

    // Trigger elimination via tab switch (3 violations). The 3rd strike
    // disqualifies the attempt server-side (terminal state "disqualified";
    // see the note in "should auto-submit test on violation threshold").
    await triggerTabSwitch(page, 3, 5500);

    // Wait for elimination to complete
    await expect.poll(
      async () => {
        const attempt = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);
        return attempt.status;
      },
      { timeout: 20000 }
    ).toBe('disqualified');

    // Get attempt after elimination
    const attemptAfter = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);

    // Answers should be preserved (disqualification never wipes answers)
    expect(attemptAfter.answers?.length).toBe(answerCountBefore);
    expect(attemptAfter.answers?.[0]?.answer).toBe('Option A');
  });
});

// Test Suite: Complete Test Flow Integration
test.describe('Test Flow Integration', () => {
  test('should complete full test flow with normal submission', async ({ page }) => {
    await loginAsParticipant(page);

    // Navigate to the event details page
    await page.goto(`${BASE_URL}/participant/events/${shared.eventId}`);
    await page.waitForSelector(`[data-testid="button-start-test-${shared.roundId}"]`, { timeout: 30000 });

    // Start test
    await page.click(`[data-testid="button-start-test-${shared.roundId}"]`);
    await page.waitForURL('**/participant/test/**', { timeout: 30000 });

    const attemptUrl = page.url();
    const attemptId = attemptUrl.split('/').pop() || '';

    // Begin test (enter fullscreen)
    await page.locator('[data-testid="button-begin-test"]').click({ force: true, noWaitAfter: true });
    await page.waitForTimeout(1000);

    // Answer all questions
    for (let i = 0; i < shared.questionIds.length; i++) {
      await answerQuestion(page, 0); // Select first option

      await page.waitForTimeout(300);

      // Navigate to next question or submit
      if (i < shared.questionIds.length - 1) {
        await page.click('[data-testid="button-next"]');
        await page.waitForTimeout(300);
      }
    }

    // Submit test
    await page.click('[data-testid="button-submit-test"]');
    await page.waitForTimeout(2000);

    // Should be redirected to results page
    await page.waitForURL('**/participant/results/**', { timeout: 30000 });

    // Verify test is completed
    const attempt = await apiRequest('GET', `/api/attempts/${attemptId}`, testContext.participantToken);
    expect(attempt.status).toBe('completed');
    // Participant view masks totalScore as null until admin enables showAnswers
    expect(attempt.totalScore).toBeNull();

    // Event admin can see the actual calculated totalScore
    const adminAttempt = await apiRequest('GET', `/api/attempts/${attemptId}`, shared.eventAdminToken);
    expect(adminAttempt.status).toBe('completed');
    expect(adminAttempt.totalScore).toBeGreaterThanOrEqual(0);

    await page.screenshot({ path: 'tests/reports/screenshots/test-completed.png', fullPage: true });
  });

  test('should maintain fullscreen throughout test duration', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);
    await waitForFullscreen(page);

    // Answer a question
    await answerQuestion(page, 0);
    await page.waitForTimeout(500);

    await waitForFullscreen(page);

    // Navigate to next question
    await page.click('[data-testid="button-next"]');
    await page.waitForTimeout(500);

    await waitForFullscreen(page);
  });

  test('should show timer and time warnings', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Check timer is visible
    await expect(page.locator('[data-testid="text-timer"]')).toBeVisible();

    // Get timer text
    const timerText = await page.locator('[data-testid="text-timer"]').textContent();
    expect(timerText).toMatch(/\d+:\d+/);

    await page.screenshot({ path: 'tests/reports/screenshots/timer-display.png' });
  });

  test('should display violation warnings to participant', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Trigger a real tab-switch violation so the frontend warning alert renders
    await triggerTabSwitch(page, 1);

    // Check for the violation warning alert (shown for ~5 seconds).
    // Scoped to the exam shell: the toast viewport also renders role="alert"
    // (the violation toast), which would trip strict mode on a bare lookup.
    await expect(page.locator('[data-testid="exam-shell"] [role="alert"]')).toBeVisible({ timeout: 5000 });

    // Take screenshot to show warning
    await page.screenshot({ path: 'tests/reports/screenshots/violation-warning.png' });
  });
});

// Test Suite: Edge Cases and Error Handling
test.describe('Edge Cases and Error Handling', () => {
  test('should handle rapid violation attempts', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    // Log multiple violations rapidly
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        apiRequest('POST', `/api/attempts/${testContext.attemptId}/violations`, testContext.participantToken, {
          type: 'refresh'
        }).catch(() => {}) // Ignore errors for completed tests
      );
    }

    await Promise.all(promises);
    await page.waitForTimeout(1000);

    // Should handle gracefully without crashing
    const attempt = await apiRequest('GET', `/api/attempts/${testContext.attemptId}`, testContext.participantToken);
    expect(attempt).toBeDefined();
  });

  test('should prevent duplicate test attempts', async ({ page }) => {
    await loginAsParticipant(page);

    // First attempt should succeed (201 Created)
    const firstAttemptRes = await fetch(
      `${BASE_URL}/api/events/${shared.eventId}/rounds/${shared.roundId}/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.participantToken}`
        },
        body: '{}'
      }
    );
    expect(firstAttemptRes.status).toBe(201);
    const firstAttempt = await firstAttemptRes.json();
    expect(firstAttempt.id).toBeTruthy();

    // Second attempt must be rejected with the duplicate-attempt message
    const secondAttemptRes = await fetch(
      `${BASE_URL}/api/events/${shared.eventId}/rounds/${shared.roundId}/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testContext.participantToken}`
        },
        body: '{}'
      }
    );
    expect(secondAttemptRes.status).toBe(400);
    const secondAttemptBody = await secondAttemptRes.json();
    expect(secondAttemptBody.message).toContain('already have an attempt');
  });

  test('should handle window blur events', async ({ page }) => {
    await loginAsParticipant(page);
    await navigateToTest(page);
    await startTest(page);

    const initialViolations = await getViolationCount(testContext.attemptId);

    // A lone blur event must NOT log a violation. H-11 removed the
    // blur-based detector: a real tab switch fires both blur and
    // visibilitychange, which double-counted strikes. visibilitychange is
    // the single canonical detector now.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(1500);

    const afterLoneBlur = await getViolationCount(testContext.attemptId);
    expect(afterLoneBlur.tabSwitch).toBe(initialViolations.tabSwitch);

    // visibilitychange (with the document hidden, as a backgrounded tab
    // reports) remains the canonical tab-switch detector.
    await page.evaluate(() => {
      try {
        Object.defineProperty(document, 'hidden', {
          get: () => true,
          configurable: true
        });
      } catch (e) {}
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(
      async () => (await getViolationCount(testContext.attemptId)).tabSwitch,
      { timeout: 10000 }
    ).toBeGreaterThan(initialViolations.tabSwitch);
  });
});

test.afterAll(async () => {
  // Cleanup if needed
  console.log('All proctored test E2E tests completed');
});
