import { eq, ne, and, desc, asc, sql, gte, lte, or, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import { users, events, eventAdmins, eventRules, rounds, roundRules, questions, participants, testAttempts, answers, reports, registrationForms, registrations, teamMembers, eventCredentials, auditLogs, emailLogs, participantRegistry, manualRoundEntries, eventWinners } from '@shared/schema';
import type { User, InsertUser, Event, InsertEvent, EventRules, InsertEventRules, Round, InsertRound, RoundRules, InsertRoundRules, Question, InsertQuestion, Participant, InsertParticipant, TestAttempt, InsertTestAttempt, Answer, InsertAnswer, Report, InsertReport, RegistrationForm, InsertRegistrationForm, Registration, InsertRegistration, TeamMember, InsertTeamMember, EventCredential, InsertEventCredential, AuditLog, InsertAuditLog, EmailLog, InsertEmailLog, ParticipantRegistry, InsertParticipantRegistry, FoodType, ManualRoundEntry, InsertManualRoundEntry, EventWinner, InsertEventWinner } from '@shared/schema';
import { normalizeDepartment } from './lib/departmentUtils';

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  totalScore: number;
  submittedAt: Date | null;
  rank: number;
}

export interface IStorage {
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCredentials(userId: string, updates: { username?: string; email?: string; password?: string; fullName?: string }): Promise<User | undefined>;
  deleteUser(userId: string): Promise<void>;
  getOrphanedEventAdmins(): Promise<User[]>;

  getEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventByName(name: string): Promise<Event | undefined>;
  getEventsByCreator(creatorId: string): Promise<Event[]>;
  getEventsByAdmin(adminId: string): Promise<Event[]>;
  getEventsWithoutAdmins(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<void>;

  getEventAdminsByEvent(eventId: string): Promise<User[]>;
  assignEventAdmin(eventId: string, adminId: string): Promise<void>;
  removeEventAdmin(eventId: string, adminId: string): Promise<void>;

  getEventRules(eventId: string): Promise<EventRules | undefined>;
  createEventRules(rules: InsertEventRules): Promise<EventRules>;
  updateEventRules(eventId: string, rules: Partial<InsertEventRules>): Promise<EventRules | undefined>;

  getRoundsByEvent(eventId: string): Promise<Round[]>;
  getRound(id: string): Promise<Round | undefined>;
  createRound(round: InsertRound): Promise<Round>;
  updateRound(id: string, round: Partial<InsertRound>): Promise<Round | undefined>;
  updateRoundStatus(roundId: string, status: 'not_started' | 'in_progress' | 'paused' | 'completed', timestamp?: Date | null): Promise<Round | undefined>;
  updateRoundResultsPublished(roundId: string, published: boolean): Promise<Round | undefined>;
  updateRoundShowAnswers(roundId: string, show: boolean): Promise<Round | undefined>;
  deleteRound(id: string): Promise<void>;
  deleteRoundTestData(roundId: string): Promise<{ deletedAttempts: number; deletedAnswers: number }>;

  getRoundRules(roundId: string): Promise<RoundRules | undefined>;
  createRoundRules(rules: InsertRoundRules): Promise<RoundRules>;
  updateRoundRules(roundId: string, rules: Partial<InsertRoundRules>): Promise<RoundRules | undefined>;

  getQuestionsByRound(roundId: string): Promise<Question[]>;
  getQuestion(id: string): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: string): Promise<void>;

  getParticipantsByEvent(eventId: string): Promise<Participant[]>;
  getParticipantsByUser(userId: string): Promise<Participant[]>;
  getParticipantsByAdmin(adminId: string): Promise<any[]>;
  registerParticipant(participant: InsertParticipant): Promise<Participant>;
  getParticipantByUserAndEvent(userId: string, eventId: string): Promise<Participant | undefined>;
  updateParticipantStatus(participantId: string, status: 'registered' | 'completed' | 'disqualified'): Promise<Participant | undefined>;

  getTestAttempt(id: string): Promise<TestAttempt | undefined>;
  getTestAttemptByUserAndRound(userId: string, roundId: string): Promise<TestAttempt | undefined>;
  getTestAttemptsByUser(userId: string): Promise<TestAttempt[]>;
  getTestAttemptsByRound(roundId: string): Promise<TestAttempt[]>;
  createTestAttempt(attempt: InsertTestAttempt): Promise<TestAttempt>;
  updateTestAttempt(id: string, attempt: Partial<InsertTestAttempt>): Promise<TestAttempt | undefined>;
  deleteTestAttemptsByRound(roundId: string): Promise<void>;

  getAnswersByAttempt(attemptId: string): Promise<Answer[]>;
  getAnswer(id: string): Promise<Answer | undefined>;
  createAnswer(answer: InsertAnswer): Promise<Answer>;
  updateAnswer(id: string, answer: Partial<InsertAnswer>): Promise<Answer | undefined>;
  upsertAnswer(data: { attemptId: string; questionId: string; answer: string }): Promise<Answer>;

