import { Router } from "express";
import { db, usersTable, feedbackTable, sessionsTable, supportTicketsTable, supportRepliesTable } from "@workspace/db";
import { eq, sql, gt, isNull, and, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { hashPassword } from "../lib/password.js";
import { getTrialDaysRemaining } from "../lib/usage.js";
import { sessionStore } from "../lib/session-store.js";
import { langConfig, updateLangConfig, ALL_LANGUAGES } from "../lib/lang-config.js";
import { sendAdminReplyEmail } from "../lib/email.js";

const router = Router();

// ── Cost-rate constants (conservative estimates) ────────────────────────────
const SONIOX_COST_PER_MIN     = 0.0025;  // $0.0025 / transcription-minute
const TRANSLATE_COST_PER_MIN  = 0.0002;  // gpt-4o-mini @ ~2 calls/min
const PLAN_PRICES: Record<string, number> = {
  basic:        40,
  professional: 80,
  unlimited:    120,
};

// ── List users ───────────────────────────────────────────────────────────────
router.get("/users", requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json({
    users: users.map((u) => ({
      id:                 u.id,
      username:           u.username,
      email:              u.email ?? null,
      isAdmin:            u.isAdmin,
      isActive:           u.isActive,
      planType:           u.planType,
      trialStartedAt:     u.trialStartedAt,
      trialEndsAt:        u.trialEndsAt,
      trialDaysRemaining: getTrialDaysRemaining(u),
      dailyLimitMinutes:  u.dailyLimitMinutes,
      minutesUsedToday:   u.minutesUsedToday,
      totalMinutesUsed:   u.totalMinutesUsed,
      totalSessions:      u.totalSessions,
      lastActivityAt:     u.lastActivity ?? null,
      createdAt:          u.createdAt,
    })),
  });
});

