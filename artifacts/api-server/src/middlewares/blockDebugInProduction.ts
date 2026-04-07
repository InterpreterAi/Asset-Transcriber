import type { RequestHandler } from "express";

/**
 * All `/debug/*` endpoints are for local troubleshooting only.
 * In production (anything other than NODE_ENV=development), return 404.
 */
export const blockDebugInProductionMiddleware: RequestHandler = (req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }
  const p = req.path || "";
  if (p === "/debug" || p.startsWith("/debug/")) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  next();
};
