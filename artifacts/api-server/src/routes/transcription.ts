import { Router } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired } from "../lib/usage.js";

const router = Router();

router.post("/token", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }

  if (isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired" });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached" });
    return;
  }

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Transcription service not configured" });
    return;
  }

  res.json({ apiKey, expiresIn: 3600 });
});

router.post("/session/start", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }

  if (isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired" });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached" });
    return;
  }

  const result = await db.insert(sessionsTable).values({
    userId: user.id,
    startedAt: new Date(),
  }).returning();

  const session = result[0];
  res.json({ sessionId: session!.id, message: "Session started" });
});

router.post("/session/stop", requireAuth, async (req, res) => {
  const { sessionId, durationSeconds } = req.body as { sessionId?: number; durationSeconds?: number };
  if (!sessionId || durationSeconds === undefined) {
    res.status(400).json({ error: "sessionId and durationSeconds are required" });
    return;
  }

  const minutesUsed = durationSeconds / 60;

  await db.update(sessionsTable)
    .set({ endedAt: new Date(), durationSeconds })
    .where(eq(sessionsTable.id, sessionId));

  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const newMinutesToday = user.minutesUsedToday + minutesUsed;
  const newTotalMinutes = user.totalMinutesUsed + minutesUsed;
  const newTotalSessions = user.totalSessions + 1;

  await db.update(usersTable)
    .set({
      minutesUsedToday: newMinutesToday,
      totalMinutesUsed: newTotalMinutes,
      totalSessions: newTotalSessions,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Session stopped" });
});

export default router;
