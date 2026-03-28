import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, getTrialDaysRemaining, isTrialExpired } from "../lib/usage.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    minutesUsedToday: user.minutesUsedToday,
    minutesRemainingToday: Math.max(0, user.dailyLimitMinutes - user.minutesUsedToday),
    totalMinutesUsed: user.totalMinutesUsed,
    totalSessions: user.totalSessions,
    dailyLimitMinutes: user.dailyLimitMinutes,
    trialDaysRemaining: getTrialDaysRemaining(user),
    trialExpired: isTrialExpired(user),
  });
});

export default router;
