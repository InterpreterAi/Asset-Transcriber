import { Router } from "express";
import { db, sessionsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { startOfAppDay } from "@workspace/app-timezone";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, getTrialDaysRemaining, isTrialExpired } from "../lib/usage.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const todayStart = startOfAppDay();
  const [todayUsage] = await db
    .select({
      minutesToday: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN ${sessionsTable.endedAt} IS NULL
                THEN EXTRACT(EPOCH FROM (NOW() - ${sessionsTable.startedAt}))
              ELSE COALESCE(${sessionsTable.audioSecondsProcessed}, ${sessionsTable.durationSeconds}, 0)
            END
          ),
          0
        ) / 60.0`,
    })
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.userId, user.id),
      gte(sessionsTable.startedAt, todayStart),
    ));

  const minutesUsedToday = Number(todayUsage?.minutesToday ?? user.minutesUsedToday ?? 0);

  res.json({
    minutesUsedToday,
    minutesRemainingToday: Math.max(0, user.dailyLimitMinutes - minutesUsedToday),
    totalMinutesUsed: user.totalMinutesUsed,
    totalSessions: user.totalSessions,
    dailyLimitMinutes: user.dailyLimitMinutes,
    trialDaysRemaining: getTrialDaysRemaining(user),
    trialExpired: isTrialExpired(user),
  });
});

router.get("/language-defaults", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const defaultLangA = ((user as { defaultLangA?: string }).defaultLangA ?? "").trim() || "en";
  const defaultLangB = ((user as { defaultLangB?: string }).defaultLangB ?? "").trim() || "ar";
  res.json({ defaultLangA, defaultLangB });
});

export default router;
