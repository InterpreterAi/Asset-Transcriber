import { db, usersTable } from "@workspace/db";
import { count, eq, or } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Prints user counts and every trial-related row (for manual review before a reminder blast).
 */
export async function printTrialReminderDbReport(): Promise<void> {
  const [[{ totalUsers }], [{ planTrialCount }], [{ subscriptionTrialCount }]] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ planTrialCount: count() }).from(usersTable).where(eq(usersTable.planType, "trial")),
    db
      .select({ subscriptionTrialCount: count() })
      .from(usersTable)
      .where(eq(usersTable.subscriptionStatus, "trial")),
  ]);

  const trialUsers = await db
    .select({
      id:                 usersTable.id,
      email:              usersTable.email,
      planType:           usersTable.planType,
      subscriptionStatus: usersTable.subscriptionStatus,
      trialEndsAt:        usersTable.trialEndsAt,
    })
    .from(usersTable)
    .where(or(eq(usersTable.planType, "trial"), eq(usersTable.subscriptionStatus, "trial")))
    .orderBy(usersTable.id);

  const lines = [
    "=== Trial reminder — database preview ===",
    `Total users (all rows):           ${totalUsers}`,
    `Users with plan_type = "trial":   ${planTrialCount}`,
    `Users with subscription_status = "trial": ${subscriptionTrialCount}`,
    "",
    "--- Each user with plan OR subscription trial (may overlap counts above) ---",
    `Rows in this list: ${trialUsers.length}`,
    "",
  ];

  for (const u of trialUsers) {
    const email = u.email ?? "(no email)";
    const end = u.trialEndsAt ? u.trialEndsAt.toISOString() : "(null)";
    const sub = u.subscriptionStatus ?? "null";
    lines.push(
      `id=${u.id}  email=${email}  trial_end_date=${end}  plan_type=${u.planType}  subscription_status=${sub}`,
    );
  }

  const text = lines.join("\n");
  console.log(text);
  logger.info(
    {
      totalUsers,
      planTrialCount,
      subscriptionTrialCount,
      trialUnionRows: trialUsers.length,
    },
    "trial-reminder-db-report: report printed",
  );
}
