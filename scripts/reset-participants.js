import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function resetParticipantData() {
  console.log('=== Resetting Participant Data ===\n');
  
  try {
    // 1. Delete all team members
    const teamMembersResult = await sql`DELETE FROM team_members RETURNING id`;
    console.log(`✅ Deleted ${teamMembersResult.length} team members`);
    
    // 2. Delete all registrations
    const registrationsResult = await sql`DELETE FROM registrations RETURNING id`;
    console.log(`✅ Deleted ${registrationsResult.length} registrations`);
    
    // 3. Delete participant registry
    const registryResult = await sql`DELETE FROM participant_registry RETURNING id`;
    console.log(`✅ Deleted ${registryResult.length} participant registry entries`);
    
    // 4. Delete event credentials for participants
    const credentialsResult = await sql`DELETE FROM event_credentials RETURNING id`;
    console.log(`✅ Deleted ${credentialsResult.length} event credentials`);
    
    // 5. Delete participant users (keep admins)
    const usersResult = await sql`
      DELETE FROM users 
      WHERE role = 'participant' 
      RETURNING id, username
    `;
    console.log(`✅ Deleted ${usersResult.length} participant users`);
    
    // 6. Show remaining users (admins)
    const remainingUsers = await sql`
      SELECT id, username, role, full_name 
      FROM users 
      ORDER BY role, username
    `;
    
    console.log('\n=== Remaining Users (Admins) ===');
    remainingUsers.forEach(u => {
      console.log(`  - ${u.username} (${u.role}) - ${u.full_name}`);
    });
    
    console.log('\n✅ All participant data has been reset!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetParticipantData();
