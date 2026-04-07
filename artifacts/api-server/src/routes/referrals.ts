import { Router } from "express";
import { db, referralsTable, usersTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

const router = Router();

const REWARD_ACTIVE_TARGET = 3;

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
    .select({ id: usersTable.id })
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
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.referrerUserId, userId))
    .orderBy(desc(referralsTable.createdAt));

  const activeCount = rows.filter((r) => r.status === "active").length;
  const base = process.env.APP_URL?.trim() || "";
  const referralLink = base
    ? `${base.replace(/\/+$/, "")}/invite?ref=${userId}`
    : `/invite?ref=${userId}`;

  res.json({
    referralLink,
    successfulReferrals: activeCount,
    rewardPending: activeCount >= REWARD_ACTIVE_TARGET,
    referrals: rows,
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

  const referredIds = rows.map((r) => r.referredUserId);
  const referredMap = new Map<number, { username: string | null; email: string | null }>();
  if (referredIds.length > 0) {
    const referredUsers = await db
      .select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, referredIds));
    for (const u of referredUsers) referredMap.set(u.id, { username: u.username, email: u.email });
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

  res.json({
    totals: {
      totalReferrals: rows.length,
      activeReferrals: rows.filter((r) => r.status === "active").length,
      pendingReferrals: rows.filter((r) => r.status === "pending").length,
    },
    rows: rows.map((r) => {
      const referred = referredMap.get(r.referredUserId);
      const activeForReferrer = byReferrer.get(r.referrerId)?.active ?? 0;
      return {
        id: r.id,
        referrerId: r.referrerId,
        referrerName: r.referrerName,
        referrerEmail: r.referrerEmail,
        referredUserId: r.referredUserId,
        referredUsername: referred?.username ?? null,
        referredEmail: referred?.email ?? null,
        status: r.status,
        sessionsCount: r.sessionsCount,
        createdAt: r.createdAt,
        rewardPending: activeForReferrer >= REWARD_ACTIVE_TARGET,
      };
    }),
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

  const rows = await db
    .select({
      id:            referralsTable.id,
      status:        referralsTable.status,
      sessionsCount: referralsTable.sessionsCount,
      createdAt:     referralsTable.createdAt,
      username:      usersTable.username,
      email:         usersTable.email,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
    .where(eq(referralsTable.referrerUserId, referrerId))
    .orderBy(desc(referralsTable.createdAt));

  res.json({ referrals: rows });
});

export default router;
