# Next Development Phase — Pending Work

> Last updated: 2026-09-25. Baseline: main @ `b5b6293` — all prior audit fixes, test-module
> (fill_blank / image question) support, and session-merge work completed and verified
> (typecheck clean, build clean, 67/67 unit tests green).

## 1. Verification (do first)

- [ ] **Re-run the Playwright E2E suite** (`npx playwright test`, 20 tests) — it has not been
      re-run since the GitHub history merge and the fill_blank changes. Unit tests pass, but
      E2E is the stronger gate for regression detection.
- [ ] **Add automated test coverage for fill_blank and image questions** — currently only
      exercised manually through the UI. Cover: authoring (create/edit), participant
      rendering, exact-match case-insensitive auto-grading, and answer masking.

## 2. Security

- [ ] **Rotate the Neon DB password and SMTP account password** — the old values remain in
      git history on GitHub (`.env` was tracked before it was untracked in `dc24448`).
- [ ] **Set a real JWT secret** — `.env` still uses the placeholder
      `your-super-secret-jwt-key-change-in-production`. Use a 64-hex random value.
- [ ] **Scrub `.replit`** — may still contain plaintext Neon DB credentials while tracked.

## 3. Listed-but-unfixed findings (from the persona-wise audit)

- [ ] Department limit hardcoded to `10` in `storage.ts` — should read the admin-configured
      setting instead.
- [ ] `/api/upload/question-image` is not scoped to the admin's assigned event — enforce
      event-admin access checks.
- [ ] No SMTP health dashboard for Super Admin (provider quota / delivery status).
- [ ] No bulk-void of test attempts (Super Admin).
- [ ] Department free-text entry splits quota buckets — normalize department names at input.

## 4. Ops / infrastructure

- [ ] Configure Redis (currently absent) — blocks Socket.io clustering, shared sessions, and
      a green `/health`.
- [ ] Deployment pre-flight: Nginx WebSocket upgrade headers + HTTPS, PM2
      `ecosystem.config.cjs` port alignment, confirm Neon PITR backups.
- [ ] Code-split the frontend bundle (1.16 MB / 305 kB gzip) — use dynamic `import()` or
      Vite `manualChunks`.
- [ ] Split `server/routes.ts` (~8k-line monolith) into domain routers
      (auth / events / rounds / registrations / proctoring).

## 5. Documentation

- [ ] Update `README.md` and `docs/DATABASE_STRUCTURE.md` — both reference deprecated schema
      (e.g., the removed `selected_events` array).
- [ ] Document the question-type model: `mcq`, `true_false`, `short_answer`, `coding`,
      `image_mcq`, `image_text`, `fill_blank` — grading rules (exact-match, case-insensitive,
      `question.points` respected) and the answer-masking invariant (participants never
      receive `correctAnswer`/`expectedOutput`/`testCases` until results are published).
