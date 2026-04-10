import type { Request, Response, NextFunction } from "express";
import { getUserWithResetCheck, isTrialLikePlanType } from "../lib/usage.js";
import { isTrialLoginBlocked, TRIAL_LOGIN_BLOCKED_JSON } from "../lib/trial-login-block.js";
import { logger } from "../lib/logger.js";

/**
 * When TRIAL_LOGIN_BLOCKED is set, any authenticated session for a trial-like user
 * is destroyed and the request gets 403. Admins are always allowed.
 * Logs out existing trial users on their next API call without a DB migration.
 */
export function trialLoginBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      if (!isTrialLoginBlocked()) {
        next();
        return;
      }
      const sess = req.session;
      if (!sess?.userId || sess.isAdmin) {
        next();
        return;
      }

      const user = await getUserWithResetCheck(sess.userId);
      if (!user || !isTrialLikePlanType(user.planType)) {
        next();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        sess.destroy((err) => (err ? reject(err) : resolve()));
      });
      res.status(403).json(TRIAL_LOGIN_BLOCKED_JSON);
    } catch (err) {
      logger.error({ err }, "trialLoginBlockMiddleware failed");
      next(err);
    }
  })();
}
