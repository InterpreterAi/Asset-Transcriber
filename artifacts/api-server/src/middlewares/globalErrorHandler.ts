import type { ErrorRequestHandler, Request, Response } from "express";

/** Full pathname for logs + JSON (under `app.use("/api", router)` `req.path` is often stripped to `/auth/login`). */
export function fullRequestPath(req: Pick<Request, "originalUrl" | "url" | "path">): string {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "?";
  return raw.split("?")[0] ?? "?";
}

/**
 * Build and send JSON for an unhandled error. Safe to call from route catch blocks.
 * Never pass raw `err` into pino here — some errors break serializers.
 */
export function writeUnhandledExceptionJson(err: unknown, req: Request, res: Response): void {
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
  const pathStr = fullRequestPath(req);

  console.error(`[globalErrorHandler] ${req.method} ${pathStr} → ${safeStatus} ${message}`);
  if (stack) {
    console.error(stack);
  }

  if (res.headersSent) {
    return;
  }

  const exposeStack =
    process.env.EXPOSE_API_ERRORS === "1" || process.env.EXPOSE_API_ERRORS === "true";

  const payload = {
    error: message,
    code: "unhandled_exception" as const,
    pgCode: pgCode ?? undefined,
    path: pathStr,
    ...(exposeStack && stack ? { stack } : {}),
  };

  res.status(safeStatus).setHeader("Content-Type", "application/json").send(JSON.stringify(payload));
}

/**
 * Mounted immediately after `app.use("/api", router)` so /api failures never pass through the SPA
 * middleware chain. Uses `originalUrl` because `req.path` is mount-relative inside `/api`.
 */
export const apiMountJsonErrorHandler: ErrorRequestHandler = function apiMountJsonErrorHandler(
  err,
  req,
  res,
  next,
) {
  if (!fullRequestPath(req).startsWith("/api")) {
    next(err);
    return;
  }
  try {
    writeUnhandledExceptionJson(err, req, res);
  } catch (fatal) {
    console.error("[apiMountJsonErrorHandler] failed", fatal);
    if (!res.headersSent) {
      try {
        res
          .status(500)
          .setHeader("Content-Type", "application/json")
          .send(JSON.stringify({ error: "Internal Server Error", code: "error_handler_failed" }));
      } catch {
        /* ignore */
      }
    }
  }
};

/**
 * Express/router only treat a layer as an error handler when `fn.length === 4`.
 * Use a function declaration (not a rest-parameter wrapper) so minifiers never drop arity.
 */
export const globalErrorHandler: ErrorRequestHandler = function globalErrorHandler(
  err,
  req,
  res,
  _next,
) {
  try {
    writeUnhandledExceptionJson(err, req, res);
  } catch (fatal) {
    console.error("[globalErrorHandler] handler itself threw — check pino/err serialization");
    console.error(fatal);
    if (!res.headersSent) {
      try {
        res
          .status(500)
          .setHeader("Content-Type", "application/json")
          .send(
            JSON.stringify({
              error: "Internal Server Error",
              code: "error_handler_failed",
            }),
          );
      } catch {
        /* ignore */
      }
    }
  }
};
