#!/usr/bin/env node
/**
 * Bootfete 500-student load test — pure Node.js, zero dependencies.
 *
 * Simulates N concurrent students running the REAL exam flow against a
 * deployed target:
 *   register -> login -> event registration -> admin confirm ->
 *   event-credential login -> start attempt ->
 *   fetch questions -> answer loop (debounced saves, edits, violations) -> submit
 *
 * Usage:
 *   node loadtest/run.mjs --target https://staging.example.com \
 *     --event-id <uuid> --round-id <uuid> \
 *     --students 500 --ramp 120 --questions 20 \
 *     --admin-user <user> --admin-pass <pass>
 *
 *   node loadtest/run.mjs --smoke   # 5 students against http://localhost:5000
 *
 * Required on the target: one event with on-spot registration open and one
 * round with status=in_progress, conductMedium=online, and questions added.
 * Each virtual student registers a fresh user, so the target database will
 * contain the load-test data afterwards (usernames prefixed `loadtest-`).
 *
 * Exit code: 0 if error rate < 1% and p99 < 5s, else 1.
 */
import { performance } from "node:perf_hooks";

// ---------------------------------------------------------------- config

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => {
    if (!a.startsWith("--")) return [];
    const eq = a.indexOf("=");
    if (eq > -1) return [[a.slice(2, eq), a.slice(eq + 1)]];
    const next = arr[i + 1];
    return [[a.slice(2), next && !next.startsWith("--") ? next : "true"]];
  }),
);

const SMOKE = args.smoke === "true";
const TARGET = (args.target || process.env.LOADTEST_TARGET || "http://localhost:5000").replace(/\/$/, "");
const STUDENTS = parseInt(args.students || process.env.LOADTEST_STUDENTS || (SMOKE ? "5" : "500"), 10);
const RAMP_S = parseInt(args["ramp"] || "120", 10);          // stagger student starts over this many seconds
const QUESTIONS = parseInt(args["questions"] || "20", 10);   // answer-loop iterations per student
const EVENT_ID = args["event-id"] || process.env.LOADTEST_EVENT_ID || "";
const ROUND_ID = args["round-id"] || process.env.LOADTEST_ROUND_ID || "";
const SEED = parseInt(args.seed || "42", 10);
const REQ_TIMEOUT_MS = 30000;
// Admin credentials for the confirm-registration step (the real student
// journey: pending registration -> admin confirm -> event credentials ->
// participant login). The loadtest models reality, not the stub.
const ADMIN_USER = args["admin-user"] || process.env.LOADTEST_ADMIN_USER || "";
const ADMIN_PASS = args["admin-pass"] || process.env.LOADTEST_ADMIN_PASS || "";
let ADMIN_TOKEN = "";

if (!EVENT_ID || !ROUND_ID) {
  console.error("ERROR: --event-id and --round-id are required (a live round on the target).");
  process.exit(2);
}

// ---------------------------------------------------------------- utils

// Seeded PRNG (mulberry32) so runs are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- metrics

const metrics = new Map(); // endpoint -> { ok, err, err429, lat: [] }
function record(endpoint, ms, status) {
  let m = metrics.get(endpoint);
  if (!m) { m = { ok: 0, err: 0, err429: 0, lat: [] }; metrics.set(endpoint, m); }
  if (status === 429) m.err429++;
  else if (status >= 200 && status < 400) m.ok++;
  else m.err++;
  m.lat.push(ms);
}
// Collapse volatile path segments (uuids, attempt ids) so each endpoint
// gets one metrics bucket instead of one per id.
function normalizePath(path) {
  return path.split("?")[0]
    .replace(/\/api\/attempts\/[^/]+/g, "/api/attempts/:id")
    .replace(/\/[0-9a-f-]{20,}/g, "/:id");
}
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

// ---------------------------------------------------------------- http

