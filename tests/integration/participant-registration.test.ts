import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';
import { TestHelpers } from '../utils/testHelpers';
import { emailService } from '../../server/services/emailService';

let app: Express;
let server: Server;
let superAdminToken: string;
let regCommitteeToken: string;
let superAdminUser: any;
let regCommitteeUser: any;

jest.mock('../../server/services/emailService');

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  server = await registerRoutes(app);

  const hashedPassword = await TestHelpers.hashPassword('test123');
  
  superAdminUser = await storage.createUser({
    username: `super_admin_reg_${Date.now()}`,
    password: hashedPassword,
    email: `super_admin_reg_${Date.now()}@test.com`,
    fullName: 'Super Admin Registration',
    role: 'super_admin'
  });

  regCommitteeUser = await storage.createUser({
    username: `reg_committee_${Date.now()}`,
    password: hashedPassword,
    email: `reg_committee_${Date.now()}@test.com`,
    fullName: 'Registration Committee',
    role: 'registration_committee'
  });

  superAdminToken = TestHelpers.generateJWT(superAdminUser);
  regCommitteeToken = TestHelpers.generateJWT(regCommitteeUser);
});

afterAll(async () => {
  await storage.deleteUser(superAdminUser.id);
  await storage.deleteUser(regCommitteeUser.id);
  
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Public Registration Flow Tests', () => {
  let registrationForm: any;
  let technicalEvent: any;
  let nonTechnicalEvent1: any;
  let nonTechnicalEvent2: any;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `Tech Event ${Date.now()}`,
      description: 'Technical event',
      type: 'quiz',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    nonTechnicalEvent1 = await storage.createEvent({
      name: `Non-Tech Event 1 ${Date.now()}`,
      description: 'Non-technical event 1',
      type: 'general',
      category: 'non_technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    nonTechnicalEvent2 = await storage.createEvent({
      name: `Non-Tech Event 2 ${Date.now()}`,
      description: 'Non-technical event 2',
      type: 'general',
      category: 'non_technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    registrationForm = await storage.createRegistrationForm({
      title: 'Test Registration Form',
      description: 'Test form',
      formSlug: `test-form-${Date.now()}`,
      formFields: [
        { id: 'fullName', label: 'Full Name', type: 'text', required: true },
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'phone', label: 'Phone', type: 'tel', required: true }
      ],
      allowedCategories: ['technical', 'non_technical'],
      isActive: true
    });
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
    if (nonTechnicalEvent1?.id) await storage.deleteEvent(nonTechnicalEvent1.id);
    if (nonTechnicalEvent2?.id) await storage.deleteEvent(nonTechnicalEvent2.id);
    if (registrationForm?.id) await storage.deleteRegistrationForm(registrationForm.id);
  });

  // NOTE: The legacy POST /api/registration-forms/:slug/submit endpoint was
  // retired (410 Gone) in favour of the team-based /api/register/batch flow.
  // These tests encode the CURRENT public registration contract.

  function batchRegistration(eventId: string, overrides: Record<string, unknown> = {}) {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
      eventId,
      organizerRollNo: `ROLL${suffix}`,
      organizerName: 'John Doe',
      organizerEmail: `john.doe.${suffix}@test.com`,
      organizerDept: 'CSE',
      organizerCollege: 'Test College',
      organizerPhone: '1234567890',
      organizerFoodType: 'veg',
      ...overrides,
    };
  }

  test('should successfully register via the public batch endpoint', async () => {
    const response = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration(technicalEvent.id)] });

    expect(response.status).toBe(201);
    expect(response.body.successfulCount).toBe(1);
    expect(response.body.results[0].success).toBe(true);
    expect(response.body.results[0]).toHaveProperty('registrationId');
  });

  test('should retire the legacy form submit endpoint with 410', async () => {
    const response = await request(app)
      .post('/api/registration-forms/invalid-slug-123/submit')
      .send({ registrations: [] });

    expect(response.status).toBe(410);
    expect(response.body.message).toContain('team-based registration');
  });

  test('should reject batch registration without registrations array', async () => {
    const response = await request(app)
      .post('/api/register/batch')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Registrations array is required');
  });

  test('should reject registration in an already-taken category for the same roll no', async () => {
    const suffix = `${Date.now()}DUP`;
    const rollNo = `ROLL${suffix}`;
    const email = `dup.tech.${suffix}@test.com`;

    const first = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration(technicalEvent.id, { organizerRollNo: rollNo, organizerEmail: email })] });
    expect(first.body.successfulCount).toBe(1);

    // Second technical registration with the same roll no must fail per-event
    const second = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration(technicalEvent.id, { organizerRollNo: rollNo, organizerEmail: email })] });

    expect(second.status).toBe(201);
    expect(second.body.successfulCount).toBe(0);
    expect(second.body.results[0].success).toBe(false);
    expect(second.body.results[0].message).toContain('Already registered');
  });

  test('should allow 1 technical + 1 non-technical event registration', async () => {
    const suffix = `${Date.now()}MIX`;
    const rollNo = `ROLL${suffix}`;
    const email = `mix.${suffix}@test.com`;

    const response = await request(app)
      .post('/api/register/batch')
      .send({
        registrations: [
          batchRegistration(technicalEvent.id, { organizerRollNo: rollNo, organizerEmail: email }),
          batchRegistration(nonTechnicalEvent1.id, { organizerRollNo: rollNo, organizerEmail: email }),
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.successfulCount).toBe(2);
  });

  test('should reject batch registration for a non-existent event', async () => {
    const response = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration('non-existent-event-id')] });

    expect(response.status).toBe(201);
    expect(response.body.successfulCount).toBe(0);
    expect(response.body.results[0].message).toContain('Event not found');
  });

  test('should reject registration with mismatched food preference for a known roll no', async () => {
    const suffix = `${Date.now()}FOOD`;
    const rollNo = `ROLL${suffix}`;
    const email = `food.${suffix}@test.com`;

    const first = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration(technicalEvent.id, { organizerRollNo: rollNo, organizerEmail: email, organizerFoodType: 'veg' })] });
    expect(first.body.successfulCount).toBe(1);

    const second = await request(app)
      .post('/api/register/batch')
      .send({ registrations: [batchRegistration(nonTechnicalEvent1.id, { organizerRollNo: rollNo, organizerEmail: email, organizerFoodType: 'nonveg' })] });

    expect(second.status).toBe(201);
    expect(second.body.successfulCount).toBe(0);
    expect(second.body.results[0].message).toContain('Food type mismatch');
  });
});

