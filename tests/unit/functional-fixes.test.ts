import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { storage } from '../../server/storage';
import { db } from '../../server/db';
import { users, events, rounds, participants, testAttempts } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

describe('Functional Fixes & Robustness Tests', () => {
  let createdUserIds: string[] = [];
  let createdEventIds: string[] = [];
  let createdRoundIds: string[] = [];

  afterAll(async () => {
    try {
      if (createdRoundIds.length > 0) {
        await db.delete(testAttempts).where(inArray(testAttempts.roundId, createdRoundIds));
        await db.delete(rounds).where(inArray(rounds.id, createdRoundIds));
      }
      if (createdEventIds.length > 0) {
        await db.delete(participants).where(inArray(participants.eventId, createdEventIds));
        await db.delete(events).where(inArray(events.id, createdEventIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
    } catch (e) {
      console.error('Cleanup error in functional-fixes.test.ts:', e);
    }
  });

  test('Leaderboard excludes disqualified participants', async () => {
    // 1. Create event
    const event = await storage.createEvent({
      name: `Leaderboard Test Event ${Date.now()}`,
      description: 'Testing disqualified leaderboard exclusion',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
      eventAdmins: [],
    });
    createdEventIds.push(event.id);

    // 2. Create round
    const round = await storage.createRound({
      eventId: event.id,
      name: 'Round 1',
      roundNumber: 1,
      roundType: 'prelims',
      duration: 30,
      conductMedium: 'online',
    });
    createdRoundIds.push(round.id);

    // 3. Create two participants
    const userA = await storage.createUser({
      username: `user_a_${Date.now()}`,
      password: 'password123',
      email: `user_a_${Date.now()}@test.com`,
      fullName: 'Honest Participant',
      role: 'participant',
    });
    createdUserIds.push(userA.id);

    const userB = await storage.createUser({
      username: `user_b_${Date.now()}`,
      password: 'password123',
      email: `user_b_${Date.now()}@test.com`,
      fullName: 'Disqualified Participant',
      role: 'participant',
    });
    createdUserIds.push(userB.id);

    const partA = await storage.createParticipant(userA.id, event.id);
    const partB = await storage.createParticipant(userB.id, event.id);

    // Disqualify userB
    await storage.updateParticipantStatus(partB.id, 'disqualified');

    // 4. Create completed test attempts for both
    const attemptA = await storage.createTestAttempt({
      roundId: round.id,
      userId: userA.id,
      startedAt: new Date(),
    });
    await storage.updateTestAttempt(attemptA.id, {
      status: 'completed',
      submittedAt: new Date(),
      completedAt: new Date(),
      totalScore: 85,
    });

    const attemptB = await storage.createTestAttempt({
      roundId: round.id,
      userId: userB.id,
      startedAt: new Date(),
    });
    await storage.updateTestAttempt(attemptB.id, {
      status: 'completed',
      submittedAt: new Date(),
      completedAt: new Date(),
      totalScore: 100, // Higher score, but disqualified!
    });

    // 5. Query round leaderboard
    const roundLeaderboard = await storage.getRoundLeaderboard(round.id);
    const roundUserIds = roundLeaderboard.map(e => e.userId);
    expect(roundUserIds).toContain(userA.id);
    expect(roundUserIds).not.toContain(userB.id);

    // 6. Query event leaderboard
    const eventLeaderboard = await storage.getEventLeaderboard(event.id);
    const eventUserIds = eventLeaderboard.map(e => e.userId);
    expect(eventUserIds).toContain(userA.id);
    expect(eventUserIds).not.toContain(userB.id);
  });

  test('Round resume preserves original startedAt timestamp', async () => {
    const event = await storage.createEvent({
      name: `Pause Resume Test Event ${Date.now()}`,
      description: 'Testing round pause/resume preservation',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
      eventAdmins: [],
    });
    createdEventIds.push(event.id);

    const round = await storage.createRound({
      eventId: event.id,
      name: 'Round 1',
      roundNumber: 1,
      roundType: 'prelims',
      duration: 30,
      conductMedium: 'online',
    });
    createdRoundIds.push(round.id);

    const originalStartTime = new Date(Date.now() - 60000); // 1 minute ago
    const startedRound = await storage.updateRoundStatus(round.id, 'in_progress', originalStartTime);
    expect(startedRound?.startedAt).toBeDefined();

    // Pause round
    await storage.updateRoundStatus(round.id, 'paused');

    // Resume round without explicitly passing timestamp (simulating admin resume)
    const resumedRound = await storage.updateRoundStatus(round.id, 'in_progress');
    expect(new Date(resumedRound!.startedAt!).getTime()).toEqual(originalStartTime.getTime());
  });

  test('Event credential password update updates plaintext value', async () => {
    const event = await storage.createEvent({
      name: `Cred Test Event ${Date.now()}`,
      description: 'Testing credential update',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
      eventAdmins: [],
    });
    createdEventIds.push(event.id);

    const user = await storage.createUser({
      username: `user_cred_${Date.now()}`,
      password: 'password123',
      email: `user_cred_${Date.now()}@test.com`,
      fullName: 'Credential User',
      role: 'participant',
    });
    createdUserIds.push(user.id);

    const cred = await storage.createEventCredential(user.id, event.id, 'test_user_1', '$2b$10$dummybcrypthashstringthatshouldbereplaced1234567890123');
    expect(cred.eventPassword).toContain('$2b$10$');

    const updated = await storage.updateEventCredentialPassword(cred.id, 'fresh-readable-pass');
    expect(updated?.eventPassword).toBe('fresh-readable-pass');

    const fetched = await storage.getEventCredential(cred.id);
    expect(fetched?.eventPassword).toBe('fresh-readable-pass');
  });

  test('Event admin assignment verification works accurately', async () => {
    const adminUser = await storage.createUser({
      username: `event_admin_${Date.now()}`,
      password: 'password123',
      email: `admin_${Date.now()}@test.com`,
      fullName: 'Event Coordinator',
      role: 'event_admin',
    });
    createdUserIds.push(adminUser.id);

    const eventA = await storage.createEvent({
      name: `Assigned Event ${Date.now()}`,
      description: 'Testing event admin authorization',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
    });
    createdEventIds.push(eventA.id);
    await storage.assignEventAdmin(eventA.id, adminUser.id);

    const eventB = await storage.createEvent({
      name: `Unassigned Event ${Date.now()}`,
      description: 'Testing event admin authorization non-access',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
    });
    createdEventIds.push(eventB.id);

    // Verify isUserEventAdmin for both
    const isAssignedToA = await storage.isUserEventAdmin(adminUser.id, eventA.id);
    expect(isAssignedToA).toBe(true);

    const isAssignedToB = await storage.isUserEventAdmin(adminUser.id, eventB.id);
    expect(isAssignedToB).toBe(false);
  });

  test('Updating final round resultsPublished updates round status for participants', async () => {
    const event = await storage.createEvent({
      name: `Winner Publish Event ${Date.now()}`,
      description: 'Testing auto publishing final round results',
      category: 'technical',
      eventType: 'individual',
      minTeamSize: 1,
      maxTeamSize: 1,
      eventAdmins: [],
    });
    createdEventIds.push(event.id);

    const round = await storage.createRound({
      eventId: event.id,
      name: 'Finals',
      roundNumber: 2,
      roundType: 'finals',
      duration: 45,
      conductMedium: 'online',
    });
    createdRoundIds.push(round.id);

    expect(round.resultsPublished).toBe(false);

    const updated = await storage.updateRoundResultsPublished(round.id, true);
    expect(updated?.resultsPublished).toBe(true);

    const rounds = await storage.getRoundsByEvent(event.id);
    const finalRound = rounds.find(r => r.id === round.id);
    expect(finalRound?.resultsPublished).toBe(true);
  });
});
