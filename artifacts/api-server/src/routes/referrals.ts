import { Router } from "express";
import { db, referralsTable, sessionsTable, shareEventsTable, usersTable } from "@workspace/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { isTrialLikePlanType } from "../lib/usage.js";

const router = Router();

const REWARD_ACTIVE_TARGET = 3;
const SIGNUP_CREDIT_USD = 1.5;
const UPGRADE_CREDIT_USD = 10;
const UPGRADE_HOLD_DAYS = 30;

function referralPlanDisplay(planType: string | null | undefined) {
  const raw = (planType ?? "trial-libre").trim().toLowerCase();
  const isTrial = isTrialLikePlanType(raw);
  let planLabel = "Trial";
  if (!isTrial) {
    if (raw.includes("basic") || raw === "legacy2" || raw === "morsy-basic") planLabel = "Basic";
    else if (raw.includes("professional")) planLabel = "Professional";
    else planLabel = "Platinum";
  }
  return {
    planType: raw,
    planLabel,
    accountType: isTrial ? ("trial" as const) : ("paid" as const),
  };
}

async function sessionCountsByUserIds(userIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({
      userId: sessionsTable.userId,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(sessionsTable)
    .where(inArray(sessionsTable.userId, userIds))
    .groupBy(sessionsTable.userId);
  for (const r of rows) {
    map.set(r.userId, Number(r.count ?? 0));
  }
  return map;
}

function effectiveSessionsCount(stored: number, live: number): number {
  return Math.max(Number(stored) || 0, Number(live) || 0);
}

function effectiveReferralStatus(stored: string, sessionsCount: number): "pending" | "active" {
  if (sessionsCount > 0) return "active";
  return stored === "active" ? "active" : "pending";
}

// ── Validate referral link (public, called by /invite page) ─────────────────
router.post("/click", async (req, res) => {
  const { refCode } = req.body as { refCode?: string };
  if (!refCode) { res.status(400).json({ error: "refCode required" }); return; }

  const referrerId = parseInt(String(refCode));
  if (isNaN(referrerId)) { res.status(400).json({ error: "Invalid refCode" }); return; }

  const [referrer] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, referrerId))
    .limit(1);

  if (!referrer) { res.status(404).json({ error: "Referrer not found" }); return; }

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "");
  const secure = req.secure || forwardedProto.includes("https");
  res.cookie("ia_ref", String(referrer.id), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ ok: true, referrerUserId: referrer.id });
});

// ── My referral dashboard (authenticated user) ───────────────────────────────
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const [referrer] = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!referrer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rows = await db
    .select({
      id:            referralsTable.id,
      referredUserId: referralsTable.referredUserId,
      status:        referralsTable.status,
      sessionsCount: referralsTable.sessionsCount,
      createdAt:     referralsTable.createdAt,
      username:      usersTable.username,
      email:         usersTable.email,
      planType:      usersTable.planType,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionStartedAt: usersTable.subscriptionStartedAt,
      userCreatedAt: usersTable.createdAt,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.referrerUserId, userId))
    .orderBy(desc(referralsTable.createdAt));

  const liveSessionCounts = await sessionCountsByUserIds(rows.map((r) => r.referredUserId));

  const nowMs = Date.now();
  const activity = rows.map((r) => {
    const joinedAt = new Date(r.userCreatedAt ?? r.createdAt);
    const plan = referralPlanDisplay(r.planType);
    const upgraded = plan.accountType === "paid";
    const upgradedAt = r.subscriptionStartedAt ? new Date(r.subscriptionStartedAt) : null;
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    const signupCredited = true;
    const sessionsCount = effectiveSessionsCount(
      r.sessionsCount,
      liveSessionCounts.get(r.referredUserId) ?? 0,
    );
    const creditedUsd =
      (signupCredited ? SIGNUP_CREDIT_USD : 0) +
      (holdCleared ? UPGRADE_CREDIT_USD : 0);
    const pendingUsd =
      upgraded && !holdCleared ? UPGRADE_CREDIT_USD : 0;
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      joinedAt: joinedAt.toISOString(),
      upgraded,
      upgradedAt: upgradedAt ? upgradedAt.toISOString() : null,
      holdReadyAt: upgraded ? holdReadyAt.toISOString() : null,
      holdCleared,
      sessionsCount,
      planType: plan.planType,
      planLabel: plan.planLabel,
      accountType: plan.accountType,
      signupCredited,
      creditedUsd,
      pendingUsd,
      status: holdCleared ? "upgraded_credited" : upgraded ? "upgraded_pending_hold" : "joined",
    };
  });

  const totals = activity.reduce(
    (acc, a) => {
      acc.signups += 1;
      if (a.upgraded) acc.upgrades += 1;
      acc.creditedUsd += a.creditedUsd;
      acc.pendingUsd += a.pendingUsd;
      return acc;
    },
    { signups: 0, upgrades: 0, creditedUsd: 0, pendingUsd: 0 },
  );

  const activeCount = activity.filter((a) => a.signupCredited).length;
  const base =
    process.env.APP_URL?.trim() ||
    `${req.protocol}://${req.get("host") ?? ""}`.replace(/\/+$/, "");
  const usernameParam = encodeURIComponent((referrer.username ?? referrer.id.toString()).trim());
  const referralLink =
    base && /^https?:\/\//i.test(base)
      ? `${base.replace(/\/+$/, "")}/invite?ref=${userId}&u=${usernameParam}`
      : `/invite?ref=${userId}&u=${usernameParam}`;

  res.json({
    referralLink,
    successfulReferrals: activeCount,
    rewardPending: activeCount >= REWARD_ACTIVE_TARGET,
    referrals: rows.map((r) => {
      const sessionsCount = effectiveSessionsCount(
        r.sessionsCount,
        liveSessionCounts.get(r.referredUserId) ?? 0,
      );
      const plan = referralPlanDisplay(r.planType);
      return {
        id: r.id,
        status: effectiveReferralStatus(r.status, sessionsCount),
        sessionsCount,
        createdAt: r.createdAt,
        username: r.username,
        email: r.email,
        planType: plan.planType,
        planLabel: plan.planLabel,
        accountType: plan.accountType,
      };
    }),
    constants: {
      signupCreditUsd: SIGNUP_CREDIT_USD,
      upgradeCreditUsd: UPGRADE_CREDIT_USD,
      upgradeHoldDays: UPGRADE_HOLD_DAYS,
    },
    totals,
    activity,
  });
});

