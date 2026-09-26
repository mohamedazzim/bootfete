// Multi-level reporting engine: live aggregated analytics for the admin
// reports surface. All three reports are computed with a small number of
// aggregate SQL queries (FILTER / GROUP BY) — no N+1 loops.
//
// Disqualification rule (matches the leaderboard convention in storage.ts):
// - Attempts with test_attempts.status = 'disqualified' never contribute to
//   scored aggregates (averages, funnels, leaderboards).
// - Attempts belonging to participants with participants.status =
//   'disqualified' are likewise excluded from scored aggregates.
// - "Scored" attempts are terminal attempts with graded scores:
//   'completed', 'auto_submitted', 'expired'. In-progress attempts carry no
//   final score and are excluded from averages (averaging their default 0
//   would be misleading); they are reported separately as active attempts.

import { sql, eq, and, or, ne, isNull, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  events,
  rounds,
  participants,
  testAttempts,
  users,
  registrations,
  teamMembers,
  participantRegistry,
} from "@shared/schema";

// Terminal attempt statuses that carry a graded score.
const SCORED_STATUSES = ["completed", "auto_submitted", "expired"] as const;

function round2(n: number | null | undefined): number | null {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return null;
  return Math.round(Number(n) * 100) / 100;
}

/** SQL fragment: attempt counts toward scored aggregates (not DQ'd itself,
 *  and its participant row — when one exists — is not disqualified). */
function scoredAttemptFilter() {
  return and(
    inArray(testAttempts.status, [...SCORED_STATUSES]),
    or(isNull(participants.status), ne(participants.status, "disqualified")),
  );
}

export interface OverallSymposiumReport {
  generatedAt: string;
  totals: {
    events: number;
    participants: { total: number; registered: number; completed: number; disqualified: number };
    attempts: { total: number; active: number; scored: number; disqualified: number };
  };
  averageScore: number | null;
}

