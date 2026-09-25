import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '@shared/schema';
import "dotenv/config";
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

// H-02: the neon-serverless Pool driver (WebSocket-based) supports real
// transactions via db.transaction(), which the neon-http driver lacks.
// This is what makes the multi-write flows in storage.ts atomic.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set. Ensure the database is provisioned.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // PROD-SCALE: pool size must cover (PM2 instances x peak concurrent
  // queries) without exhausting the database's connection limit.
  // 2 workers x 20 = 40 connections default; raise via DB_POOL_MAX if the
  // database allows more, lower it on small Neon tiers.
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // Fail fast when the pool is exhausted instead of hanging the request
  // forever behind a growing queue.
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_TIMEOUT_MS || '10000', 10),
  // Close idle connections so a stale/broken socket can't linger.
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
});

// An idle-client error (e.g. the database killed a connection) must not
// crash the process — log it and let the pool replace the client.
pool.on('error', (err) => {
  console.error('[db] pool idle client error:', err.message);
});

export const db = drizzle(pool, { schema });
