/**
 * Department Limit Migrations Runner
 * 
 * Executes SQL migration files directly against Neon PostgreSQL database
 * Run with: npx tsx server/run-department-migrations.ts
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL!);

async function runMigration(name: string, filePath: string) {
  console.log(`\n📦 Running migration: ${name}`);
  console.log(`   File: ${filePath}`);
  
  try {
    const sqlContent = readFileSync(filePath, 'utf-8');
    
    // Remove all comments first
    const cleanedSQL = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    // Split by semicolons and execute each statement
    const statements = cleanedSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`   Statements to execute: ${statements.length}`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (!statement || statement.length === 0) continue;
      
      try {
        console.log(`   ⏳ Executing statement ${i + 1}/${statements.length}...`);
        await sql(statement);
        console.log(`   ✅ Statement ${i + 1}/${statements.length} completed`);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
          console.log(`   ⚠️  Statement ${i + 1}/${statements.length} skipped (already exists)`);
        } else {
          console.error(`   ❌ Statement ${i + 1}/${statements.length} failed:`);
          console.error(`      ${error.message}`);
          console.error(`      SQL: ${statement.substring(0, 100)}...`);
          throw error;
        }
      }
    }
    
    console.log(`✅ Migration "${name}" completed successfully`);
    return true;
  } catch (error: any) {
    console.error(`❌ Migration "${name}" failed:`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Department Limit Migrations Runner');
  console.log('=====================================\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable is not set');
    console.error('   Please check your .env file');
    process.exit(1);
  }
  
  console.log('🔗 Database URL found');
  console.log(`   Host: ${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);
  
  const migrations = [
    {
      name: 'Add Department Limit Indexes',
      file: join(process.cwd(), 'server', 'migrations', 'add-department-limit-indexes.sql')
    },
    {
      name: 'Normalize Department Data',
      file: join(process.cwd(), 'server', 'migrations', 'normalize-department-data.sql')
    }
  ];
  
  let allSuccess = true;
  
  for (const migration of migrations) {
    const success = await runMigration(migration.name, migration.file);
    if (!success) {
      allSuccess = false;
      break;
    }
  }
  
  console.log('\n=====================================');
  if (allSuccess) {
    console.log('✅ All migrations completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Build the application: npm run build');
    console.log('2. Deploy/restart server: pm2 restart ecosystem.config.cjs');
    console.log('3. Verify deployment using post-deployment checklist');
    process.exit(0);
  } else {
    console.log('❌ Some migrations failed');
    console.log('   Please check errors above and try again');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
