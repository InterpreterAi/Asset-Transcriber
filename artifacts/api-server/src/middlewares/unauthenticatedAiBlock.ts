import type { NextFunction, Request, Response } from "express";
import { apiRequestPath, requiresAiSession } from "./apiRateLimits.js";
import { logger } from "../lib/logger.js";

/**
 * Blocks AI/transcription-cost paths without a logged-in user before route handlers run.
 * Returns 401 with the same shape as requireAuth (defense in depth; rate limits still apply first).
 */
export function blockUnauthenticatedAiRequests(req: Request, res: Response, next: NextFunction): void {
  if (!requiresAiSession(req)) {
    next();
    return;
  }
  const uid = req.session?.userId;
  if (uid != null && Number.isFinite(uid)) {
    next();
    return;
  }

  logger.warn(
    { ip: req.ip, path: apiRequestPath(req), method: req.method },
    "Blocked unauthenticated request to AI/transcription endpoint",
  );

  res.status(401).json({
    error: "Not authenticated",
    code: "not_authenticated",
  });
}
