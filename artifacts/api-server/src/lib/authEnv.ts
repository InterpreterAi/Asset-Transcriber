/**
 * Central auth-related environment resolution (Express API — not NextAuth).
 * Accepts common NextAuth-style names as fallbacks so Railway vars match tutorials.
 */
import type { Request } from "express";
import { logger } from "./logger.js";

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v == null) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Session signing secret — SESSION_SECRET preferred, NEXTAUTH_SECRET alias. */
export function getSessionSecret(): string {
  const s = trimEnv("SESSION_SECRET") ?? trimEnv("NEXTAUTH_SECRET");
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    logger.error(
      "SESSION_SECRET (or NEXTAUTH_SECRET) is not set. Sessions are insecure; set one in Railway.",
    );
  }
  return "fallback-secret-change-me";
}

export function getGoogleClientId(): string | undefined {
  return (
    trimEnv("GOOGLE_CLIENT_ID") ??
    trimEnv("AUTH_GOOGLE_CLIENT_ID") ??
    trimEnv("GOOGLE_OAUTH_CLIENT_ID")
  );
}

export function getGoogleClientSecret(): string | undefined {
  return (
    trimEnv("GOOGLE_CLIENT_SECRET") ??
    trimEnv("AUTH_GOOGLE_CLIENT_SECRET") ??
    trimEnv("GOOGLE_OAUTH_CLIENT_SECRET")
  );
}

function publicBaseFromEnv(): string | undefined {
  const fromEnv =
    trimEnv("APP_URL") ??
    trimEnv("NEXTAUTH_URL") ??
    trimEnv("RAILWAY_STATIC_URL") ??
    trimEnv("RAILWAY_PUBLIC_DOMAIN");
  if (!fromEnv) return undefined;
  const u = fromEnv.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

/** For emails and other code paths without an HTTP request. */
export function getStaticPublicBaseUrl(): string {
  return publicBaseFromEnv() ?? "https://asset-transcriber.replit.app";
}

/**
 * Public origin for OAuth redirect_uri. Prefer explicit env when proxy headers
 * are missing or wrong on the host.
 */
export function getPublicBaseUrl(req: Request): string {
  const fromEnv = publicBaseFromEnv();
  if (fromEnv) return fromEnv;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** Must match Google Cloud Console "Authorized redirect URIs". */
export function getGoogleOAuthRedirectUri(req: Request): string {
  return `${getPublicBaseUrl(req)}/api/auth/google/callback`;
}

/** Presence-only snapshot for startup logs (never log values). */
export function logAuthEnvBootstrap(): void {
  const dbConfigured =
    Boolean(trimEnv("DATABASE_URL")) ||
    Boolean(trimEnv("DATABASE_PRIVATE_URL")) ||
    Boolean(trimEnv("DATABASE_PUBLIC_URL"));

  logger.info(
    {
      DATABASE_URL: dbConfigured,
      SESSION_SECRET: Boolean(trimEnv("SESSION_SECRET") ?? trimEnv("NEXTAUTH_SECRET")),
      GOOGLE_CLIENT_ID: Boolean(getGoogleClientId()),
      GOOGLE_CLIENT_SECRET: Boolean(getGoogleClientSecret()),
      ADMIN_PASSWORD: Boolean(trimEnv("ADMIN_PASSWORD")),
      APP_URL: Boolean(trimEnv("APP_URL") ?? trimEnv("NEXTAUTH_URL")),
    },
    "Auth-related environment (presence only; Railway vars must be on the running web service)",
  );

  if (process.env.NODE_ENV === "production" && !getGoogleClientId()) {
    logger.warn("GOOGLE_CLIENT_ID missing — Google sign-in disabled until set on this service.");
  }
}