// ── Admin: manually attribute a referred signup (recovery) ───────────────────
router.post("/admin/attribute", requireAdmin, async (req, res) => {
  const { referrerUserId, referredUserId } = req.body as {
    referrerUserId?: number | string;
    referredUserId?: number | string;
  };
  const referrerId =
    typeof referrerUserId === "number"
      ? referrerUserId
      : typeof referrerUserId === "string" && /^\d+$/.test(referrerUserId)
        ? Number(referrerUserId)
        : null;
  const referredId =
    typeof referredUserId === "number"
      ? referredUserId
      : typeof referredUserId === "string" && /^\d+$/.test(referredUserId)
        ? Number(referredUserId)
        : null;
  if (!referrerId || !referredId || referrerId === referredId) {
    res.status(400).json({ error: "referrerUserId and referredUserId are required and must differ" });
    return;
  }

  const [referrer] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, referrerId))
    .limit(1);
  const [referred] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, referredId))
    .limit(1);
  if (!referrer || !referred) {
    res.status(404).json({ error: "Referrer or referred user not found" });
    return;
  }

  const existing = await db
    .select({ id: referralsTable.id })
    .from(referralsTable)
    .where(eq(referralsTable.referredUserId, referredId))
    .limit(1);
  if (existing[0]) {
    res.json({ ok: true, referralId: existing[0].id, alreadyExists: true });
    return;
  }

  const [row] = await db
    .insert(referralsTable)
    .values({
      referrerUserId: referrer.id,
      referredUserId: referred.id,
      status: "pending",
      sessionsCount: 0,
    })
    .returning({ id: referralsTable.id });
  res.json({ ok: true, referralId: row?.id ?? null, alreadyExists: false });
});

