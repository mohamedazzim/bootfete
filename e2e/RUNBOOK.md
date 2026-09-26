# Bootfete Staging Production-Readiness Runbook

Goal: prove `main@d26d8e2` is safe for 500 simultaneous students **before**
touching production. Do every step on a staging host + staging Neon DB first.

---

## 1. Provision a staging Neon database

1. In the Neon console, create a **new project** (or a branch of the prod
   project — a branch is cheaper and gives you prod-like data for the
   duplicate checks in §2).
2. Copy the pooled connection string. It must include `?sslmode=require`.
3. On the staging host, set:
   ```bash
   export DATABASE_URL='postgresql://...@.../bootfete_staging?sslmode=require'
   export JWT_SECRET='<long-random-value>'   # REQUIRED in production mode
   export NODE_ENV=production
   export PORT=3000
   ```
   The app **fails fast at boot** if `JWT_SECRET` is unset in production —
   that is intentional (round-2 C1).

## 2. Run migration 001 against staging

The migration converts all 39 timestamp columns to `timestamptz` and adds the
round-2 unique constraints / checks:

```bash
psql "$DATABASE_URL" -f server/migrations/001_timestamptz_and_constraints.sql
```

### 2a. UTC-assumption check (do BEFORE the migration on prod-like data)

The migration interprets existing `timestamp` values as UTC
(`USING col AT TIME ZONE 'UTC'`). If the legacy data was written in IST
(or the server wrote local time), every exam timer shifts by 5:30.
Verify on staging first:

```sql
-- Pick a known event: compare a stored timestamp against wall-clock reality.
SELECT id, name, started_at, now() FROM test_attempts ORDER BY started_at DESC LIMIT 3;
SELECT id, name, start_time, end_time FROM events ORDER BY created_at DESC LIMIT 3;
```

If the stored times read as UTC but the events actually happened at IST
wall-clock, stop — the assumption is wrong and the `USING` clause needs the
real zone (e.g. `AT TIME ZONE 'Asia/Kolkata'`).

### 2b. Duplicate-data failures

The migration fails loudly (no silent partial apply) if existing rows violate
the new unique constraints. The usual suspects and how to find them:

```sql
-- H7: registrations unique (event_id, organizer_roll_no) — includes cancelled rows
SELECT event_id, organizer_roll_no, count(*) FROM registrations
GROUP BY 1,2 HAVING count(*) > 1;

-- H6: event_credentials unique (participant_user_id, event_id)
SELECT participant_user_id, event_id, count(*) FROM event_credentials
GROUP BY 1,2 HAVING count(*) > 1;

-- M2: questions unique (round_id, question_number)
SELECT round_id, question_number, count(*) FROM questions
GROUP BY 1,2 HAVING count(*) > 1;

-- M2: rounds unique (event_id, round_number)
SELECT event_id, round_number, count(*) FROM rounds
GROUP BY 1,2 HAVING count(*) > 1;

-- M2: event_winners unique (event_id, position) and (event_id, participant_user_id)
SELECT event_id, position, count(*) FROM event_winners GROUP BY 1,2 HAVING count(*) > 1;

-- M2: event_admins unique (event_id, admin_id)
SELECT event_id, admin_id, count(*) FROM event_admins GROUP BY 1,2 HAVING count(*) > 1;

-- M2: team_members unique (registration_id, member_roll_no)
SELECT registration_id, member_roll_no, count(*) FROM team_members
GROUP BY 1,2 HAVING count(*) > 1;
```

Resolve by deleting/merging the genuinely duplicate rows (keep the newest),
then re-run the migration. **Never** `DELETE` blindly on prod — do this on
the staging branch first and replay the exact statements.

## 3. Deploy the app on staging

```bash
git clone https://github.com/mohamedazzim/bootfete.git && cd bootfete
git checkout d26d8e2        # or: git checkout main && git pull (verify d26d8e2)
npm ci
npm run build              # vite + esbuild; must exit 0
pm2 start ecosystem.config.cjs
pm2 logs bootfete --lines 40   # confirm "listening", no boot errors
curl -s http://localhost:3000/api/health
# -> {"status":"ok","message":"BootFete 2K26 API is running","config":{"appUrl":true,"senderEmail":true,"gaps":[]}}
# (status is "degraded" with gaps listed when APP_URL/SENDER_EMAIL are unset)
```

Notes:
- PM2 runs 2 cluster workers on port 3000; put nginx in front with
  `ip_hash` sticky sessions for Socket.IO (see `deploy/nginx.conf.example`).
