/**
 * Central auth-related environment resolution (Express API + express-session).
 *
 * There is no NextAuth.js in this repo — Google OAuth lives in `routes/auth.ts`.
 * Use the same env names Railway/NextAuth tutorials expect: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
 * `NEXTAUTH_URL` (or `APP_URL`) for the public origin.
 *
 * OAuth redirect URI (must match Google Cloud Console exactly):
 *   `{NEXTAUTH_URL or APP_URL}/api/auth/{path}`
 * If `GOOGLE_OAUTH_REDIRECT_PATH` is unset and `NEXTAUTH_URL` is set → path `callback/google` (NextAuth’s `/api/auth/callback/google`).
 * Otherwise default path `google/callback` → `/api/auth/google/callback`.
 * Override anytime with `GOOGLE_OAUTH_REDIRECT_PATH=callback/google` or `=google/callback`.
 *
 * In **production**, only `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are read (no VITE_/NEXT_PUBLIC_
 * fallbacks) so an old client id cannot override Railway.
 */
import type { Request } from "express";
import { isPostgresEnvConfigured } from "../postgres-env.js";
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

/** In production, only `process.env.GOOGLE_CLIENT_ID` (trimmed / quotes stripped). No VITE_/NEXT_PUBLIC_ fallbacks. */
export function getGoogleClientId(): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return readGoogleCredential("GOOGLE_CLIENT_ID");
  }
  return (
    readGoogleCredential("GOOGLE_CLIENT_ID") ??
    readGoogleCredential("AUTH_GOOGLE_CLIENT_ID") ??
    readGoogleCredential("GOOGLE_OAUTH_CLIENT_ID") ??
    readGoogleCredential("NEXT_PUBLIC_GOOGLE_CLIENT_ID") ??
    readGoogleCredential("VITE_GOOGLE_CLIENT_ID")
  );
}

/** In production, only `process.env.GOOGLE_CLIENT_SECRET`. */
export function getGoogleClientSecret(): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return readGoogleCredential("GOOGLE_CLIENT_SECRET");
  }
  return (
    readGoogleCredential("GOOGLE_CLIENT_SECRET") ??
    readGoogleCredential("AUTH_GOOGLE_CLIENT_SECRET") ??
    readGoogleCredential("GOOGLE_OAUTH_CLIENT_SECRET")
  );
}

const DEFAULT_GOOGLE_OAUTH_REDIRECT_PATH = "google/callback";

/** Path under `/api/auth/` — must match an Authorized redirect URI in Google Cloud Console. */
export function getGoogleOAuthRedirectPath(): string {
  const raw = trimEnv("GOOGLE_OAUTH_REDIRECT_PATH")?.replace(/^\/+/g, "").replace(/\/+$/g, "") ?? "";
  if (raw === "callback/google" || raw === "google/callback") return raw;
  if (raw.length > 0) {
    logger.warn(
      { GOOGLE_OAUTH_REDIRECT_PATH: raw },
      "Invalid GOOGLE_OAUTH_REDIRECT_PATH — use google/callback or callback/google; using default",
    );
  }
  // NextAuth-style URI when NEXTAUTH_URL is set and path not overridden (…/api/auth/callback/google).
  if (trimEnv("NEXTAUTH_URL")) return "callback/google";
  return DEFAULT_GOOGLE_OAUTH_REDIRECT_PATH;
}

function publicBaseFromEnv(): string | undefined {
  // Prefer NEXTAUTH_URL when set — matches common Railway/NextAuth tutorials and avoids a stale APP_URL
  // overriding the domain used for Google OAuth redirect_uri.
  const fromEnv =
    trimEnv("NEXTAUTH_URL") ??
    trimEnv("APP_URL") ??
    trimEnv("PUBLIC_APP_URL") ??
    trimEnv("FRONTEND_URL") ??
    trimEnv("RAILWAY_STATIC_URL") ??
    trimEnv("RAILWAY_PUBLIC_DOMAIN");
  if (!fromEnv) return undefined;
  const u = fromEnv.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

/** For emails and other code paths without an HTTP request. */
export function getStaticPublicBaseUrl(): string {
  const fromEnv = publicBaseFromEnv();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "No APP_URL, NEXTAUTH_URL, PUBLIC_APP_URL, or FRONTEND_URL — using https://app.interpreterai.org for email links; set one of these for the correct domain.",
    );
    return "https://app.interpreterai.org";
  }
  return "http://localhost:3000";
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
  return `${getPublicBaseUrl(req)}/api/auth/${getGoogleOAuthRedirectPath()}`;
}

/** Presence-only snapshot for startup logs (never log values). */
export function logAuthEnvBootstrap(): void {
  const dbConfigured = isPostgresEnvConfigured();

  logger.info(
    {
      // Any supported Postgres connection env (URL or mixed PG* / POSTGRES_*), not only DATABASE_URL.
      DATABASE_URL: dbConfigured,
      SESSION_SECRET: Boolean(trimEnv("SESSION_SECRET") ?? trimEnv("NEXTAUTH_SECRET")),
      GOOGLE_CLIENT_ID: Boolean(getGoogleClientId()),
      GOOGLE_CLIENT_SECRET: Boolean(getGoogleClientSecret()),
      ADMIN_PASSWORD: Boolean(trimEnv("ADMIN_PASSWORD")),
      APP_URL: Boolean(
        trimEnv("APP_URL") ??
          trimEnv("NEXTAUTH_URL") ??
          trimEnv("PUBLIC_APP_URL") ??
          trimEnv("FRONTEND_URL"),
      ),
      googleOAuthRedirectPath: getGoogleOAuthRedirectPath(),
      googleOAuthEnvOnlyProduction: process.env.NODE_ENV === "production",
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
    DATABASE_URL: isPostgresEnvConfigured(),
    SESSION_SECRET: Boolean(trimEnv("SESSION_SECRET") ?? trimEnv("NEXTAUTH_SECRET")),
    GOOGLE_CLIENT_ID: Boolean(gid),
    GOOGLE_CLIENT_SECRET: Boolean(getGoogleClientSecret()),
    /** Matches the client id the running process uses (after alias resolution). */
    googleClientIdFingerprint: gid ? googleClientIdFingerprint(gid) : null,
    googleOAuthRedirectPath: getGoogleOAuthRedirectPath(),
    googleOAuthProductionUsesEnvOnly: process.env.NODE_ENV === "production",
    ADMIN_PASSWORD: Boolean(trimEnv("ADMIN_PASSWORD")),
    APP_URL_OR_NEXTAUTH_URL: Boolean(
      trimEnv("APP_URL") ??
        trimEnv("NEXTAUTH_URL") ??
        trimEnv("PUBLIC_APP_URL") ??
        trimEnv("FRONTEND_URL"),
    ),
    RAILWAY_STATIC_URL: Boolean(trimEnv("RAILWAY_STATIC_URL")),
  };
}
