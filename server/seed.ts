import { db } from './db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  users,
  symposiums,
  events,
  eventAdmins,
  rounds,
  questions,
  participants,
  testAttempts,
  answers,
  registrationForms,
  registrations,
  eventCredentials,
  auditLogs
} from '@shared/schema';

async function clearDatabase() {
  console.log('Clearing existing data...');

  // Delete from child tables first (respecting FK order if any)
  await db.delete(answers);
  await db.delete(testAttempts);
  await db.delete(eventCredentials);
  await db.delete(participants);
  await db.delete(questions);
  await db.delete(rounds);
  await db.delete(eventAdmins);
  await db.delete(registrations);
  await db.delete(registrationForms);
  await db.delete(events);
  await db.delete(auditLogs);
  await db.delete(users);
  // Multi-tenancy (Phase 1): symposiums parent users and events, both
  // already deleted above.
  await db.delete(symposiums);

  console.log('✅ Database cleared successfully!');
}

async function seed() {
  console.log('🚀 Starting database seeding...');

  await clearDatabase();

  // One-time random superadmin password — same 16-char crypto.randomBytes
  // scheme as provisioned temp passwords (server/routes.ts). Printed once
  // below; never hardcode a real/memorable password in source.
  // SEED_ADMIN_PASSWORD overrides it for automated environments (CI),
  // where the test harness must know the credential ahead of time.
  const passwordFromEnv = process.env.SEED_ADMIN_PASSWORD !== undefined;
  const superadminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(12).toString('base64').slice(0, 16);
  const hashedPassword = await bcrypt.hash(superadminPassword, 10);

  // Phase 1 multi-tenancy: a super_admin is a scoped role and MUST belong
  // to a symposium (migration 006 CHECK constraint
  // users_symposium_required_for_scoped_roles rejects NULL). Seed the
  // default symposium first, then scope the superadmin to it.
  console.log('Creating default symposium...');
  const [symposium] = await db.insert(symposiums).values({
    name: 'BootFete 2K26',
    slug: 'bootfete-2k26',
    organizerName: 'Bishop Heber College',
    supportEmail: 'azzimandabdullah1@gmail.com',
  }).returning({ id: symposiums.id });

  console.log('Creating ONLY superadmin user...');
  await db.insert(users).values({
    username: 'superadmin',
    password: hashedPassword,
    email: 'azzimandabdullah1@gmail.com',
    fullName: 'Mohamed Azzim',
    role: 'super_admin',
    phone: '+916380083647',
    symposiumId: symposium.id,
  });

  console.log('✅ Superadmin created successfully!');
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  SUPERADMIN LOGIN CREDENTIALS');
  console.log('═══════════════════════════════════════');
  console.log('  Username: superadmin');
  console.log('  Password: ' + (passwordFromEnv ? '(provided via SEED_ADMIN_PASSWORD)' : superadminPassword + '   (shown once — save it now)'));
  console.log('  Email: azzimandabdullah1@gmail.com');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('Note: Superadmin will create all other users from the dashboard.');
}

seed()
  .then(() => {
    console.log('🌱 Seeding finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error during seeding:', err);
    process.exit(1);
  });
