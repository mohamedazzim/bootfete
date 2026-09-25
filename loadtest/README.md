# Load testing Bootfete for 500 concurrent students

Pure Node.js (no dependencies) harness that drives the **real exam flow**:
`register → login → event registration → start attempt → answer loop
(debounced saves + edits + violations) → submit`.

## 1. Prepare the target

On the staging/production target you need:

1. One event with on-spot registration open.
2. One round with `status = in_progress`, `conductMedium = online`, and questions added.
3. The event/round UUIDs.

Each virtual student registers a fresh user (`loadtest-<seed>-<n>`), so the
target DB will contain load-test data afterwards — use a staging event, or
plan a cleanup.

## 2. Smoke test first

```bash
node loadtest/run.mjs --smoke \
  --target https://staging.example.com \
  --event-id <uuid> --round-id <uuid>
```

5 students, quick pass. Expect `PASS`.

## 3. The 500-student run

```bash
node loadtest/run.mjs \
  --target https://staging.example.com \
  --event-id <uuid> --round-id <uuid> \
  --students 500 --ramp 120 --questions 20 --seed 42
```

What this does:

- **Ramp (120s):** student starts are staggered across 2 minutes, mimicking
  real exam-day arrivals.
- **Answer loop:** each student "thinks" 2–9s per question, saves, 30% edit
  shortly after (exercises the debounced re-save path), ~5% post a violation.
- 20 questions × ~6s think ≈ 2–4 min active per student; 500 students ≈
  **100–160 sustained req/s** on the answers endpoint at peak.

Pass criteria (also the exit code): error rate < 1%, p99 latency < 5s,
zero failed journeys. A JSON report is written to `./loadtest-report-<ts>.json`.

## 4. What to watch during the run

- `GET /metrics` (Prometheus) and `GET /health` on the target.
- PM2: `pm2 monit` — heap per worker (restart cap is 1G), event loop lag.
- Database: active connections vs `DB_POOL_MAX` (default 20/worker × 2
  workers = 40). If you see `connectionTimeoutMillis` (10s) errors, raise
  `DB_POOL_MAX` — but stay under the Neon tier's connection limit.
- Redis: `INFO clients`, evictions; the rate limiters and Socket.IO adapter
  share it.
- nginx `error.log` for 502s (worker restarts).

## 5. Interpreting failures

| Symptom | Likely cause |
|---|---|
| 429s on `/api/auth/register` or `/api/register` | IP-keyed public limiter (100/15min). Registration at scale must happen **before** exam day, or raise the limit. The harness backs off and retries these. |
| 429s on answers/violations/submit | Per-student `examApiLimiter` (600/5min). Legit traffic is ~200/5min; 429s here mean a client bug or the limit needs raising. |
| 503s / timeouts on answers | DB pool exhausted or Neon tier limits. Raise `DB_POOL_MAX` (env) or scale the DB. |
| 502s from nginx | A PM2 worker crashed/restarted — check `logs/err.log`. |
| Login slowness (p99 > 2s) | bcrypt cost × 500 concurrent logins. Consider staggering exam start or caching. |

## 6. Capacity math (why 500 is fine on paper)

- Answer saves: 500 students × ~1 save/4s (think + debounce) ≈ **125 writes/s**.
  Each is a single indexed upsert — trivial for Postgres at 40 pooled connections.
- Login storm: 500 bcrypt verifies over the ramp window. At ~150ms each on
  one core, 2 workers absorb this in well under the ramp time.
- WebSocket: 500 concurrent sockets across 2 workers with the Redis adapter —
  well within Socket.IO's comfort zone.
- The binding constraint is usually the **database tier's connection limit**,
  not the app. Size `DB_POOL_MAX` so that `workers × DB_POOL_MAX` <
  `database max connections`, leaving headroom for migrations/admin.

## 7. Pre-exam checklist

- [ ] `npm run db:indexes` applied on the production database
- [ ] Redis reachable from all workers (rate limiters + Socket.IO fall back
      to memory otherwise, which breaks limits across workers)
- [ ] nginx in front with `ip_hash`, port 3000 firewalled (see
      `deploy/nginx.conf.example`)
- [ ] `pm2 reload` (not restart) for zero-downtime deploys — the app drains
      connections on SIGTERM (up to 15s; `kill_timeout` is 20s)
- [ ] Run this load test against staging at 500 students; keep the JSON report