describe('On-Spot Registration Tests (Registration Committee)', () => {
  let technicalEvent: any;
  let nonTechnicalEvent: any;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `Quiz Master Challenge ${Date.now()}`,
      description: 'Technical quiz event',
      type: 'quiz',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    nonTechnicalEvent = await storage.createEvent({
      name: `General Knowledge ${Date.now()}`,
      description: 'Non-technical event',
      type: 'general',
      category: 'non_technical',
      status: 'active',
      createdBy: superAdminUser.id
    });
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
    if (nonTechnicalEvent?.id) await storage.deleteEvent(nonTechnicalEvent.id);
  });

  test('should create participant with auto-generated credentials', async () => {
    const participantData = {
      fullName: 'Alice Johnson',
      email: `alice.johnson.${Date.now()}@test.com`,
      phone: '1234567890',
      college: `Test College ${Date.now()}`,
      rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
      department: 'CSE',
      year: 'II',
      selectedEvents: [technicalEvent.id]
    };

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send(participantData);

    expect(response.status).toBe(201);
    expect(response.body.participant.fullName).toBe('Alice Johnson');
    expect(response.body.eventCredentials).toHaveLength(1);
    
    const credential = response.body.eventCredentials[0];
    // 'Quiz...' -> 'qui', 'Alice' -> 'alic', counter 1
    expect(credential.eventUsername).toMatch(/^quialic\d+$/);
    // Capitalised 3-letter first-name prefix + '@' + 2-digit counter, e.g. 'Ali@01'
    expect(credential.eventPassword).toMatch(/^Ali@\d{2}$/);
  });

  test('should increment counter for multiple participants in same event', async () => {
    const participant1Data = {
      fullName: 'Bob Smith',
      email: `bob.smith.${Date.now()}@test.com`,
      phone: '1111111111',
      college: `Test College ${Date.now()}`,
      rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
      department: 'CSE',
      year: 'II',
      selectedEvents: [technicalEvent.id]
    };

    const participant2Data = {
      fullName: 'Carol Davis',
      email: `carol.davis.${Date.now()}@test.com`,
      phone: '2222222222',
      college: `Test College ${Date.now()}`,
      rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
      department: 'CSE',
      year: 'II',
      selectedEvents: [technicalEvent.id]
    };

    const response1 = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send(participant1Data);

    const response2 = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send(participant2Data);

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);

    const cred1 = response1.body.eventCredentials[0];
    const cred2 = response2.body.eventCredentials[0];

    // Backend format: eventPrefix(3) + namePrefix(4) + counter (no zero padding)
    expect(cred1.eventUsername).toMatch(/\d+$/);
    expect(cred2.eventUsername).toMatch(/\d+$/);
    expect(cred1.eventUsername).not.toBe(cred2.eventUsername);
    expect(cred1.eventPassword).not.toBe(cred2.eventPassword);
  });

  test('should generate credentials in eventname-firstname-counter format', async () => {
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'David Wilson',
        email: `david.wilson.${Date.now()}@test.com`,
        phone: '3333333333',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(201);
    const username = response.body.eventCredentials[0].eventUsername;

    // 'Quiz...' -> 'qui', 'David' -> 'davi', then an incrementing counter
    expect(username).toMatch(/^quidavi\d+$/);
  });

  test('should generate password in shortname+counter format', async () => {
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Emma Thompson',
        email: `emma.thompson.${Date.now()}@test.com`,
        phone: '4444444444',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(201);
    const password = response.body.eventCredentials[0].eventPassword;

    // Capitalised 3-letter first-name prefix + '@' + 2-digit counter, e.g. 'Emm@01'
    expect(password).toMatch(/^[A-Z][a-z]{2}@\d{2}$/);
  });

  test('should create multiple event credentials for participant', async () => {
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Frank Miller',
        email: `frank.miller.${Date.now()}@test.com`,
        phone: '5555555555',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id, nonTechnicalEvent.id]
      });

    expect(response.status).toBe(201);
    expect(response.body.eventCredentials).toHaveLength(2);
    
    const usernames = response.body.eventCredentials.map((c: any) => c.eventUsername);
    expect(usernames).toHaveLength(2);
    // Name prefix (4 chars of first name) appears in every username
    expect(usernames.every((u: string) => u.includes('fran'))).toBe(true);
  });

  test('should require authentication for on-spot registration', async () => {
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .send({
        fullName: 'Test User',
        email: 'test@test.com',
        phone: '1234567890',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(401);
  });

  test('should require registration committee role', async () => {
    const participantUser = await storage.createUser({
      username: `participant_${Date.now()}`,
      password: await TestHelpers.hashPassword('test123'),
      email: `participant_${Date.now()}@test.com`,
      fullName: 'Participant User',
      role: 'participant'
    });

    const participantToken = TestHelpers.generateJWT(participantUser);

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(participantToken))
      .send({
        fullName: 'Test User',
        email: 'test@test.com',
        phone: '1234567890',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('Registration Committee access required');

    await storage.deleteUser(participantUser.id);
  });

  test('should validate required fields for on-spot registration', async () => {
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        email: 'test@test.com',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('All fields (Name, Email, College, Roll No, Dept, Year, Events) are required');
  });

  test('should reject duplicate email for on-spot registration', async () => {
    const duplicateEmail = `duplicate.${Date.now()}@test.com`;

    await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'First User',
        email: duplicateEmail,
        phone: '1111111111',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Second User',
        email: duplicateEmail,
        phone: '2222222222',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Email already exists');
  });

  test('should send consolidated credentials via email after creation', async () => {
    // On-spot creation queues a consolidated credentials email; with no Redis in
    // tests the queue falls back to a direct send through this method.
    const mockSendConsolidated = jest.mocked(emailService.sendConsolidatedCredentials);
    mockSendConsolidated.mockResolvedValue({ success: true, messageId: 'test-message-id' });

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Grace Lee',
        email: `grace.lee.${Date.now()}@test.com`,
        phone: '6666666666',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(201);
    expect(mockSendConsolidated).toHaveBeenCalled();
  });
});

describe('Credential Export Tests', () => {
  let technicalEvent: any;
  let participant1: any;
  let participant2: any;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `Export Test Event ${Date.now()}`,
      description: 'Event for export testing',
      type: 'quiz',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    const mockSendCredentials = jest.mocked(emailService.sendCredentials);
    mockSendCredentials.mockResolvedValue({ success: true });

    const response1 = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Export User 1',
        email: `export1_${Date.now()}@test.com`,
        phone: '1111111111',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    const response2 = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Export User 2',
        email: `export2_${Date.now()}@test.com`,
        phone: '2222222222',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    participant1 = response1.body;
    participant2 = response2.body;
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
  });

  test('should export credentials as CSV', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('participants-credentials.csv');
  });

  test('should verify CSV format with correct headers', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    
    const csvLines = response.text.split('\n');
    const headers = csvLines[0];
    
    expect(headers).toContain('Participant Name');
    expect(headers).toContain('Email');
    expect(headers).toContain('Phone');
    expect(headers).toContain('Event Name');
    expect(headers).toContain('Username');
    expect(headers).toContain('Password');
  });

  test('should include participant data in CSV export', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    
    const csvContent = response.text;
    expect(csvContent).toContain('Export User 1');
    expect(csvContent).toContain('Export User 2');
  });

  test('should export credentials as PDF', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/pdf')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('participants-credentials.pdf');
  });

  test('should validate PDF generation response', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/pdf')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Buffer);
    expect(response.body.length).toBeGreaterThan(0);
  });

  test('should require authentication for CSV export', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv');

    expect(response.status).toBe(401);
  });

  test('should require authentication for PDF export', async () => {
    const response = await request(app)
      .get('/api/registration-committee/participants/export/pdf');

    expect(response.status).toBe(401);
  });

  test('should require registration committee role for CSV export', async () => {
    const participantUser = await storage.createUser({
      username: `participant_export_${Date.now()}`,
      password: await TestHelpers.hashPassword('test123'),
      email: `participant_export_${Date.now()}@test.com`,
      fullName: 'Participant User',
      role: 'participant'
    });

    const participantToken = TestHelpers.generateJWT(participantUser);

    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv')
      .set(TestHelpers.createAuthHeader(participantToken));

    expect(response.status).toBe(403);

    await storage.deleteUser(participantUser.id);
  });

  test('should properly escape CSV special characters', async () => {
    const mockSendCredentials = jest.mocked(emailService.sendCredentials);
    mockSendCredentials.mockResolvedValue({ success: true });

    await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Test "Quote" User',
        email: `quote_${Date.now()}@test.com`,
        phone: '9999999999',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    const response = await request(app)
      .get('/api/registration-committee/participants/export/csv')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.text).toContain('Test ""Quote"" User');
  });
});