class Student {
  constructor(id) {
    this.id = id;
    this.cookies = new Map();
    this.token = null; // Bearer <redacted> captured at login — the app authenticates via Authorization header, not cookies
    this.tag = `loadtest-${SEED}-${id}`;
  }

  cookieHeader() {
    if (!this.cookies.size) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  authHeaders() {
    const headers = { "Content-Type": "application/json" };
    const ck = this.cookieHeader();
    if (ck) headers["Cookie"] = ck;
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    return headers;
  }

  async req(method, path, body, { retries = 0 } = {}) {
    const url = TARGET + path;
    const headers = this.authHeaders();
    const t0 = performance.now();
    let status = 0;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      status = res.status;
      const setCookies = res.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const [pair] = sc.split(";");
        const eq = pair.indexOf("=");
        if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
      // Drain body so the socket can be reused.
      await res.arrayBuffer().catch(() => {});
      // 429 during setup phases: back off and retry (registration buckets are IP-keyed).
      if (status === 429 && retries < 5) {
        await sleep(2000 * (retries + 1) + randInt(0, 1000));
        return this.req(method, path, body, { retries: retries + 1 });
      }
      return { status, ok: status >= 200 && status < 400 };
    } catch (e) {
      status = e.name === "AbortError" ? 599 : 598; // 599 = timeout, 598 = connection error
      return { status, ok: false, error: e.message };
    } finally {
      record(`${method} ${normalizePath(path)}`, performance.now() - t0, status);
    }
  }
}

// ---------------------------------------------------------------- scenario

const SAMPLE_ANSWERS = [
  "42", "The quick brown fox", "O(n log n)", "Paris",
  "function solve() { return true; }", "Mitochondria", "3.14159", "Blue",
];

// Response bodies are needed where the flow depends on returned ids
// (attempt start -> attemptId + questionIds), so a JSON variant exists
// alongside the plain req() used for fire-and-forget calls.
Student.prototype.reqJson = async function (method, path, body) {
  const url = TARGET + path;
  const headers = this.authHeaders();
  const t0 = performance.now();
  let status = 0, data = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    clearTimeout(timer);
    status = res.status;
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const text = await res.text().catch(() => "");
    try { data = JSON.parse(text); } catch { data = null; }
    if (status === 429) { await sleep(3000); return this.reqJson(method, path, body); }
    return { status, ok: status >= 200 && status < 400, data };
  } catch (e) {
    status = e.name === "AbortError" ? 599 : 598;
    return { status, ok: false, data: null };
  } finally {
    record(`${method} ${normalizePath(path)}`, performance.now() - t0, status);
  }
};

// Admin helper for the confirm-registration step.
async function adminReqJson(method, path, body) {
  const res = await fetch(TARGET + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, ok: res.status >= 200 && res.status < 400, data };
}

