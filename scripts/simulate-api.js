import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../shared/schema.js';
import { desc, eq, sql, inArray } from 'drizzle-orm';

const { registrations, events, teamMembers, eventAdmins } = schema;

const client = neon(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

async function simulateAPI() {
  try {
    const userId = '1d6bab4a-9e13-4616-bdbd-58e5bce458b7'; // ppadmin
    
    // Get events for this admin
    const adminEvents = await db.select({ eventId: eventAdmins.eventId })
      .from(eventAdmins)
      .where(eq(eventAdmins.adminId, userId));
    
    const eventIds = adminEvents.map(e => e.eventId);
    console.log('Event IDs:', eventIds);
    
    // Get all registrations
    const result = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .leftJoin(events, eq(registrations.eventId, events.id))
      .orderBy(desc(registrations.createdAt));

    // Fetch team members
    const registrationIds = result.map(r => r.registration.id);
    const allTeamMembers = registrationIds.length > 0
      ? await db.select().from(teamMembers).where(
        sql`${teamMembers.registrationId} IN (${sql.join(registrationIds.map(id => sql`${id}`), sql`, `)})`
      )
      : [];

    const allRegistrations = result.map(r => ({
      ...r.registration,
      event: r.event,
      teamMembers: allTeamMembers.filter(m => m.registrationId === r.registration.id)
    }));
    
    // Filter
    const relevantRegistrations = allRegistrations.filter(r => eventIds.includes(r.eventId));
    
    console.log('\n=== Relevant Registrations ===');
    relevantRegistrations.forEach(reg => {
      console.log(`\nID: ${reg.id}`);
      console.log(`Name: ${reg.organizerName}`);
      console.log(`Event: ${reg.event?.name}`);
      console.log(`Paper Topic: "${reg.paperTopic}"`);
      console.log(`Paper Topic type: ${typeof reg.paperTopic}`);
      console.log(`Paper Topic is null: ${reg.paperTopic === null}`);
      console.log(`Paper Topic is undefined: ${reg.paperTopic === undefined}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

simulateAPI();
