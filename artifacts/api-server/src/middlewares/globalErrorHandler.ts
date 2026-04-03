import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

/**
 * Express's built-in final handler returns plain text "Internal Server Error" for unhandled
 * errors (including `next(err)` from session middleware). This ensures JSON + stderr logs for Railway.
 */
export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const anyErr = err as Error & { status?: number; statusCode?: number; code?: string };
  const status = anyErr.statusCode ?? anyErr.status ?? 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message =
    err instanceof Error && err.message
      ? err.message
      : typeof err === "string"
        ? err
        : "Internal Server Error";
  const stack = err instanceof Error ? err.stack : undefined;
  const rawCode = typeof anyErr.code === "string" ? anyErr.code : undefined;
  const pgCode = rawCode && /^\d{5}$/.test(rawCode) ? rawCode : undefined;

  // Railway / Docker: always mirror to stderr so "Deploy Logs" shows the stack even if pino is misconfigured.
  console.error(
    `[globalErrorHandler] ${req.method} ${req.path} → ${safeStatus} ${message}`,
  );
  if (stack) {
    console.error(stack);
  }

  logger.error(
    {
      err,
      errStack: stack,
      path: req.path,
      method: req.method,
      statusCode: safeStatus,
    },
    "Unhandled error (caught by globalErrorHandler)",
  );

  if (res.headersSent) {
    return;
  }

  const exposeStack =
    process.env.EXPOSE_API_ERRORS === "1" || process.env.EXPOSE_API_ERRORS === "true";

  res.status(safeStatus).json({
    error: message,
    code: "unhandled_exception",
    pgCode: pgCode ?? undefined,
    path: req.path,
    ...(exposeStack && stack ? { stack } : {}),
  });
};
