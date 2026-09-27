#!/usr/bin/env node
/**
 * BootFete manual-DQ vs submit race proof (committed regression test).
 *
 * Covers PATCH /api/participants/:participantId/disqualify — the route that
 * was never covered by a race test (the auto-DQ path has one; this route ran
 * an unconditional UPDATE that clobbered a concurrent submit's completed
 * state until it was brought under the same transactional CAS).
 *
 * Also covers the leaderboard tie-break: total_score DESC, submitted_at ASC,
 * user_id ASC — burst submits sharing one millisecond submittedAt must keep
 * a stable order across repeated fetches.
 *
 * What it proves:
 *   A. DQ-first (sequential): manual DQ wins -> attempt disqualified,
 *      participant disqualified, late submit rejected (4xx), no clobber.
 *   B. Submit-first (sequential): submit wins -> attempt completed,
 *      participant stays registered; late manual DQ stands down
 *      (disqualifiedAttempts: 0, honest message), nothing clobbered.
 *   C. Truly simultaneous submit+DQ x4: every racer lands in exactly one
 *      consistent terminal state — never split (completed attempt +
 *      disqualified participant, or vice versa).
 *   D. Tie-break: two score-0 submits forced to the same millisecond
 *      submittedAt -> 10 consecutive leaderboard fetches return the
 *      identical order, and the tied pair is ordered by user_id ASC.
 *
 * Env:
 *   E2E_BASE_URL    base URL of the app (default http://localhost:3000)
 *   E2E_ADMIN_USER  username of an EXISTING super_admin
 *   E2E_ADMIN_PASS  password for that super_admin
 *   DATABASE_URL    postgres connection (racer setup, ground-truth asserts,
 *                   forcing the tie-break timestamp)
 *
 * Exit code 0 = all steps passed. Any failed assertion throws and exits 1.
 * All fixtures (event, users, participants, attempts) are removed in the
 * finally block so reruns stay clean.
 */

import bcryptPkg from "bcrypt";
import pgPkg from "pg";
const bcrypt = bcryptPkg;
const { Client } = pgPkg;

const BASE = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_USER = process.env.E2E_ADMIN_USER;
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;
const DATABASE_URL = process.env.DATABASE_URL;

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error("FATAL: E2E_ADMIN_USER and E2E_ADMIN_PASS must be set (existing super_admin).");
  process.exit(2);
}
if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL must be set (racer setup + ground-truth assertions).");
  process.exit(2);
}

const RUN_ID = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pg = new Client({ connectionString: DATABASE_URL });

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
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: parsed };
}

async function must(method, path, opts = {}, expected = [200]) {
  const { status, body } = await req(method, path, opts);
  assert(
    expected.includes(status),
    `${method} ${path}: expected ${expected}, got ${status} (${JSON.stringify(body)?.slice(0, 160)})`
  );
  return body;
}

const created = { eventId: null, userIds: [], participantIds: [], attemptIds: [] };
let adminToken = ""; // captured in main() for the finally-block cleanup

