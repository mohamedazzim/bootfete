import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function check() {
  // Find ppadmin user
  const user = await sql`SELECT id, username, role FROM users WHERE username = 'ppadmin'`;
  console.log('User:', user);
  
  if (user.length > 0) {
    // Find their events
    const events = await sql`SELECT * FROM event_admins WHERE admin_id = ${user[0].id}`;
    console.log('\nEvents managed by ppadmin:', events);
    
    // Check if Test 09's event is in the list
    const testEvent = await sql`SELECT event_id FROM registrations WHERE id = 'b5a37fb2-7863-4555-8795-21c5189cd181'`;
    console.log('\nTest 09 event ID:', testEvent);
    
    const eventIds = events.map(e => e.event_id);
    console.log('\nDoes ppadmin manage Test 09 event?', eventIds.includes(testEvent[0]?.event_id));
  }
  
  process.exit(0);
}

check();
