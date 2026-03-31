import { Router } from "express";
import { db, usersTable, feedbackTable } from "@workspace/db";
import { eq, sql, gt } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth.js";
import { hashPassword } from "../lib/password.js";
import { getTrialDaysRemaining, isTrialExpired } from "../lib/usage.js";

const router = Router();

router.get("/users", requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      trialStartedAt: u.trialStartedAt,
      trialEndsAt: u.trialEndsAt,
      dailyLimitMinutes: u.dailyLimitMinutes,
      minutesUsedToday: u.minutesUsedToday,
      totalMinutesUsed: u.totalMinutesUsed,
      totalSessions: u.totalSessions,
      lastActivityAt: u.lastActivity ?? null,
      createdAt: u.createdAt,
    })),
  });
});

router.get("/stats", requireAdmin, async (_req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(usersTable)
    .where(gt(usersTable.lastActivity, fiveMinutesAgo));
  res.json({ activeUsers: Number(rows[0]?.count ?? 0) });
});

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
    dailyLimitMinutes: dailyLimitMinutes ?? 180,
    minutesUsedToday: 0,
    totalMinutesUsed: 0,
    totalSessions: 0,
    lastUsageResetAt: new Date(),
  }).returning();

  const user = result[0]!;
  res.status(201).json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    dailyLimitMinutes: user.dailyLimitMinutes,
    minutesUsedToday: user.minutesUsedToday,
    totalMinutesUsed: user.totalMinutesUsed,
    totalSessions: user.totalSessions,
    createdAt: user.createdAt,
  });
});

router.patch("/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.userId!);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const { isActive, isAdmin, dailyLimitMinutes, password } = req.body as {
    isActive?: boolean;
    isAdmin?: boolean;
    dailyLimitMinutes?: number;
    password?: string;
  };

  const updates: Partial<typeof usersTable.$inferSelect> = {};
  if (isActive !== undefined) updates.isActive = isActive;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;
  if (dailyLimitMinutes !== undefined) updates.dailyLimitMinutes = dailyLimitMinutes;
  if (password) updates.passwordHash = await hashPassword(password);

  const result = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = result[0]!;
  res.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    dailyLimitMinutes: user.dailyLimitMinutes,
    minutesUsedToday: user.minutesUsedToday,
    totalMinutesUsed: user.totalMinutesUsed,
    totalSessions: user.totalSessions,
    createdAt: user.createdAt,
  });
});

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

router.get("/feedback", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: feedbackTable.id,
      userId: feedbackTable.userId,
      username: usersTable.username,
      rating: feedbackTable.rating,
      comment: feedbackTable.comment,
      createdAt: feedbackTable.createdAt,
    })
    .from(feedbackTable)
    .innerJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
    .orderBy(feedbackTable.createdAt);

  res.json({
    feedback: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: r.username,
      rating: r.rating,
      comment: r.comment ?? undefined,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
