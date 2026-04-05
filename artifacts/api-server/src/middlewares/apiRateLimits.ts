import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import { fullRequestPath } from "./globalErrorHandler.js";
import { logger } from "../lib/logger.js";

/** Full pathname including `/api` (uses originalUrl). */
export function apiRequestPath(req: Request): string {
  return fullRequestPath(req);
}

export function isSessionHeartbeatPost(req: Request): boolean {
  if (req.method !== "POST") return false;
  const p = apiRequestPath(req);
  return p.includes("/transcription/session/heartbeat");
}

export function isTranscriptionSessionStartPost(req: Request): boolean {
  if (req.method !== "POST") return false;
  const p = apiRequestPath(req);
  return p.includes("/transcription/session/start");
}

/**
 * Routes that bill or proxy AI / transcription (counted separately from general API limit).
 */
export function isAiCostPath(req: Request): boolean {
  if (req.method !== "POST" && req.method !== "PUT") return false;
  const p = apiRequestPath(req);
  if (p.includes("/transcription/token")) return true;
  if (p.includes("/transcription/translate")) return true;
  if (p.includes("/terminology/search")) return true;
  if (p === "/api/translate" || p.startsWith("/api/translate/")) return true;
  if (p.includes("/transcription/session/stop")) return true;
  if (p.includes("/transcription/session/snapshot")) return true;
  return false;
}

/** AI-cost routes plus transcription session start (Soniox); used for early 401 + monitoring. */
export function requiresAiSession(req: Request): boolean {
  if (req.method === "OPTIONS") return false;
  return isAiCostPath(req) || isTranscriptionSessionStartPost(req);
}

function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

/** Authenticated user id, else IP-based key (IPv6-safe). */
export function rateLimitUserOrIpKey(req: Request): string {
  const uid = (req as Request & { session?: { userId?: number } }).session?.userId;
  if (uid != null && Number.isFinite(uid)) return `u:${uid}`;
  return `ip:${ipKeyGenerator(clientIp(req))}`;
}

function rateLimitExceededHandler(limiterId: string) {
  return (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const lim = typeof options.limit === "number" ? options.limit : -1;
    logger.warn(
      {
        limiter: limiterId,
        ip: clientIp(req),
        path: apiRequestPath(req),
        method: req.method,
        limit: lim,
        windowMs: options.windowMs,
        userId: (req as Request & { session?: { userId?: number } }).session?.userId ?? null,
      },
      "API rate limit exceeded",
    );

    const status = options.statusCode ?? 429;
    const base =
      typeof options.message === "object" && options.message !== null && !Array.isArray(options.message)
        ? (options.message as Record<string, unknown>)
        : { error: typeof options.message === "string" ? options.message : "Too many requests." };
    res.status(status).json({ ...base, code: "rate_limited", limiter: limiterId });
  };
}

/** Failed login / 2FA verify: 5 failures per 10 minutes per IP. */
export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please wait 10 minutes before trying again." },
  handler: rateLimitExceededHandler("login"),
});

/** New account creation: 5 per hour per IP. */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: "Too many signup attempts from this network. Please try again later." },
  handler: rateLimitExceededHandler("signup"),
});

/** Password reset requests: 5 per hour per IP. */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: "Too many reset requests. Please try again later." },
  handler: rateLimitExceededHandler("forgot_password"),
});

/** Other /api/auth/* traffic (OAuth start, etc.). */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: "Too many requests. Please wait a moment." },
  handler: rateLimitExceededHandler("auth"),
  skip: (req) =>
    req.method === "OPTIONS" ||
    (req.method === "GET" && (req.path === "/me" || req.path.startsWith("/me/"))),
});

/**
 * New transcription sessions per user/IP — stops scripted session spam (Soniox cost surface).
 * Separate from the general AI burst limiter.
 */
export const transcriptionSessionStartLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitUserOrIpKey,
  message: {
    error: "Too many transcription sessions started. Please wait before starting another.",
  },
  handler: rateLimitExceededHandler("transcription_session_start"),
  skip: (req) => req.method === "OPTIONS" || !isTranscriptionSessionStartPost(req),
});

/** Session heartbeats only — generous cap so 30s intervals never hit the wall. */
export const sessionHeartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitUserOrIpKey,
  message: { error: "Too many session heartbeats. Please wait a moment." },
  handler: rateLimitExceededHandler("session_heartbeat"),
  skip: (req) => req.method === "OPTIONS" || !isSessionHeartbeatPost(req),
});

/**
 * Transcription token, translate, terminology (OpenAI), external translate, session lifecycle.
 * Per-user when logged in; per-IP otherwise.
 */
export const aiCostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitUserOrIpKey,
  message: { error: "Too many AI or transcription requests. Please slow down." },
  handler: rateLimitExceededHandler("ai_transcription"),
  skip: (req) => req.method === "OPTIONS" || !isAiCostPath(req),
});

/**
 * Default API cap: 60 req/min per IP for routes not covered by AI or heartbeat buckets.
 * Skips health check, heartbeats, and AI-cost paths (those use dedicated limiters).
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: "Too many requests. Please slow down." },
  handler: rateLimitExceededHandler("general_api"),
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const p = apiRequestPath(req);
    if (p === "/api/healthz") return true;
    if (isSessionHeartbeatPost(req)) return true;
    if (isAiCostPath(req)) return true;
    if (isTranscriptionSessionStartPost(req)) return true;
    return false;
  },
});
