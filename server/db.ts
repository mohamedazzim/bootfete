import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool: PgPool } = pg;
import ws from 'ws';
import * as schema from '@shared/schema';
import "dotenv/config";
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

// H-02: the neon-serverless Pool driver (WebSocket-based) supports real
// transactions via db.transaction(), which the neon-http driver lacks.
// This is what makes the multi-write flows in storage.ts atomic.
neonConfig.webSocketConstructor = ws;

// TEST-ONLY local mode (e2e/harness branch): the Neon serverless driver
// speaks WebSocket to Neon's proxy and cannot connect to a vanilla
// Postgres. When LOCAL_DATABASE_URL is set, use node-postgres against a
// regular Postgres instead. All SQL in storage.ts/routes.ts is
// driver-agnostic (incl. pg_advisory_xact_lock); production always uses
// the Neon path below. The two drizzle instances expose the same query
// builder API, so storage.ts needs no changes.
const useLocal = !!process.env.LOCAL_DATABASE_URL;

if (!useLocal && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Ensure the database is provisioned.');
}

const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
const poolConnTimeout = parseInt(process.env.DB_POOL_TIMEOUT_MS || '10000', 10);
const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pool: any = useLocal
  ? new PgPool({
      connectionString: process.env.LOCAL_DATABASE_URL,
      max: poolMax,
      connectionTimeoutMillis: poolConnTimeout,
      idleTimeoutMillis: poolIdleTimeout,
    })
  : new NeonPool({
      connectionString: process.env.DATABASE_URL,
      // PROD-SCALE: pool size must cover (PM2 instances x peak concurrent
      // queries) without exhausting the database's connection limit.
      // 2 workers x 20 = 40 connections default; raise via DB_POOL_MAX if the
      // database allows more, lower it on small Neon tiers.
      max: poolMax,
      // Fail fast when the pool is exhausted instead of hanging the request
      // forever behind a growing queue.
      connectionTimeoutMillis: poolConnTimeout,
      // Close idle connections so a stale/broken socket can't linger.
      idleTimeoutMillis: poolIdleTimeout,
    });

// An idle-client error (e.g. the database killed a connection) must not
// crash the process — log it and let the pool replace the client.
pool.on('error', (err: Error) => {
  console.error('[db] pool idle client error:', err.message);
});

// Keep the exported type identical to the production (Neon) drizzle
// instance so the rest of the codebase type-checks unchanged; the
// node-postgres instance exposes the same query-builder API at runtime.
const neonDb = drizzleNeon(pool, { schema });
type AppDb = typeof neonDb;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: AppDb = (useLocal
  ? drizzlePg(pool, { schema })
  : neonDb) as unknown as AppDb;

if (useLocal) {
  console.log('[db] LOCAL_DATABASE_URL set — using node-postgres (TEST-ONLY mode)');
}
