import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function check() {
  const result = await sql`
    SELECT 
      r.id,
      r.organizer_name,
      r.event_id,
      r.paper_topic,
      e.name as event_name
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    WHERE r.id = 'b5a37fb2-7863-4555-8795-21c5189cd181'
  `;
  
  console.log('Raw DB result for Test 09:');
  console.log(JSON.stringify(result, null, 2));
  
  // Simulate what the API does
  const registration = result[0];
  const apiResponse = {
    id: registration.id,
    eventName: registration.event_name,
    paperTopic: registration.paper_topic || null,
  };
  
  console.log('\nWhat API should return:');
  console.log(JSON.stringify(apiResponse, null, 2));
  
  process.exit(0);
}

check();
