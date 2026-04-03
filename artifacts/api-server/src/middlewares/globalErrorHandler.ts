import type { ErrorRequestHandler } from "express";

/**
 * Express's default handler sends plain text "Internal Server Error". This returns JSON.
 * IMPORTANT: Never pass raw `err` into pino — some errors (e.g. AggregateError) can make
 * serializers throw and abort the handler, breaking every request that hits `next(err)`.
 */
export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  try {
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
    const pathStr = (req as { path?: string })?.path ?? (req as { url?: string })?.url ?? "?";

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