export async function getOverallSymposiumReport(): Promise<OverallSymposiumReport> {
  // 1. Total events.
  const [{ eventCount }] = await db
    .select({ eventCount: sql<number>`count(*)` })
    .from(events);

  // 2. Participants grouped by status (single aggregate query).
  const participantRows = await db
    .select({ status: participants.status, count: sql<number>`count(*)` })
    .from(participants)
    .groupBy(participants.status);
  const pCount = (s: string) =>
    Number(participantRows.find((r) => r.status === s)?.count ?? 0);
  const totalParticipants = participantRows.reduce((sum, r) => sum + Number(r.count), 0);

  // 3. Attempt aggregates in one pass. The participants join is per
  // (user, event) via the attempt's round, so DQ exclusion is event-scoped.
  const [a] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${testAttempts.status} = 'in_progress')`,
      scored: sql<number>`count(*) filter (where ${scoredAttemptFilter()})`,
      disqualified: sql<number>`count(*) filter (where ${testAttempts.status} = 'disqualified')`,
      avgScore: sql<number | null>`avg(${testAttempts.totalScore}) filter (where ${scoredAttemptFilter()})`,
    })
    .from(testAttempts)
    .innerJoin(rounds, eq(testAttempts.roundId, rounds.id))
    .leftJoin(
      participants,
      and(
        eq(participants.userId, testAttempts.userId),
        eq(participants.eventId, rounds.eventId),
      ),
    );

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      events: Number(eventCount),
      participants: {
        total: totalParticipants,
        registered: pCount("registered"),
        completed: pCount("completed"),
        disqualified: pCount("disqualified"),
      },
      attempts: {
        total: Number(a.total),
        active: Number(a.active),
        scored: Number(a.scored),
        disqualified: Number(a.disqualified),
      },
    },
    averageScore: round2(a.avgScore),
  };
}

export interface EventWiseRoundBreakdown {
  roundId: string;
  roundName: string;
  roundNumber: number;
  status: string;
  attempts: number;
  uniqueUsers: number;
  averageScore: number | null;
  byStatus: Record<string, number>;
}

export interface EventWiseReport {
  generatedAt: string;
  event: { id: string; name: string };
  funnel: {
    registered: number;
    started: number;
    completed: number;
    disqualified: number;
    completionRate: number | null; // completed / started
  };
  averageScore: number | null;
  rounds: EventWiseRoundBreakdown[];
}

export async function getEventWiseReport(eventId: string): Promise<EventWiseReport | null> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) return null;

  const eventRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId))
    .orderBy(rounds.roundNumber);
  const roundIds = eventRounds.map((r) => r.id);

  // Participants by status (single query).
  const participantRows = await db
    .select({
      userId: participants.userId,
      status: participants.status,
    })
    .from(participants)
    .where(eq(participants.eventId, eventId));
  const participantStatus = new Map(participantRows.map((p) => [p.userId, p.status]));

  // Per (round, status) attempt aggregates — one query, DQ participants excluded.
  const aggRows = roundIds.length
    ? await db
        .select({
          roundId: testAttempts.roundId,
          status: testAttempts.status,
          attempts: sql<number>`count(*)`,
          uniqueUsers: sql<number>`count(distinct ${testAttempts.userId})`,
          avgScore: sql<number | null>`avg(${testAttempts.totalScore}) filter (where ${inArray(testAttempts.status, [...SCORED_STATUSES])})`,
        })
        .from(testAttempts)
        .leftJoin(
          participants,
          and(
            eq(participants.userId, testAttempts.userId),
            eq(participants.eventId, eventId),
          ),
        )
        .where(
          and(
            inArray(testAttempts.roundId, roundIds),
            or(isNull(participants.status), ne(participants.status, "disqualified")),
          ),
        )
        .groupBy(testAttempts.roundId, testAttempts.status)
    : [];

  // Per-user status sets for the funnel — one grouped query.
  const userRows = roundIds.length
    ? await db
        .select({
          userId: testAttempts.userId,
          statuses: sql<string[]>`array_agg(distinct ${testAttempts.status})`,
        })
        .from(testAttempts)
        .where(inArray(testAttempts.roundId, roundIds))
        .groupBy(testAttempts.userId)
    : [];

  const dqUsers = new Set<string>();
  const startedUsers = new Set<string>();
  const completedUsers = new Set<string>();
  for (const row of userRows) {
    const statuses = row.statuses ?? [];
    const isDqAttempt = statuses.includes("disqualified");
    const isDqParticipant = participantStatus.get(row.userId) === "disqualified";
    if (isDqAttempt || isDqParticipant) {
      dqUsers.add(row.userId);
      continue;
    }
    if (statuses.some((s) => s !== "disqualified")) startedUsers.add(row.userId);
    if (statuses.some((s) => (SCORED_STATUSES as readonly string[]).includes(s)))
      completedUsers.add(row.userId);
  }

  const registered = participantRows.length;
  const started = startedUsers.size;
  const completed = completedUsers.size;
  const disqualified = dqUsers.size;

  const roundsOut: EventWiseRoundBreakdown[] = eventRounds.map((round) => {
    const rows = aggRows.filter((r) => r.roundId === round.id);
    const byStatus: Record<string, number> = {};
    let attempts = 0;
    let uniqueUsers = 0;
    let scoreSum = 0;
    let scoreUsers = 0;
    for (const r of rows) {
      byStatus[r.status] = Number(r.attempts);
      attempts += Number(r.attempts);
      uniqueUsers += Number(r.uniqueUsers);
      // avgScore per status row is over scored attempts only; weight by users.
      if (r.avgScore !== null && (SCORED_STATUSES as readonly string[]).includes(r.status)) {
        scoreSum += Number(r.avgScore) * Number(r.uniqueUsers);
        scoreUsers += Number(r.uniqueUsers);
      }
    }
    return {
      roundId: round.id,
      roundName: round.name,
      roundNumber: round.roundNumber,
      status: round.status,
      attempts,
      uniqueUsers,
      averageScore: scoreUsers > 0 ? round2(scoreSum / scoreUsers) : null,
      byStatus,
    };
  });

  // Event-level average: weighted by scored users across rounds.
  let totalScoreSum = 0;
  let totalScoreUsers = 0;
  for (const r of aggRows) {
    if (r.avgScore !== null && (SCORED_STATUSES as readonly string[]).includes(r.status)) {
      totalScoreSum += Number(r.avgScore) * Number(r.uniqueUsers);
      totalScoreUsers += Number(r.uniqueUsers);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    event: { id: event.id, name: event.name },
    funnel: {
      registered,
      started,
      completed,
      disqualified,
      completionRate: started > 0 ? round2(completed / started) : null,
    },
    averageScore: totalScoreUsers > 0 ? round2(totalScoreSum / totalScoreUsers) : null,
    rounds: roundsOut,
  };
}

export interface CollegeWiseEntry {
  collegeName: string;
  participantCount: number;
  scoredParticipantCount: number;
  averageScore: number | null;
}

export interface CollegeWiseReport {
  generatedAt: string;
  colleges: CollegeWiseEntry[];
}

/**
 * Symposium-wide rollup by institution. College affiliation resolves per
 * person with this precedence:
 *   1. participant_registry.college looked up by roll number,
 *   2. the registration's organizer_college (organizer; team members inherit
 *      it when they have no registry row),
 *   3. 'Unknown'.
 * A person registered for several events is counted once per college they
 * resolve to (mode across their registrations); scores are the user's total
 * across scored, non-disqualified attempts symposium-wide.
 */
export async function getCollegeWiseReport(): Promise<CollegeWiseReport> {
  // 1. All active registrations with team members (two queries, no N+1).
  const regRows = await db
    .select({
      registrationId: registrations.id,
      organizerRollNo: registrations.organizerRollNo,
      organizerEmail: registrations.organizerEmail,
      organizerCollege: registrations.organizerCollege,
      memberRollNo: teamMembers.memberRollNo,
      memberEmail: teamMembers.memberEmail,
    })
    .from(registrations)
    .leftJoin(teamMembers, eq(teamMembers.registrationId, registrations.id))
    .where(ne(registrations.status, "cancelled"));

  // 2. Registry colleges for every roll number seen (one query).
  const rollNos = Array.from(
    new Set(
      regRows.flatMap((r) => [r.organizerRollNo, r.memberRollNo].filter(Boolean) as string[]),
    ),
  );
  const registryRows = rollNos.length
    ? await db
        .select({ rollNo: participantRegistry.rollNo, college: participantRegistry.college })
        .from(participantRegistry)
        .where(inArray(participantRegistry.rollNo, rollNos))
    : [];
  const registryCollege = new Map(registryRows.map((r) => [r.rollNo, r.college]));

  // 3. Email -> college votes.
  const emailCollegeVotes = new Map<string, Map<string, number>>();
  const vote = (email: string | null, college: string | null) => {
    if (!email) return;
    const name = college?.trim() || "Unknown";
    let votes = emailCollegeVotes.get(email.toLowerCase());
    if (!votes) {
      votes = new Map();
      emailCollegeVotes.set(email.toLowerCase(), votes);
    }
    votes.set(name, (votes.get(name) ?? 0) + 1);
  };
  // Collapse member rows per registration first.
  const byReg = new Map<string, { org: (typeof regRows)[number]; members: (typeof regRows)[number][] }>();
  for (const row of regRows) {
    let entry = byReg.get(row.registrationId);
    if (!entry) {
      entry = { org: row, members: [] };
      byReg.set(row.registrationId, entry);
    }
    if (row.memberEmail) entry.members.push(row);
  }
  for (const { org, members } of Array.from(byReg.values())) {
    const orgCollege =
      registryCollege.get(org.organizerRollNo) ?? org.organizerCollege ?? null;
    vote(org.organizerEmail, orgCollege);
    for (const m of members) {
      const memberCollege =
        registryCollege.get(m.memberRollNo!) ?? orgCollege ?? null;
      vote(m.memberEmail, memberCollege);
    }
  }
  const emailCollege = new Map<string, string>();
  emailCollegeVotes.forEach((votes, email) => {
    let best = "Unknown";
    let bestCount = -1;
    votes.forEach((count, name) => {
      if (count > bestCount) {
        best = name;
        bestCount = count;
      }
    });
    emailCollege.set(email, best);
  });

  // 4. Per-user total score across scored, non-disqualified attempts (one query).
  const scoreRows = await db
    .select({
      email: users.email,
      totalScore: sql<number>`sum(${testAttempts.totalScore})`,
    })
    .from(testAttempts)
    .innerJoin(users, eq(users.id, testAttempts.userId))
    .innerJoin(rounds, eq(rounds.id, testAttempts.roundId))
    .leftJoin(
      participants,
      and(
        eq(participants.userId, testAttempts.userId),
        eq(participants.eventId, rounds.eventId),
      ),
    )
    .where(scoredAttemptFilter())
    .groupBy(users.email);

  // 5. Aggregate per college in memory (bounded by registration/user counts).
  const perCollege = new Map<string, { people: Set<string>; scored: Map<string, number> }>();
  const bucket = (name: string) => {
    let b = perCollege.get(name);
    if (!b) {
      b = { people: new Set(), scored: new Map() };
      perCollege.set(name, b);
    }
    return b;
  };
  for (const email of Array.from(emailCollege.keys())) bucket(emailCollege.get(email)!).people.add(email);
  for (const row of scoreRows) {
    const college = emailCollege.get((row.email as string).toLowerCase());
    if (!college) continue; // scored user with no registration record
    const b = bucket(college);
    b.people.add((row.email as string).toLowerCase());
    b.scored.set((row.email as string).toLowerCase(), Number(row.totalScore));
  }

  const colleges: CollegeWiseEntry[] = Array.from(perCollege.entries())
    .map(([collegeName, b]) => {
      const scores = Array.from(b.scored.values());
      return {
        collegeName,
        participantCount: b.people.size,
        scoredParticipantCount: scores.length,
        averageScore:
          scores.length > 0
            ? round2(scores.reduce((s, v) => s + v, 0) / scores.length)
            : null,
      };
    })
    .sort((x, y) => y.participantCount - x.participantCount);

  return { generatedAt: new Date().toISOString(), colleges };
}

export const reportingService = {
  getOverallSymposiumReport,
  getEventWiseReport,
  getCollegeWiseReport,
};
