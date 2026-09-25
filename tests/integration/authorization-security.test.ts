import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import { registerRoutes } from '../../server/routes';
import { storage } from '../../server/storage';
import { TestHelpers } from '../utils/testHelpers';

// SECURITY: adversarial authorization tests.
// Proves that unauthorized users cannot cross role / event / data boundaries.

let app: Express;
let server: Server;

let superAdmin: any, eventAdminA: any, eventAdminB: any, eventAdminUnassigned: any;
let committee: any, participantA1: any, participantA2: any, participantB: any;

let tokenSuper: string, tokenAdminA: string, tokenAdminB: string, tokenAdminUnassigned: string;
let tokenCommittee: string, tokenPartA1: string, tokenPartA2: string, tokenPartB: string;

let eventA: any, eventB: any;
let roundA: any, roundB: any;
let questionA: any;
let participantRecordA1: any, participantRecordA2: any, participantRecordB: any;
let attemptA1: any;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = await registerRoutes(app);

  const hash = await TestHelpers.hashPassword('test123');
  const unique = Date.now();

  superAdmin = await storage.createUser({
    username: `sec_super_${unique}`, password: hash, email: `sec_super_${unique}@test.com`,
    fullName: 'Sec Super', role: 'super_admin'
  });
  eventAdminA = await storage.createUser({
    username: `sec_admin_a_${unique}`, password: hash, email: `sec_admin_a_${unique}@test.com`,
    fullName: 'Sec Admin A', role: 'event_admin'
  });
  eventAdminB = await storage.createUser({
    username: `sec_admin_b_${unique}`, password: hash, email: `sec_admin_b_${unique}@test.com`,
    fullName: 'Sec Admin B', role: 'event_admin'
  });
  eventAdminUnassigned = await storage.createUser({
    username: `sec_admin_u_${unique}`, password: hash, email: `sec_admin_u_${unique}@test.com`,
    fullName: 'Sec Admin Unassigned', role: 'event_admin'
  });
  committee = await storage.createUser({
    username: `sec_committee_${unique}`, password: hash, email: `sec_committee_${unique}@test.com`,
    fullName: 'Sec Committee', role: 'registration_committee'
  });
  participantA1 = await storage.createUser({
    username: `sec_part_a1_${unique}`, password: hash, email: `sec_part_a1_${unique}@test.com`,
    fullName: 'Sec Part A1', role: 'participant'
  });
  participantA2 = await storage.createUser({
    username: `sec_part_a2_${unique}`, password: hash, email: `sec_part_a2_${unique}@test.com`,
    fullName: 'Sec Part A2', role: 'participant'
  });
  participantB = await storage.createUser({
    username: `sec_part_b_${unique}`, password: hash, email: `sec_part_b_${unique}@test.com`,
    fullName: 'Sec Part B', role: 'participant'
  });

  tokenSuper = TestHelpers.generateJWT(superAdmin);
  tokenAdminA = TestHelpers.generateJWT(eventAdminA);
  tokenAdminB = TestHelpers.generateJWT(eventAdminB);
  tokenAdminUnassigned = TestHelpers.generateJWT(eventAdminUnassigned);
  tokenCommittee = TestHelpers.generateJWT(committee);
  tokenPartA1 = TestHelpers.generateJWT(participantA1);
  tokenPartA2 = TestHelpers.generateJWT(participantA2);
  tokenPartB = TestHelpers.generateJWT(participantB);

  eventA = await storage.createEvent({
    name: `Sec Event A ${unique}`, description: 'Security event A',
    type: 'technical', category: 'technical', status: 'active', createdBy: superAdmin.id
  });
  eventB = await storage.createEvent({
    name: `Sec Event B ${unique}`, description: 'Security event B',
    type: 'technical', category: 'technical', status: 'active', createdBy: superAdmin.id
  });

  await storage.assignEventAdmin(eventA.id, eventAdminA.id);
  await storage.assignEventAdmin(eventB.id, eventAdminB.id);

  roundA = await storage.createRound({
    eventId: eventA.id, name: 'Sec Round A', roundNumber: 1, duration: 60, status: 'not_started'
  });
  roundB = await storage.createRound({
    eventId: eventB.id, name: 'Sec Round B', roundNumber: 1, duration: 60, status: 'not_started'
  });

  questionA = await storage.createQuestion({
    roundId: roundA.id, questionType: 'mcq', questionText: 'Security question',
    questionNumber: 1, points: 1, options: ['1', '2'], correctAnswer: '1'
  });
  await storage.createQuestion({
    roundId: roundB.id, questionType: 'mcq', questionText: 'Security question B',
    questionNumber: 1, points: 1, options: ['1', '2'], correctAnswer: '1'
  });

  participantRecordA1 = await storage.registerParticipant({ eventId: eventA.id, userId: participantA1.id });
  participantRecordA2 = await storage.registerParticipant({ eventId: eventA.id, userId: participantA2.id });
  participantRecordB = await storage.registerParticipant({ eventId: eventB.id, userId: participantB.id });

  // Start roundA so attempts can be created on it
  await request(app).post(`/api/rounds/${roundA.id}/start`).set(TestHelpers.createAuthHeader(tokenAdminA));

  attemptA1 = await storage.createTestAttempt({
    roundId: roundA.id, userId: participantA1.id, status: 'in_progress',
    tabSwitchCount: 0, refreshAttemptCount: 0, violationLogs: [], totalScore: 0, maxScore: 1
  });
});

