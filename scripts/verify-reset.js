import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function verifyReset() {
  console.log('=== Verifying Database State ===\n');
  
  const registrations = await sql`SELECT COUNT(*) as count FROM registrations`;
  console.log(`Registrations: ${registrations[0].count}`);
  
  const teamMembers = await sql`SELECT COUNT(*) as count FROM team_members`;
  console.log(`Team Members: ${teamMembers[0].count}`);
  
  const participantRegistry = await sql`SELECT COUNT(*) as count FROM participant_registry`;
  console.log(`Participant Registry: ${participantRegistry[0].count}`);
  
  const eventCredentials = await sql`SELECT COUNT(*) as count FROM event_credentials`;
  console.log(`Event Credentials: ${eventCredentials[0].count}`);
  
  const participants = await sql`SELECT COUNT(*) as count FROM users WHERE role = 'participant'`;
  console.log(`Participant Users: ${participants[0].count}`);
  
  const allUsers = await sql`SELECT id, username, role FROM users ORDER BY role`;
  console.log(`\nAll Users (${allUsers.length}):`);
  allUsers.forEach(u => console.log(`  - ${u.username} (${u.role})`));
}

verifyReset().catch(console.error);
