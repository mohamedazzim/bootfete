/**
 * Department Limit Verification Script
 * 
 * Verifies that the department limit implementation is working correctly
 * Run with: npx tsx server/verify-department-limit.ts
 */

import { neon } from '@neondatabase/serverless';
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('🔍 Department Limit Implementation Verification');
  console.log('==============================================\n');
  
  // Check 1: Verify indexes exist
  console.log('✓ Check 1: Database Indexes');
  const indexes = await sql`
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE tablename IN ('registrations', 'team_members')
    AND indexname LIKE '%dept%'
    ORDER BY tablename, indexname
  `;
  
  console.log(`  Found ${indexes.length} department-related indexes:`);
  indexes.forEach((idx: any) => {
    console.log(`  - ${idx.indexname} on ${idx.tablename}`);
  });
  
  if (indexes.length < 2) {
    console.log('  ⚠️  Expected at least 2 indexes');
  }
  
  // Check 2: Verify data normalization
  console.log('\n✓ Check 2: Department Name Normalization');
  const depts = await sql`
    SELECT DISTINCT organizer_dept 
    FROM registrations 
    WHERE organizer_dept IS NOT NULL
    LIMIT 10
  `;
  
  console.log(`  Sample departments (should be uppercase):`);
  depts.forEach((d: any) => {
    const isNormalized = d.organizer_dept === d.organizer_dept.toUpperCase().trim();
    console.log(`  ${isNormalized ? '✅' : '❌'} "${d.organizer_dept}"`);
  });
  
  // Check 3: Count departments and participants
  console.log('\n✓ Check 3: Department Participant Counts');
  const counts = await sql`
    SELECT dept, COUNT(DISTINCT roll_no) as count
    FROM (
      SELECT organizer_dept as dept, organizer_roll_no as roll_no
      FROM registrations WHERE status IN ('confirmed', 'pending')
      UNION ALL
      SELECT tm.member_dept, tm.member_roll_no
      FROM team_members tm
      INNER JOIN registrations r ON tm.registration_id = r.id
      WHERE r.status IN ('confirmed', 'pending')
    ) combined
    GROUP BY dept
    ORDER BY count DESC
    LIMIT 10
  `;
  
  console.log('  Top departments by participant count:');
  counts.forEach((c: any) => {
    const status = c.count > 10 ? '🔴 VIOLATION' : c.count === 10 ? '🟡 AT LIMIT' : '✅ OK';
    console.log(`  ${status} ${c.dept}: ${c.count} participants`);
  });
  
  const violations = counts.filter((c: any) => c.count > 10);
  
  // Check 4: Verify no violations
  console.log('\n✓ Check 4: Department Limit Violations');
  if (violations.length === 0) {
    console.log('  ✅ No departments exceed 10 participants');
  } else {
    console.log(`  ❌ Found ${violations.length} department(s) exceeding limit:`);
    violations.forEach((v: any) => {
      console.log(`     - ${v.dept}: ${v.count} participants`);
    });
  }
  
  // Check 5: Test query performance
  console.log('\n✓ Check 5: Query Performance');
  const startTime = Date.now();
  await sql`
    SELECT * FROM registrations 
    WHERE status IN ('confirmed', 'pending') 
    AND UPPER(TRIM(organizer_dept)) = 'CSE (III)'
  `;
  const duration = Date.now() - startTime;
  
  console.log(`  Query execution time: ${duration}ms`);
  if (duration < 100) {
    console.log('  ✅ Performance is good (< 100ms)');
  } else {
    console.log('  ⚠️  Performance could be better (> 100ms)');
  }
  
  // Summary
  console.log('\n==============================================');
  console.log('📊 Verification Summary:');
  console.log(`  Indexes: ${indexes.length >= 2 ? '✅' : '⚠️'} `);
  console.log(`  Normalization: ${depts.every((d: any) => d.organizer_dept === d.organizer_dept.toUpperCase()) ? '✅' : '⚠️'}`);
  console.log(`  Violations: ${violations.length === 0 ? '✅' : '❌'} (${violations.length} found)`);
  console.log(`  Performance: ${duration < 100 ? '✅' : '⚠️'} (${duration}ms)`);
  
  if (violations.length === 0 && indexes.length >= 2) {
    console.log('\n✅ All checks passed! Department limit is working correctly.');
  } else {
    console.log('\n⚠️  Some issues detected. Review the output above.');
  }
}

main().catch(error => {
  console.error('💥 Error:', error);
  process.exit(1);
});