afterAll(async () => {
  const cleanup = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* already gone */ } };

  await cleanup(() => attemptA1 && storage.deleteTestAttemptsByRound(roundA.id));
  await cleanup(() => storage.deleteRound(roundA.id));
  await cleanup(() => storage.deleteRound(roundB.id));
  await cleanup(() => storage.deleteEvent(eventA.id));
  await cleanup(() => storage.deleteEvent(eventB.id));

  for (const u of [participantB, participantA2, participantA1, committee, eventAdminUnassigned, eventAdminB, eventAdminA, superAdmin]) {
    await cleanup(() => storage.deleteUser(u.id));
  }

  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('SECURITY: Unauthenticated access is rejected', () => {
  const cases: Array<[string, string, string]> = [
    ['GET', '/api/users', 'user list'],
    ['GET', '/api/registrations', 'registrations'],
    ['GET', '/api/email-logs', 'email logs'],
    ['GET', '/api/super-admin/audit-logs', 'audit logs'],
    ['POST', '/api/events', 'event creation'],
    ['POST', `/api/rounds/${'x'}/start`, 'admin round start'],
    ['PATCH', '/api/events/x', 'event update'],
    ['DELETE', '/api/events/x', 'event delete'],
    ['GET', '/api/event-admin/events', 'event admin scope'],
  ];

  test.each(cases)('%s %s (%s) without token -> 401', async (method, url) => {
    const response = await (request(app) as any)[method.toLowerCase()](url);
    expect(response.status).toBe(401);
  });
});

describe('SECURITY: JWT role-claim forgery is ineffective', () => {
  // Validly-signed tokens carrying an escalated role claim: authorization
  // MUST be based on the backend's stored role, never on the token claim.
  test('participant id with forged super_admin claim cannot list users', async () => {
    const forged = TestHelpers.generateJWT({
      id: participantA1.id, username: participantA1.username,
      email: participantA1.email, role: 'super_admin'
    });
    const response = await request(app)
      .get('/api/users')
      .set(TestHelpers.createAuthHeader(forged));
    expect(response.status).not.toBe(200);
  });

  test('participant id with forged super_admin claim cannot create events', async () => {
    const forged = TestHelpers.generateJWT({
      id: participantA1.id, username: participantA1.username,
      email: participantA1.email, role: 'super_admin'
    });
    const response = await request(app)
      .post('/api/events')
      .set(TestHelpers.createAuthHeader(forged))
      .send({ name: `Hijack ${Date.now()}`, description: 'x', type: 'technical' });
    expect(response.status).not.toBe(201);
  });

  test('event admin id with forged super_admin claim cannot delete events', async () => {
    const forged = TestHelpers.generateJWT({
      id: eventAdminA.id, username: eventAdminA.username,
      email: eventAdminA.email, role: 'super_admin'
    });
    const response = await request(app)
      .delete(`/api/events/${eventA.id}`)
      .set(TestHelpers.createAuthHeader(forged));
    expect(response.status).not.toBe(200);
  });
});

