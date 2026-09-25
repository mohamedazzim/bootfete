import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function check() {
  const event = await sql`SELECT id, name FROM events WHERE id = '2d00598b-8810-4b3f-9395-60b0f090b4b7'`;
  console.log('Event:', event);
  process.exit(0);
}

check();
