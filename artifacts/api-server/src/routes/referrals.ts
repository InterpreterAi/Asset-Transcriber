import { Router } from "express";
import { db, referralsTable, shareEventsTable, usersTable } from "@workspace/db";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { isTrialLikePlanType } from "../lib/usage.js";

const router = Router();

const REWARD_ACTIVE_TARGET = 3;
const SIGNUP_CREDIT_USD = 1.5;
const UPGRADE_CREDIT_USD = 10;
const UPGRADE_HOLD_DAYS = 30;

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

  const nowMs = Date.now();
  const activity = rows.map((r) => {
    const joinedAt = new Date(r.userCreatedAt ?? r.createdAt);
    const upgraded = !isTrialLikePlanType((r.planType ?? "").toLowerCase());
    const upgradedAt = r.subscriptionStartedAt ? new Date(r.subscriptionStartedAt) : null;
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    const signupCredited = true; // referral row exists only after successful signup attribution
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
      sessionsCount: r.sessionsCount,
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
    referrals: rows.map((r) => ({
      id: r.id,
      status: r.status,
      sessionsCount: r.sessionsCount,
      createdAt: r.createdAt,
      username: r.username,
      email: r.email,
    })),
    constants: {
      signupCreditUsd: SIGNUP_CREDIT_USD,
      upgradeCreditUsd: UPGRADE_CREDIT_USD,
      upgradeHoldDays: UPGRADE_HOLD_DAYS,
    },
    totals,
    activity,
  });
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
  const referredMap = new Map<number, { username: string | null; email: string | null; planType: string | null }>();
  if (referredIds.length > 0) {
    const referredUsers = await db
      .select({ id: usersTable.id, username: usersTable.username, email: usersTable.email, planType: usersTable.planType })
      .from(usersTable)
      .where(inArray(usersTable.id, referredIds));
    for (const u of referredUsers) {
      referredMap.set(u.id, { username: u.username, email: u.email, planType: u.planType ?? null });
    }
  }

  const byReferrer = new Map<number, { referrerId: number; referrer: string; active: number }>();
  for (const row of rows) {
    const current = byReferrer.get(row.referrerId) ?? {
      referrerId: row.referrerId,
      referrer: row.referrerName ?? String(row.referrerId),
      active: 0,
    };
    if (row.status === "active") current.active += 1;
    byReferrer.set(row.referrerId, current);
  }

  const nowMs = Date.now();
  const enriched = rows.map((r) => {
    const referred = referredMap.get(r.referredUserId);
    const planType = referred?.planType ?? null;
    const upgraded = planType ? !isTrialLikePlanType(planType.toLowerCase()) : r.status === "active";
    const joinedAt = new Date(r.createdAt);
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    return {
      ...r,
      referredUsername: referred?.username ?? null,
      referredEmail: referred?.email ?? null,
      upgraded,
      holdCleared,
      generatedUsd: SIGNUP_CREDIT_USD + (holdCleared ? UPGRADE_CREDIT_USD : 0),
      pendingUsd: upgraded && !holdCleared ? UPGRADE_CREDIT_USD : 0,
    };
  });

  res.json({
    totals: {
      totalReferrals: rows.length,
      activeReferrals: rows.filter((r) => r.status === "active").length,
      pendingReferrals: rows.filter((r) => r.status === "pending").length,
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
      status:        referralsTable.status,
      sessionsCount: referralsTable.sessionsCount,
      createdAt:     referralsTable.createdAt,
      username:      usersTable.username,
      email:         usersTable.email,
      planType:      usersTable.planType,
      subscriptionStartedAt: usersTable.subscriptionStartedAt,
      userCreatedAt: usersTable.createdAt,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.referrerUserId, referrerId))
    .orderBy(desc(referralsTable.createdAt));

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
    const upgraded = !isTrialLikePlanType((r.planType ?? "").toLowerCase());
    const upgradedAt = r.subscriptionStartedAt ? new Date(r.subscriptionStartedAt) : null;
    const holdReadyAt = new Date(joinedAt.getTime() + UPGRADE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdCleared = upgraded && nowMs >= holdReadyAt.getTime();
    const creditedUsd = SIGNUP_CREDIT_USD + (holdCleared ? UPGRADE_CREDIT_USD : 0);
    const pendingUsd = upgraded && !holdCleared ? UPGRADE_CREDIT_USD : 0;
    return {
      id: r.id,
      status: r.status,
      sessionsCount: r.sessionsCount,
      username: r.username,
      email: r.email,
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