// ── Admin: full referral analytics ───────────────────────────────────────────
router.get("/admin/analytics", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id:             referralsTable.id,
      status:         referralsTable.status,
      sessionsCount:  referralsTable.sessionsCount,
      createdAt:      referralsTable.createdAt,
      referrerId:     referralsTable.referrerUserId,
      referrerName:   usersTable.username,
      referrerEmail:  usersTable.email,
      referredUserId: referralsTable.referredUserId,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referrerUserId, usersTable.id))
    .orderBy(desc(referralsTable.createdAt));

  const shareAggRows = await db
    .select({
      userId: shareEventsTable.userId,
      totalShares: sql<number>`COUNT(*)::int`,
      copyShares: sql<number>`SUM(CASE WHEN ${shareEventsTable.platform} = 'copy' THEN 1 ELSE 0 END)::int`,
      nativeShares: sql<number>`SUM(CASE WHEN ${shareEventsTable.platform} = 'native' THEN 1 ELSE 0 END)::int`,
      lastSharedAt: sql<string | null>`MAX(${shareEventsTable.createdAt})`,
    })
    .from(shareEventsTable)
    .groupBy(shareEventsTable.userId);

  const shareAggMap = new Map(
    shareAggRows.map((r) => [
      r.userId,
      {
        totalShares: Number(r.totalShares ?? 0),
        copyShares: Number(r.copyShares ?? 0),
        nativeShares: Number(r.nativeShares ?? 0),
        lastSharedAt: r.lastSharedAt,
      },
    ]),
  );
  const sharerIds = shareAggRows.map((r) => r.userId);
  const sharerUserMap = new Map<number, { username: string | null; email: string | null }>();
  if (sharerIds.length > 0) {
    const sharerUsers = await db
      .select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, sharerIds));
    for (const u of sharerUsers) {
      sharerUserMap.set(u.id, { username: u.username, email: u.email });
    }
  }

  const referredIds = rows.map((r) => r.referredUserId);
  const liveSessionCounts = await sessionCountsByUserIds(referredIds);
  const referredMap = new Map<
    number,
    {
      username: string | null;
      email: string | null;
      planType: string | null;
      subscriptionStatus: string | null;
    }
  >();
  if (referredIds.length > 0) {
    const referredUsers = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
        planType: usersTable.planType,
        subscriptionStatus: usersTable.subscriptionStatus,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, referredIds));
    for (const u of referredUsers) {
      referredMap.set(u.id, {
        username: u.username,
        email: u.email,
        planType: u.planType ?? null,
        subscriptionStatus: u.subscriptionStatus ?? null,
      });
    }
  }

  const byReferrer = new Map<number, { referrerId: number; referrer: string; active: number }>();
  for (const row of rows) {
    const sessionsCount = effectiveSessionsCount(
      row.sessionsCount,
      liveSessionCounts.get(row.referredUserId) ?? 0,
    );
    const status = effectiveReferralStatus(row.status, sessionsCount);
    const current = byReferrer.get(row.referrerId) ?? {
      referrerId: row.referrerId,
      referrer: row.referrerName ?? String(row.referrerId),
      active: 0,
    };
    if (status === "active") current.active += 1;
    byReferrer.set(row.referrerId, current);
  }

  const nowMs = Date.now();
  const enriched = rows.map((r) => {
    const referred = referredMap.get(r.referredUserId);
    const plan = referralPlanDisplay(referred?.planType);
    const sessionsCount = effectiveSessionsCount(
      r.sessionsCount,
      liveSessionCounts.get(r.referredUserId) ?? 0,
    );
    const status = effectiveReferralStatus(r.status, sessionsCount);
    const upgraded = plan.accountType === "paid";
    const joinedAt = new Date(r.createdAt);
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    return {
      ...r,
      status,
      sessionsCount,
      referredUsername: referred?.username ?? null,
      referredEmail: referred?.email ?? null,
      planType: plan.planType,
      planLabel: plan.planLabel,
      accountType: plan.accountType,
      subscriptionStatus: referred?.subscriptionStatus ?? null,
      upgraded,
      holdCleared,
      generatedUsd: SIGNUP_CREDIT_USD + (holdCleared ? UPGRADE_CREDIT_USD : 0),
      pendingUsd: upgraded && !holdCleared ? UPGRADE_CREDIT_USD : 0,
    };
  });

  res.json({
    totals: {
      totalReferrals: rows.length,
      activeReferrals: enriched.filter((r) => r.status === "active").length,
      pendingReferrals: enriched.filter((r) => r.status === "pending").length,
      signups: rows.length,
      upgrades: enriched.filter((r) => r.upgraded).length,
      creditedUsd: enriched.reduce((s, r) => s + r.generatedUsd, 0),
      pendingUsd: enriched.reduce((s, r) => s + r.pendingUsd, 0),
      totalShareEvents: shareAggRows.reduce((s, r) => s + Number(r.totalShares ?? 0), 0),
      totalShareUsers: shareAggRows.length,
    },
    rows: enriched.map((r) => {
      const activeForReferrer = byReferrer.get(r.referrerId)?.active ?? 0;
      const share = shareAggMap.get(r.referrerId);
      return {
        id: r.id,
        referrerId: r.referrerId,
        referrerName: r.referrerName,
        referrerEmail: r.referrerEmail,
        referredUserId: r.referredUserId,
        referredUsername: r.referredUsername,
        referredEmail: r.referredEmail,
        planType: r.planType,
        planLabel: r.planLabel,
        accountType: r.accountType,
        subscriptionStatus: r.subscriptionStatus,
        status: r.status,
        sessionsCount: r.sessionsCount,
        createdAt: r.createdAt,
        upgraded: r.upgraded,
        holdCleared: r.holdCleared,
        generatedUsd: r.generatedUsd,
        pendingUsd: r.pendingUsd,
        referrerShareCount: share?.totalShares ?? 0,
        referrerCopyCount: share?.copyShares ?? 0,
        referrerNativeCount: share?.nativeShares ?? 0,
        referrerLastSharedAt: share?.lastSharedAt ?? null,
        rewardPending: activeForReferrer >= REWARD_ACTIVE_TARGET,
      };
    }),
    topSharers: shareAggRows
      .map((row) => {
        const u = sharerUserMap.get(row.userId);
        return {
          userId: row.userId,
          username: u?.username ?? null,
          email: u?.email ?? null,
          totalShares: Number(row.totalShares ?? 0),
          copyShares: Number(row.copyShares ?? 0),
          nativeShares: Number(row.nativeShares ?? 0),
          lastSharedAt: row.lastSharedAt ?? null,
          joinedReferrals: rows.filter((r) => r.referrerId === row.userId).length,
        };
      })
      .sort((a, b) => b.totalShares - a.totalShares)
      .slice(0, 100),
    rewardPendingReferrers: Array.from(byReferrer.values())
      .filter((r) => r.active >= REWARD_ACTIVE_TARGET)
      .map((r) => ({
        referrerId: r.referrerId,
        referrer: r.referrer,
        activeReferrals: r.active,
        badge: "Reward pending - 3 referrals completed",
      })),
  });
});

