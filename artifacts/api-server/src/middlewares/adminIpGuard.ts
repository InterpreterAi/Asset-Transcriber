import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

const ALLOWED_IPS_RAW = process.env.ADMIN_ALLOWED_IPS ?? "";

function getAllowedIps(): string[] | null {
  const trimmed = ALLOWED_IPS_RAW.trim();
  if (!trimmed) return null;
  return trimmed.split(",").map(ip => ip.trim()).filter(Boolean);
}

export function adminIpGuard(req: Request, res: Response, next: NextFunction): void {
  const allowed = getAllowedIps();
  if (!allowed) { next(); return; }

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.ip
    ?? "";

  if (allowed.includes(ip)) { next(); return; }

  logger.warn({ ip, path: req.path }, "Admin access blocked by IP allowlist");
  res.status(403).json({ error: "Access denied from this location." });
}
