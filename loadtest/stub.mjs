#!/usr/bin/env node
/**
 * Minimal stub of the Bootfete API used ONLY to validate the load-test
 * harness itself (loadtest/run.mjs). It is NOT a substitute for testing
 * against the real app + database.
 *
 * Implements just enough of the exam flow with realistic per-endpoint
 * delays: register, login (sets session cookie), event registration,
 * attempt start, answer saves, violations, submit.
 *
 * Usage: node loadtest/stub.mjs [port]
 */
import { createServer } from "node:http";

const PORT = parseInt(process.argv[2] || "5055", 10);
const users = new Map();    // username -> true (registered)
const sessions = new Set(); // session ids
let attemptSeq = 0;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, obj, cookie) => {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => {
      try { resolve(JSON.parse(buf || "{}")); } catch { resolve({}); }
    });
  });
const authed = (req) => {
  const m = /sympo\.sid=([^;]+)/.exec(req.headers.cookie || "");
  return m && sessions.has(m[1]);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const body = await readBody(req);

  // POST /api/auth/register — ~150ms (bcrypt-ish)
  if (req.method === "POST" && p === "/api/auth/register") {
    await delay(120 + Math.random() * 80);
    if (!body.username || !body.password || !body.email) return json(res, 400, { message: "All fields are required" });
    if (users.has(body.username)) return json(res, 409, { message: "exists" });
    users.set(body.username, true);
    return json(res, 201, { id: body.username });
  }

  // POST /api/auth/login — ~150ms, sets session cookie
  if (req.method === "POST" && p === "/api/auth/login") {
    await delay(120 + Math.random() * 80);
    if (!users.has(body.username)) return json(res, 401, { message: "Invalid credentials" });
    const sid = `sid-${body.username}-${Date.now()}`;
    sessions.add(sid);
    return json(res, 200, { ok: true }, `sympo.sid=${sid}; Path=/; HttpOnly`);
  }

  // POST /api/register — ~80ms (participant record + queued email)
  if (req.method === "POST" && p === "/api/register") {
    if (!authed(req)) return json(res, 401, { message: "Unauthorized" });
    await delay(60 + Math.random() * 60);
    return json(res, 200, { ok: true });
  }

  // POST /api/events/:eventId/rounds/:roundId/start — ~100ms (attempt insert)
  const startMatch = /^\/api\/events\/[^/]+\/rounds\/[^/]+\/start$/.exec(p);
  if (req.method === "POST" && startMatch) {
    if (!authed(req)) return json(res, 401, { message: "Unauthorized" });
    await delay(80 + Math.random() * 60);
    const attemptId = `attempt-${++attemptSeq}`;
    const questions = Array.from({ length: 25 }, (_, i) => ({ id: `q-${attemptId}-${i}` }));
    return json(res, 200, { attempt: { id: attemptId }, questions });
  }

  // POST /api/attempts/:id/answers — ~50ms (upsert)
  const ansMatch = /^\/api\/attempts\/[^/]+\/answers$/.exec(p);
  if (req.method === "POST" && ansMatch) {
    if (!authed(req)) return json(res, 401, { message: "Unauthorized" });
    await delay(30 + Math.random() * 50);
    if (!body.questionId || body.answer === undefined) return json(res, 400, { message: "Question ID and answer are required" });
    return json(res, 200, { ok: true });
  }

  // POST /api/attempts/:id/violations — ~40ms
  const vioMatch = /^\/api\/attempts\/[^/]+\/violations$/.exec(p);
  if (req.method === "POST" && vioMatch) {
    if (!authed(req)) return json(res, 401, { message: "Unauthorized" });
    await delay(25 + Math.random() * 40);
    return json(res, 200, { ok: true });
  }

  // POST /api/attempts/:id/submit — ~200ms (grading transaction)
  const subMatch = /^\/api\/attempts\/[^/]+\/submit$/.exec(p);
  if (req.method === "POST" && subMatch) {
    if (!authed(req)) return json(res, 401, { message: "Unauthorized" });
    await delay(150 + Math.random() * 150);
    return json(res, 200, { ok: true, score: 18 });
  }

  return json(res, 404, { message: "stub: not implemented" });
});

server.listen(PORT, () => console.log(`[stub] listening on http://localhost:${PORT}`));
