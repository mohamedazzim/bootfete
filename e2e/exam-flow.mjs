#!/usr/bin/env node
/**
 * Bootfete end-to-end exam-flow test.
 *
 * Runs the full lifecycle against a live staging deploy:
 *   health -> admin login -> event -> round -> questions -> register ->
 *   confirm (event credentials) -> round start -> participant login ->
 *   attempt start -> answer saves -> violations (+dedupe) -> pause/resume
 *   (startedAt shift) -> submit (grading) -> idempotent resubmit ->
 *   post-submit save rejection -> leaderboard -> cleanup.
 *
 * Env:
 *   E2E_BASE_URL    base URL of the app (default http://localhost:3000)
 *   E2E_ADMIN_USER  username of an EXISTING super_admin (seeded on staging)
 *   E2E_ADMIN_PASS  password for that super_admin
 *
 * Exit code 0 = all steps passed. Any failed assertion throws and exits 1.
 * The created event is deleted in a finally block so reruns stay clean.
 *
 * All request/response shapes were read from server/routes.ts and
 * server/storage.ts at main@d26d8e2 — see RUNBOOK.md for the shape notes.
 */

const BASE = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_USER = process.env.E2E_ADMIN_USER;
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error("FATAL: E2E_ADMIN_USER and E2E_ADMIN_PASS must be set (existing super_admin).");
  process.exit(2);
}

