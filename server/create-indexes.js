// DB-05: index runner. The index definitions live in db-indexes.sql and
// add-performance-indexes.sql (both idempotent: CREATE INDEX IF NOT EXISTS).
// Previously this file created only 3 hardcoded indexes and was wired to no
// npm script, so the SQL files may never have run in production.
//
// Usage: npm run db:indexes   (requires DATABASE_URL)
// Safe to re-run: every statement uses IF NOT EXISTS.
import { neon } from '@neondatabase/serverless';
import "dotenv/config";
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const INDEX_FILES = ['db-indexes.sql', 'add-performance-indexes.sql'];

function statementsFromFile(path) {
    const raw = readFileSync(path, 'utf8');
    // Drop full-line comments, then split into individual statements.
    const withoutComments = raw
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
    return withoutComments
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

async function run() {
    console.log('Starting index creation...');
    let applied = 0;
    let failed = 0;
    for (const file of INDEX_FILES) {
        const path = join(__dirname, file);
        const statements = statementsFromFile(path);
        console.log(`\n${file}: ${statements.length} statements`);
        for (const stmt of statements) {
            const name = (stmt.match(/INDEX IF NOT EXISTS (\S+)/i) || [])[1] || stmt.slice(0, 60);
            try {
                await sql.query(stmt);
                applied++;
                console.log(`  ok: ${name}`);
            } catch (err) {
                // IF NOT EXISTS handles the already-created case; anything
                // else is reported but doesn't abort the remaining indexes.
                console.error(`  FAILED: ${name}: ${err.message}`);
                failed++;
            }
        }
    }
    console.log(`\nDone. applied=${applied} failed=${failed}`);
    if (failed > 0) process.exit(1);
}

run();