// ── Enhanced stats ───────────────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req, res) => {
  const now              = new Date();
  const fiveMinutesAgo   = new Date(Date.now() - 5 * 60 * 1000);
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twentyFourHrsAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo     = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeRow,
    totalRow,
    dauRow,
    minutesTodayRow,
    minutesWeekRow,
    minutesMonthRow,
    activeSessionRows,
    allUsersForMrr,
    avgSessionRow,
    sessionsTodayRow,
    payingUsersRow,
    trialUsersRow,
  ] = await Promise.all([
    // Active users: last_activity within the past 5 minutes
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(gt(usersTable.lastActivity, fiveMinutesAgo)),

    // Total registered users
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable),

    // Daily active users: last_activity since midnight today
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(gt(usersTable.lastActivity, startOfToday)),

    // Minutes used today (last 24 h from all sessions)
    db.select({ total: sql<number>`COALESCE(SUM(duration_seconds), 0) / 60.0` })
      .from(sessionsTable)
      .where(gt(sessionsTable.startedAt, twentyFourHrsAgo)),

    // Minutes used this week
    db.select({ total: sql<number>`COALESCE(SUM(duration_seconds), 0) / 60.0` })
      .from(sessionsTable)
      .where(gt(sessionsTable.startedAt, sevenDaysAgo)),

    // Minutes used this month
    db.select({ total: sql<number>`COALESCE(SUM(duration_seconds), 0) / 60.0` })
      .from(sessionsTable)
      .where(gt(sessionsTable.startedAt, thirtyDaysAgo)),

    // Open (live) sessions with user info
    db.select({
      sessionId:  sessionsTable.id,
      userId:     sessionsTable.userId,
      startedAt:  sessionsTable.startedAt,
      langPair:   sessionsTable.langPair,
      username:   usersTable.username,
      email:      usersTable.email,
      planType:   usersTable.planType,
    })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(isNull(sessionsTable.endedAt))
      .orderBy(sessionsTable.startedAt),

    // All non-admin users for MRR calculation
    db.select({ planType: usersTable.planType })
      .from(usersTable)
      .where(sql`${usersTable.isAdmin} = false`),

    // Average completed session duration in last 30 days
    db.select({ avg: sql<number>`COALESCE(AVG(duration_seconds), 0)` })
      .from(sessionsTable)
      .where(and(
        gt(sessionsTable.startedAt, thirtyDaysAgo),
        sql`${sessionsTable.endedAt} IS NOT NULL`,
        sql`${sessionsTable.durationSeconds} > 0`,
      )),

    // Session count today
    db.select({ count: sql<number>`COUNT(*)` })
      .from(sessionsTable)
      .where(gt(sessionsTable.startedAt, twentyFourHrsAgo)),

    // Paying (non-trial) users
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        sql`${usersTable.planType} != 'trial'`,
        sql`${usersTable.isAdmin} = false`,
      )),

    // Trial users
    db.select({ count: sql<number>`COUNT(*)` })
      .from(usersTable)
      .where(and(
        sql`${usersTable.planType} = 'trial'`,
        sql`${usersTable.isAdmin} = false`,
      )),
  ]);

  const minutesToday  = Number(minutesTodayRow[0]?.total  ?? 0);
  const minutesWeek   = Number(minutesWeekRow[0]?.total   ?? 0);
  const minutesMonth  = Number(minutesMonthRow[0]?.total  ?? 0);
  const totalCostToday = +(minutesToday * (SONIOX_COST_PER_MIN + TRANSLATE_COST_PER_MIN)).toFixed(2);

  // MRR estimate: sum up plan prices for all non-admin, non-trial users
  const mrrEstimate = allUsersForMrr.reduce((sum, u) => {
    return sum + (PLAN_PRICES[u.planType] ?? 0);
  }, 0);

  const payingCount   = Number(payingUsersRow[0]?.count  ?? 0);
  const trialCount    = Number(trialUsersRow[0]?.count   ?? 0);
  const totalNonAdmin = payingCount + trialCount;
  const conversionRate = totalNonAdmin > 0 ? +((payingCount / totalNonAdmin) * 100).toFixed(1) : 0;

  const avgSessionMin   = +(Number(avgSessionRow[0]?.avg ?? 0) / 60).toFixed(1);
  const sessionsToday   = Number(sessionsTodayRow[0]?.count ?? 0);
  const costPerSession  = sessionsToday > 0 ? +(totalCostToday / sessionsToday).toFixed(4) : 0;

  res.json({
    activeUsers:       Number(activeRow[0]?.count  ?? 0),
    totalUsers:        Number(totalRow[0]?.count   ?? 0),
    dailyActiveUsers:  Number(dauRow[0]?.count     ?? 0),
    minutesToday,
    minutesWeek,
    minutesMonth,
    // Cost estimates
    sonioxCostToday:    +(minutesToday * SONIOX_COST_PER_MIN).toFixed(2),
    translateCostToday: +(minutesToday * TRANSLATE_COST_PER_MIN).toFixed(2),
    totalCostToday,
    // SaaS metrics
    mrrEstimate,
    conversionRate,
    avgSessionMin,
    sessionsToday,
    costPerSession,
    payingUsers:   payingCount,
    trialUsers:    trialCount,
    // Live sessions
    activeSessions: activeSessionRows.map(s => ({
      sessionId:       s.sessionId,
      userId:          s.userId,
      username:        s.username,
      email:           s.email ?? null,
      planType:        s.planType,
      langPair:        s.langPair ?? null,
      startedAt:       s.startedAt,
      durationSeconds: Math.round((Date.now() - s.startedAt.getTime()) / 1000),
      hasSnapshot:     sessionStore.has(s.sessionId),
    })),
  });
});

// ── View live session snapshot ───────────────────────────────────────────────
router.get("/session/:sessionId", requireAdmin, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId!);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const rows = await db
    .select({
      id:              sessionsTable.id,
      userId:          sessionsTable.userId,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      langPair:        sessionsTable.langPair,
      username:        usersTable.username,
      email:           usersTable.email,
      planType:        usersTable.planType,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: "Session not found" }); return; }

  const session  = rows[0]!;
  const snapshot = sessionStore.get(sessionId) ?? null;

  const durationSeconds = session.endedAt
    ? (session.durationSeconds ?? 0)
    : Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  res.json({
    sessionId:       session.id,
    userId:          session.userId,
    username:        session.username,
    email:           session.email ?? null,
    planType:        session.planType,
    langPair:        session.langPair ?? (snapshot ? `${snapshot.langA}↔${snapshot.langB}` : null),
    startedAt:       session.startedAt,
    endedAt:         session.endedAt ?? null,
    durationSeconds,
    isLive:          !session.endedAt,
    snapshot,
  });
});

// ── Terminate a live session ─────────────────────────────────────────────────
router.post("/session/:sessionId/terminate", requireAdmin, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId!);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const rows = await db
    .select({ id: sessionsTable.id, startedAt: sessionsTable.startedAt })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, sessionId), isNull(sessionsTable.endedAt)))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: "Session not found or already ended" }); return; }

  const session = rows[0]!;
  const durationSeconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000);

  await db.update(sessionsTable)
    .set({ endedAt: new Date(), durationSeconds })
    .where(eq(sessionsTable.id, sessionId));

  sessionStore.delete(sessionId);

  res.json({ ok: true, message: "Session terminated" });
});

