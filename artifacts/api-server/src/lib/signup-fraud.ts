import { and, eq, inArray, sql } from "drizzle-orm";
import { db, loginEventsTable, usersTable } from "@workspace/db";
import { isTrialLikePlanType } from "./usage.js";

/**
 * Auto-disable new trial signups when the same IP already has 2+ successful logins
 * from distinct accounts and none are paid (multi-trial abuse from one host).
 */
export async function shouldAutoDisableSignupForSharedIp(clientIp: string): Promise<boolean> {
  const signupIp = clientIp.trim();
  if (!signupIp || signupIp === "unknown") return false;

  const sharedIpRows = await db
    .selectDistinct({ userId: loginEventsTable.userId })
    .from(loginEventsTable)
    .where(and(
      eq(loginEventsTable.success, true),
      eq(loginEventsTable.ipAddress, signupIp),
      sql`${loginEventsTable.userId} IS NOT NULL`,
    ));

  const sharedUserIds = sharedIpRows
    .map((r) => r.userId)
    .filter((v): v is number => typeof v === "number");

  if (sharedUserIds.length < 2) return false;

  const existingOnIp = await db
    .select({ planType: usersTable.planType, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(inArray(usersTable.id, sharedUserIds));

  const hasPaidAccountOnIp = existingOnIp.some(
    (u) => !u.isAdmin && !isTrialLikePlanType(u.planType),
  );
  return !hasPaidAccountOnIp;
}
