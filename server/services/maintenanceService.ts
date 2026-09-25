import { db } from "../db";
import { sql } from "drizzle-orm";

// Round-2 M1+M7: scheduled maintenance jobs. Deliberately no node-cron
// dependency — a single daily timer started once from server/index.ts.
// Every job is idempotent (conditional DELETE/UPDATE), so overlapping runs
// (PM2 multi-instance, rolling reloads, the jittered first run) converge
// instead of corrupting.

const DAY_MS = 24 * 60 * 60 * 1000;

function affectedCount(result: unknown): number {
  return Array.isArray(result) ? result.length : 0;
}

// M1: pending registrations older than 48h never get confirmed — they sit
// in the admin queue forever and (via the partial unique on
// event_id+organizer_roll_no excluding only 'cancelled') block the student
// from re-registering. Cancel them so the slot frees up.
async function cancelStalePendingRegistrations(): Promise<void> {
  const rows = await db.execute(sql`
    UPDATE registrations
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours'
    RETURNING id
  `);
  const n = affectedCount(rows);
  if (n > 0) console.log(`[maintenance] cancelled ${n} stale pending registration(s)`);
}

// M7: audit_logs / email_logs grow unbounded (one row per admin action and
// per sent email). 90-day retention keeps compliance usefulness without
// letting the tables bloat past their indexes.
async function purgeOldLogs(): Promise<void> {
  const auditRows = await db.execute(sql`
    DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days' RETURNING id
  `);
  const emailRows = await db.execute(sql`
    DELETE FROM email_logs WHERE sent_at < NOW() - INTERVAL '90 days' RETURNING id
  `);
  const a = affectedCount(auditRows);
  const e = affectedCount(emailRows);
  if (a > 0 || e > 0) console.log(`[maintenance] purged ${a} audit log(s), ${e} email log(s) older than 90 days`);
}

async function runAll(): Promise<void> {
  try {
    await cancelStalePendingRegistrations();
  } catch (err) {
    console.error("[maintenance] stale-pending sweep failed:", err);
  }
  try {
    await purgeOldLogs();
  } catch (err) {
    console.error("[maintenance] log retention purge failed:", err);
  }
}

export function startMaintenanceScheduler(): { stop: () => void } {
  // Jitter the first run so a PM2 fleet doesn't stampede the DB at boot.
  const initialDelayMs = Math.floor(Math.random() * 60) * 60 * 1000;
  let interval: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void runAll();
    interval = setInterval(() => void runAll(), DAY_MS);
    interval.unref?.();
  }, initialDelayMs);
  first.unref?.();
  console.log("[maintenance] scheduler started (daily: stale-pending cancel + 90d log retention)");
  return {
    stop() {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    },
  };
}
