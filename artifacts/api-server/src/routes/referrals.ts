import { Router } from "express";
import { db } from "../lib/db.js";
import { referralsTable, usersTable } from "@workspace/db";
import { eq, isNotNull, count, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

const router = Router();

// ── Track a referral link click (public, called by /invite page) ─────────────
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

  const [referral] = await db
    .insert(referralsTable)
    .values({ referrerId: referrer.id, clickedAt: new Date() })
    .returning({ id: referralsTable.id });

  res.json({ referralId: referral!.id });
});

// ── My referral stats (authenticated user) ────────────────────────────────────
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      id:                referralsTable.id,
      clickedAt:         referralsTable.clickedAt,
      registeredAt:      referralsTable.registeredAt,
      hasStartedSession: referralsTable.hasStartedSession,
      username:          usersTable.username,
      email:             usersTable.email,
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.registeredUserId, usersTable.id))
    .where(eq(referralsTable.referrerId, userId))
    .orderBy(referralsTable.clickedAt);

  res.json({ referrals: rows });
});

// ── Admin: full referral analytics ───────────────────────────────────────────
router.get("/admin/analytics", requireAdmin, async (_req, res) => {
  const allRows = await db
    .select({
      referrerId:        referralsTable.referrerId,
      clickedAt:         referralsTable.clickedAt,
      registeredAt:      referralsTable.registeredAt,
      hasStartedSession: referralsTable.hasStartedSession,
      referrerUsername:  usersTable.username,
      referrerEmail:     usersTable.email,
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.referrerId, usersTable.id))
    .orderBy(referralsTable.clickedAt);

  const totalClicks      = allRows.length;
  const totalRegistered  = allRows.filter(r => r.registeredAt !== null).length;
  const totalActive      = allRows.filter(r => r.hasStartedSession).length;

  const byReferrer = new Map<number, {
    referrerId:      number;
    username:        string;
    email:           string | null;
    clicks:          number;
    joined:          number;
    active:          number;
  }>();

  for (const row of allRows) {
    const existing = byReferrer.get(row.referrerId) ?? {
      referrerId: row.referrerId,
      username:   row.referrerUsername ?? String(row.referrerId),
      email:      row.referrerEmail ?? null,
      clicks:     0,
      joined:     0,
      active:     0,
    };
    existing.clicks += 1;
    if (row.registeredAt) existing.joined += 1;
    if (row.hasStartedSession) existing.active += 1;
    byReferrer.set(row.referrerId, existing);
  }

  res.json({
    totals: {
      invitationsSent:   byReferrer.size > 0 ? totalClicks : 0,
      clicks:            totalClicks,
      registrations:     totalRegistered,
      activeInterpreters: totalActive,
    },
    perUser: Array.from(byReferrer.values()).sort((a, b) => b.clicks - a.clicks),
  });
});

// ── Admin: referred users for a specific referrer ─────────────────────────────
router.get("/admin/user/:userId", requireAdmin, async (req, res) => {
  const referrerId = parseInt(String(req.params.userId));
  if (isNaN(referrerId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const rows = await db
    .select({
      id:                referralsTable.id,
      clickedAt:         referralsTable.clickedAt,
      registeredAt:      referralsTable.registeredAt,
      hasStartedSession: referralsTable.hasStartedSession,
      username:          usersTable.username,
      email:             usersTable.email,
    })
    .from(referralsTable)
    .leftJoin(usersTable, eq(referralsTable.registeredUserId, usersTable.id))
    .where(eq(referralsTable.referrerId, referrerId))
    .orderBy(referralsTable.clickedAt);

  res.json({ referrals: rows });
});

export default router;
