import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import { uaHash } from "../lib/security-watch/detector.js";
import { logger } from "../lib/logger.js";

const THROTTLE_MS = 30 * 60_000;
const MAX_TRACKED_KEYS = 50_000;
const lastWrite = new Map<string, number>();

/**
 * Records which IP + browser each signed-in account uses (Security Watch).
 * Covers Google sign-ins, which never reach login_events. Fire-and-forget: never delays or fails a request.
 */
export const securitySightingsMiddleware: RequestHandler = (req, _res, next) => {
  try {
    const userId: number | undefined = (req as any).session?.userId;
    if (userId) {
      const forwarded = req.headers["x-forwarded-for"];
      const rawIp = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.ip || "";
      const ip = rawIp.replace(/^::ffff:/, "").slice(0, 64);
      if (ip) {
        const ua = (req.headers["user-agent"] ?? "").slice(0, 512) || null;
        const hash = uaHash(ua);
        const key = `${userId}|${ip}|${hash}`;
        const now = Date.now();
        if (now - (lastWrite.get(key) ?? 0) >= THROTTLE_MS) {
          if (lastWrite.size >= MAX_TRACKED_KEYS) lastWrite.clear();
          lastWrite.set(key, now);
          void pool
            .query(
              `INSERT INTO security_ip_sightings (user_id, ip_address, user_agent, ua_hash)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, ip_address, ua_hash)
               DO UPDATE SET last_seen = NOW(), hits = security_ip_sightings.hits + 1`,
              [userId, ip, ua, hash],
            )
            .catch((err: unknown) => {
              logger.debug({ err }, "security sighting write failed (non-fatal)");
            });
        }
      }
    }
  } catch (err) {
    logger.debug({ err }, "security sighting middleware error (non-fatal)");
  }
  next();
};
