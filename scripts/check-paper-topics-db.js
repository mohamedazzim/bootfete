import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function checkPaperTopics() {
  try {
    const result = await sql`
      SELECT id, organizer_name, organizer_email, paper_topic, event_id 
      FROM registrations 
      LIMIT 10
    `;
    
    console.log('Registration records:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

checkPaperTopics();
