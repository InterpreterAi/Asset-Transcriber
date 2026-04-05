import type { NextFunction, Request, Response } from "express";
import { apiRequestPath, isAiCostPath } from "./apiRateLimits.js";
import { logger } from "../lib/logger.js";

const WINDOW_MS = 60_000;
/** Log once per window when a user exceeds this many successful AI-cost calls. */
const WARN_THRESHOLD = 55;

type Bucket = { windowStart: number; count: number; warned: boolean };

const buckets = new Map<number, Bucket>();

function pruneBuckets(now: number): void {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart > WINDOW_MS * 5) buckets.delete(k);
  }
}

/**
 * After responses complete, logs unusually high successful AI/transcription API usage per user.
 */
export function aiUsageMonitorMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isAiCostPath(req)) {
    next();
    return;
  }

  const uid = req.session?.userId;
  if (uid == null) {
    next();
    return;
  }

  const pathStr = apiRequestPath(req);

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const now = Date.now();
    pruneBuckets(now);
    let b = buckets.get(uid);
    if (!b || now - b.windowStart >= WINDOW_MS) {
      b = { windowStart: now, count: 0, warned: false };
      buckets.set(uid, b);
    }
    b.count += 1;
    if (b.count >= WARN_THRESHOLD && !b.warned) {
      b.warned = true;
      logger.warn(
        { userId: uid, path: pathStr, countInWindow: b.count, windowMs: WINDOW_MS },
        "High AI/transcription API usage (observation)",
      );
    }
  });

  next();
}