describe('SECURITY: Privilege escalation via register endpoint', () => {
  test('anonymous cannot create super_admin account', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: `evil_super_${Date.now()}`, password: 'EvilPass123',
        email: `evil_super_${Date.now()}@test.com`, fullName: 'Evil', role: 'super_admin'
      });
    expect([401, 403]).toContain(response.status);
  });

  test('event admin cannot create privileged accounts', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set(TestHelpers.createAuthHeader(tokenAdminA))
      .send({
        username: `evil_super2_${Date.now()}`, password: 'EvilPass123',
        email: `evil_super2_${Date.now()}@test.com`, fullName: 'Evil', role: 'super_admin'
      });
    expect(response.status).toBe(403);
  });

  test('committee cannot create privileged accounts', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set(TestHelpers.createAuthHeader(tokenCommittee))
      .send({
        username: `evil_admin_${Date.now()}`, password: 'EvilPass123',
        email: `evil_admin_${Date.now()}@test.com`, fullName: 'Evil', role: 'event_admin'
      });
    expect(response.status).toBe(403);
  });

  test('public self-registration as participant is allowed', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: `self_part_${Date.now()}`, password: 'SelfPass123',
        email: `self_part_${Date.now()}@test.com`, fullName: 'Self Participant', role: 'participant'
      });
    expect(response.status).toBe(201);
    if (response.body?.user?.id) {
      await storage.deleteUser(response.body.user.id).catch(() => {});
    }
  });

  test('super admin can create event admin via register', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set(TestHelpers.createAuthHeader(tokenSuper))
      .send({
        username: `legit_admin_${Date.now()}`, password: 'LegitPass123',
        email: `legit_admin_${Date.now()}@test.com`, fullName: 'Legit Admin', role: 'event_admin'
      });
    expect(response.status).toBe(201);
    if (response.body?.user?.id) {
      await storage.deleteUser(response.body.user.id).catch(() => {});
    }
  });
});