// ── Session history for a user ───────────────────────────────────────────────
router.get("/users/:userId/sessions", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId!);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const rows = await db
    .select({
      id:              sessionsTable.id,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      langPair:        sessionsTable.langPair,
      lastActivityAt:  sessionsTable.lastActivityAt,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.startedAt))
    .limit(100);

  res.json({
    sessions: rows.map(s => ({
      id:              s.id,
      startedAt:       s.startedAt,
      endedAt:         s.endedAt ?? null,
      durationSeconds: s.durationSeconds ?? (
        s.endedAt ? null
          : Math.round((Date.now() - s.startedAt.getTime()) / 1000)
      ),
      langPair:       s.langPair ?? null,
      minutesUsed:    s.durationSeconds ? +(s.durationSeconds / 60).toFixed(2) : null,
      isLive:         !s.endedAt,
    })),
  });
});

// ── Language config (read) ───────────────────────────────────────────────────
router.get("/config/languages", requireAdmin, async (_req, res) => {
  res.json({
    allLanguages:     ALL_LANGUAGES,
    enabledLanguages: langConfig.enabledLanguages,
    defaultLangA:     langConfig.defaultLangA,
    defaultLangB:     langConfig.defaultLangB,
  });
});

// ── Language config (write) ──────────────────────────────────────────────────
router.put("/config/languages", requireAdmin, async (req, res) => {
  const { enabledLanguages, defaultLangA, defaultLangB } = req.body as {
    enabledLanguages?: string[];
    defaultLangA?:     string;
    defaultLangB?:     string;
  };

  if (enabledLanguages && enabledLanguages.length < 2) {
    res.status(400).json({ error: "At least 2 languages must be enabled" });
    return;
  }

  updateLangConfig({
    ...(enabledLanguages && { enabledLanguages }),
    ...(defaultLangA    && { defaultLangA }),
    ...(defaultLangB    && { defaultLangB }),
  });

  res.json({ ok: true, config: langConfig });
});

// ── Create user ──────────────────────────────────────────────────────────────
router.post("/users", requireAdmin, async (req, res) => {
  const { username, password, isAdmin, dailyLimitMinutes } = req.body as {
    username?: string;
    password?: string;
    isAdmin?: boolean;
    dailyLimitMinutes?: number;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const result = await db.insert(usersTable).values({
    username,
    passwordHash,
    isAdmin: isAdmin ?? false,
    isActive: true,
    trialStartedAt: new Date(),
    trialEndsAt,
    dailyLimitMinutes: dailyLimitMinutes ?? 300,
    minutesUsedToday: 0,
    totalMinutesUsed: 0,
    totalSessions: 0,
    lastUsageResetAt: new Date(),
  }).returning();

  const user = result[0]!;
  res.status(201).json({
    id:                user.id,
    username:          user.username,
    email:             user.email ?? null,
    isAdmin:           user.isAdmin,
    isActive:          user.isActive,
    planType:          user.planType,
    trialStartedAt:    user.trialStartedAt,
    trialEndsAt:       user.trialEndsAt,
    dailyLimitMinutes: user.dailyLimitMinutes,
    minutesUsedToday:  user.minutesUsedToday,
    totalMinutesUsed:  user.totalMinutesUsed,
    totalSessions:     user.totalSessions,
    createdAt:         user.createdAt,
  });
});

// ── Update user ──────────────────────────────────────────────────────────────
router.patch("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId!);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const { isActive, isAdmin, dailyLimitMinutes, password, planType } = req.body as {
    isActive?: boolean;
    isAdmin?: boolean;
    dailyLimitMinutes?: number;
    password?: string;
    planType?: string;
  };

  const updates: Partial<typeof usersTable.$inferSelect> = {};
  if (isActive !== undefined)          updates.isActive = isActive;
  if (isAdmin !== undefined)           updates.isAdmin = isAdmin;
  if (dailyLimitMinutes !== undefined) updates.dailyLimitMinutes = dailyLimitMinutes;
  if (planType)                        updates.planType = planType;
  if (password)                        updates.passwordHash = await hashPassword(password);

  const result = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = result[0]!;
  res.json({
    id:                user.id,
    username:          user.username,
    email:             user.email ?? null,
    isAdmin:           user.isAdmin,
    isActive:          user.isActive,
    planType:          user.planType,
    trialStartedAt:    user.trialStartedAt,
    trialEndsAt:       user.trialEndsAt,
    dailyLimitMinutes: user.dailyLimitMinutes,
    minutesUsedToday:  user.minutesUsedToday,
    totalMinutesUsed:  user.totalMinutesUsed,
    totalSessions:     user.totalSessions,
    createdAt:         user.createdAt,
  });
});