// Rewire the scenario to use reqJson where ids are needed.
async function runStudentFull(s) {
  // 1. user account
  let r = await s.reqJson("POST", "/api/auth/register", {
    username: s.tag, password: "LoadTest123!", email: `${s.tag}@loadtest.local`,
    fullName: `Load Test ${s.id}`, role: "participant",
  });
  if (!r.ok && r.status !== 409 && !(r.status === 400 && /already exists/i.test(JSON.stringify(r.data)))) return "register";

  // 2. user login -> Bearer <redacted> (the app authenticates via Authorization header)
  r = await s.reqJson("POST", "/api/auth/login", { username: s.tag, password: "LoadTest123!" });
  if (!r.ok || !r.data?.token) return "login";
  s.token = r.data.token;

  // 3. event registration (pending)
  r = await s.reqJson("POST", "/api/register", {
    eventId: EVENT_ID,
    organizerRollNo: `LT${SEED}${String(s.id).padStart(5, "0")}`,
    organizerName: `Load Test ${s.id}`,
    organizerEmail: `${s.tag}@loadtest.local`,
    organizerDept: "LOAD",
  });
  if (!r.ok && r.status !== 409 && r.status !== 400) return "event-register";
  const registrationId = r.data?.registration?.id;
  if (!registrationId) return "event-register";

  // 4. admin confirm -> event credentials (the REAL student journey; the
  //    stub-era flow skipped this and could never start an attempt)
  const conf = await adminReqJson("PATCH", `/api/registrations/${registrationId}/confirm`, {});
  if (!conf.ok) return "confirm";
  const creds = conf.data?.eventCredentials?.[0] || conf.data?.credentials?.[0];
  if (!creds?.eventUsername || !creds?.eventPassword) return "confirm";

  // 5. participant login with event credentials
  s.token = null;
  r = await s.reqJson("POST", "/api/auth/login", { username: creds.eventUsername, password: creds.eventPassword });
  if (!r.ok || !r.data?.token) return "participant-login";
  s.token = r.data.token;

  const start = await s.reqJson("POST", `/api/events/${EVENT_ID}/rounds/${ROUND_ID}/start`, {});
  // 400 "already have an attempt" happens on re-runs — treat as ok and skip.
  const attemptId = start.data?.attempt?.id || start.data?.id;
  if (!start.ok && start.status !== 400) return "start";
  if (!attemptId) return "start";

  // The start endpoint returns only the attempt; the client fetches the
  // question list separately (GET /api/rounds/:id/questions).
  const qlist = await s.reqJson("GET", `/api/rounds/${ROUND_ID}/questions`);
  const questionIds = (Array.isArray(qlist.data) ? qlist.data : qlist.data?.questions || []).map((q) => q.id || q.questionId);
  if (!questionIds.length) return "questions";

  const n = Math.min(QUESTIONS, questionIds.length || QUESTIONS);
  for (let q = 0; q < n; q++) {
    await sleep(randInt(2000, 9000));
    const qid = questionIds[q] || `q-${q}`;
    const answer = pick(SAMPLE_ANSWERS);
    await s.req("POST", `/api/attempts/${attemptId}/answers`, { questionId: qid, answer });
    if (rand() < 0.3) {
      await sleep(randInt(1500, 3000));
      await s.req("POST", `/api/attempts/${attemptId}/answers`, { questionId: qid, answer: answer + " (edited)" });
    }
    if (rand() < 0.05) {
      await s.req("POST", `/api/attempts/${attemptId}/violations`, {
        type: pick(["tab_switch", "copy_paste", "fullscreen_exit"]),
        details: "loadtest simulated",
      });
    }
  }
  const sub = await s.req("POST", `/api/attempts/${attemptId}/submit`, {});
  if (!sub.ok) return "submit";
  return "done";
}

// ---------------------------------------------------------------- runner

let completed = 0, failed = 0;
const failuresByStage = {};