describe('SECURITY: Cross-event access (IDOR) is blocked', () => {
  test('event admin A cannot read event B', async () => {
    const response = await request(app)
      .get(`/api/events/${eventB.id}`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('event admin A cannot list event B rounds', async () => {
    const response = await request(app)
      .get(`/api/events/${eventB.id}/rounds`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('event admin A cannot update event B round', async () => {
    const response = await request(app)
      .patch(`/api/rounds/${roundB.id}`)
      .set(TestHelpers.createAuthHeader(tokenAdminA))
      .send({ name: 'Hijacked' });
    expect(response.status).toBe(403);
  });

  test('event admin A cannot start event B round', async () => {
    const response = await request(app)
      .post(`/api/rounds/${roundB.id}/start`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('event admin A cannot read event B credentials', async () => {
    const response = await request(app)
      .get(`/api/events/${eventB.id}/event-credentials`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('unassigned event admin cannot access either event', async () => {
    const rA = await request(app).get(`/api/events/${eventA.id}`).set(TestHelpers.createAuthHeader(tokenAdminUnassigned));
    const rB = await request(app).get(`/api/events/${eventB.id}`).set(TestHelpers.createAuthHeader(tokenAdminUnassigned));
    expect(rA.status).toBe(403);
    expect(rB.status).toBe(403);
  });

  test('participant of event B cannot read event A', async () => {
    const response = await request(app)
      .get(`/api/events/${eventA.id}`)
      .set(TestHelpers.createAuthHeader(tokenPartB));
    expect(response.status).toBe(403);
  });

  test('participant of event B cannot view event A round leaderboard', async () => {
    const response = await request(app)
      .get(`/api/rounds/${roundA.id}/leaderboard`)
      .set(TestHelpers.createAuthHeader(tokenPartB));
    expect(response.status).toBe(403);
  });

  test('participant of event A cannot read event B rounds', async () => {
    const response = await request(app)
      .get(`/api/events/${eventB.id}/rounds`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(response.status).toBe(403);
  });

  test('participant of event B cannot start a test attempt on event A round', async () => {
    // roundA is in_progress with questions; a participant from event B must
    // not be able to join another event's live test.
    const response = await request(app)
      .post(`/api/events/${eventA.id}/rounds/${roundA.id}/start`)
      .set(TestHelpers.createAuthHeader(tokenPartB));
    expect(response.status).toBe(403);
  });
});

describe('SECURITY: Participant data boundaries (IDOR)', () => {
  test('participant cannot read another participant attempt', async () => {
    const response = await request(app)
      .get(`/api/attempts/${attemptA1.id}`)
      .set(TestHelpers.createAuthHeader(tokenPartA2));
    expect([403, 404]).toContain(response.status);
  });

  test('participant cannot answer another participant attempt', async () => {
    const response = await request(app)
      .post(`/api/attempts/${attemptA1.id}/answers`)
      .set(TestHelpers.createAuthHeader(tokenPartA2))
      .send({ questionId: questionA.id, answer: '2' });
    expect(response.status).toBe(403);
  });

  test('participant cannot submit another participant attempt', async () => {
    const response = await request(app)
      .post(`/api/attempts/${attemptA1.id}/submit`)
      .set(TestHelpers.createAuthHeader(tokenPartA2));
    expect(response.status).toBe(403);
  });

  test('outsider participant cannot submit an attempt they do not own', async () => {
    const response = await request(app)
      .post(`/api/attempts/${attemptA1.id}/submit`)
      .set(TestHelpers.createAuthHeader(tokenPartB));
    expect(response.status).toBe(403);
  });

  test('participant cannot disqualify another participant', async () => {
    const response = await request(app)
      .patch(`/api/participants/${participantRecordA2.id}/disqualify`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(response.status).toBe(403);
  });

  test('participant cannot disqualify a participant in another event', async () => {
    const response = await request(app)
      .patch(`/api/participants/${participantRecordB.id}/disqualify`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(response.status).toBe(403);
  });

  test('participant can self-eliminate (disqualify own record)', async () => {
    const response = await request(app)
      .patch(`/api/participants/${participantRecordA2.id}/disqualify`)
      .set(TestHelpers.createAuthHeader(tokenPartA2));
    expect(response.status).toBe(200);
    // Restore for other tests
    await storage.updateParticipantStatus(participantRecordA2.id, 'registered');
  });
});

describe('SECURITY: Wrong role is rejected on admin endpoints', () => {
  test('event admin cannot list users', async () => {
    const response = await request(app).get('/api/users').set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('event admin cannot update events', async () => {
    const response = await request(app)
      .patch(`/api/events/${eventA.id}`)
      .set(TestHelpers.createAuthHeader(tokenAdminA))
      .send({ name: 'Nope' });
    expect(response.status).toBe(403);
  });

  test('event admin cannot delete events', async () => {
    const response = await request(app)
      .delete(`/api/events/${eventA.id}`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(403);
  });

  test('committee cannot list users', async () => {
    const response = await request(app).get('/api/users').set(TestHelpers.createAuthHeader(tokenCommittee));
    expect(response.status).toBe(403);
  });

  test('committee cannot create events', async () => {
    const response = await request(app)
      .post('/api/events')
      .set(TestHelpers.createAuthHeader(tokenCommittee))
      .send({ name: `C ${Date.now()}`, description: 'x', type: 'technical' });
    expect(response.status).toBe(403);
  });

  test('committee cannot read email logs', async () => {
    const response = await request(app).get('/api/email-logs').set(TestHelpers.createAuthHeader(tokenCommittee));
    expect(response.status).toBe(403);
  });

  test('participant cannot start admin rounds', async () => {
    const response = await request(app)
      .post(`/api/rounds/${roundB.id}/start`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(response.status).toBe(403);
  });

  test('participant cannot list registrations', async () => {
    const response = await request(app).get('/api/registrations').set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(response.status).toBe(403);
  });

  test('event admin cannot access super-admin question override', async () => {
    const response = await request(app)
      .put(`/api/super-admin/questions/${questionA.id}/override`)
      .set(TestHelpers.createAuthHeader(tokenAdminA))
      .send({ questionText: 'Hacked' });
    expect(response.status).toBe(403);
  });
});

describe('SECURITY: Round state machine transitions', () => {
  test('starting an in-progress round is rejected', async () => {
    const response = await request(app)
      .post(`/api/rounds/${roundA.id}/start`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(response.status).toBe(400);
  });

  test('pause -> resume round works for assigned admin', async () => {
    const paused = await request(app)
      .post(`/api/rounds/${roundA.id}/pause`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('paused');

    const resumed = await request(app)
      .post(`/api/rounds/${roundA.id}/resume`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe('in_progress');
  });

  test('ending a round sets endedAt and blocks further ends', async () => {
    const ended = await request(app)
      .post(`/api/rounds/${roundA.id}/end`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('completed');
    expect(ended.body.endedAt).toBeDefined();

    const again = await request(app)
      .post(`/api/rounds/${roundA.id}/end`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(again.status).toBe(400);
  });

  test('restart resets startedAt/endedAt and deletes attempts', async () => {
    const restarted = await request(app)
      .post(`/api/rounds/${roundA.id}/restart`)
      .set(TestHelpers.createAuthHeader(tokenAdminA));
    expect(restarted.status).toBe(200);
    expect(restarted.body.round.status).toBe('not_started');
    expect(restarted.body.round.startedAt).toBeNull();
    expect(restarted.body.round.endedAt).toBeNull();

    const attempt = await storage.getTestAttempt(attemptA1.id);
    expect(attempt).toBeUndefined();
  });
});

describe('SECURITY: Double-submit idempotency', () => {
  test('submitting an attempt twice is rejected the second time', async () => {
    // Restart round for a fresh attempt
    await request(app).post(`/api/rounds/${roundA.id}/restart`).set(TestHelpers.createAuthHeader(tokenAdminA));
    await request(app).post(`/api/rounds/${roundA.id}/start`).set(TestHelpers.createAuthHeader(tokenAdminA));

    // Event credential login ensures the participant flow is realistic
    const started = await request(app)
      .post(`/api/events/${eventA.id}/rounds/${roundA.id}/start`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(started.status).toBe(201);
    const attemptId = started.body.id;

    // Save an answer, then submit twice
    await request(app)
      .post(`/api/attempts/${attemptId}/answers`)
      .set(TestHelpers.createAuthHeader(tokenPartA1))
      .send({ questionId: questionA.id, answer: '1' });

    const first = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('completed');

    const second = await request(app)
      .post(`/api/attempts/${attemptId}/submit`)
      .set(TestHelpers.createAuthHeader(tokenPartA1));
    expect(second.status).toBe(400);
    expect(second.body.message).toContain('already submitted');
  });
});

describe('SECURITY: Admin self-lockout protection', () => {
  test('super admin cannot delete own account', async () => {
    const response = await request(app)
      .delete(`/api/users/${superAdmin.id}`)
      .set(TestHelpers.createAuthHeader(tokenSuper));
    expect([400, 403]).toContain(response.status);
  });
});
