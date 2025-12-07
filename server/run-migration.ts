import { neon } from '@neondatabase/serverless';
import "dotenv/config";

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
}

const sql = neon(process.env.DATABASE_URL);

async function runMigration() {
    try {
        console.log('Running migration: add-college-field.sql');

        // Execute ALTER TABLE command
        console.log('Adding organizer_college column...');
        await sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS organizer_college TEXT`;
        console.log('✅ Column added');

        // Execute CREATE INDEX command
        console.log('Creating index on organizer_college...');
        await sql`CREATE INDEX IF NOT EXISTS idx_registrations_college ON registrations(organizer_college)`;
        console.log('✅ Index created');

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