const RUN_ID = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
function step(name) {
  return async (fn) => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${name}`);
    } catch (err) {
      console.error(`FAIL  ${name}`);
      console.error(`      ${err.message}`);
      throw err;
    }
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

/** Low-level request. Returns {status, body}. */
async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed };
}

/** Request that must succeed with one of the expected statuses. */
async function must(method, path, opts = {}, expected = [200]) {
  const { status, body } = await req(method, path, opts);
  assert(
    expected.includes(status),
    `${method} ${path} -> expected ${expected.join("/")} but got ${status}: ${JSON.stringify(body)?.slice(0, 300)}`
  );
  return body;
}

async function main() {
  let eventId = null;
  let adminToken = null;

  try {
    // a. Health
    await step("a. GET /api/health")(async () => {
      const body = await must("GET", "/api/health");
      assert(body.status === "ok", `expected status "ok", got ${JSON.stringify(body)}`);
    });

    // b. Admin login
    await step("b. admin login -> token")(async () => {
      const body = await must("POST", "/api/auth/login", {
        body: { username: ADMIN_USER, password: ADMIN_PASS },
      });
      assert(body.token, "no token in login response");
      assert(body.user?.role === "super_admin", `expected super_admin, got ${body.user?.role}`);
      adminToken = body.token;
    });
    const A = { token: adminToken }; // admin auth opts

    // c. Create event (unique name per run)
    const eventName = `E2E Exam ${RUN_ID}`;
    await step("c. create event")(async () => {
      const body = await must("POST", "/api/events", {
        ...A,
        body: {
          name: eventName,
          description: "E2E automated exam-flow test event",
          type: "e2e",
          category: "technical",
          minMembers: 1,
          maxMembers: 1,
        },
      }, [201]);
      assert(body.id, "no event id returned");
      eventId = body.id;
    });

    // d. Create round (online, 30 min) + verify auto-created rules
    let roundId;
    await step("d. create round + rules exist")(async () => {
      const round = await must("POST", `/api/events/${eventId}/rounds`, {
        ...A,
        body: {
          name: "E2E Round 1",
          roundNumber: 1,
          duration: 30,
          conductMedium: "online",
          roundType: "prelims",
        },
      }, [201]);
      assert(round.id && round.status === "not_started", `bad round: ${JSON.stringify(round).slice(0, 200)}`);
      roundId = round.id;

      const rules = await must("GET", `/api/rounds/${roundId}/rules`, A);
      assert(rules.autoSubmitOnViolation !== undefined, "round rules missing autoSubmitOnViolation");
    });

    // e. Add 3 questions: MCQ (correct known), short-answer, MCQ (will answer wrong)
    const q = {};
    await step("e. add 3 questions")(async () => {
      const mk = (n, payload) =>
        must("POST", `/api/rounds/${roundId}/questions`, { ...A, body: payload }, [201]);
      q.q1 = await mk(1, {
        questionType: "multiple_choice",
        questionText: "E2E: capital of France?",
        questionNumber: 1,
        points: 1,
        options: ["Paris", "London", "Berlin", "Rome"],
        correctAnswer: "Paris",
      });
      q.q2 = await mk(2, {
        questionType: "descriptive",
        questionText: "E2E: answer to life, the universe, and everything?",
        questionNumber: 2,
        points: 1,
        correctAnswer: "42",
      });
      q.q3 = await mk(3, {
        questionType: "multiple_choice",
        questionText: "E2E: color of the sky?",
        questionNumber: 3,
        points: 1,
        options: ["Red", "Green", "Blue"],
        correctAnswer: "Blue",
      });
      for (const k of ["q1", "q2", "q3"]) assert(q[k].id, `${k} missing id`);
    });

    // g+h. Register + confirm BEFORE starting the round, so the round-start
    // auto-enable of test access covers this participant's credentials.
    let registrationId, eventUsername, eventPassword;
    await step("g. register participant")(async () => {
      const body = await must("POST", "/api/register", {
        body: {
          eventId,
          organizerRollNo: `E2E${RUN_ID}`.toUpperCase(),
          organizerName: "E2E Student",
          organizerEmail: `e2e.${RUN_ID}@example.com`,
          organizerDept: "CSE",
          organizerCollege: "E2E College",
          organizerPhone: "9999999999",
        },
      }, [201]);
      assert(body.registration?.id, `no registration id: ${JSON.stringify(body).slice(0, 200)}`);
      registrationId = body.registration.id;
    });

    await step("h. confirm registration -> event credentials")(async () => {
      const body = await must("PATCH", `/api/registrations/${registrationId}/confirm`, A);
      const creds = body.eventCredentials;
      assert(Array.isArray(creds) && creds.length > 0, "no eventCredentials in confirm response");
      eventUsername = creds[0].eventUsername;
      eventPassword = creds[0].eventPassword;
      assert(eventUsername && eventPassword, "credential missing username/password");
    });

    // f. Start the round
    await step("f. start round")(async () => {
      const round = await must("POST", `/api/rounds/${roundId}/start`, {
        ...A,
        body: { duration: 30 },
      });
      assert(round.status === "in_progress", `round not in_progress: ${round.status}`);
    });

    // i. Participant login with event credentials
    let participantToken, participantUserId;
    await step("i. participant login (event credentials)")(async () => {
      const body = await must("POST", "/api/auth/login", {
        body: { username: eventUsername, password: eventPassword },
      });
      assert(body.token, "no participant token");
      assert(body.user?.role === "participant", `expected participant, got ${body.user?.role}`);
      participantToken = body.token;
      participantUserId = body.user.id;
    });
    const P = { token: participantToken }; // participant auth opts

    // j. Start attempt; duplicate must 400 (not 500)
    let attemptId, startedAtBefore;
    await step("j. start attempt + duplicate start is 400")(async () => {
      const attempt = await must(
        "POST", `/api/events/${eventId}/rounds/${roundId}/start`, P, [200, 201]
      );
      assert(attempt.id, "no attempt id");
      assert(attempt.startedAt, "no startedAt on attempt");
      attemptId = attempt.id;
      startedAtBefore = new Date(attempt.startedAt).getTime();

      const dup = await req("POST", `/api/events/${eventId}/rounds/${roundId}/start`, P);
      assert(dup.status === 400, `duplicate start -> expected 400, got ${dup.status}`);
    });

    // k. Save answers (single + bulk), then verify persistence
    await step("k. save answers (single + bulk) and verify")(async () => {
      await must("POST", `/api/attempts/${attemptId}/answers`, {
        ...P,
        body: { questionId: q.q1.id, answer: "Paris" }, // correct
      });
      await must("POST", `/api/attempts/${attemptId}/answers/bulk`, {
        ...P,
        body: {
          answers: [
            { questionId: q.q2.id, answer: "42" },   // correct
            { questionId: q.q3.id, answer: "Red" },  // wrong on purpose
          ],
        },
      });

      const attempt = await must("GET", `/api/attempts/${attemptId}`, P);
      const byQ = Object.fromEntries((attempt.answers || []).map((a) => [a.questionId, a.answer]));
      assert(byQ[q.q1.id] === "Paris", "q1 answer not persisted");
      assert(byQ[q.q2.id] === "42", "q2 answer not persisted");
      assert(byQ[q.q3.id] === "Red", "q3 answer not persisted");
    });

    // l. Violation logging + same-type dedupe within 5s (H-11)
    await step("l. violation logged; same-type repeat deduped")(async () => {
      const v1 = await must("POST", `/api/attempts/${attemptId}/violations`, {
        ...P,
        body: { type: "tab_switch" },
      });
      assert(v1.tabSwitchCount === 1, `expected tabSwitchCount 1, got ${v1.tabSwitchCount}`);
      const logs1 = (v1.violationLogs || []).length;

      const v2 = await must("POST", `/api/attempts/${attemptId}/violations`, {
        ...P,
        body: { type: "tab_switch" },
      });
      assert(
        (v2.violationLogs || []).length === logs1 && v2.tabSwitchCount === 1,
        "same-type violation within 5s was not deduped"
      );
    });

    // m. Pause -> save rejected while paused -> resume shifts startedAt (H-13).
    // NOTE: the shift happens on RESUME, not on pause (pauseDurationMs is
    // computed from round.updatedAt at resume time).
    await step("m. pause blocks saves; resume shifts startedAt")(async () => {
      const paused = await must("POST", `/api/rounds/${roundId}/pause`, A);
      assert(paused.status === "paused", `round not paused: ${paused.status}`);

      const blocked = await req("POST", `/api/attempts/${attemptId}/answers`, {
        ...P,
        body: { questionId: q.q1.id, answer: "Paris" },
      });
      assert(blocked.status === 403, `save during pause -> expected 403, got ${blocked.status}`);

      await sleep(6000); // pause long enough to observe the shift

      const resumed = await must("POST", `/api/rounds/${roundId}/resume`, A);
      assert(resumed.status === "in_progress", `round not resumed: ${resumed.status}`);

      const attempt = await must("GET", `/api/attempts/${attemptId}`, P);
      const shifted = new Date(attempt.startedAt).getTime() - startedAtBefore;
      assert(shifted >= 3000, `startedAt shifted only ${shifted}ms after ~6s pause (H-13 broken?)`);
      console.log(`      startedAt shifted forward by ${(shifted / 1000).toFixed(1)}s`);
    });

    // n. Submit -> score 2/3; resubmit idempotent; post-submit save rejected
    await step("n. submit grades 2/3; resubmit + post-submit save rejected")(async () => {
      const submitted = await must("POST", `/api/attempts/${attemptId}/submit`, P);
      assert(submitted.status === "completed", `attempt not completed: ${submitted.status}`);
      assert(
        submitted.totalScore === 2,
        `expected totalScore 2 (Paris + 42 correct, Red wrong), got ${submitted.totalScore}`
      );

      const again = await req("POST", `/api/attempts/${attemptId}/submit`, P);
      assert(again.status === 400, `second submit -> expected 400, got ${again.status}`);

      const late = await req("POST", `/api/attempts/${attemptId}/answers`, {
        ...P,
        body: { questionId: q.q1.id, answer: "Paris" },
      });
      assert(late.status === 400, `post-submit save -> expected 400, got ${late.status}`);
    });

    // o. Leaderboard shows the score
    await step("o. leaderboard shows participant score")(async () => {
      const lb = await must("GET", `/api/rounds/${roundId}/leaderboard`, A);
      assert(lb.scope === "admin", `expected admin scope, got ${lb.scope}`);
      const entry = (lb.leaderboard || []).find((e) => e.userId === participantUserId);
      assert(entry, "participant missing from leaderboard");
      assert(
        Number(entry.totalScore) === 2,
        `leaderboard score expected 2, got ${entry.totalScore}`
      );
    });

    console.log(`\nE2E PASS: ${passed} steps, run ${RUN_ID}`);
  } finally {
    // p. Cleanup — runs even on failure
    if (eventId && adminToken) {
      try {
        const { status } = await req("DELETE", `/api/events/${eventId}`, { token: adminToken });
        console.log(status === 200 ? `PASS  p. cleanup: deleted event ${eventId}` : `WARN  p. cleanup: DELETE -> ${status}`);
      } catch (e) {
        console.error(`WARN  p. cleanup failed: ${e.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`\nE2E FAIL: ${err.message}`);
  process.exit(1);
});