// ── Delete user ──────────────────────────────────────────────────────────────
router.delete("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId!);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const result = await db.delete(usersTable).where(eq(usersTable.id, userId)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ message: "User deleted" });
});

// ── Reset daily usage ────────────────────────────────────────────────────────
router.post("/users/:userId/reset-usage", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId!);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  await db.update(usersTable)
    .set({ minutesUsedToday: 0, lastUsageResetAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ message: "Usage reset" });
});

// ── Feedback ─────────────────────────────────────────────────────────────────
router.get("/feedback", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id:        feedbackTable.id,
      userId:    feedbackTable.userId,
      username:  usersTable.username,
      rating:    feedbackTable.rating,
      comment:   feedbackTable.comment,
      createdAt: feedbackTable.createdAt,
    })
    .from(feedbackTable)
    .innerJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
    .orderBy(feedbackTable.createdAt);

  res.json({
    feedback: rows.map((r) => ({
      id:        r.id,
      userId:    r.userId,
      username:  r.username,
      rating:    r.rating,
      comment:   r.comment ?? undefined,
      createdAt: r.createdAt,
    })),
  });
});

// ── Support ticket management ─────────────────────────────────────────────────

// List all tickets
router.get("/support", requireAdmin, async (_req, res) => {
  const tickets = await db
    .select({
      id:        supportTicketsTable.id,
      userId:    supportTicketsTable.userId,
      email:     supportTicketsTable.email,
      subject:   supportTicketsTable.subject,
      message:   supportTicketsTable.message,
      status:    supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
      username:  usersTable.username,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .orderBy(desc(supportTicketsTable.createdAt));

  // Fetch reply counts
  const replyCountRows = await db
    .select({
      ticketId: supportRepliesTable.ticketId,
      cnt:      sql<number>`COUNT(*)`,
    })
    .from(supportRepliesTable)
    .groupBy(supportRepliesTable.ticketId);

  const replyCounts = Object.fromEntries(replyCountRows.map(r => [r.ticketId, Number(r.cnt)]));

  res.json({
    tickets: tickets.map(t => ({
      ...t,
      replyCount: replyCounts[t.id] ?? 0,
    })),
  });
});

// Get a single ticket with all replies
router.get("/support/:id", requireAdmin, async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [ticket] = await db
    .select({
      id:        supportTicketsTable.id,
      userId:    supportTicketsTable.userId,
      email:     supportTicketsTable.email,
      subject:   supportTicketsTable.subject,
      message:   supportTicketsTable.message,
      status:    supportTicketsTable.status,
      createdAt: supportTicketsTable.createdAt,
      username:  usersTable.username,
    })
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .where(eq(supportTicketsTable.id, ticketId));

  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const replies = await db
    .select({
      id:        supportRepliesTable.id,
      isAdmin:   supportRepliesTable.isAdmin,
      message:   supportRepliesTable.message,
      createdAt: supportRepliesTable.createdAt,
      username:  usersTable.username,
    })
    .from(supportRepliesTable)
    .leftJoin(usersTable, eq(supportRepliesTable.authorId, usersTable.id))
    .where(eq(supportRepliesTable.ticketId, ticketId))
    .orderBy(supportRepliesTable.createdAt);

  res.json({ ticket, replies });
});

// Admin reply
router.post("/support/:id/reply", requireAdmin, async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const { message } = req.body as { message?: string };
  if (isNaN(ticketId) || !message?.trim()) {
    res.status(400).json({ error: "Message is required." }); return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const [reply] = await db.insert(supportRepliesTable).values({
    ticketId,
    authorId: req.session.userId ?? null,
    isAdmin:  true,
    message:  message.trim(),
  }).returning();

  // Re-open if resolved when admin replies
  await db.update(supportTicketsTable)
    .set({ updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId));

  // Email user
  void sendAdminReplyEmail(ticket.email, ticket.id, ticket.subject, message.trim());

  res.status(201).json({ reply });
});

// Update ticket status
router.put("/support/:id/status", requireAdmin, async (req, res) => {
  const ticketId = parseInt(req.params.id, 10);
  const { status } = req.body as { status?: string };
  if (isNaN(ticketId) || !["open", "resolved"].includes(status ?? "")) {
    res.status(400).json({ error: "Status must be 'open' or 'resolved'." }); return;
  }

  const [updated] = await db
    .update(supportTicketsTable)
    .set({ status: status!, updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Ticket not found." }); return; }
  res.json({ ticket: updated });
});

export default router;
