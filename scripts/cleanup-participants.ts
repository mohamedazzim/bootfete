
import { db } from "../server/db";
import { users, registrations, teamMembers, participants, eventCredentials, testAttempts, answers } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

async function cleanup() {
    console.log("Starting cleanup of participants and team members...");

    try {
        // 1. Delete all Registrations (Cascades to TeamMembers)
        console.log("Deleting Registrations...");
        const deletedRegistrations = await db.delete(registrations).returning({ id: registrations.id });
        console.log(`Deleted ${deletedRegistrations.length} registrations (and associated team members).`);

        // 2. Delete Users with role 'participant'
        // This should cascade delete:
        // - participants table entries
        // - eventCredentials
        // - testAttempts -> answers
        console.log("Deleting Participants...");
        const deletedUsers = await db.delete(users).where(eq(users.role, 'participant')).returning({ id: users.id, username: users.username });
        console.log(`Deleted ${deletedUsers.length} users with role 'participant'.`);

        console.log("Cleanup complete.");
        process.exit(0);
    } catch (error) {
        console.error("Error during cleanup:", error);
        process.exit(1);
    }
}

cleanup();
