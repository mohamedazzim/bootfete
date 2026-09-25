
import { db } from "../server/db";
import {
    users, rounds, questions, registrations, teamMembers, participants,
    testAttempts, answers, manualRoundEntries, eventWinners, eventCredentials, roundRules
} from "@shared/schema";
import { eq } from "drizzle-orm";

async function resetData() {
    console.log("Starting data reset...");

    // 1. Results & Test Data
    console.log("Deleting results (answers, attempts, winners, manual entries)...");
    await db.delete(answers);
    await db.delete(testAttempts);
    await db.delete(manualRoundEntries);
    await db.delete(eventWinners);
    await db.delete(eventCredentials);

    // 2. Round Content
    console.log("Deleting round content (questions, rules, rounds)...");
    await db.delete(questions);
    await db.delete(roundRules);
    await db.delete(rounds);

    // 3. User & Registration Data
    console.log("Deleting registration data and participants...");
    await db.delete(teamMembers);
    await db.delete(registrations);
    await db.delete(participants);

    // Only delete 'participant' role. Admin accounts are preserved.
    await db.delete(users).where(eq(users.role, 'participant'));

    console.log("✅ Database reset complete! All participant data and rounds have been cleared.");
    process.exit(0);
}

resetData().catch((err) => {
    console.error("Error resetting data:", err);
    process.exit(1);
});
