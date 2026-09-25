import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../shared/schema.js';
import { desc, eq, sql } from 'drizzle-orm';

const { registrations, events, teamMembers } = schema;

const client = neon(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

async function testGetRegistrations() {
  try {
    const result = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .leftJoin(events, eq(registrations.eventId, events.id))
      .orderBy(desc(registrations.createdAt));

    // Fetch team members for each registration
    const registrationIds = result.map(r => r.registration.id);
    const allTeamMembers = registrationIds.length > 0
      ? await db.select().from(teamMembers).where(
        sql`${teamMembers.registrationId} IN (${sql.join(registrationIds.map(id => sql`${id}`), sql`, `)})`
      )
      : [];

    const final = result.map(r => ({
      ...r.registration,
      event: r.event,
      teamMembers: allTeamMembers.filter(m => m.registrationId === r.registration.id)
    }));

    console.log('\n=== Final Result ===');
    final.forEach(reg => {
      console.log(`\nID: ${reg.id}`);
      console.log(`Name: ${reg.organizerName}`);
      console.log(`Paper Topic: ${reg.paperTopic}`);
      console.log(`Event: ${reg.event?.name}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

testGetRegistrations();
