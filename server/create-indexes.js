
import { neon } from '@neondatabase/serverless';
import "dotenv/config";

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    console.log('Starting index creation...');
    try {
        console.log('Creating idx_answers_attempt_id...');
        await sql`CREATE INDEX IF NOT EXISTS idx_answers_attempt_id ON answers(attempt_id)`;

        console.log('Creating idx_test_attempts_round_id...');
        await sql`CREATE INDEX IF NOT EXISTS idx_test_attempts_round_id ON test_attempts(round_id)`;

        console.log('Creating idx_registrations_email...');
        await sql`CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(organizer_email)`;

        console.log('All indexes created successfully!');
    } catch (err) {
        console.error('Error creating indexes:', err);
        process.exit(1);
    }
}

run();
