import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function checkPaperTopics() {
  try {
    const results = await sql`
      SELECT id, organizer_name, organizer_roll_no, paper_topic, created_at 
      FROM registrations 
      WHERE paper_topic IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    console.log('=== Registrations with Paper Topics ===\n');
    
    if (results.length === 0) {
      console.log('No registrations with paper topics found.');
    } else {
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.organizer_name} (${r.organizer_roll_no})`);
        console.log(`   Topic: ${r.paper_topic}`);
        console.log(`   Created: ${r.created_at}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPaperTopics();
