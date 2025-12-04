import { db } from './db';
import bcrypt from 'bcrypt';
import { 
  users, 
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

  console.log('✅ Database cleared successfully!');
}

async function seed() {
  console.log('🚀 Starting database seeding...');

  await clearDatabase();

  // Hash the password: Azzi@03
  const hashedPassword = await bcrypt.hash('Azzi@03', 10);

  console.log('Creating ONLY superadmin user...');
  await db.insert(users).values({
    username: 'superadmin',
    password: hashedPassword,
    email: 'azzimandabdullah1@gmail.com',
    fullName: 'Mohamed Azzim',
    role: 'super_admin',
    phone: '+916380083647'
  });

  console.log('✅ Superadmin created successfully!');
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  SUPERADMIN LOGIN CREDENTIALS');
  console.log('═══════════════════════════════════════');
  console.log('  Username: superadmin');
  console.log('  Password: Azzi@03');
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