async function main() {
  console.log(`Bootfete load test — target=${TARGET} students=${STUDENTS} ramp=${RAMP_S}s questions=${QUESTIONS} seed=${SEED}`);
  if (!ADMIN_USER || !ADMIN_PASS) {
    console.error("ERROR: --admin-user and --admin-pass (or LOADTEST_ADMIN_USER/PASS) are required: the real student journey needs admin confirm.");
    process.exit(2);
  }
  const al = await fetch(`${TARGET}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const abody = await al.json().catch(() => ({}));
  if (!al.ok || !abody.token) {
    console.error(`ERROR: admin login failed (${al.status}).`);
    process.exit(2);
  }
  ADMIN_TOKEN = abody.token;
  console.log("admin login ok");
  const t0 = performance.now();

  const tick = setInterval(() => {
    const el = ((performance.now() - t0) / 1000).toFixed(0);
    process.stdout.write(`\r[${el}s] completed=${completed} failed=${failed} ...`);
  }, 2000);

  const workers = [];
  for (let i = 0; i < STUDENTS; i++) {
    const s = new Student(i);
    // Stagger starts across the ramp window.
    const delay = SMOKE ? i * 200 : (RAMP_S * 1000 * i) / STUDENTS;
    workers.push(
      (async () => {
        await sleep(delay);
        try {
          const outcome = await runStudentFull(s);
          completed++;
          if (outcome !== "done") { failed++; failuresByStage[outcome] = (failuresByStage[outcome] || 0) + 1; }
        } catch {
          completed++; failed++;
          failuresByStage["exception"] = (failuresByStage["exception"] || 0) + 1;
        }
      })(),
    );
  }
  await Promise.all(workers);
  clearInterval(tick);
  process.stdout.write("\n");

  const totalS = (performance.now() - t0) / 1000;
  let totalReq = 0, totalErr = 0, total429 = 0;
  const allLat = [];
  console.log("\n================ RESULTS ================");
  console.log("endpoint".padEnd(46) + " reqs".padStart(7) + " errs".padStart(7) + " 429s".padStart(7) + " p50".padStart(8) + " p95".padStart(8) + " p99".padStart(8) + " max".padStart(8));
  for (const [ep, m] of [...metrics.entries()].sort()) {
    const lat = [...m.lat].sort((a, b) => a - b);
    totalReq += m.ok + m.err + m.err429; totalErr += m.err; total429 += m.err429;
    allLat.push(...m.lat);
    console.log(
      ep.padEnd(46) +
      String(m.ok + m.err + m.err429).padStart(7) +
      String(m.err).padStart(7) +
      String(m.err429).padStart(7) +
      String(Math.round(pct(lat, 50))).padStart(8) +
      String(Math.round(pct(lat, 95))).padStart(8) +
      String(Math.round(pct(lat, 99))).padStart(8) +
      String(Math.round(lat[lat.length - 1] || 0)).padStart(8),
    );
  }
  allLat.sort((a, b) => a - b);
  const errRate = totalReq ? ((totalErr / totalReq) * 100) : 0;
  console.log("-----------------------------------------------");
  console.log(`students: ${STUDENTS}  completed: ${completed}  failed journeys: ${failed}`);
  console.log(`failures by stage: ${JSON.stringify(failuresByStage)}`);
  console.log(`total requests: ${totalReq}  error rate: ${errRate.toFixed(2)}%  429s: ${total429}`);
  console.log(`throughput: ${(totalReq / totalS).toFixed(1)} req/s over ${totalS.toFixed(0)}s`);
  console.log(`overall latency ms: p50=${Math.round(pct(allLat, 50))} p95=${Math.round(pct(allLat, 95))} p99=${Math.round(pct(allLat, 99))} max=${Math.round(allLat[allLat.length - 1] || 0)}`);

  const pass = errRate < 1 && pct(allLat, 99) < 5000 && failed === 0;
  console.log(pass ? "\nPASS: error rate < 1%, p99 < 5s, all journeys completed." : "\nFAIL: thresholds breached — see breakdown above.");

  const report = {
    target: TARGET, students: STUDENTS, seed: SEED, durationS: Math.round(totalS),
    completed, failed, failuresByStage, totalReq, errRatePct: +errRate.toFixed(2),
    rps: +(totalReq / totalS).toFixed(1),
    latencyMs: { p50: Math.round(pct(allLat, 50)), p95: Math.round(pct(allLat, 95)), p99: Math.round(pct(allLat, 99)) },
    endpoints: Object.fromEntries([...metrics.entries()].map(([ep, m]) => {
      const lat = [...m.lat].sort((a, b) => a - b);
      return [ep, { reqs: m.ok + m.err + m.err429, errs: m.err, r429: m.err429, p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)) }];
    })),
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`loadtest-report-${Date.now()}.json`, JSON.stringify(report, null, 2));
  console.log("JSON report written to ./loadtest-report-<ts>.json");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("harness fatal:", e); process.exit(2); });
