import type { Request, Response, NextFunction } from "express";
import { logError } from "../lib/error-logger.js";

const SKIP_ENDPOINTS = new Set(["/api/auth/heartbeat", "/api/health"]);

function shouldLog(statusCode: number, endpoint: string): boolean {
  if (SKIP_ENDPOINTS.has(endpoint)) return false;
  return statusCode >= 400;
}

export function errorLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalEnd = res.end.bind(res);

  (res as any).end = function (...args: Parameters<typeof originalEnd>) {
    const statusCode = res.statusCode;
    const endpoint   = req.path.split("?")[0] ?? req.path;
    const method     = req.method;

    if (shouldLog(statusCode, endpoint)) {
      const session   = (req as any).session;
      const userId    = session?.userId ?? null;
      const sessionId = session?.id ?? null;

      void logError({
        userId,
        sessionId,
        endpoint,
        method,
        statusCode,
        userAgent:  req.headers["user-agent"] ?? null,
        ipAddress:  req.ip ?? null,
      });
    }

    return originalEnd(...args);
  };

  next();
}