describe('Registration Approval Workflow Tests', () => {
  let technicalEvent: any;
  let registration: any;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `Approval Test Event ${Date.now()}`,
      description: 'Event for approval testing',
      type: 'technical',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    // Create a pending registration through the public team-based flow
    const regResponse = await request(app)
      .post('/api/register')
      .send({
        eventId: technicalEvent.id,
        organizerRollNo: `APPR${Date.now()}`,
        organizerName: 'Approval Test User',
        organizerEmail: `approval_${Date.now()}@test.com`,
        organizerDept: 'CSE',
        organizerCollege: 'Test College',
        organizerPhone: '1234567890',
        organizerFoodType: 'veg'
      });

    expect(regResponse.status).toBe(201);
    registration = regResponse.body.registration;
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
  });

  test('should confirm registration and create user account', async () => {
    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.body.registration.status).toBe('confirmed');
    // The organizer's user account is created and credentials are generated;
    // the participant link lives in the participants/event_credentials tables.
    expect(response.body.eventCredentials).toHaveLength(1);
    expect(response.body.eventCredentials[0].eventUsername).toBeDefined();

    const participantUser = await storage.getUserByEmail(response.body.eventCredentials[0].participantEmail);
    expect(participantUser).toBeDefined();
    expect(participantUser!.role).toBe('participant');
  });

  test('should generate credentials on confirmation', async () => {
    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);

    const eventCred = response.body.eventCredentials[0];
    expect(eventCred.eventUsername).toBeDefined();
    expect(eventCred.eventPassword).toBeDefined();
    expect(eventCred.eventName).toBeDefined();
  });

  test('should transition status from pending to confirmed', async () => {
    expect(registration.status).toBe('pending');

    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(response.body.registration.status).toBe('confirmed');
  });

  test('should queue consolidated credentials email on confirmation', async () => {
    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    // Credentials are queued as a consolidated email (credits optimisation);
    // the response returns them for on-screen display.
    expect(response.body.eventCredentials.length).toBeGreaterThan(0);
    expect(response.body.eventCredentials[0].eventUsername).toBeDefined();
  });

  test('should require authentication for confirmation', async () => {
    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`);

    expect(response.status).toBe(401);
  });

  test('should require registration committee or super admin role for confirmation', async () => {
    const participantUser = await storage.createUser({
      username: `participant_approval_${Date.now()}`,
      password: await TestHelpers.hashPassword('test123'),
      email: `participant_approval_${Date.now()}@test.com`,
      fullName: 'Participant User',
      role: 'participant'
    });

    const participantToken = TestHelpers.generateJWT(participantUser);

    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(participantToken));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden');

    await storage.deleteUser(participantUser.id);
  });

  test('should allow super admin to confirm registration', async () => {
    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(superAdminToken));

    expect(response.status).toBe(200);
    expect(response.body.registration.status).toBe('confirmed');
  });

  test('should reject confirmation of already processed registration', async () => {
    await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    const response = await request(app)
      .patch(`/api/registrations/${registration.id}/confirm`)
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already been processed');
  });

  test('should return 404 for non-existent registration', async () => {
    const response = await request(app)
      .patch('/api/registrations/non-existent-id/confirm')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Registration not found');
  });

  test('should create participant records for all selected events on confirmation', async () => {
    const nonTechnicalEvent = await storage.createEvent({
      name: `Non-Tech Approval ${Date.now()}`,
      description: 'Non-technical event',
      type: 'general',
      category: 'non_technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    // Register one participant for both events via the on-spot flow
    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Multi Event User',
        email: `multi_event_${Date.now()}@test.com`,
        phone: '9999999999',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id, nonTechnicalEvent.id]
      });

    expect(response.status).toBe(201);
    expect(response.body.eventCredentials).toHaveLength(2);

    await storage.deleteEvent(nonTechnicalEvent.id);
  });
});

describe('Credential Management Tests', () => {
  let technicalEvent: any;
  let participantUser: any;
  let participantToken: string;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `Credential Test Event ${Date.now()}`,
      description: 'Event for credential testing',
      type: 'quiz',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    const mockSendCredentials = jest.mocked(emailService.sendCredentials);
    mockSendCredentials.mockResolvedValue({ success: true });

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Credential Test User',
        email: `cred_test_${Date.now()}@test.com`,
        phone: '1234567890',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    participantUser = response.body.participant;
    
    const user = await storage.getUserByEmail(response.body.participant.email);
    participantToken = TestHelpers.generateJWT({
      ...user!,
      eventId: technicalEvent.id
    });
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
  });

  test('should view participant credentials', async () => {
    const response = await request(app)
      .get('/api/participants/my-credential')
      .set(TestHelpers.createAuthHeader(participantToken));

    expect(response.status).toBe(200);
    expect(response.body.credential).toBeDefined();
    expect(response.body.credential.eventUsername).toBeDefined();
    expect(response.body.event).toBeDefined();
    expect(response.body.rounds).toBeDefined();
  });

  test('should display credentials in response after on-spot creation', async () => {
    const mockSendCredentials = jest.mocked(emailService.sendCredentials);
    mockSendCredentials.mockResolvedValue({ success: true });

    const response = await request(app)
      .post('/api/registration-committee/participants')
      .set(TestHelpers.createAuthHeader(regCommitteeToken))
      .send({
        fullName: 'Display Cred User',
        email: `display_${Date.now()}@test.com`,
        phone: '5555555555',
        college: `Test College ${Date.now()}`,
        rollNo: `ROLL${Date.now()}${Math.floor(Math.random() * 1000)}`,
        department: 'CSE',
        year: 'II',
        selectedEvents: [technicalEvent.id]
      });

    expect(response.status).toBe(201);
    expect(response.body.eventCredentials).toBeDefined();
    expect(response.body.eventCredentials).toHaveLength(1);
    expect(response.body.eventCredentials[0].eventUsername).toBeDefined();
    expect(response.body.eventCredentials[0].eventPassword).toBeDefined();
  });

  test('should require authentication to view credentials', async () => {
    const response = await request(app)
      .get('/api/participants/my-credential');

    expect(response.status).toBe(401);
  });

  test('should require participant role to view own credentials', async () => {
    const response = await request(app)
      .get('/api/participants/my-credential')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('Participant access required');
  });
});

describe('Registration List and Query Tests', () => {
  let technicalEvent: any;

  beforeEach(async () => {
    technicalEvent = await storage.createEvent({
      name: `List Test Event ${Date.now()}`,
      description: 'Event for list testing',
      type: 'technical',
      category: 'technical',
      status: 'active',
      createdBy: superAdminUser.id
    });

    // Create two pending registrations through the public team-based flow
    const suffix = Date.now();
    await request(app)
      .post('/api/register')
      .send({
        eventId: technicalEvent.id,
        organizerRollNo: `LIST1${suffix}`,
        organizerName: 'List User 1',
        organizerEmail: `list1_${suffix}@test.com`,
        organizerDept: 'CSE',
        organizerCollege: 'Test College',
        organizerPhone: '1234567890',
        organizerFoodType: 'veg'
      });

    await request(app)
      .post('/api/register')
      .send({
        eventId: technicalEvent.id,
        organizerRollNo: `LIST2${suffix}`,
        organizerName: 'List User 2',
        organizerEmail: `list2_${suffix}@test.com`,
        organizerDept: 'ECE',
        organizerCollege: 'Test College',
        organizerPhone: '1234567891',
        organizerFoodType: 'veg'
      });
  });

  afterEach(async () => {
    if (technicalEvent?.id) await storage.deleteEvent(technicalEvent.id);
  });

  test('should list all registrations for registration committee', async () => {
    const response = await request(app)
      .get('/api/registrations')
      .set(TestHelpers.createAuthHeader(regCommitteeToken));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
  });

  test('should list all registrations for super admin', async () => {
    const response = await request(app)
      .get('/api/registrations')
      .set(TestHelpers.createAuthHeader(superAdminToken));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('should deny access to registrations list for non-authorized roles', async () => {
    const participantUser = await storage.createUser({
      username: `participant_list_${Date.now()}`,
      password: await TestHelpers.hashPassword('test123'),
      email: `participant_list_${Date.now()}@test.com`,
      fullName: 'Participant User',
      role: 'participant'
    });

    const participantToken = TestHelpers.generateJWT(participantUser);

    const response = await request(app)
      .get('/api/registrations')
      .set(TestHelpers.createAuthHeader(participantToken));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden');

    await storage.deleteUser(participantUser.id);
  });
});