// ── Admin: referred users for a specific referrer ─────────────────────────────
router.get("/admin/user/:userId", requireAdmin, async (req, res) => {
  const referrerId = parseInt(String(req.params.userId));
  if (isNaN(referrerId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const [referrer] = await db
    .select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, referrerId))
    .limit(1);

  if (!referrer) {
    res.status(404).json({ error: "Referrer not found" });
    return;
  }

  const rows = await db
    .select({
      id:            referralsTable.id,
      referredUserId: referralsTable.referredUserId,
      status:        referralsTable.status,
      sessionsCount: referralsTable.sessionsCount,
      createdAt:     referralsTable.createdAt,
      username:      usersTable.username,
      email:         usersTable.email,
      planType:      usersTable.planType,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionStartedAt: usersTable.subscriptionStartedAt,
      userCreatedAt: usersTable.createdAt,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.referrerUserId, referrerId))
    .orderBy(desc(referralsTable.createdAt));

  const liveSessionCounts = await sessionCountsByUserIds(rows.map((r) => r.referredUserId));

  const shareEvents = await db
    .select({
      id: shareEventsTable.id,
      platform: shareEventsTable.platform,
      createdAt: shareEventsTable.createdAt,
    })
    .from(shareEventsTable)
    .where(eq(shareEventsTable.userId, referrerId))
    .orderBy(desc(shareEventsTable.createdAt))
    .limit(300);

  const nowMs = Date.now();
  const referrals = rows.map((r) => {
    const joinedAt = new Date(r.userCreatedAt ?? r.createdAt);
    const plan = referralPlanDisplay(r.planType);
    const sessionsCount = effectiveSessionsCount(
      r.sessionsCount,
      liveSessionCounts.get(r.referredUserId) ?? 0,
    );
    const status = effectiveReferralStatus(r.status, sessionsCount);
    const upgraded = plan.accountType === "paid";
    const upgradedAt = r.subscriptionStartedAt ? new Date(r.subscriptionStartedAt) : null;
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    const creditedUsd = SIGNUP_CREDIT_USD + (holdCleared ? UPGRADE_CREDIT_USD : 0);
    const pendingUsd = upgraded && !holdCleared ? UPGRADE_CREDIT_USD : 0;
    return {
      id: r.id,
      status,
      sessionsCount,
      username: r.username,
      email: r.email,
      planType: plan.planType,
      planLabel: plan.planLabel,
      accountType: plan.accountType,
      subscriptionStatus: r.subscriptionStatus ?? null,
      joinedAt: joinedAt.toISOString(),
      upgraded,
      upgradedAt: upgradedAt ? upgradedAt.toISOString() : null,
      holdReadyAt: upgraded ? holdReadyAt.toISOString() : null,
      holdCleared,
      creditedUsd,
      pendingUsd,
    };
  });

  res.json({
    referrer,
    totals: {
      shareEvents: shareEvents.length,
      referrals: referrals.length,
      activeReferrals: referrals.filter((r) => r.status === "active").length,
      upgradedReferrals: referrals.filter((r) => r.upgraded).length,
    },
    shareEvents,
    referrals,
  });
});

export default router;
