import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { apiRequestPath } from "./apiRateLimits.js";
import { appliesStrictTrialAiThrottle } from "../lib/usage.js";
import { logger } from "../lib/logger.js";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TRIAL_TRANSLATE_MAX = envInt("TRIAL_TRANSLATE_MAX_PER_MINUTE", 22);
const TRIAL_TOKEN_MAX = envInt("TRIAL_TOKEN_MAX_PER_MINUTE", 12);
const WINDOW_MS = 60_000;
const USER_CACHE_MS = 45_000;

type Cached = { at: number; strict: boolean };
const userThrottleCache = new Map<number, Cached>();

/** Sliding-window hit log per user and path kind. */
const translateHits = new Map<number, number[]>();
const tokenHits = new Map<number, number[]>();

function prune(ts: number[], now: number): void {
  const cutoff = now - WINDOW_MS;
  while (ts.length > 0 && ts[0]! < cutoff) ts.shift();
}

function isTrialHardWallPath(req: Request): boolean {
  if (req.method !== "POST") return false;
  const p = apiRequestPath(req);
  if (p.includes("/transcription/translate")) return true;
  if (p.includes("/transcription/token")) return true;
  return false;
}

async function loadStrictTrialCached(userId: number): Promise<boolean> {
  const now = Date.now();
  const hit = userThrottleCache.get(userId);
  if (hit && now - hit.at < USER_CACHE_MS) return hit.strict;

  const [row] = await db
    .select({
      planType: usersTable.planType,
      trialEndsAt: usersTable.trialEndsAt,
      dailyLimitMinutes: usersTable.dailyLimitMinutes,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
      isAdmin: usersTable.isAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const strict = row ? appliesStrictTrialAiThrottle(row) : false;
  userThrottleCache.set(userId, { at: now, strict });
  return strict;
}

/**
 * Stricter sliding-window limits on Soniox token + `/translate` for **trial-only** accounts.
 * Paid-effective users (including PayPal lag) skip entirely. Runs before the broader AI limiters.
 */
export function trialAiHardWallMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isTrialHardWallPath(req)) {
    next();
    return;
  }

  const userId = (req as Request & { session?: { userId?: number } }).session?.userId;
  if (userId == null || !Number.isFinite(userId)) {
    next();
    return;
  }

  void (async () => {
    try {
      const strict = await loadStrictTrialCached(userId);
      if (!strict) {
        next();
        return;
      }

      const now = Date.now();
      const isTranslate = apiRequestPath(req).includes("/transcription/translate");
      const bucket = isTranslate ? translateHits : tokenHits;
      const max = isTranslate ? TRIAL_TRANSLATE_MAX : TRIAL_TOKEN_MAX;
      let arr = bucket.get(userId);
      if (!arr) {
        arr = [];
        bucket.set(userId, arr);
      }
      prune(arr, now);

      if (arr.length >= max) {
        logger.warn(
          {
            userId,
            path: apiRequestPath(req),
            kind: isTranslate ? "translate" : "token",
            windowMs: WINDOW_MS,
            max,
            inWindow: arr.length,
          },
          "trial AI hard wall: rate limit exceeded",
        );
        res.setHeader("Retry-After", "5");
        res.status(429).json({
          error:
            "Trial rate limit: too many transcription or translation requests. Please slow down; paid plans have higher limits.",
          code: "trial_ai_rate_limited",
          limiter: "trial_ai_hard_wall",
          kind: isTranslate ? "translate" : "token",
        });
        return;
      }

      arr.push(now);
      next();
    } catch (err) {
      next(err as Error);
    }
  })();
}