- `app.set('trust proxy', 1)` is on — port 3000 must **not** be directly
  reachable from the internet; only nginx may talk to it.
- If Redis is configured, confirm the adapter connects (watch for
  reconnect logs); without Redis the app still runs single-host.

## 4. Seed the super_admin (staging only)

`npm run db:seed` **wipes all tables first** — only ever run it on a fresh
staging DB, never on prod.

```bash
npm run db:seed
# creates superadmin / Azzi@03 — change the password immediately afterwards
# via the dashboard or: UPDATE users SET password='<bcrypt-hash>' WHERE username='superadmin';
```

## 5. Run the E2E exam-flow test

```bash
E2E_BASE_URL=https://<staging-host> \
E2E_ADMIN_USER=superadmin \
E2E_ADMIN_PASS='<current-password>' \
npm run test:e2e
```

What it proves (each step prints PASS/FAIL, non-zero exit on failure):
- health, admin login, event/round/question creation, public registration,
  confirm → event credentials, round start, participant login, attempt start
  (duplicate start → 400, not 500)
- single + bulk answer saves persist; violation logged and same-type repeat
  deduped within 5s; answer save rejected while round paused (403)
- **pause → resume shifts `startedAt` forward** (H-13) by ~the pause duration
- submit grades 2/3 (one deliberately wrong answer); second submit → 400
  idempotent; post-submit save → 400; leaderboard shows score 2
- the test event is deleted afterwards (try/finally), so reruns are clean

Two deliberate deviations from the naive script, both verified against
`server/routes.ts`:
- Registration + confirm happen **before** round start, so the round-start
  auto-enable of test access covers the participant's credentials.
- The `startedAt` shift is asserted after **resume**, not pause — the server
  computes the shift from `round.updatedAt` at resume time.

## 6. 500-student load test

Only after E2E is green. From `loadtest/README.md`:

```bash
node loadtest/run.mjs \
  --target https://<staging-host> \
  --event-id <uuid> \
  --round-id <uuid> \
  --students 500 \
  --ramp 120 \
  --questions 20
```

Create the event/round on staging first (dashboard or API) and pass their
IDs. This exercises the real attempt-start response shape — the harness was
validated against a stub, so the first staging run also validates the harness
itself.

**Abort thresholds** (stop the run, investigate, do not proceed to prod):
- any 5xx rate > 0.1% sustained
- p95 latency on answer-save > 2s
- PM2 worker restarts or OOM (`pm2 monit`, `max_memory_restart: 1G`)
- Neon: connection count pinned at pool max, or "too many clients" errors

## 7. What to monitor during the runs

| Signal | Where | Healthy |
|---|---|---|
| 5xx rate | app logs / nginx access log | 0 sustained |
| p95 latency (answers, submit) | nginx `$request_time` or APM | < 2s |
| DB pool saturation | Neon dashboard + `DB_POOL_MAX` (default 20/worker) | well under max |
| PM2 restarts | `pm2 list` / `pm2 logs` | 0 |
| Socket.IO reconnect storms | app logs | brief, self-healing |
| Email queue depth | queueService logs | drains, no unbounded growth |
| Disk (uploads, logs) | host | not filling |

## 8. Rollback

If staging misbehaves, redeploy the last known-good commit:

```bash
cd bootfete
git fetch origin
git checkout f2a8094          # pre-round-2 main
npm ci && npm run build
pm2 reload bootfete           # zero-downtime rolling restart (kill_timeout 20s)
```

Then diagnose on staging before re-attempting. Do **not** roll the migration
backwards on prod without a tested down-migration — the `timestamptz`
conversion is one-way in practice; the rollback above is code-only and is
safe because the old code reads `timestamptz` columns fine (it just interprets
them the old way).

## 9. Prod go/no-go checklist

- [ ] Migration 001 executed on prod DB, UTC assumption verified (§2a)
- [ ] Duplicate-data conflicts resolved (§2b)
- [ ] E2E green on staging (`npm run test:e2e`)
- [ ] 500-student load test green on staging (§6 thresholds)
- [ ] nginx `ip_hash` + TLS in front; port 3000 not publicly reachable
- [ ] `JWT_SECRET`, `DATABASE_URL`, Redis URL set in prod env
- [ ] Seed admin password changed; PATs revoked
- [ ] Rollback command (§8) tested once on staging
- [ ] Someone watching the monitors (§7) during the first live exam
