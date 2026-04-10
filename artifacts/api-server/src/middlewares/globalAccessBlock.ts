import type { NextFunction, Request, Response } from "express";
import {
  GLOBAL_ACCESS_BLOCKED_JSON,
  isGlobalAccessBlocked,
} from "../lib/global-access-block.js";

/**
 * Hard maintenance block for all /api routes.
 * Also destroys authenticated sessions so active users are forced out.
 */
export function globalAccessBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isGlobalAccessBlocked()) {
    next();
    return;
  }

  const sess = req.session;
  if (sess?.userId) {
    sess.destroy(() => {
      res.status(503).json(GLOBAL_ACCESS_BLOCKED_JSON);
    });
    return;
  }

  res.status(503).json(GLOBAL_ACCESS_BLOCKED_JSON);
}
