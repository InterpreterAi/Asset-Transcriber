import type { RequestHandler } from "express";

/** Reject obvious probes for env files, git metadata, etc. (never serve from static). */
export const blockSensitivePathMiddleware: RequestHandler = (req, res, next) => {
  const p = (req.path || "").replace(/\\/g, "/").toLowerCase();
  if (
    p.includes("/.env") ||
    p.endsWith(".env") ||
    p.endsWith(".env.local") ||
    p.endsWith(".env.production") ||
    p.includes(".git/") ||
    p.endsWith(".pem") ||
    p.includes("id_rsa") ||
    p.includes("web.config")
  ) {
    res.status(404).end();
    return;
  }
  next();
};
