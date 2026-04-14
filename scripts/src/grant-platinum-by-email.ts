import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: join(rootDir, ".env") });

async function main() {
  const { db, usersTable, pool } = await import("@workspace/db");
  const { eq, sql, and, isNotNull } = await import("drizzle-orm");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const emailArg = args[0]?.trim().toLowerCase();
  const email = (emailArg || process.env.GRANT_PLATINUM_EMAIL || "").trim().toLowerCase();
  if (!email) {
    console.error(
      "Usage: pnpm --filter @workspace/scripts run grant-platinum -- <email> [dailyLimitMinutes]\n" +
        "Or set GRANT_PLATINUM_EMAIL (and optional GRANT_PLATINUM_DAILY_MINUTES).",
    );
    process.exit(1);
  }

  const dailyLimit = Math.max(
    1,
    parseInt(args[1] || process.env.GRANT_PLATINUM_DAILY_MINUTES || "300", 10) || 300,
  );
  const now = new Date();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(isNotNull(usersTable.email), sql`lower(trim(${usersTable.email})) = ${email}`))
    .limit(1);

  if (!user) {
    console.error(`No user with email matching: ${email}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      planType: "platinum",
      subscriptionPlan: "platinum",
      subscriptionStatus: "active",
      dailyLimitMinutes: dailyLimit,
      minutesUsedToday: 0,
      lastUsageResetAt: now,
    })
    .where(eq(usersTable.id, user.id))
    .returning();

  console.log("Updated user:", {
    id: updated!.id,
    email: updated!.email,
    planType: updated!.planType,
    dailyLimitMinutes: updated!.dailyLimitMinutes,
    minutesUsedToday: updated!.minutesUsedToday,
    lastUsageResetAt: updated!.lastUsageResetAt,
    subscriptionPlan: updated!.subscriptionPlan,
    subscriptionStatus: updated!.subscriptionStatus,
  });

  await pool.end().catch(() => {});
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { pool } = await import("@workspace/db");
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
