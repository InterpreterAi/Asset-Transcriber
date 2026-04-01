import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length > 0) {
    console.log(`Admin user '${username}' already exists.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await db.insert(usersTable).values({
    username,
    passwordHash,
    isAdmin: true,
    isActive: true,
    trialStartedAt: new Date(),
    trialEndsAt,
    dailyLimitMinutes: 9999,
    minutesUsedToday: 0,
    totalMinutesUsed: 0,
    totalSessions: 0,
    lastUsageResetAt: new Date(),
  });

  console.log("Admin user created successfully.");
  console.log("IMPORTANT: Change the admin password immediately after first login!");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
