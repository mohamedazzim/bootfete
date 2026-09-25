import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function checkFormFields() {
  const results = await sql`SELECT id, title, form_fields FROM registration_forms LIMIT 1`;
  console.log('=== Registration Form Fields ===\n');
  if (results.length > 0) {
    console.log('Form:', results[0].title);
    console.log('\nFields:');
    const fields = results[0].form_fields;
    fields.forEach((f, i) => {
      console.log(`${i + 1}. ${f.label} (id: ${f.id}, type: ${f.type})`);
    });
  }
}

checkFormFields().catch(console.error);
