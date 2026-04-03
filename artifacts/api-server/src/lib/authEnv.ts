/**
 * Central auth-related environment resolution (Express API + express-session).
 * This app does not use the NextAuth.js library; Google OAuth is implemented in `routes/auth.ts`.
 * Railway: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the **web/API service** that runs
 * this server, then redeploy. Remove stale duplicate vars (`AUTH_GOOGLE_*`, `VITE_GOOGLE_*`, etc.)
 * so an old ID is not picked up via the alias chain in `getGoogleClientId()`.
 */
import type { Request } from "express";
import { logger } from "./logger.js";

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v == null) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Strips wrapping quotes from Railway / JSON paste mistakes (avoids invalid_client). */
function readGoogleCredential(key: string): string | undefined {
  const v = process.env[key];
  if (v == null) return undefined;
  let t = v.trim();
  if (t === "") return undefined;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t === "" ? undefined : t;
}

/** Public OAuth client id — safe to expose; helps verify Railway after credential rotation. */
function googleClientIdFingerprint(id: string): string {
  if (id.length <= 24) return id;
  return `${id.slice(0, 12)}…${id.slice(-10)}`;
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
    readGoogleCredential("GOOGLE_CLIENT_ID") ??
    readGoogleCredential("AUTH_GOOGLE_CLIENT_ID") ??
    readGoogleCredential("GOOGLE_OAUTH_CLIENT_ID") ??
    /** Next/Vite tutorials often set this; the OAuth *client id* is public anyway. */
    readGoogleCredential("NEXT_PUBLIC_GOOGLE_CLIENT_ID") ??
    readGoogleCredential("VITE_GOOGLE_CLIENT_ID")
  );
}

export function getGoogleClientSecret(): string | undefined {
  return (
    readGoogleCredential("GOOGLE_CLIENT_SECRET") ??
    readGoogleCredential("AUTH_GOOGLE_CLIENT_SECRET") ??
    readGoogleCredential("GOOGLE_OAUTH_CLIENT_SECRET")
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

  const gid = getGoogleClientId();
  if (process.env.NODE_ENV === "production" && !gid) {
    logger.warn("GOOGLE_CLIENT_ID missing — Google sign-in disabled until set on this service.");
  }
  // Web OAuth clients use this suffix; wrong shape → Google returns 401 invalid_client ("client not found").
  if (gid && !gid.includes(".apps.googleusercontent.com")) {
    logger.warn(
      "GOOGLE_CLIENT_ID does not look like a Google *Web client* ID (expected …apps.googleusercontent.com). " +
        "Using an Android/iOS key or a typo triggers OAuth client was not found.",
    );
  }
}

/** For GET /debug/auth-env — booleans + non-secret OAuth client fingerprint. */
export function getAuthEnvDiagnostics(): Record<string, boolean | string | null> {
  const gid = getGoogleClientId();
  return {
    DATABASE_URL: Boolean(
      trimEnv("DATABASE_URL") ??
        trimEnv("DATABASE_PRIVATE_URL") ??
        trimEnv("DATABASE_PUBLIC_URL"),
    ),
    SESSION_SECRET: Boolean(trimEnv("SESSION_SECRET") ?? trimEnv("NEXTAUTH_SECRET")),
    GOOGLE_CLIENT_ID: Boolean(gid),
    GOOGLE_CLIENT_SECRET: Boolean(getGoogleClientSecret()),
    /** Matches the client id the running process uses (after alias resolution). */
    googleClientIdFingerprint: gid ? googleClientIdFingerprint(gid) : null,
    ADMIN_PASSWORD: Boolean(trimEnv("ADMIN_PASSWORD")),
    APP_URL_OR_NEXTAUTH_URL: Boolean(trimEnv("APP_URL") ?? trimEnv("NEXTAUTH_URL")),
    RAILWAY_STATIC_URL: Boolean(trimEnv("RAILWAY_STATIC_URL")),
  };
}