async function main() {
  await pg.connect();

  // a. Health
  await step("a. health")(async () => {
    const { status } = await req("GET", "/api/health");
    assert(status === 200, `health: ${status}`);
  });

  // b. Admin login
  await step("b. admin login")(async () => {
    const body = await must("POST", "/api/auth/login", {
      body: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    assert(body.token, "no token in login response");
    adminToken = body.token;
  });
  const A = { token: adminToken };

  // c. Event + round + 1 MCQ question, round started
  let eventId, roundId;
  await step("c. create event + round + question, start round")(async () => {
    const event = await must("POST", "/api/events", {
      ...A,
      body: {
        name: `E2E DQ-Race ${RUN_ID}`,
        description: "manual-DQ vs submit race regression fixtures",
        type: "e2e",
        category: "technical",
        minMembers: 1,
        maxMembers: 1,
      },
    }, [201]);
    eventId = event.id;
    created.eventId = eventId;

    const round = await must("POST", `/api/events/${eventId}/rounds`, {
      ...A,
      body: {
        name: "DQ Race Round",
        roundNumber: 1,
        duration: 30,
        conductMedium: "online",
        roundType: "prelims",
      },
    }, [201]);
    roundId = round.id;

    await must("POST", `/api/rounds/${roundId}/questions`, {
      ...A,
      body: {
        questionType: "multiple_choice",
        questionText: "E2E race: 2+2?",
        questionNumber: 1,
        points: 1,
        options: ["3", "4", "5"],
        correctAnswer: "4",
      },
    }, [201]);

    const started = await must("POST", `/api/rounds/${roundId}/start`, {
      ...A,
      body: { duration: 30 },
    });
    assert(started.status === "in_progress", `round not in_progress: ${started.status}`);
  });

  // d. 10 racers: users + participant rows via DB, login + attempt start via API
  //    0-1: DQ-first | 2-3: submit-first | 4-7: simultaneous | 8-9: tie-break
  const racers = [];
  await step("d. create 10 racers, log in, start attempts")(async () => {
    const pwHash = await bcrypt.hash("race-test-123", 10);
    for (let i = 0; i < 10; i++) {
      const un = `dqrace-${RUN_ID}-${i}`;
      const { rows } = await pg.query(
        `INSERT INTO users (username, email, password, role, full_name)
         VALUES ($1, $2, $3, 'participant', $4) RETURNING id`,
        [un, `${un}@e2e.test`, pwHash, un]
      );
      const userId = rows[0].id;
      const p = await pg.query(
        `INSERT INTO participants (event_id, user_id, status)
         VALUES ($1, $2, 'registered') RETURNING id`,
        [eventId, userId]
      );
      created.userIds.push(userId);
      created.participantIds.push(p.rows[0].id);

      const login = await must("POST", "/api/auth/login", {
        body: { username: un, password: "race-test-123" },
      });
      assert(login.token, `no token for ${un}`);

      const attempt = await must(
        "POST", `/api/events/${eventId}/rounds/${roundId}/start`,
        { token: login.token }, [200, 201]
      );
      assert(attempt.id && attempt.status === "in_progress", `bad attempt for ${un}`);
      created.attemptIds.push(attempt.id);
      racers.push({ i, un, userId, participantId: p.rows[0].id, attemptId: attempt.id, token: login.token });
    }
    assert(racers.length === 10, "racer setup incomplete");
  });

  const attemptStatus = async (id) =>
    (await pg.query(`SELECT status FROM test_attempts WHERE id = $1`, [id])).rows[0]?.status;
  const participantStatus = async (id) =>
    (await pg.query(`SELECT status FROM participants WHERE id = $1`, [id])).rows[0]?.status;
  const submit = (r) =>
    req("POST", `/api/attempts/${r.attemptId}/submit`, { token: r.token, body: {} });
  const manualDQ = (r) =>
    req("PATCH", `/api/participants/${r.participantId}/disqualify`, { ...A });

  // A. DQ-first (sequential, deterministic ordering)
  await step("A. DQ-first: attempt+participant disqualified, late submit 4xx")(async () => {
    for (const r of racers.slice(0, 2)) {
      const dq = await manualDQ(r);
      assert(dq.status === 200, `DQ status ${dq.status}`);
      assert(dq.body?.disqualifiedAttempts === 1,
        `expected disqualifiedAttempts 1, got ${JSON.stringify(dq.body)?.slice(0, 120)}`);
      const late = await submit(r);
      assert(late.status >= 400 && late.status < 500, `late submit: ${late.status}`);
      assert((await attemptStatus(r.attemptId)) === "disqualified", "attempt not disqualified");
      assert((await participantStatus(r.participantId)) === "disqualified", "participant not disqualified");
    }
  });

  // B. Submit-first (sequential): submit wins, late manual DQ stands down
  await step("B. submit-first: completed kept, late DQ stands down cleanly")(async () => {
    for (const r of racers.slice(2, 4)) {
      const sub = await submit(r);
      assert(sub.status === 200, `submit status ${sub.status}`);
      const dq = await manualDQ(r);
      assert(dq.status === 200, `DQ status ${dq.status}`);
      assert(dq.body?.disqualifiedAttempts === 0,
        `expected disqualifiedAttempts 0, got ${JSON.stringify(dq.body)?.slice(0, 160)}`);
      assert(/no in-progress/i.test(dq.body?.message || ""),
        `unexpected message: ${dq.body?.message}`);
      // The won submit must NOT be clobbered.
      assert((await attemptStatus(r.attemptId)) === "completed", "completed attempt was clobbered!");
      assert((await participantStatus(r.participantId)) === "registered",
        "participant flipped after CAS loss!");
    }
  });

  // C. Truly simultaneous submit + manual DQ: exactly one consistent terminal state
  await step("C. simultaneous x4: one winner, no split state")(async () => {
    const batch = racers.slice(4, 8);
    const outcomes = await Promise.all(batch.map((r) =>
      Promise.all([submit(r), manualDQ(r)]).then(() => r)
    ));
    for (const r of outcomes) {
      const a = await attemptStatus(r.attemptId);
      const p = await participantStatus(r.participantId);
      const ok =
        (a === "completed" && p === "registered") ||
        (a === "disqualified" && p === "disqualified");
      assert(ok, `SPLIT STATE for ${r.un}: attempt=${a} participant=${p}`);
    }
    const dqWins = (
      await pg.query(
        `SELECT count(*)::int c FROM test_attempts WHERE id = ANY($1) AND status = 'disqualified'`,
        [batch.map((r) => r.attemptId)]
      )
    ).rows[0].c;
    console.log(`      (simultaneous outcomes: ${dqWins} DQ-wins, ${batch.length - dqWins} submit-wins)`);
  });

  // D. Tie-break: force identical millisecond submittedAt, order must be stable
  await step("D. tie-break stable across 10 fetches, user_id ASC on ties")(async () => {
    const pair = racers.slice(8, 10);
    for (const r of pair) {
      const sub = await submit(r);
      assert(sub.status === 200, `tie-break submit: ${sub.status}`);
    }
    const tieTs = "2026-01-01T00:00:00.000Z";
    await pg.query(
      `UPDATE test_attempts SET submitted_at = $1 WHERE id = ANY($2)`,
      [tieTs, pair.map((r) => r.attemptId)]
    );
    const [u0, u1] = [...pair].sort((a, b) => (a.userId < b.userId ? -1 : 1));
    let first = null;
    for (let k = 0; k < 10; k++) {
      const board = await must("GET", `/api/rounds/${roundId}/leaderboard`, A);
      const order = (board.leaderboard || []).map((e) => e.userId).join(",");
      if (k === 0) first = order;
      assert(order === first, `fetch ${k}: leaderboard order changed (tie-break unstable)`);
      const iu0 = order.split(",").indexOf(u0.userId);
      const iu1 = order.split(",").indexOf(u1.userId);
      assert(iu0 !== -1 && iu1 !== -1, "tied pair missing from board");
      assert(iu0 < iu1, "tied pair not in user_id ASC order");
    }
  });

  console.log(`\nAll ${passed} steps passed.`);
}

try {
  await main();
} catch (err) {
  console.error(`\nHarness failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  // Cleanup: remove fixtures so reruns stay clean.
  try {
    if (created.attemptIds.length)
      await pg.query(`DELETE FROM test_attempts WHERE id = ANY($1)`, [created.attemptIds]);
    if (created.participantIds.length)
      await pg.query(`DELETE FROM participants WHERE id = ANY($1)`, [created.participantIds]);
    if (created.userIds.length)
      await pg.query(`DELETE FROM users WHERE id = ANY($1)`, [created.userIds]);
    if (created.eventId) {
      await fetch(`${BASE}/api/events/${created.eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
  await pg.end().catch(() => {});
}
