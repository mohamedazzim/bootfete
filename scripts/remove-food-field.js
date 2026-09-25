import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function removeFoodFieldFromForm() {
  // Get the current form
  const forms = await sql`SELECT id, form_fields FROM registration_forms LIMIT 1`;
  
  if (forms.length === 0) {
    console.log('No forms found');
    return;
  }
  
  const form = forms[0];
  const fields = form.form_fields;
  
  console.log('Current fields:', fields.length);
  
  // Filter out the Food Preference field
  const filteredFields = fields.filter(f => !f.label.toLowerCase().includes('food'));
  
  console.log('After removing food field:', filteredFields.length);
  
  // Update the form
  await sql`UPDATE registration_forms SET form_fields = ${JSON.stringify(filteredFields)} WHERE id = ${form.id}`;
  
  console.log('✅ Food Preference field removed from form configuration');
}

removeFoodFieldFromForm().catch(console.error);