  getReports(): Promise<Report[]>;
  getReportsByEvent(eventId: string): Promise<Report[]>;
  getReport(id: string): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, report: Partial<InsertReport>): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;

  generateEventReport(eventId: string, generatedBy: string): Promise<Report>;
  generateSymposiumReport(generatedBy: string): Promise<Report>;

  createRegistrationForm(title: string, description: string, formFields: any[], slug: string): Promise<RegistrationForm>;
  getRegistrationFormBySlug(slug: string): Promise<RegistrationForm | undefined>;
  getAllRegistrationForms(): Promise<RegistrationForm[]>;
  getParticipant(id: string): Promise<Participant | undefined>;
  getActiveRegistrationForm(): Promise<RegistrationForm | undefined>;
  updateRegistrationForm(id: string, updates: Partial<RegistrationForm>): Promise<RegistrationForm | undefined>;
  deleteRegistrationForm(id: string): Promise<void>;

  // Team-based Registration methods

  createTeamRegistrationAtomic(data: {
    eventId: string;
    organizerRollNo: string;
    eventName?: string;
    organizerName: string;
    organizerEmail: string;
    organizerDept: string;
    organizerCollege?: string;
    organizerPhone?: string;
    organizerFoodType: 'veg' | 'nonveg';
    registrationType: 'solo' | 'team';
    paperTopic?: string;
    teamMembers?: Array<{
      memberRollNo: string;
      memberName: string;
      memberEmail: string;
      memberDept: string;
      memberPhone?: string;
      memberFoodType: 'veg' | 'nonveg';
    }>;
  }): Promise<{
    success: boolean;
    registration?: Registration;
    error?: string;
    department?: string;
    currentCount?: number;
  }>;
  updateRegistration(id: string, updates: Partial<InsertRegistration>): Promise<Registration | undefined>; // NEW METHOD
  getRegistrations(): Promise<any[]>;
  getRegistrationsByEvent(eventId: string): Promise<any[]>;
  getRegistration(id: string): Promise<any | undefined>;
  confirmRegistration(id: string, confirmedBy: string): Promise<Registration>;
  cancelRegistration(id: string): Promise<Registration>;
  deleteRegistration(id: string): Promise<void>;
  cleanupStalePendingRegistrations(maxAgeHours?: number): Promise<number>;

  // Roll number validation
  checkRollNoCategoryRegistration(rollNo: string, category: 'technical' | 'non_technical'): Promise<{
    isRegistered: boolean;
    registration?: Registration;
    event?: Event;
    role?: 'organizer' | 'team_member';
  }>;
  getRegistrationsByRollNo(rollNo: string): Promise<any[]>;

  // Team members
  getTeamMembersByRegistration(registrationId: string): Promise<TeamMember[]>;

  // Department participant count (per college)
  getParticipantCountByDepartment(department: string, college: string): Promise<number>;
  validateDepartmentParticipantLimit(departments: string[], college: string): Promise<{ valid: boolean; department?: string; currentCount?: number; message?: string }>;

  getEventsByIds(eventIds: string[]): Promise<Event[]>;
  createParticipant(userId: string, eventId: string): Promise<Participant>;

  createEventCredential(participantUserId: string, eventId: string, eventUsername: string, eventPassword: string): Promise<EventCredential>;
  getEventCredentialsByParticipant(participantUserId: string): Promise<EventCredential[]>;
  getEventCredentialsByEvent(eventId: string): Promise<Array<EventCredential & { participant: User, event: Event, paperTopic?: string | null }>>;
  getEventCredential(credentialId: string): Promise<EventCredential | undefined>;
  getEventCredentialByUserAndEvent(userId: string, eventId: string): Promise<EventCredential | undefined>;
  updateEventCredentialTestStatus(credentialId: string, testEnabled: boolean, enabledBy: string): Promise<EventCredential>;
  updateEventCredentialPassword(credentialId: string, eventPassword: string): Promise<EventCredential | undefined>;
  getEventCredentialsWithParticipants(eventId: string): Promise<Array<EventCredential & { participant: User }>>;
  isUserEventAdmin(userId: string, eventId: string): Promise<boolean>;
  getEventLeaderboard(eventId: string): Promise<LeaderboardEntry[]>;
  getRoundLeaderboard(roundId: string): Promise<LeaderboardEntry[]>;
  exportEventData(eventId: string): Promise<any>;
  getEventById(eventId: string): Promise<Event | undefined>;
  getParticipantCredentialWithDetails(userId: string, eventId: string): Promise<any>;

  getOnSpotParticipantsByCreator(creatorId?: string): Promise<Array<User & { eventCredentials: Array<EventCredential & { event: Event }> }>>;
  updateUserDetails(userId: string, updates: { fullName?: string; email?: string; phone?: string }): Promise<User | undefined>;
  getEventCredentialCountForEvent(eventId: string): Promise<number>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { adminId?: string; targetType?: string; startDate?: Date; endDate?: Date }): Promise<AuditLog[]>;
  getAuditLogsByTarget(targetType: string, targetId: string): Promise<AuditLog[]>;

  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogs(filters?: { status?: string; templateType?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<Omit<EmailLog, 'metadata'>[]>;
  getEmailLogsByRecipient(email: string, limit?: number): Promise<EmailLog[]>;
  getEmailLogsCount(filters?: { status?: string; templateType?: string; startDate?: Date; endDate?: Date }): Promise<number>;
  getEmailLogCountSince(since: Date, provider?: string): Promise<number>;
  getEmailLogById(id: string): Promise<EmailLog | null>;

  getParticipantsByEventId(eventId: string): Promise<User[]>;
  removeEventFromRegistrations(eventId: string): Promise<void>;

  getRegistrationStats(adminId?: string): Promise<{
    totalTeams: number;
    teamsPerEvent: Array<{ eventId: string; eventName: string; count: number }>;
    teamsPerCollege: Array<{ college: string; count: number }>;
    totalParticipants: number;
    vegCount: number;
    nonVegCount: number;
  }>;

  // Participant Registry methods (global participant info by roll_no)
  getParticipantRegistryByRollNo(rollNo: string): Promise<ParticipantRegistry | undefined>;
  upsertParticipantRegistry(data: {
    rollNo: string;
    name: string;
    email?: string;
    dept?: string;
    phone?: string;
    college?: string;
    foodType: FoodType;
  }): Promise<ParticipantRegistry>;

  // Manual Round Entries - for physical/offline round results
  getManualRoundEntriesByEvent(eventId: string): Promise<ManualRoundEntry[]>;
  getManualRoundEntriesByEventAndRound(eventId: string, roundNumber: number): Promise<(ManualRoundEntry & { participantEmail: string | null })[]>;
  createManualRoundEntry(entry: InsertManualRoundEntry): Promise<ManualRoundEntry>;
  updateManualRoundEntry(id: string, entry: Partial<InsertManualRoundEntry>): Promise<ManualRoundEntry | undefined>;
  deleteManualRoundEntry(id: string): Promise<void>;
  deleteManualRoundEntriesByEvent(eventId: string): Promise<void>;
  deleteManualRoundEntriesByEventAndRound(eventId: string, roundNumber: number): Promise<void>;

  // Event Winners
  getEventWinners(eventId: string): Promise<EventWinner[]>;
  createEventWinner(winner: InsertEventWinner): Promise<EventWinner>;
  updateEventWinner(id: string, winner: Partial<InsertEventWinner>): Promise<EventWinner | undefined>;
  deleteEventWinner(id: string): Promise<void>;
  deleteEventWinnersByEvent(eventId: string): Promise<void>;
  replaceEventWinners(eventId: string, winners: InsertEventWinner[]): Promise<EventWinner[]>;

  // Round 1 qualifiers (from online tests)
  getRound1Qualifiers(eventId: string, limit?: number): Promise<Array<{
    userId: string;
    userName: string;
    rollNo?: string;
    college?: string;
    dept?: string;
    email?: string;
    score: number;
    rank: number;
  }>>;

  // Batch query methods for performance optimization
  getUsersByIds(ids: string[]): Promise<User[]>;
  getAnswersByAttemptIds(attemptIds: string[]): Promise<Answer[]>;
  getTeamMembersByRegistrationIds(registrationIds: string[]): Promise<TeamMember[]>;
}

export class DatabaseStorage implements IStorage {
  private getTeamIdPrefix(eventName?: string): string {
    const cleaned = (eventName || 'EV').replace(/[^A-Za-z]/g, '').toUpperCase();
    if (cleaned.length === 0) return 'EV';
    return cleaned.slice(0, 2).padEnd(2, 'X');
  }

  // Team IDs are globally unique (unique constraint on registrations.team_id),
  // so the sequence must be global too: two events sharing the same two-letter
  // name prefix (e.g. "Hackathon" and "Hardware") would otherwise generate the
  // same ID. Trailing digits are parsed (not just the last two chars) so the
  // sequence keeps working past 99.
  private async getNextTeamSequence(): Promise<number> {
    const [row] = await db
      .select({ maxSeq: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${registrations.teamId} FROM '[0-9]+$') AS INTEGER)), 0)` })
      .from(registrations);

    return ((row?.maxSeq as number | undefined) || 0) + 1;
  }

  private async resolveEventName(eventId: string, fallbackName?: string): Promise<string> {
    if (fallbackName) return fallbackName;
    const event = await this.getEventById(eventId);
    return event?.name || 'Event';
  }

  private async generateTeamId(eventId: string, eventName?: string): Promise<string> {
    const resolvedName = await this.resolveEventName(eventId, eventName);
    const prefix = this.getTeamIdPrefix(resolvedName);
    const sequence = await this.getNextTeamSequence();
    return `BHC${prefix}${String(sequence).padStart(2, '0')}`;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Batch query: Get multiple users by their IDs in a single query
  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return await db.select().from(users).where(inArray(users.id, ids));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    const [user] = result as User[];
    return user;
  }

  async updateUserCredentials(userId: string, updates: { username?: string; email?: string; password?: string; fullName?: string }): Promise<User | undefined> {
    if (updates.username) {
      const existingUser = await this.getUserByUsername(updates.username);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('Username already exists');
      }
    }

    if (updates.email) {
      const existingUser = await this.getUserByEmail(updates.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('Email already exists');
      }
    }

    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.password !== undefined) updateData.password = updates.password;
    if (updates.fullName !== undefined) updateData.fullName = updates.fullName;

    const [user] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return user;
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async getOrphanedEventAdmins(): Promise<User[]> {
    const adminsWithAssignments = await db
      .select({ adminId: eventAdmins.adminId })
      .from(eventAdmins)
      .groupBy(eventAdmins.adminId);

    const assignedAdminIds = new Set(adminsWithAssignments.map(a => a.adminId));

    const allEventAdmins = await db
      .select()
      .from(users)
      .where(eq(users.role, 'event_admin'));

    return allEventAdmins.filter(admin => !assignedAdminIds.has(admin.id));
  }

  async getEvents(): Promise<Event[]> {
    return await db.select().from(events);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventByName(name: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.name, name));
    return event;
  }

  async getEventsByCreator(creatorId: string): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.createdBy, creatorId));
  }

  async getEventsByAdmin(adminId: string): Promise<Event[]> {
    const result = await db
      .select({ event: events })
      .from(eventAdmins)
      .innerJoin(events, eq(eventAdmins.eventId, events.id))
      .where(eq(eventAdmins.adminId, adminId));
    return result.map(r => r.event);
  }

  async getEventsWithoutAdmins(): Promise<Event[]> {
    const eventsWithAdmins = await db
      .select({ eventId: eventAdmins.eventId })
      .from(eventAdmins)
      .groupBy(eventAdmins.eventId);

    const assignedEventIds = new Set(eventsWithAdmins.map(e => e.eventId));

    const allEvents = await db.select().from(events);

    return allEvents.filter(event => !assignedEventIds.has(event.id));
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const [event] = await db.insert(events).values(insertEvent).returning();
    return event;
  }

  async updateEvent(id: string, updateData: Partial<InsertEvent>): Promise<Event | undefined> {
    const [event] = await db.update(events).set({ ...updateData, updatedAt: new Date() }).where(eq(events.id, id)).returning();
    return event;
  }

  async deleteEvent(id: string): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async getEventAdminsByEvent(eventId: string): Promise<User[]> {
    const result = await db
      .select({ user: users })
      .from(eventAdmins)
      .innerJoin(users, eq(eventAdmins.adminId, users.id))
      .where(eq(eventAdmins.eventId, eventId));
    return result.map(r => r.user);
  }

  async assignEventAdmin(eventId: string, adminId: string): Promise<void> {
    await db.insert(eventAdmins).values({ eventId, adminId });
  }

  async removeEventAdmin(eventId: string, adminId: string): Promise<void> {
    await db.delete(eventAdmins).where(and(eq(eventAdmins.eventId, eventId), eq(eventAdmins.adminId, adminId)));
  }

  async getEventRules(eventId: string): Promise<EventRules | undefined> {
    const [rules] = await db.select().from(eventRules).where(eq(eventRules.eventId, eventId));
    return rules;
  }

  async createEventRules(insertRules: InsertEventRules): Promise<EventRules> {
    const [rules] = await db.insert(eventRules).values(insertRules).returning();
    return rules;
  }

  async updateEventRules(eventId: string, updateData: Partial<InsertEventRules>): Promise<EventRules | undefined> {
    const [rules] = await db.update(eventRules).set({ ...updateData, updatedAt: new Date() }).where(eq(eventRules.eventId, eventId)).returning();
    return rules;
  }

  async getRoundsByEvent(eventId: string): Promise<Round[]> {
    return await db.select().from(rounds).where(eq(rounds.eventId, eventId));
  }

  async getRound(id: string): Promise<Round | undefined> {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
    return round;
  }

  async createRound(insertRound: InsertRound): Promise<Round> {
    const [round] = await db.insert(rounds).values(insertRound).returning();
    return round;
  }

  async updateRound(id: string, updateData: Partial<InsertRound>): Promise<Round | undefined> {
    const [round] = await db.update(rounds).set({ ...updateData, updatedAt: new Date() }).where(eq(rounds.id, id)).returning();
    return round;
  }

  async updateRoundStatus(roundId: string, status: 'not_started' | 'in_progress' | 'paused' | 'completed', timestamp?: Date | null): Promise<Round | undefined> {
    if (status === 'in_progress') {
      const existingRound = await this.getRound(roundId);
      const startedAt = timestamp !== undefined ? timestamp : (existingRound?.startedAt || new Date());
      const [round] = await db.update(rounds)
        .set({
          status: 'in_progress',
          startedAt,
          updatedAt: new Date()
        })
        .where(eq(rounds.id, roundId))
        .returning();
      return round;
    } else if (status === 'paused') {
      const [round] = await db.update(rounds)
        .set({
          status: 'paused',
          updatedAt: new Date()
        })
        .where(eq(rounds.id, roundId))
        .returning();
      return round;

    } else if (status === 'completed') {
      const [round] = await db.update(rounds)
        .set({
          status: 'completed',
          endedAt: timestamp || new Date(),
          updatedAt: new Date()
        })
        .where(eq(rounds.id, roundId))
        .returning();
      return round;
    } else if (status === 'not_started') {
      const [round] = await db.update(rounds)
        .set({
          status: 'not_started',
          startedAt: null,
          endedAt: null,
          updatedAt: new Date()
        })
        .where(eq(rounds.id, roundId))
        .returning();
      return round;
    }
    return undefined;
  }

  async updateRoundResultsPublished(roundId: string, published: boolean): Promise<Round | undefined> {
    const [round] = await db.update(rounds)
      .set({
        resultsPublished: published,
        updatedAt: new Date()
      })
      .where(eq(rounds.id, roundId))
      .returning();
    return round;
  }

  async updateRoundShowAnswers(roundId: string, show: boolean): Promise<Round | undefined> {
    const [round] = await db.update(rounds)
      .set({
        showAnswers: show,
        updatedAt: new Date()
      })
      .where(eq(rounds.id, roundId))
      .returning();
    return round;
  }

  async deleteRound(id: string): Promise<void> {
    await db.delete(rounds).where(eq(rounds.id, id));
  }

  async deleteRoundTestData(roundId: string): Promise<{ deletedAttempts: number; deletedAnswers: number }> {
    // H-02: delete answers + attempts atomically — a crash between the two
    // used to leave orphaned answers.
    return await db.transaction(async (tx) => {
      // First, get all test attempts for this round to count answers
      const attemptIds = await tx.select({ id: testAttempts.id })
        .from(testAttempts)
        .where(eq(testAttempts.roundId, roundId));

      let deletedAnswers = 0;
      if (attemptIds.length > 0) {
        // Delete all answers for these attempts
        const answerResult = await tx.delete(answers)
          .where(sql`${answers.attemptId} IN (${sql.join(attemptIds.map(a => sql`${a.id}`), sql`, `)})`)
          .returning({ id: answers.id });
        deletedAnswers = answerResult.length;
      }

      // Delete all test attempts for this round
      const attemptResult = await tx.delete(testAttempts)
        .where(eq(testAttempts.roundId, roundId))
        .returning({ id: testAttempts.id });

      return {
        deletedAttempts: attemptResult.length,
        deletedAnswers
      };
    });
  }

  async getRoundRules(roundId: string): Promise<RoundRules | undefined> {
    const [rules] = await db.select().from(roundRules).where(eq(roundRules.roundId, roundId));
    return rules;
  }

  async createRoundRules(insertRules: InsertRoundRules): Promise<RoundRules> {
    const [rules] = await db.insert(roundRules).values(insertRules).returning();
    return rules;
  }

  async updateRoundRules(roundId: string, updateData: Partial<InsertRoundRules>): Promise<RoundRules | undefined> {
    const [rules] = await db.update(roundRules).set({ ...updateData, updatedAt: new Date() }).where(eq(roundRules.roundId, roundId)).returning();
    return rules;
  }

  async getQuestionsByRound(roundId: string): Promise<Question[]> {
    return await db.select().from(questions).where(eq(questions.roundId, roundId));
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question;
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db.insert(questions).values(insertQuestion).returning();
    return question;
  }

  async updateQuestion(id: string, updateData: Partial<InsertQuestion>): Promise<Question | undefined> {
    const [question] = await db.update(questions).set({ ...updateData, updatedAt: new Date() }).where(eq(questions.id, id)).returning();
    return question;
  }

  async deleteQuestion(id: string): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  }

  async getParticipantsByEvent(eventId: string): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.eventId, eventId));
  }

  async getParticipantsByUser(userId: string): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.userId, userId));
  }

  async registerParticipant(insertParticipant: InsertParticipant): Promise<Participant> {
    const [participant] = await db.insert(participants).values(insertParticipant).returning();
    return participant;
  }

  async getParticipantByUserAndEvent(userId: string, eventId: string): Promise<Participant | undefined> {
    const [participant] = await db.select().from(participants)
      .where(and(eq(participants.userId, userId), eq(participants.eventId, eventId)));
    return participant;
  }

  async updateParticipantStatus(participantId: string, status: 'registered' | 'completed' | 'disqualified'): Promise<Participant | undefined> {
    const [participant] = await db.update(participants)
      .set({ status })
      .where(eq(participants.id, participantId))
      .returning();
    return participant;
  }

  async getParticipantsByAdmin(adminId: string) {
    const result = await db
      .select({
        participant: participants,
        user: users,
        event: events
      })
      .from(participants)
      .innerJoin(users, eq(participants.userId, users.id))
      .innerJoin(events, eq(participants.eventId, events.id))
      .innerJoin(eventAdmins, eq(events.id, eventAdmins.eventId))
      .where(eq(eventAdmins.adminId, adminId))
      .orderBy(desc(participants.registeredAt));

    return result.map(r => ({
      ...r.participant,
      user: r.user,
      event: r.event
    }));
  }

  async getTestAttempt(id: string): Promise<TestAttempt | undefined> {
    const [attempt] = await db.select().from(testAttempts).where(eq(testAttempts.id, id));
    return attempt;
  }

  async getTestAttemptByUserAndRound(userId: string, roundId: string): Promise<TestAttempt | undefined> {
    const [attempt] = await db.select().from(testAttempts)
      .where(and(eq(testAttempts.userId, userId), eq(testAttempts.roundId, roundId)));
    return attempt;
  }

  async getTestAttemptsByUser(userId: string): Promise<TestAttempt[]> {
    return await db.select().from(testAttempts).where(eq(testAttempts.userId, userId));
  }

  async getTestAttemptsByRound(roundId: string): Promise<TestAttempt[]> {
    return await db.select().from(testAttempts).where(eq(testAttempts.roundId, roundId));
  }

  async createTestAttempt(insertAttempt: InsertTestAttempt): Promise<TestAttempt> {
    // H-15: the (user_id, round_id) unique constraint makes a double start
    // (double-click / retried request) a no-op returning the existing row
    // instead of a 500 or a duplicate attempt.
    const [attempt] = await db.insert(testAttempts).values(insertAttempt)
      .onConflictDoNothing({ target: [testAttempts.userId, testAttempts.roundId] })
      .returning();
    if (attempt) return attempt;
    const existing = await this.getTestAttemptByUserAndRound(insertAttempt.userId, insertAttempt.roundId);
    if (!existing) throw new Error('Failed to create test attempt');
    return existing;
  }

  async updateTestAttempt(id: string, updateData: Partial<TestAttempt>): Promise<TestAttempt | undefined> {
    const [attempt] = await db.update(testAttempts).set(updateData).where(eq(testAttempts.id, id)).returning();
    return attempt;
  }

  // Round-2 H8: atomic violation append + counter bump in ONE statement. The
  // old route read violationLogs, pushed in JS, and wrote back — concurrent
  // violations overwrote each other (lost strikes) and the read-modify-write
  // counter double-counted. This keeps the array append and the increment
  // inside a single UPDATE, so 500 students hammering violations can't lose
  // or duplicate strikes.
  async logViolation(attemptId: string, type: string): Promise<TestAttempt | undefined> {
    const entry = JSON.stringify([{ type, timestamp: new Date().toISOString() }]);
    const setClause: Record<string, unknown> = {
      violationLogs: sql`COALESCE(${testAttempts.violationLogs}, '[]'::jsonb) || ${entry}::jsonb`,
    };
    if (type === "tab_switch") {
      setClause.tabSwitchCount = sql`COALESCE(${testAttempts.tabSwitchCount}, 0) + 1`;
    } else if (type === "refresh") {
      setClause.refreshAttemptCount = sql`COALESCE(${testAttempts.refreshAttemptCount}, 0) + 1`;
    }
    const [attempt] = await db.update(testAttempts).set(setClause as any).where(eq(testAttempts.id, attemptId)).returning();
    return attempt;
  }

  async deleteTestAttemptsByRound(roundId: string): Promise<void> {
    await db.delete(testAttempts).where(eq(testAttempts.roundId, roundId));
  }

  async getAnswersByAttempt(attemptId: string): Promise<Answer[]> {
    return await db.select().from(answers).where(eq(answers.attemptId, attemptId));
  }

  // Batch query: Get all answers for multiple attempts in a single query
  async getAnswersByAttemptIds(attemptIds: string[]): Promise<Answer[]> {
    if (attemptIds.length === 0) return [];
    return await db.select().from(answers).where(inArray(answers.attemptId, attemptIds));
  }

  async createAnswer(insertAnswer: InsertAnswer): Promise<Answer> {
    const [answer] = await db.insert(answers).values(insertAnswer).returning();
    return answer;
  }

  async getAnswer(id: string): Promise<Answer | undefined> {
    const [answer] = await db.select().from(answers).where(eq(answers.id, id)).limit(1);
    return answer;
  }

  async updateAnswer(id: string, updateData: Partial<Answer>): Promise<Answer | undefined> {
    const [answer] = await db.update(answers).set(updateData).where(eq(answers.id, id)).returning();
    return answer;
  }

  // Round-2 C3: submit grading + attempt flip in ONE transaction with a
  // compare-and-set on the status. The old code ran N updateAnswer calls and
  // then the attempt flip as separate statements — a crash in between left
  // half-graded answers on an `in_progress` attempt with no error surfaced,
  // and a double-submit could double-fire notifications.
  // Returns the completed attempt, or the current row when the CAS loses
  // (concurrent/duplicate submit — the caller should treat it as idempotent).
  async submitTestAttempt(
    attemptId: string,
    grading: Array<{ answerId: string; isCorrect: boolean; pointsAwarded: number }>,
    totalScore: number,
  ): Promise<TestAttempt | undefined> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      // CAS: only in_progress -> completed transitions.
      const [updated] = await tx
        .update(testAttempts)
        .set({ status: "completed", submittedAt: now, completedAt: now, totalScore })
        .where(and(eq(testAttempts.id, attemptId), eq(testAttempts.status, "in_progress")))
        .returning();
      if (!updated) {
        const [current] = await tx.select().from(testAttempts).where(eq(testAttempts.id, attemptId)).limit(1);
        return current;
      }
      for (const g of grading) {
        await tx
          .update(answers)
          .set({ isCorrect: g.isCorrect, pointsAwarded: g.pointsAwarded })
          .where(eq(answers.id, g.answerId));
      }
      return updated;
    });
  }

  // H-15: atomic upsert on (attempt_id, question_id). The save-answer endpoint
  // used find-then-insert/update, so two concurrent saves for the same
  // question could both insert and create duplicate rows.
  async upsertAnswer(data: { attemptId: string; questionId: string; answer: string }): Promise<Answer> {
    const [answer] = await db.insert(answers).values({
      attemptId: data.attemptId,
      questionId: data.questionId,
      answer: data.answer,
      isCorrect: false,
      pointsAwarded: 0,
    })
      .onConflictDoUpdate({
        target: [answers.attemptId, answers.questionId],
        set: { answer: data.answer, answeredAt: new Date() },
      })
      .returning();
    return answer;
  }

  // Round-2 H16: bulk answer save for the tab-close keepalive flush. One
  // transaction so a partial write can't strand half the flush; same
  // conflict target as the single upsert so it stays idempotent.
  async upsertAnswersBulk(items: Array<{ attemptId: string; questionId: string; answer: string }>): Promise<void> {
    if (items.length === 0) return;
    await db.transaction(async (tx) => {
      for (const data of items) {
        await tx.insert(answers).values({
          attemptId: data.attemptId,
          questionId: data.questionId,
          answer: data.answer,
          isCorrect: false,
          pointsAwarded: 0,
        })
          .onConflictDoUpdate({
            target: [answers.attemptId, answers.questionId],
            set: { answer: data.answer, answeredAt: new Date() },
          });
      }
    });
  }

  async getReports(): Promise<Report[]> {
    return await db.select().from(reports);
  }

  async getReportsByEvent(eventId: string): Promise<Report[]> {
    return await db.select().from(reports).where(eq(reports.eventId, eventId));
  }

  async getReport(id: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async createReport(insertReport: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(insertReport).returning();
    return report;
  }

  async updateReport(id: string, updateData: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db.update(reports).set(updateData).where(eq(reports.id, id)).returning();
    return report;
  }

  async deleteReport(id: string): Promise<void> {
    await db.delete(reports).where(eq(reports.id, id));
  }

  async generateEventReport(eventId: string, generatedBy: string): Promise<Report> {
    const event = await this.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const eventRoundsData = await db.select().from(rounds).where(eq(rounds.eventId, eventId));
    const eventParticipants = await this.getParticipantsByEvent(eventId);
    const eventRulesData = await this.getEventRules(eventId);

    // Get all registrations for this event with team members
    const eventRegistrations = await this.getRegistrationsByEvent(eventId);

    // Calculate college statistics from registrations
    const collegeMap = new Map<string, { count: number; participants: number }>();
    for (const reg of eventRegistrations) {
      const collegeName = reg.organizerCollege || 'Unknown';
      const current = collegeMap.get(collegeName) || { count: 0, participants: 0 };
      current.count += 1;
      // Count organizer + team members as participants
      current.participants += 1 + (reg.teamMembers?.length || 0);
      collegeMap.set(collegeName, current);
    }
    const collegeStatistics = Array.from(collegeMap.entries()).map(([name, data]) => ({
      collegeName: name,
      teamCount: data.count,
      participantCount: data.participants
    })).sort((a, b) => b.participantCount - a.participantCount);

    const roundsDetails = await Promise.all(
      eventRoundsData.map(async (round) => {
        const questionsData = await this.getQuestionsByRound(round.id);
        const attemptsData = await db
          .select({
            attempt: testAttempts,
            user: users
          })
          .from(testAttempts)
          .innerJoin(users, eq(testAttempts.userId, users.id))
          .where(eq(testAttempts.roundId, round.id));

        const questionAnalysis = await Promise.all(
          questionsData.map(async (question) => {
            const answersData = await db
              .select({
                answer: answers,
                attempt: testAttempts
              })
              .from(answers)
              .innerJoin(testAttempts, eq(answers.attemptId, testAttempts.id))
              .where(and(
                eq(answers.questionId, question.id),
                eq(testAttempts.roundId, round.id)
              ));

            const totalAnswers = answersData.length;
            const correctAnswers = answersData.filter(a => a.answer.isCorrect).length;
            const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

            return {
              questionId: question.id,
              questionText: question.questionText,
              questionType: question.questionType,
              points: question.points,
              totalAnswers,
              correctAnswers,
              accuracy: Math.round(accuracy * 100) / 100
            };
          })
        );

        const completedAttempts = attemptsData.filter(a => a.attempt.status === 'completed');
        const inProgressAttempts = attemptsData.filter(a => a.attempt.status === 'in_progress');
        const totalScore = completedAttempts.reduce((sum, a) => sum + (a.attempt.totalScore || 0), 0);
        const avgScore = completedAttempts.length > 0 ? totalScore / completedAttempts.length : 0;

        const violations = attemptsData.map(a => ({
          userId: a.user.id,
          userName: a.user.fullName,
          tabSwitches: a.attempt.tabSwitchCount || 0,
          refreshAttempts: a.attempt.refreshAttemptCount || 0,
          violationLogs: a.attempt.violationLogs || []
        }));

        const leaderboard = await this.getRoundLeaderboard(round.id);

        // Get top 3 winners for this round with registration details
        const top3 = leaderboard.slice(0, 3);
        const winners = await Promise.all(top3.map(async (entry, index) => {
          // Find registration for this user
          const userReg = eventRegistrations.find(r => {
            // Check if organizer email matches
            const user = attemptsData.find(a => a.user.id === entry.userId)?.user;
            if (!user) return false;
            return r.organizerEmail === user.email ||
              r.teamMembers?.some((m: any) => m.memberEmail === user.email);
          });

          return {
            rank: index + 1,
            userId: entry.userId,
            userName: entry.userName,
            score: entry.totalScore,
            maxScore: entry.maxScore,
            submittedAt: entry.submittedAt,
            college: userReg?.organizerCollege || 'Unknown',
            rollNo: userReg?.organizerRollNo || null,
            department: userReg?.organizerDept || null
          };
        }));

        return {
          roundId: round.id,
          roundName: round.name,
          roundNumber: round.roundNumber,
          duration: round.duration,
          status: round.status,
          // Enhanced timing information
          timing: {
            scheduledStart: round.startTime,
            scheduledEnd: round.endTime,
            actualStart: round.startedAt,
            actualEnd: round.endedAt
          },
          // Enhanced attendance
          attendance: {
            registered: eventParticipants.length,
            attempted: attemptsData.length,
            inProgress: inProgressAttempts.length,
            completed: completedAttempts.length,
            completionRate: attemptsData.length > 0 ? Math.round((completedAttempts.length / attemptsData.length) * 100) : 0
          },
          totalQuestions: questionsData.length,
          totalAttempts: attemptsData.length,
          completedAttempts: completedAttempts.length,
          averageScore: Math.round(avgScore * 100) / 100,
          // Winners for this round
          winners,
          questionAnalysis,
          violations,
          leaderboard: leaderboard.slice(0, 10)
        };
      })
    );

    const participantDetails = await Promise.all(
      eventParticipants.map(async (participant) => {
        const user = await this.getUser(participant.userId);
        const attempts = await db
          .select()
          .from(testAttempts)
          .innerJoin(rounds, eq(testAttempts.roundId, rounds.id))
          .where(and(
            eq(rounds.eventId, eventId),
            eq(testAttempts.userId, participant.userId)
          ));

        const totalScore = attempts
          .filter(a => a.test_attempts.status === 'completed')
          .reduce((sum, a) => sum + (a.test_attempts.totalScore || 0), 0);

        // Find registration info for this participant
        const userReg = eventRegistrations.find(r =>
          r.organizerEmail === user?.email ||
          r.teamMembers?.some((m: any) => m.memberEmail === user?.email)
        );

        return {
          userId: participant.userId,
          userName: user?.fullName,
          email: user?.email,
          college: userReg?.organizerCollege || null,
          department: userReg?.organizerDept || null,
          rollNo: userReg?.organizerRollNo || null,
          registeredAt: participant.registeredAt,
          status: participant.status,
          attemptsCount: attempts.length,
          completedAttempts: attempts.filter(a => a.test_attempts.status === 'completed').length,
          totalScore,
          // Round-wise breakdown
          roundWiseScores: attempts
            .filter(a => a.test_attempts.status === 'completed')
            .map(a => ({
              roundId: a.rounds.id,
              roundName: a.rounds.name,
              score: a.test_attempts.totalScore,
              maxScore: a.test_attempts.maxScore,
              submittedAt: a.test_attempts.submittedAt
            }))
        };
      })
    );

    // Registration data with team members
    const registrationData = eventRegistrations.map(reg => ({
      registrationId: reg.id,
      status: reg.status,
      registrationType: reg.registrationType,
      createdAt: reg.createdAt,
      organizer: {
        name: reg.organizerName,
        email: reg.organizerEmail,
        rollNo: reg.organizerRollNo,
        department: reg.organizerDept,
        college: reg.organizerCollege,
        phone: reg.organizerPhone,
        foodType: reg.organizerFoodType
      },
      teamMembers: reg.teamMembers?.map((m: any) => ({
        name: m.memberName,
        email: m.memberEmail,
        rollNo: m.memberRollNo,
        department: m.memberDept,
        phone: m.memberPhone,
        foodType: m.memberFoodType
      })) || [],
      paperTopic: reg.paperTopic
    }));

    const reportData = {
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        type: event.type,
        category: event.category,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status
      },
      rules: eventRulesData,
      // Summary statistics
      summary: {
        totalRounds: eventRoundsData.length,
        totalParticipants: eventParticipants.length,
        totalRegistrations: eventRegistrations.length,
        totalColleges: collegeStatistics.length,
        confirmedRegistrations: eventRegistrations.filter(r => r.status === 'confirmed').length,
        pendingRegistrations: eventRegistrations.filter(r => r.status === 'pending').length
      },
      collegeStatistics,
      rounds: roundsDetails,
      participants: participantDetails,
      registrations: registrationData,
      generatedAt: new Date().toISOString()
    };

    const report = await this.createReport({
      eventId,
      reportType: 'event_wise',
      title: `${event.name} - Event Report`,
      generatedBy,
      reportData,
      fileUrl: null
    });

    return report;
  }


  async generateSymposiumReport(generatedBy: string): Promise<Report> {
    const allEvents = await this.getEvents();
    const allUsers = await this.getUsers();

    // Get all registrations across all events for college and attendance statistics
    const allRegistrations = await this.getRegistrations();

    // Calculate unique colleges across all events
    const allColleges = new Set<string>();
    for (const reg of allRegistrations) {
      if (reg.organizerCollege) {
        allColleges.add(reg.organizerCollege);
      }
    }

    // College-wise participation statistics
    const collegeParticipation = new Map<string, { teams: number; participants: number; events: Set<string> }>();
    for (const reg of allRegistrations) {
      const college = reg.organizerCollege || 'Unknown';
      const current = collegeParticipation.get(college) || { teams: 0, participants: 0, events: new Set<string>() };
      current.teams += 1;
      current.participants += 1 + (reg.teamMembers?.length || 0);
      current.events.add(reg.eventId);
      collegeParticipation.set(college, current);
    }

    const collegeStatistics = Array.from(collegeParticipation.entries())
      .map(([name, data]) => ({
        collegeName: name,
        teamCount: data.teams,
        participantCount: data.participants,
        eventsParticipated: data.events.size
      }))
      .sort((a, b) => b.participantCount - a.participantCount);

    const eventSummaries = await Promise.all(
      allEvents.map(async (event) => {
        const eventRoundsData = await db.select().from(rounds).where(eq(rounds.eventId, event.id));
        const eventParticipants = await this.getParticipantsByEvent(event.id);
        const eventRegs = allRegistrations.filter(r => r.eventId === event.id);

        const roundIds = eventRoundsData.map(r => r.id);
        let completedAttempts = 0;
        let totalAttempts = 0;
        let totalScore = 0;

        if (roundIds.length > 0) {
          const attemptsData = await db
            .select()
            .from(testAttempts)
            .where(sql`${testAttempts.roundId} IN (${sql.join(roundIds.map(id => sql`${id}`), sql`, `)})`);

          totalAttempts = attemptsData.length;
          completedAttempts = attemptsData.filter(a => a.status === 'completed').length;
          totalScore = attemptsData
            .filter(a => a.status === 'completed')
            .reduce((sum, a) => sum + (a.totalScore || 0), 0);
        }

        // Get event winner (top performer overall)
        const eventLeaderboard = await this.getEventLeaderboard(event.id);
        const topPerformer = eventLeaderboard.length > 0 ? eventLeaderboard[0] : null;

        // Find winner's registration for college info
        let winnerDetails = null;
        if (topPerformer) {
          const winnerUser = await this.getUser(topPerformer.userId);
          const winnerReg = eventRegs.find(r =>
            r.organizerEmail === winnerUser?.email ||
            r.teamMembers?.some((m: any) => m.memberEmail === winnerUser?.email)
          );
          winnerDetails = {
            userId: topPerformer.userId,
            userName: topPerformer.userName,
            score: topPerformer.totalScore,
            college: winnerReg?.organizerCollege || 'Unknown',
            department: winnerReg?.organizerDept || null
          };
        }

        // Count unique colleges for this event
        const eventColleges = new Set(eventRegs.map(r => r.organizerCollege).filter(Boolean));

        return {
          eventId: event.id,
          eventName: event.name,
          eventType: event.type,
          category: event.category,
          status: event.status,
          totalRounds: eventRoundsData.length,
          totalParticipants: eventParticipants.length,
          totalRegistrations: eventRegs.length,
          totalColleges: eventColleges.size,
          totalAttempts,
          completedAttempts,
          completionRate: totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0,
          averageScore: completedAttempts > 0 ? Math.round((totalScore / completedAttempts) * 100) / 100 : 0,
          winner: winnerDetails
        };
      })
    );

    const allAttempts = await db
      .select({
        userId: testAttempts.userId,
        userName: users.fullName,
        userEmail: users.email,
        totalScore: sql<number>`SUM(${testAttempts.totalScore})`.as('total_score'),
        attemptsCount: sql<number>`COUNT(*)`.as('attempts_count')
      })
      .from(testAttempts)
      .innerJoin(users, eq(testAttempts.userId, users.id))
      .where(eq(testAttempts.status, 'completed'))
      .groupBy(testAttempts.userId, users.fullName, users.email)
      .orderBy(desc(sql`SUM(${testAttempts.totalScore})`))
      .limit(50);

    const participantCount = await db
      .select({ userId: participants.userId })
      .from(participants)
      .groupBy(participants.userId);

    const totalCompletedAttempts = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(testAttempts)
      .where(eq(testAttempts.status, 'completed'));

    const totalViolations = await db
      .select({
        totalTabSwitches: sql<number>`SUM(${testAttempts.tabSwitchCount})`.as('total_tab_switches'),
        totalRefreshes: sql<number>`SUM(${testAttempts.refreshAttemptCount})`.as('total_refreshes')
      })
      .from(testAttempts);

    // Enhance top performers with college info
    const topPerformersWithDetails = await Promise.all(
      allAttempts.slice(0, 20).map(async (performer, index) => {
        const performerReg = allRegistrations.find(r =>
          r.organizerEmail === performer.userEmail ||
          r.teamMembers?.some((m: any) => m.memberEmail === performer.userEmail)
        );
        return {
          rank: index + 1,
          userId: performer.userId,
          userName: performer.userName,
          email: performer.userEmail,
          totalScore: performer.totalScore,
          attemptsCount: performer.attemptsCount,
          college: performerReg?.organizerCollege || 'Unknown',
          department: performerReg?.organizerDept || null
        };
      })
    );

    // Registration summary
    const confirmedRegs = allRegistrations.filter(r => r.status === 'confirmed').length;
    const pendingRegs = allRegistrations.filter(r => r.status === 'pending').length;
    const totalTeamSize = allRegistrations.reduce((sum, r) => sum + 1 + (r.teamMembers?.length || 0), 0);

    const reportData = {
      overview: {
        totalEvents: allEvents.length,
        activeEvents: allEvents.filter(e => e.status === 'active').length,
        completedEvents: allEvents.filter(e => e.status === 'completed').length,
        draftEvents: allEvents.filter(e => e.status === 'draft').length,
        totalParticipants: participantCount.length,
        totalRegistrations: allRegistrations.length,
        confirmedRegistrations: confirmedRegs,
        pendingRegistrations: pendingRegs,
        totalTeamParticipants: totalTeamSize,
        totalColleges: allColleges.size,
        totalEventAdmins: allUsers.filter(u => u.role === 'event_admin').length,
        totalCompletedAttempts: totalCompletedAttempts[0]?.count || 0,
        totalViolations: {
          tabSwitches: totalViolations[0]?.totalTabSwitches || 0,
          refreshes: totalViolations[0]?.totalRefreshes || 0
        }
      },
      collegeStatistics,
      eventSummaries,
      topPerformers: topPerformersWithDetails,
      generatedAt: new Date().toISOString()
    };

    const report = await this.createReport({
      eventId: null,
      reportType: 'symposium_wide',
      title: 'Symposium-wide Report',
      generatedBy,
      reportData,
      fileUrl: null
    });

    return report;
  }




  async getEventLeaderboard(eventId: string) {
    const roundsData = await db.select().from(rounds).where(eq(rounds.eventId, eventId));
    const roundIds = roundsData.map(r => r.id);

    if (roundIds.length === 0) {
      return [];
    }

    const attempts = await db
      .select({
        userId: testAttempts.userId,
        userName: users.fullName,
        totalScore: sql<number>`SUM(${testAttempts.totalScore})`.as('total_score'),
        maxScore: sql<number>`SUM(${testAttempts.maxScore})`.as('max_score'),
        submittedAt: sql<Date>`MAX(${testAttempts.submittedAt})`.as('last_submitted')
      })
      .from(testAttempts)
      .innerJoin(users, eq(testAttempts.userId, users.id))
      .leftJoin(participants, and(
        eq(participants.userId, testAttempts.userId),
        eq(participants.eventId, eventId)
      ))
      .where(and(
        sql`${testAttempts.roundId} IN (${sql.join(roundIds.map(id => sql`${id}`), sql`, `)})`,
        eq(testAttempts.status, 'completed'),
        or(ne(participants.status, 'disqualified'), isNull(participants.status))
      ))
      .groupBy(testAttempts.userId, users.fullName)
      .orderBy(desc(sql`SUM(${testAttempts.totalScore})`), asc(sql`MAX(${testAttempts.submittedAt})`));

    return attempts.map((attempt, index) => ({
      ...attempt,
      rank: index + 1
    }));
  }

  async getRoundLeaderboard(roundId: string) {
    const round = await this.getRound(roundId);
    const eventId = round?.eventId;

    let query = db
      .select({
        userId: testAttempts.userId,
        userName: users.fullName,
        totalScore: sql<number>`SUM(${testAttempts.totalScore})`.as('total_score'),
        maxScore: sql<number>`SUM(${testAttempts.maxScore})`.as('max_score'),
        submittedAt: sql<Date>`MAX(${testAttempts.submittedAt})`.as('last_submitted')
      })
      .from(testAttempts)
      .innerJoin(users, eq(testAttempts.userId, users.id));

    if (eventId) {
      query = query.leftJoin(participants, and(
        eq(participants.userId, testAttempts.userId),
        eq(participants.eventId, eventId)
      )) as any;
    }

    const whereConditions: any[] = [
      eq(testAttempts.roundId, roundId),
      eq(testAttempts.status, 'completed')
    ];

    if (eventId) {
      whereConditions.push(or(ne(participants.status, 'disqualified'), isNull(participants.status)));
    }

    const attempts = await query
      .where(and(...whereConditions))
      .groupBy(testAttempts.userId, users.fullName)
      .orderBy(desc(sql`SUM(${testAttempts.totalScore})`), asc(sql`MAX(${testAttempts.submittedAt})`));

    return attempts.map((attempt, index) => ({
      ...attempt,
      rank: index + 1
    }));
  }

  async createRegistrationForm(
    titleOrData: string | {
      title: string;
      description?: string | null;
      formSlug: string;
      formFields: any[];
      headerImage?: string | null;
      allowedCategories?: Array<'technical' | 'non_technical'>;
      isActive?: boolean;
    },
    description?: string,
    formFields?: any[],
    slug?: string,
    headerImage?: string | null,
  ): Promise<RegistrationForm> {
    // Accept both a full object and the legacy positional signature
    const data = typeof titleOrData === 'object' ? titleOrData : {
      title: titleOrData,
      description: description ?? '',
      formSlug: slug!,
      formFields: formFields!,
      headerImage: headerImage ?? null,
    };
    const [form] = await db.insert(registrationForms).values({
      title: data.title,
      description: data.description ?? '',
      formSlug: data.formSlug,
      formFields: data.formFields,
      headerImage: data.headerImage ?? null,
      allowedCategories: data.allowedCategories ?? ['technical', 'non_technical'],
      isActive: data.isActive ?? true,
    }).returning();
    return form;
  }

  async getRegistrationFormBySlug(slug: string): Promise<RegistrationForm | undefined> {
    const [form] = await db.select().from(registrationForms).where(eq(registrationForms.formSlug, slug));
    return form;
  }

  async getRegistrationFormById(id: string): Promise<RegistrationForm | undefined> {
    const [form] = await db.select().from(registrationForms).where(eq(registrationForms.id, id));
    return form;
  }

  async getAllRegistrationForms(): Promise<RegistrationForm[]> {
    return await db.select().from(registrationForms).orderBy(desc(registrationForms.createdAt));
  }

  async getActiveRegistrationForm(): Promise<RegistrationForm | undefined> {
    const [form] = await db.select().from(registrationForms)
      .where(eq(registrationForms.isActive, true))
      .orderBy(desc(registrationForms.createdAt))
      .limit(1);
    return form;
  }

  async updateRegistrationForm(id: string, updates: Partial<RegistrationForm>): Promise<RegistrationForm | undefined> {
    const [form] = await db.update(registrationForms)
      .set(updates)
      .where(eq(registrationForms.id, id))
      .returning();
    return form;
  }

  // ============ Team-Based Registration Methods ============

  /**
   * ATOMIC: Create team registration with department limit validation
   * 
   * This method wraps validation + registration creation in a database transaction
   * to prevent race conditions where concurrent requests could bypass the department limit.
   * 
   * @param data - Registration data including organizer and optional team members
   * @returns Promise resolving to { success, registration?, error?, department?, currentCount? }
   */
  async createTeamRegistrationAtomic(data: {
    eventId: string;
    eventName?: string;
    organizerRollNo: string;
    organizerName: string;
    organizerEmail: string;
    organizerDept: string;
    organizerCollege?: string;
    organizerPhone?: string;
    organizerFoodType: 'veg' | 'nonveg';
    registrationType: 'solo' | 'team';
    paperTopic?: string;
    teamMembers?: Array<{
      memberRollNo: string;
      memberName: string;
      memberEmail: string;
      memberDept: string;
      memberPhone?: string;
      memberFoodType: 'veg' | 'nonveg';
    }>;
  }): Promise<{
    success: boolean;
    registration?: Registration;
    error?: string;
    department?: string;
    currentCount?: number;
  }> {
    const DEPARTMENT_LIMIT = 10;

    // Normalize all department names
    const normalizedOrganizerDept = normalizeDepartment(data.organizerDept);
    const allDepartments = [normalizedOrganizerDept];

    if (data.teamMembers && data.teamMembers.length > 0) {
      data.teamMembers.forEach(m => {
        const normalizedDept = normalizeDepartment(m.memberDept);
        if (!allDepartments.includes(normalizedDept)) {
          allDepartments.push(normalizedDept);
        }
      });
    }

    // Round-2 H5: acquire the advisory locks in a deterministic (sorted)
    // order. Two concurrent team registrations touching {CSE, ECE} and
    // {ECE, CSE} used to lock in opposite orders — a classic deadlock under
    // registration spikes.
    allDepartments.sort();

    const normalizedCollege = data.organizerCollege ? data.organizerCollege.trim().toUpperCase() : '';

    try {
      // H-02: the whole flow now runs in a single transaction (the Pool driver
      // supports db.transaction()). Any failure rolls back every write, which
      // replaces the old manual "delete the registration" compensation.
      return await db.transaction(async (tx) => {
        // Step 1: Validate department limits per college.
        for (const dept of allDepartments) {
          // H-03: transaction-scoped advisory lock per college+dept serializes
          // the count-then-insert window, so two concurrent registrations for
          // the same department can't both slip under the cap.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'dept-cap:' + normalizedCollege + ':' + dept}))`);

          // Count confirmed + pending registrations (prevents over-registration) for THIS COLLEGE
          const organizerCount = await tx
            .select({ rollNo: registrations.organizerRollNo })
            .from(registrations)
            .where(
              and(
                inArray(registrations.status, ['confirmed', 'pending']),
                sql`UPPER(TRIM(${registrations.organizerDept})) = ${dept}`,
                sql`UPPER(TRIM(${registrations.organizerCollege})) = ${normalizedCollege}`
              )
            );

          const memberCount = await tx
            .select({ rollNo: teamMembers.memberRollNo })
            .from(teamMembers)
            .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
            .where(
              and(
                inArray(registrations.status, ['confirmed', 'pending']),
                sql`UPPER(TRIM(${teamMembers.memberDept})) = ${dept}`,
                sql`UPPER(TRIM(${registrations.organizerCollege})) = ${normalizedCollege}`
              )
            );

          // Get unique roll numbers (participants can be in multiple registrations)
          const existingRollNos = new Set<string>();
          organizerCount.forEach(r => existingRollNos.add(r.rollNo));
          memberCount.forEach(r => existingRollNos.add(r.rollNo));

          const currentCount = existingRollNos.size;

          // Calculate how many NEW unique participants this registration will add
          const newParticipants = new Set<string>();

          // Check organizer (only if from this dept)
          const normalizedOrgDept = normalizeDepartment(data.organizerDept);
          if (normalizedOrgDept === dept && !existingRollNos.has(data.organizerRollNo)) {
            newParticipants.add(data.organizerRollNo);
          }

          // Check team members (only from this dept)
          if (data.teamMembers && data.teamMembers.length > 0) {
            data.teamMembers.forEach(member => {
              const memberDept = normalizeDepartment(member.memberDept);
              if (memberDept === dept && !existingRollNos.has(member.memberRollNo)) {
                newParticipants.add(member.memberRollNo);
              }
            });
          }

          const newCount = newParticipants.size;
          const projectedTotal = currentCount + newCount;

          // Reject if adding these new participants would exceed the limit for THIS COLLEGE
          if (projectedTotal > DEPARTMENT_LIMIT) {
            return {
              success: false,
              error: `Department "${dept}" at ${data.organizerCollege} would exceed the maximum limit of ${DEPARTMENT_LIMIT} unique participants. Current: ${currentCount}, New: ${newCount}, Total would be: ${projectedTotal}`,
              department: dept,
              currentCount: currentCount,
            };
          }
        }

        // Serialize team-ID generation GLOBALLY: team_id carries a global unique
        // constraint, and the two-letter event prefix is not unique per event
        // (e.g. "Hackathon" vs "Hardware"), so a per-event lock/sequence could
        // hand two events the same ID. The lock is held to transaction end, so
        // no two concurrent registrations can compute the same MAX()+1 value —
        // a unique conflict is impossible by construction here.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'team-id:global'}))`);

        // Step 2: Create registration with generated team ID
        const teamId = await this.generateTeamId(data.eventId, data.eventName);
        const [created] = await tx.insert(registrations).values({
          eventId: data.eventId,
          organizerRollNo: data.organizerRollNo,
          organizerEmail: data.organizerEmail,
          organizerName: data.organizerName,
          organizerDept: normalizedOrganizerDept, // Store normalized department
          organizerCollege: data.organizerCollege || null,
          organizerPhone: data.organizerPhone || null,
          organizerFoodType: data.organizerFoodType,
          registrationType: data.registrationType,
          paperTopic: data.paperTopic || null,
          status: 'pending',
          confirmedBy: null,
          teamId,
        }).returning();

        const registration = created as Registration;

        // Step 3: Add team members (transaction rolls back on failure — no
        // manual compensation delete needed)
        if (data.teamMembers && data.teamMembers.length > 0) {
          await tx.insert(teamMembers).values(
            data.teamMembers.map(member => ({
              registrationId: registration!.id,
              memberRollNo: member.memberRollNo,
              memberName: member.memberName,
              memberEmail: member.memberEmail,
              memberDept: normalizeDepartment(member.memberDept), // Store normalized
              memberPhone: member.memberPhone || null,
              memberFoodType: member.memberFoodType,
            }))
          );
        }

        return { success: true, registration };
      });
    } catch (error: any) {
      // Log and re-throw unexpected errors
      console.error('Registration creation error:', error);
      throw error;
    }
  }

  // Round-2 M8: the non-atomic createTeamRegistration was deleted. It had no
  // callers (all routes use createTeamRegistrationAtomic) and its multi-
  // statement insert-then-members flow could strand a registration without
  // its team members on partial failure.


  // Round-2 M4: optional event filter + pagination. The old getRegistrations()
  // loaded every registration in the database for admin dashboards (50k
  // rows x team members x 500 students) and /api/event-admin/participants
  // then filtered in JS. Callers that need everything (exports) keep calling
  // with no options; the dashboard routes pass limit/offset.
  async getRegistrations(options?: { eventIds?: string[]; limit?: number; offset?: number }): Promise<any[]> {
    const result = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .leftJoin(events, eq(registrations.eventId, events.id))
      .where(options?.eventIds?.length ? inArray(registrations.eventId, options.eventIds) : undefined)
      .orderBy(desc(registrations.createdAt))
      .limit(options?.limit ?? 1000000)
      .offset(options?.offset ?? 0);

    // Fetch team members for each registration
    const registrationIds = result.map(r => r.registration.id);
    const allTeamMembers = registrationIds.length > 0
      ? await db.select().from(teamMembers).where(
        sql`${teamMembers.registrationId} IN (${sql.join(registrationIds.map(id => sql`${id}`), sql`, `)})`
      )
      : [];

    return result.map(r => ({
      ...r.registration,
      event: r.event,
      teamMembers: allTeamMembers.filter(m => m.registrationId === r.registration.id)
    }));
  }

  // Round-2 M4: total count for paginated admin dashboards (X-Total-Count).
  async getRegistrationsCount(eventIds?: string[]): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(registrations)
      .where(eventIds?.length ? inArray(registrations.eventId, eventIds) : undefined);
    return row?.count ?? 0;
  }

  async getRegistrationsByEvent(eventId: string): Promise<any[]> {
    const result = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .leftJoin(events, eq(registrations.eventId, events.id))
      .where(eq(registrations.eventId, eventId))
      .orderBy(desc(registrations.createdAt));

    // Fetch team members for each registration
    const registrationIds = result.map(r => r.registration.id);
    const allTeamMembers = registrationIds.length > 0
      ? await db.select().from(teamMembers).where(
        sql`${teamMembers.registrationId} IN (${sql.join(registrationIds.map(id => sql`${id}`), sql`, `)})`
      )
      : [];

    return result.map(r => ({
      ...r.registration,
      event: r.event,
      teamMembers: allTeamMembers.filter(m => m.registrationId === r.registration.id)
    }));
  }

  async getRegistration(id: string): Promise<any | undefined> {
    const result = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .leftJoin(events, eq(registrations.eventId, events.id))
      .where(eq(registrations.id, id));

    if (result.length === 0) return undefined;

    const r = result[0];
    const members = await db.select().from(teamMembers)
      .where(eq(teamMembers.registrationId, id));

    return {
      ...r.registration,
      event: r.event,
      teamMembers: members
    };
  }

  async confirmRegistration(id: string, confirmedBy: string): Promise<Registration> {
    // BUG-C-02: confirm only from 'pending' in the UPDATE itself — the JS
    // status check in the route races with concurrent confirms, which used
    // to send duplicate credential emails.
    const [registration] = await db.update(registrations).set({
      status: 'confirmed',
      confirmedAt: new Date(),
      confirmedBy,
      updatedAt: new Date()
    }).where(and(eq(registrations.id, id), eq(registrations.status, 'pending'))).returning();
    if (!registration) {
      throw new Error('Registration is not in pending state or does not exist');
    }
    return registration;
  }

  async updateRegistration(id: string, updates: Partial<InsertRegistration>): Promise<Registration | undefined> {
    const [registration] = await db.update(registrations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(registrations.id, id))
      .returning();
    return registration;
  }

  async cancelRegistration(id: string): Promise<Registration> {
    const [registration] = await db.update(registrations).set({
      status: 'cancelled',
      updatedAt: new Date()
    }).where(eq(registrations.id, id)).returning();
    return registration;
  }

  async deleteRegistration(id: string): Promise<void> {
    // H-02: delete members + registration atomically — a crash between the
    // two used to leave orphaned team members.
    await db.transaction(async (tx) => {
      // First delete team members
      await tx.delete(teamMembers).where(eq(teamMembers.registrationId, id));
      // Then delete the registration
      await tx.delete(registrations).where(eq(registrations.id, id));
    });
  }

  /**
   * Cleanup stale pending registrations
   * 
   * Cancels pending registrations that are older than the specified age.
   * This prevents abandoned registrations from permanently blocking department slots.
   * 
   * Should be run as a scheduled job (e.g., daily via cron).
   * 
   * @param maxAgeHours - Maximum age in hours for pending registrations (default: 24)
   * @returns Number of registrations cancelled
   */
  async cleanupStalePendingRegistrations(maxAgeHours: number = 24): Promise<number> {
    const result = await db.update(registrations)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(registrations.status, 'pending'),
          sql`${registrations.createdAt} < NOW() - INTERVAL '${sql.raw(maxAgeHours.toString())} hours'`
        )
      )
      .returning();

    return result.length;
  }

  async checkRollNoCategoryRegistration(rollNo: string, category: 'technical' | 'non_technical'): Promise<{
    isRegistered: boolean;
    registration?: Registration;
    event?: Event;
    role?: 'organizer' | 'team_member';
  }> {
    // BUG-B-08: normalize the roll number (trim + uppercase) and compare
    // against normalized DB values — otherwise "ABC123" vs "abc123" bypasses
    // the one-registration-per-category rule.
    const normalizedRollNo = rollNo.trim().toUpperCase();

    // Check if rollNo is an organizer in any registration for this category
    const organizerResult = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(and(
        sql`UPPER(TRIM(${registrations.organizerRollNo})) = ${normalizedRollNo}`,
        eq(events.category, category),
        or(eq(registrations.status, 'pending'), eq(registrations.status, 'confirmed'))
      ));

    if (organizerResult.length > 0) {
      return {
        isRegistered: true,
        registration: organizerResult[0].registration,
        event: organizerResult[0].event,
        role: 'organizer'
      };
    }

    // Check if rollNo is a team member in any registration for this category
    const memberResult = await db.select({
      teamMember: teamMembers,
      registration: registrations,
      event: events
    })
      .from(teamMembers)
      .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(and(
        sql`UPPER(TRIM(${teamMembers.memberRollNo})) = ${normalizedRollNo}`,
        eq(events.category, category),
        or(eq(registrations.status, 'pending'), eq(registrations.status, 'confirmed'))
      ));

    if (memberResult.length > 0) {
      return {
        isRegistered: true,
        registration: memberResult[0].registration,
        event: memberResult[0].event,
        role: 'team_member'
      };
    }

    return { isRegistered: false };
  }

  async getRegistrationsByRollNo(rollNo: string): Promise<any[]> {
    // Get registrations where rollNo is organizer
    const organizerRegs = await db.select({
      registration: registrations,
      event: events
    })
      .from(registrations)
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(eq(registrations.organizerRollNo, rollNo));

    // Get registrations where rollNo is team member
    const memberRegs = await db.select({
      teamMember: teamMembers,
      registration: registrations,
      event: events
    })
      .from(teamMembers)
      .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(eq(teamMembers.memberRollNo, rollNo));

    const allRegs: any[] = [];

    for (const r of organizerRegs) {
      const members = await this.getTeamMembersByRegistration(r.registration.id);
      allRegs.push({
        ...r.registration,
        event: r.event,
        role: 'organizer',
        teamMembers: members
      });
    }

    for (const r of memberRegs) {
      // Avoid duplicates if somehow in both (shouldn't happen)
      if (!allRegs.find(reg => reg.id === r.registration.id)) {
        const members = await this.getTeamMembersByRegistration(r.registration.id);
        allRegs.push({
          ...r.registration,
          event: r.event,
          role: 'team_member',
          teamMembers: members
        });
      }
    }

    return allRegs;
  }

  async getParticipantsByEventId(eventId: string): Promise<Participant[]> {
    return await db.select().from(participants).where(eq(participants.eventId, eventId));
  }

  async getTeamMembersByRegistration(registrationId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers)
      .where(eq(teamMembers.registrationId, registrationId));
  }

  async getTeamMembersByRegistrationIds(registrationIds: string[]): Promise<TeamMember[]> {
    if (registrationIds.length === 0) return [];
    return await db.select().from(teamMembers)
      .where(inArray(teamMembers.registrationId, registrationIds));
  }

  async getParticipantCountByDepartment(department: string, college: string): Promise<number> {
    // Normalize department for case-insensitive, whitespace-tolerant comparison
    const normalizedDept = normalizeDepartment(department);
    // Normalize college for consistent comparison
    const normalizedCollege = college.trim().toUpperCase();

    // Count unique roll numbers from confirmed + pending registrations in this department AND college
    // NOTE: Pending registrations count to prevent over-registration
    // A cleanup job should cancel stale pending registrations (>24 hours old)
    const organizerCount = await db.select({ rollNo: registrations.organizerRollNo })
      .from(registrations)
      .where(
        and(
          inArray(registrations.status, ['confirmed', 'pending']),
          sql`UPPER(TRIM(${registrations.organizerDept})) = ${normalizedDept}`,
          sql`UPPER(TRIM(${registrations.organizerCollege})) = ${normalizedCollege}`
        )
      );

    const memberCount = await db.select({ rollNo: teamMembers.memberRollNo })
      .from(teamMembers)
      .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
      .where(
        and(
          inArray(registrations.status, ['confirmed', 'pending']),
          sql`UPPER(TRIM(${teamMembers.memberDept})) = ${normalizedDept}`,
          sql`UPPER(TRIM(${registrations.organizerCollege})) = ${normalizedCollege}`
        )
      );

    // Get unique roll numbers (participants can be in multiple confirmed registrations)
    const uniqueRollNos = new Set<string>();
    organizerCount.forEach(r => uniqueRollNos.add(r.rollNo));
    memberCount.forEach(r => uniqueRollNos.add(r.rollNo));

    return uniqueRollNos.size;
  }

  async validateDepartmentParticipantLimit(departments: string[], college: string): Promise<{ valid: boolean; department?: string; currentCount?: number; message?: string }> {
    const DEPARTMENT_LIMIT = 10;

    // Normalize all department names for consistent comparison
    const normalizedDepartments = departments.map(dept => normalizeDepartment(dept));

    for (const dept of normalizedDepartments) {
      const count = await this.getParticipantCountByDepartment(dept, college);
      if (count >= DEPARTMENT_LIMIT) {
        return {
          valid: false,
          department: dept,
          currentCount: count,
          message: `Department "${dept}" at ${college} has already reached the maximum limit of ${DEPARTMENT_LIMIT} unique participants.`
        };
      }
    }

    return { valid: true };
  }

  async getUniqueColleges(): Promise<string[]> {
    const result = await db.selectDistinct({ college: registrations.organizerCollege })
      .from(registrations)
      .where(sql`${registrations.organizerCollege} IS NOT NULL AND ${registrations.organizerCollege} != ''`)
      .orderBy(asc(registrations.organizerCollege));

    return result.map(r => r.college).filter((c): c is string => c !== null);
  }


  async getEventsByIds(eventIds: string[]): Promise<Event[]> {
    if (eventIds.length === 0) return [];
    return await db.select().from(events).where(
      sql`${events.id} IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})`
    );
  }

  async createParticipant(userId: string, eventId: string): Promise<Participant> {
    // Round-2 H9: the (event_id, user_id) unique (migration 001) makes the
    // insert idempotent — concurrent bulk-confirms used to 500 on the
    // duplicate key instead of converging.
    await db.insert(participants).values({
      userId,
      eventId,
      status: 'registered'
    }).onConflictDoNothing({ target: [participants.eventId, participants.userId] });
    const [participant] = await db.select().from(participants).where(
      and(eq(participants.eventId, eventId), eq(participants.userId, userId))
    );
    if (!participant) {
      throw new Error("Failed to create participant");
    }
    return participant;
  }

  async createEventCredential(participantUserId: string, eventId: string, eventUsername: string, eventPassword: string): Promise<EventCredential> {
    const [credential] = await db.insert(eventCredentials).values({
      participantUserId,
      eventId,
      eventUsername,
      eventPassword,
    }).returning();
    return credential;
  }

  // Round-2 H6: idempotent credential creation. The (participant_user_id,
  // event_id) unique (migration 001) makes the INSERT the arbitration —
  // the first writer wins, concurrent losers get the existing row instead
  // of a duplicate-key error or a silent overwrite.
  async upsertEventCredential(participantUserId: string, eventId: string, eventUsername: string, eventPassword: string): Promise<EventCredential> {
    await db.insert(eventCredentials).values({
      participantUserId,
      eventId,
      eventUsername,
      eventPassword,
    }).onConflictDoNothing({ target: [eventCredentials.participantUserId, eventCredentials.eventId] });
    const [credential] = await db.select().from(eventCredentials).where(
      and(
        eq(eventCredentials.participantUserId, participantUserId),
        eq(eventCredentials.eventId, eventId),
      )
    );
    if (!credential) {
      throw new Error("Failed to upsert event credential");
    }
    return credential;
  }

  async getEventCredentialsByParticipant(participantUserId: string): Promise<EventCredential[]> {
    return await db.select()
      .from(eventCredentials)
      .where(eq(eventCredentials.participantUserId, participantUserId));
  }

  async getEventCredentialsByEvent(eventId: string): Promise<Array<EventCredential & { participant: User, event: Event, paperTopic?: string | null, realRollNo?: string | null }>> {
    // First get credentials with participant and event info
    const credentialsWithDetails = await db.select({
      id: eventCredentials.id,
      participantUserId: eventCredentials.participantUserId,
      eventId: eventCredentials.eventId,
      eventUsername: eventCredentials.eventUsername,
      eventPassword: eventCredentials.eventPassword,
      testEnabled: eventCredentials.testEnabled,
      enabledAt: eventCredentials.enabledAt,
      enabledBy: eventCredentials.enabledBy,
      createdAt: eventCredentials.createdAt,
      participant: users,
      event: events,
    })
      .from(eventCredentials)
      .innerJoin(users, eq(eventCredentials.participantUserId, users.id))
      .innerJoin(events, eq(eventCredentials.eventId, events.id))
      .where(eq(eventCredentials.eventId, eventId));

    // Get paper topics and roll numbers
    const result = await Promise.all(credentialsWithDetails.map(async (cred) => {
      let rollNo: string | null = null;
      let paperTopic: string | null = null;

      // 1. Try to find as organizer in registrations
      const [registration] = await db.select({
        paperTopic: registrations.paperTopic,
        organizerRollNo: registrations.organizerRollNo,
      })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, eventId),
            eq(registrations.organizerEmail, cred.participant.email)
          )
        )
        .limit(1);

      if (registration) {
        paperTopic = registration.paperTopic;
        rollNo = registration.organizerRollNo;
      }

      // 2. If not found or if we need to check team members (users could be team members)
      // Or if simply rollNo is still missing (e.g. for team members who got accounts)
      if (!rollNo) {
        // Try participant registry
        const [registryEntry] = await db.select({
          rollNo: participantRegistry.rollNo
        })
          .from(participantRegistry)
          .where(eq(participantRegistry.email, cred.participant.email))
          .limit(1);

        if (registryEntry) {
          rollNo = registryEntry.rollNo;
        }
      }

      return {
        ...cred,
        paperTopic: paperTopic || null,
        realRollNo: rollNo || cred.participant.username // Fallback to username if absolutely nothing found
      };
    }));

    return result as any;
  }

  async getConfirmedParticipantsForEvent(eventId: string): Promise<Array<{
    userId: string;
    name: string;
    rollNo: string | null;
    college: string | null;
    dept: string | null;
    email: string;
  }>> {
    const credentials = await db.select({
      participantUserId: eventCredentials.participantUserId,
      participant: users,
    })
      .from(eventCredentials)
      .innerJoin(users, eq(eventCredentials.participantUserId, users.id))
      .where(eq(eventCredentials.eventId, eventId))
      .orderBy(asc(users.fullName));

    const result = await Promise.all(credentials.map(async (cred) => {
      let rollNo: string | null = null;
      let college: string | null = null;
      let dept: string | null = null;

      // 1. Try to find as organizer in registrations
      const [registration] = await db.select({
        organizerRollNo: registrations.organizerRollNo,
        organizerCollege: registrations.organizerCollege,
        organizerDept: registrations.organizerDept,
      })
        .from(registrations)
        .where(
          and(
            eq(registrations.eventId, eventId),
            eq(registrations.organizerEmail, cred.participant.email)
          )
        )
        .limit(1);

      if (registration) {
        rollNo = registration.organizerRollNo;
        college = registration.organizerCollege;
        dept = registration.organizerDept;
      }

      // 2. If not found, try participant registry
      if (!rollNo) {
        const [registryEntry] = await db.select({
          rollNo: participantRegistry.rollNo,
          college: participantRegistry.college,
          dept: participantRegistry.dept,
        })
          .from(participantRegistry)
          .where(eq(participantRegistry.email, cred.participant.email))
          .limit(1);

        if (registryEntry) {
          rollNo = registryEntry.rollNo;
          college = registryEntry.college;
          dept = registryEntry.dept;
        }
      }

      return {
        userId: cred.participantUserId,
        name: cred.participant.fullName,
        email: cred.participant.email,
        rollNo: rollNo || cred.participant.username, // Fallback
        college: college,
        dept: dept,
      };
    }));

    return result;
  }

  async getEventCredential(credentialId: string): Promise<EventCredential | undefined> {
    const [credential] = await db.select()
      .from(eventCredentials)
      .where(eq(eventCredentials.id, credentialId));
    return credential;
  }

  async getEventCredentialByUserAndEvent(userId: string, eventId: string): Promise<EventCredential | undefined> {
    const [credential] = await db.select()
      .from(eventCredentials)
      .where(and(eq(eventCredentials.participantUserId, userId), eq(eventCredentials.eventId, eventId)));
    return credential;
  }

  async updateEventCredentialTestStatus(credentialId: string, testEnabled: boolean, enabledBy: string): Promise<EventCredential> {
    const updateData: any = {
      testEnabled,
    };

    if (testEnabled) {
      updateData.enabledAt = new Date();
      updateData.enabledBy = enabledBy;
    }

    const [credential] = await db.update(eventCredentials)
      .set(updateData)
      .where(eq(eventCredentials.id, credentialId))
      .returning();
    return credential;
  }

  async updateEventCredentialPassword(credentialId: string, eventPassword: string): Promise<EventCredential | undefined> {
    const [credential] = await db.update(eventCredentials)
      .set({ eventPassword })
      .where(eq(eventCredentials.id, credentialId))
      .returning();
    return credential;
  }

  async getEventCredentialsWithParticipants(eventId: string): Promise<Array<EventCredential & { participant: User }>> {
    const result = await db.select({
      id: eventCredentials.id,
      participantUserId: eventCredentials.participantUserId,
      eventId: eventCredentials.eventId,
      eventUsername: eventCredentials.eventUsername,
      eventPassword: eventCredentials.eventPassword,
      testEnabled: eventCredentials.testEnabled,
      enabledAt: eventCredentials.enabledAt,
      enabledBy: eventCredentials.enabledBy,
      createdAt: eventCredentials.createdAt,
      participant: users,
    })
      .from(eventCredentials)
      .innerJoin(users, eq(eventCredentials.participantUserId, users.id))
      .where(eq(eventCredentials.eventId, eventId))
      .orderBy(asc(users.fullName));

    return result as any;
  }

  async getEventCredentialByUsername(eventUsername: string): Promise<EventCredential | undefined> {
    const [credential] = await db.select()
      .from(eventCredentials)
      .where(eq(eventCredentials.eventUsername, eventUsername));
    return credential;
  }

  async getUserById(userId: string): Promise<User | undefined> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId));
    return user;
  }

  async isUserEventAdmin(userId: string, eventId: string): Promise<boolean> {
    const [assignment] = await db.select()
      .from(eventAdmins)
      .where(and(eq(eventAdmins.adminId, userId), eq(eventAdmins.eventId, eventId)));
    return !!assignment;
  }

  async getEventById(eventId: string): Promise<Event | undefined> {
    return await this.getEvent(eventId);
  }

  async getParticipantCredentialWithDetails(userId: string, eventId: string): Promise<any> {
    const credential = await this.getEventCredentialByUserAndEvent(userId, eventId);
    if (!credential) {
      return null;
    }

    const event = await this.getEvent(eventId);
    if (!event) {
      return null;
    }

    const rounds = await this.getRoundsByEvent(eventId);
    const eventRules = await this.getEventRules(eventId);

    const activeRound = rounds.find(r => r.status === 'in_progress');
    let activeRoundRules = null;
    if (activeRound) {
      activeRoundRules = await this.getRoundRules(activeRound.id);
    }

    // Fetch team details if this is a team registration
    const user = await this.getUser(userId);
    let teamDetails: any[] = [];

    if (user) {
      // Check if user is the organizer
      const [organizerReg] = await db
        .select()
        .from(registrations)
        .where(and(
          eq(registrations.eventId, eventId),
          eq(registrations.organizerEmail, user.email),
          eq(registrations.status, 'confirmed')
        ));

      if (organizerReg) {
        // User is organizer - Add organizer first
        teamDetails.push({
          name: organizerReg.organizerName,
          email: organizerReg.organizerEmail,
          rollNo: organizerReg.organizerRollNo,
          role: 'Organizer'
        });

        // Add team members
        const members = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.registrationId, organizerReg.id));

        members.forEach(m => {
          teamDetails.push({
            name: m.memberName,
            email: m.memberEmail,
            rollNo: m.memberRollNo,
            role: 'Member'
          });
        });
      } else {
        // Check if user is a team member
        const [memberRecord] = await db
          .select({
            registration: registrations,
            member: teamMembers
          })
          .from(teamMembers)
          .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
          .where(and(
            eq(registrations.eventId, eventId),
            eq(teamMembers.memberEmail, user.email),
            eq(registrations.status, 'confirmed')
          ));

        if (memberRecord) {
          const reg = memberRecord.registration;
          // Add organizer
          teamDetails.push({
            name: reg.organizerName,
            email: reg.organizerEmail,
            rollNo: reg.organizerRollNo,
            role: 'Organizer'
          });

          // Add all team members (including self)
          const members = await db
            .select()
            .from(teamMembers)
            .where(eq(teamMembers.registrationId, reg.id));

          members.forEach(m => {
            teamDetails.push({
              name: m.memberName,
              email: m.memberEmail,
              rollNo: m.memberRollNo,
              role: 'Member'
            });
          });
        }
      }
    }

    return {
      credential,
      event,
      rounds,
      eventRules,
      activeRoundRules,
      team: teamDetails.length > 0 ? teamDetails : null
    };
  }

  async getOnSpotParticipantsByCreator(creatorId?: string): Promise<Array<User & { eventCredentials: Array<EventCredential & { event: Event }> }>> {
    const whereConditions = [eq(users.role, 'participant')];
    if (creatorId) {
      whereConditions.push(eq(users.createdBy, creatorId));
    } else {
      whereConditions.push(sql`${users.createdBy} IS NOT NULL`);
    }

    const participantUsers = await db
      .select()
      .from(users)
      .where(and(...whereConditions))
      .orderBy(desc(users.createdAt));

    const result = await Promise.all(participantUsers.map(async (user) => {
      const credentials = await db
        .select({
          id: eventCredentials.id,
          participantUserId: eventCredentials.participantUserId,
          eventId: eventCredentials.eventId,
          eventUsername: eventCredentials.eventUsername,
          eventPassword: eventCredentials.eventPassword,
          testEnabled: eventCredentials.testEnabled,
          enabledAt: eventCredentials.enabledAt,
          enabledBy: eventCredentials.enabledBy,
          createdAt: eventCredentials.createdAt,
          event: events,
        })
        .from(eventCredentials)
        .innerJoin(events, eq(eventCredentials.eventId, events.id))
        .where(eq(eventCredentials.participantUserId, user.id));

      return {
        ...user,
        eventCredentials: credentials as any,
      };
    }));

    return result;
  }

  async updateUserDetails(userId: string, updates: { fullName?: string; email?: string; phone?: string }): Promise<User | undefined> {
    if (updates.email) {
      const existingUser = await this.getUserByEmail(updates.email);
      if (existingUser && existingUser.id !== userId) {
        throw new Error('Email already exists');
      }
    }

    const updateData: any = {};
    if (updates.fullName !== undefined) updateData.fullName = updates.fullName;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;

    const [user] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
    return user;
  }

  async getEventCredentialCountForEvent(eventId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventCredentials)
      .where(eq(eventCredentials.eventId, eventId));

    return result[0]?.count || 0;
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogs(filters?: { adminId?: string; targetType?: string; startDate?: Date; endDate?: Date }): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs);

    const conditions = [];
    if (filters?.adminId) conditions.push(eq(auditLogs.adminId, filters.adminId));
    if (filters?.targetType) conditions.push(eq(auditLogs.targetType, filters.targetType));
    if (filters?.startDate) conditions.push(gte(auditLogs.timestamp, filters.startDate));
    if (filters?.endDate) conditions.push(lte(auditLogs.timestamp, filters.endDate));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query.orderBy(desc(auditLogs.timestamp));
  }

  async getAuditLogsByTarget(targetType: string, targetId: string): Promise<AuditLog[]> {
    return await db.select().from(auditLogs)
      .where(and(eq(auditLogs.targetType, targetType), eq(auditLogs.targetId, targetId)))
      .orderBy(desc(auditLogs.timestamp));
  }

  async createEmailLog(insertLog: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db.insert(emailLogs).values(insertLog).returning();
    return log;
  }

  async getEmailLogs(filters?: { status?: string; templateType?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }): Promise<Omit<EmailLog, 'metadata'>[]> {
    // Select only essential fields, exclude large metadata to prevent 507 errors
    let query = db.select({
      id: emailLogs.id,
      recipientEmail: emailLogs.recipientEmail,
      recipientName: emailLogs.recipientName,
      subject: emailLogs.subject,
      templateType: emailLogs.templateType,
      status: emailLogs.status,
      errorMessage: emailLogs.errorMessage,
      sentAt: emailLogs.sentAt,
      // Exclude metadata field from list view to reduce payload size
    }).from(emailLogs);

    const conditions = [];
    if (filters?.status) conditions.push(eq(emailLogs.status, filters.status));
    if (filters?.templateType) conditions.push(eq(emailLogs.templateType, filters.templateType));
    if (filters?.startDate) conditions.push(gte(emailLogs.sentAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(emailLogs.sentAt, filters.endDate));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Add pagination with default limit of 50 to prevent response size errors
    const limit = Math.min(filters?.limit || 50, 100); // Cap at 100
    const offset = filters?.offset || 0;

    return await query.orderBy(desc(emailLogs.sentAt)).limit(limit).offset(offset);
  }

  async getEmailLogsByRecipient(email: string, limit: number = 100): Promise<EmailLog[]> {
    return await db.select().from(emailLogs)
      .where(eq(emailLogs.recipientEmail, email))
      .orderBy(desc(emailLogs.sentAt))
      .limit(limit);
  }

  async getEmailLogsCount(filters?: { status?: string; templateType?: string; startDate?: Date; endDate?: Date }): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` }).from(emailLogs);

    const conditions = [];
    if (filters?.status) conditions.push(eq(emailLogs.status, filters.status));
    if (filters?.templateType) conditions.push(eq(emailLogs.templateType, filters.templateType));
    if (filters?.startDate) conditions.push(gte(emailLogs.sentAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(emailLogs.sentAt, filters.endDate));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async getEmailLogById(id: string): Promise<EmailLog | null> {
    const result = await db.select().from(emailLogs).where(eq(emailLogs.id, id)).limit(1);
    return result[0] || null;
  }

  // Count emails sent since a specific date, optionally filtered by provider
  async getEmailLogCountSince(since: Date, provider?: string): Promise<number> {
    let query = db.select({ count: sql<number>`count(*)` }).from(emailLogs);

    const conditions = [
      gte(emailLogs.sentAt, since),
      eq(emailLogs.status, 'sent')
    ];

    // Filter by provider if specified (provider is stored in metadata JSON)
    if (provider) {
      conditions.push(sql`${emailLogs.metadata}->>'provider' = ${provider}`);
    }

    query = query.where(and(...conditions)) as any;

    const result = await query;
    return result[0]?.count || 0;
  }



  async getParticipant(id: string): Promise<Participant | undefined> {
    const [participant] = await db
      .select()
      .from(participants)
      .where(eq(participants.id, id));
    return participant;
  }

  async removeEventFromRegistrations(eventId: string): Promise<void> {
    // With new schema, registrations are 1:1 with events, so delete registrations for this event
    await db.delete(registrations).where(eq(registrations.eventId, eventId));
  }

  async deleteRegistrationForm(id: string): Promise<void> {
    console.log(`[Storage] Starting deletion of registration form ${id}`);

    try {
      // Delete the form (registrations are now separate from forms)
      const deletedForms = await db.delete(registrationForms).where(eq(registrationForms.id, id)).returning({ id: registrationForms.id });
      console.log(`[Storage] Deleted ${deletedForms.length} registration forms`);

      // Verify deletion
      const check = await db.select().from(registrationForms).where(eq(registrationForms.id, id));
      if (check.length > 0) {
        throw new Error(`Verification failed: Form ${id} still exists in database`);
      }

      console.log(`[Storage] Deletion verified for form ${id}`);
    } catch (error) {
      console.error(`[Storage] Delete failed for form ${id}:`, error);
      throw error;
    }
  }

  async getRegistrationStats(adminId?: string) {
    let eventFilter = undefined;

    if (adminId) {
      const adminEvents = await this.getEventsByAdmin(adminId);
      const eventIds = adminEvents.map(e => e.id);
      if (eventIds.length === 0) {
        return {
          totalTeams: 0,
          teamsPerEvent: [],
          teamsPerCollege: [],
          totalParticipants: 0,
          vegCount: 0,
          nonVegCount: 0
        };
      }
      eventFilter = sql`${registrations.eventId} IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})`;
    }

    const teamsPerEvent = await db
      .select({
        eventId: registrations.eventId,
        eventName: events.name,
        count: sql<number>`count(*)`
      })
      .from(registrations)
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(eventFilter)
      .groupBy(registrations.eventId, events.name);

    const teamsPerCollege = await db
      .select({
        college: registrations.organizerCollege,
        count: sql<number>`count(*)`
      })
      .from(registrations)
      .where(eventFilter)
      .groupBy(registrations.organizerCollege);

    const totalTeams = teamsPerEvent.reduce((sum, item) => sum + Number(item.count), 0);

    // Get food preference stats from participant_registry for TRULY unique participants
    // This avoids double-counting people who are both organizers and team members
    // For event admins, we need to filter by their events
    let foodStats: Array<{ foodType: string | null; count: number }>;
    if (eventFilter) {
      // Event admin: Get participants only from their events
      // First, get all unique roll numbers from registrations and team members for these events
      const organizerRolls = await db
        .selectDistinct({ rollNo: registrations.organizerRollNo })
        .from(registrations)
        .where(eventFilter);

      const memberRolls = await db
        .selectDistinct({ rollNo: teamMembers.memberRollNo })
        .from(teamMembers)
        .innerJoin(registrations, eq(teamMembers.registrationId, registrations.id))
        .where(eventFilter);

      // Combine and deduplicate
      const allRollNos = new Set<string>();
      organizerRolls.forEach(r => allRollNos.add(r.rollNo));
      memberRolls.forEach(r => allRollNos.add(r.rollNo));
      const rollNos = Array.from(allRollNos);

      if (rollNos.length === 0) {
        foodStats = [];
      } else {
        foodStats = await db
          .select({
            foodType: participantRegistry.foodType,
            count: sql<number>`count(DISTINCT ${participantRegistry.rollNo})`
          })
          .from(participantRegistry)
          .where(inArray(participantRegistry.rollNo, rollNos))
          .groupBy(participantRegistry.foodType);
      }
    } else {
      // Super admin: Get all participants
      foodStats = await db
        .select({
          foodType: participantRegistry.foodType,
          count: sql<number>`count(DISTINCT ${participantRegistry.rollNo})`
        })
        .from(participantRegistry)
        .groupBy(participantRegistry.foodType);
    }

    const vegCount = foodStats.find(f => f.foodType === 'veg')?.count || 0;
    const nonVegCount = foodStats.find(f => f.foodType === 'nonveg')?.count || 0;
    const totalParticipants = Number(vegCount) + Number(nonVegCount);

    return {
      totalTeams,
      teamsPerEvent: teamsPerEvent.map(t => ({ ...t, count: Number(t.count) })),
      teamsPerCollege: teamsPerCollege.map(t => ({ college: t.college || 'Other', count: Number(t.count) })),
      totalParticipants,
      vegCount: Number(vegCount),
      nonVegCount: Number(nonVegCount)
    };
  }

  // Participant Registry methods - global participant info by roll_no
  async getParticipantRegistryByRollNo(rollNo: string): Promise<ParticipantRegistry | undefined> {
    const normalizedRollNo = rollNo.trim().toUpperCase();
    const [participant] = await db
      .select()
      .from(participantRegistry)
      .where(eq(participantRegistry.rollNo, normalizedRollNo));
    return participant;
  }

  async upsertParticipantRegistry(data: {
    rollNo: string;
    name: string;
    email?: string;
    dept?: string;
    phone?: string;
    college?: string;
    foodType: 'veg' | 'nonveg';
  }): Promise<ParticipantRegistry> {
    const normalizedRollNo = data.rollNo.trim().toUpperCase();

    // H-02/H-15: single atomic upsert on the unique roll_no. The old
    // check-then-insert/update raced under concurrent registrations.
    // foodType stays locked once set (only written on insert).
    const [row] = await db
      .insert(participantRegistry)
      .values({
        rollNo: normalizedRollNo,
        name: data.name,
        email: data.email,
        dept: data.dept,
        phone: data.phone,
        college: data.college,
        foodType: data.foodType
      })
      .onConflictDoUpdate({
        target: participantRegistry.rollNo,
        set: {
          name: data.name,
          email: data.email || sql`${participantRegistry.email}`,
          dept: data.dept || sql`${participantRegistry.dept}`,
          phone: data.phone || sql`${participantRegistry.phone}`,
          college: data.college || sql`${participantRegistry.college}`,
          updatedAt: new Date()
        },
      })
      .returning();
    return row;
  }

  // Manual Round Entries implementations
  async getManualRoundEntriesByEvent(eventId: string): Promise<ManualRoundEntry[]> {
    return await db.select().from(manualRoundEntries)
      .where(eq(manualRoundEntries.eventId, eventId))
      .orderBy(asc(manualRoundEntries.roundNumber), asc(manualRoundEntries.rank));
  }

  async getManualRoundEntriesByEventAndRound(eventId: string, roundNumber: number): Promise<(ManualRoundEntry & { participantEmail: string | null; teamMembers: any[] })[]> {
    const entries = await db.select({
      id: manualRoundEntries.id,
      eventId: manualRoundEntries.eventId,
      roundNumber: manualRoundEntries.roundNumber,
      roundName: manualRoundEntries.roundName,
      participantUserId: manualRoundEntries.participantUserId,
      participantName: manualRoundEntries.participantName,
      participantRollNo: manualRoundEntries.participantRollNo,
      participantCollege: manualRoundEntries.participantCollege,
      participantDept: manualRoundEntries.participantDept,
      score: manualRoundEntries.score,
      rank: manualRoundEntries.rank,
      notes: manualRoundEntries.notes,
      enteredBy: manualRoundEntries.enteredBy,
      createdAt: manualRoundEntries.createdAt,
      updatedAt: manualRoundEntries.updatedAt,
      participantEmail: users.email,
    })
      .from(manualRoundEntries)
      .leftJoin(users, eq(manualRoundEntries.participantUserId, users.id))
      .where(and(
        eq(manualRoundEntries.eventId, eventId),
        eq(manualRoundEntries.roundNumber, roundNumber)
      ))
      .orderBy(asc(manualRoundEntries.rank));

    // Fetch team members for each entry; avoid relation lookups to prevent Drizzle relation errors
    const entriesWithTeam = await Promise.all(entries.map(async (entry) => {
      let team: any[] = [];
      const email = entry.participantEmail || '';

      // Find a registration by organizer email (best effort)
      const reg = email
        ? await db.select().from(registrations).where(eq(registrations.organizerEmail, email)).limit(1)
        : [];

      if (reg.length > 0) {
        const regId = reg[0].id;
        const members = await db.select().from(teamMembers).where(eq(teamMembers.registrationId, regId));
        team = members.map(tm => ({
          name: tm.memberName,
          rollNo: tm.memberRollNo,
          email: tm.memberEmail
        }));
      }

      return { ...entry, teamMembers: team };
    }));

    return entriesWithTeam;
  }

  async createManualRoundEntry(entry: InsertManualRoundEntry): Promise<ManualRoundEntry> {
    const [created] = await db.insert(manualRoundEntries).values(entry).returning();
    return created;
  }

  async updateManualRoundEntry(id: string, entry: Partial<InsertManualRoundEntry>): Promise<ManualRoundEntry | undefined> {
    const [updated] = await db.update(manualRoundEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(manualRoundEntries.id, id))
      .returning();
    return updated;
  }

  async deleteManualRoundEntry(id: string): Promise<void> {
    await db.delete(manualRoundEntries).where(eq(manualRoundEntries.id, id));
  }

  async deleteManualRoundEntriesByEvent(eventId: string): Promise<void> {
    await db.delete(manualRoundEntries).where(eq(manualRoundEntries.eventId, eventId));
  }

  async deleteManualRoundEntriesByEventAndRound(eventId: string, roundNumber: number): Promise<void> {
    await db.delete(manualRoundEntries).where(and(
      eq(manualRoundEntries.eventId, eventId),
      eq(manualRoundEntries.roundNumber, roundNumber)
    ));
  }

  // Event Winners implementations
  async getEventWinners(eventId: string): Promise<EventWinner[]> {
    return await db.select().from(eventWinners)
      .where(eq(eventWinners.eventId, eventId))
      .orderBy(asc(eventWinners.position));
  }

  async createEventWinner(winner: InsertEventWinner): Promise<EventWinner> {
    const [created] = await db.insert(eventWinners).values(winner as any).returning();
    return created;
  }

  async updateEventWinner(id: string, winner: Partial<InsertEventWinner>): Promise<EventWinner | undefined> {
    const [updated] = await db.update(eventWinners)
      .set(winner as any)
      .where(eq(eventWinners.id, id))
      .returning();
    return updated;
  }

  async deleteEventWinner(id: string): Promise<void> {
    await db.delete(eventWinners).where(eq(eventWinners.id, id));
  }

  async deleteEventWinnersByEvent(eventId: string): Promise<void> {
    await db.delete(eventWinners).where(eq(eventWinners.eventId, eventId));
  }

  // H-02: delete-then-bulk-create in one transaction. The route used to
  // delete all winners and then insert them one by one outside any
  // transaction — a failure mid-way left the event with no winners at all.
  async replaceEventWinners(eventId: string, winners: InsertEventWinner[]): Promise<EventWinner[]> {
    return await db.transaction(async (tx) => {
      await tx.delete(eventWinners).where(eq(eventWinners.eventId, eventId));
      if (winners.length === 0) return [];
      const created = await tx.insert(eventWinners).values(winners as any).returning();
      return created;
    });
  }

  async exportEventData(eventId: string): Promise<any> {
    return { eventId };
  }


  async getRound1Qualifiers(eventId: string, limit: number = 100): Promise<Array<{
    userId: string;
    userName: string;
    rollNo?: string;
    college?: string;
    dept?: string;
    email?: string;
    score: number;
    rank: number;
    teamMembers?: Array<{ name: string; rollNo: string; email: string }>;
  }>> {
    // Get Round 1 for this event
    const eventRounds = await db.select().from(rounds)
      .where(and(eq(rounds.eventId, eventId), eq(rounds.roundNumber, 1)));

    if (eventRounds.length === 0) {
      return [];
    }

    const round1 = eventRounds[0];

    // Get completed test attempts for Round 1, sorted by score
    const attempts = await db.select({
      userId: testAttempts.userId,
      userName: users.fullName,
      email: users.email,
      totalScore: testAttempts.totalScore,
    })
      .from(testAttempts)
      .innerJoin(users, eq(testAttempts.userId, users.id))
      .where(and(
        eq(testAttempts.roundId, round1.id),
        eq(testAttempts.status, 'completed')
      ))
      .orderBy(desc(testAttempts.totalScore), asc(testAttempts.submittedAt))
      .limit(limit);

    // Get registration details for college/dept info and team members
    const results = await Promise.all(attempts.map(async (attempt, index) => {
      // Find registration for this participant
      // Using organizerEmail because online tests are typically taken by the organizer
      const reg = await db.query.registrations.findFirst({
        where: eq(registrations.organizerEmail, attempt.email || ''),
        with: {
          teamMembers: true
        }
      });

      const team = reg?.teamMembers?.map(tm => ({
        name: tm.memberName,
        rollNo: tm.memberRollNo,
        email: tm.memberEmail
      })) || [];

      return {
        userId: attempt.userId,
        userName: attempt.userName,
        rollNo: reg?.organizerRollNo || undefined,
        college: reg?.organizerCollege || undefined,
        dept: reg?.organizerDept || undefined,
        email: attempt.email || reg?.organizerEmail || undefined,
        score: attempt.totalScore || 0,
        rank: index + 1,
        teamMembers: team
      };
    }));

    return results;
  }
}

export const storage = new DatabaseStorage();
