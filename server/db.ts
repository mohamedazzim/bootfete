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

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
