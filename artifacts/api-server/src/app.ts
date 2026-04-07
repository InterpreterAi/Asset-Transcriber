import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { WebhookHandlers } from "./lib/webhookHandlers.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import {
  sessionMiddleware,
  sessionStoreMode,
  getSessionStoreResolution,
} from "./middlewares/session.js";
import { touchActivity } from "./lib/usage.js";
import { errorLoggerMiddleware } from "./middlewares/errorLogger.js";
import { adminIpGuard } from "./middlewares/adminIpGuard.js";
import { getAuthEnvDiagnostics } from "./lib/authEnv.js";
import { getAiEnvDiagnostics } from "./lib/ai-env.js";
import { getPublicEnvReadiness } from "./lib/readiness-env.js";
import { getDebugDbEnvHttpPayload } from "./postgres-env.js";
import { apiMountJsonErrorHandler, globalErrorHandler } from "./middlewares/globalErrorHandler.js";
import {
  aiCostLimiter,
  authLimiter,
  forgotPasswordLimiter,
  generalApiLimiter,
  resendVerificationLimiter,
  loginLimiter,
  sessionHeartbeatLimiter,
  signupLimiter,
  transcriptionSessionStartLimiter,
  translationLimiter,
} from "./middlewares/apiRateLimits.js";
import { jsonParseErrorHandler } from "./middlewares/jsonParseError.js";
import { aiUsageMonitorMiddleware } from "./middlewares/aiUsageMonitor.js";
import { blockUnauthenticatedAiRequests } from "./middlewares/unauthenticatedAiBlock.js";
import { securityHeadersMiddleware } from "./middlewares/securityHeaders.js";
import { createProductionCorsMiddleware } from "./middlewares/corsPolicy.js";
import { blockSensitivePathMiddleware } from "./middlewares/blockSensitivePaths.js";
import { blockDebugInProductionMiddleware } from "./middlewares/blockDebugInProduction.js";

// Per-user debounce: only write last_activity to DB once per 60 s per user.
const activityDebounce = new Map<number, number>();
const ACTIVITY_DEBOUNCE_MS = 60_000;

const app: Express = express();

// Trust reverse proxy (Railway often chains >1 hop). Without this, req.secure stays false and
// Secure session cookies never stick — breaks password login + Google OAuth state.
const trustEnv = process.env.TRUST_PROXY?.trim().toLowerCase();
const trustProxy: boolean | number =
  trustEnv === "false" || trustEnv === "0"
    ? false
    : trustEnv === "true" || trustEnv === "1"
      ? true
      : trustEnv && /^\d+$/.test(trustEnv)
        ? Number(trustEnv)
        : Boolean(
              process.env.RAILWAY_ENVIRONMENT ||
                process.env.RAILWAY_PROJECT_ID ||
                process.env.FLY_APP_NAME ||
                process.env.RENDER,
            )
          ? true
          : 1;
app.set("trust proxy", trustProxy);

const spaStaticRoot = path.resolve(
  process.cwd(),
  "artifacts/transcription-app/dist/public",
);
const spaIndexHtml = path.join(spaStaticRoot, "index.html");
const spaEnabled = fs.existsSync(spaIndexHtml);

// Railway / load balancers probe "/health" before the app is "ready".
// Must stay BEFORE session (Postgres) and before /api rate limits.
app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.use(securityHeadersMiddleware);
app.use(blockSensitivePathMiddleware);
app.use(blockDebugInProductionMiddleware);

// Branded logo for transactional emails (`<img src="{APP_URL}/email/logo.png">`).
// Supports cwd = repo root (Docker /app) or `artifacts/api-server` (local `node dist/index.mjs`).
const emailAssetsCandidates = [
  path.resolve(process.cwd(), "public/email"),
  path.resolve(process.cwd(), "artifacts/api-server/public/email"),
];
const emailAssetsRoot = emailAssetsCandidates.find((p) => fs.existsSync(p));
if (emailAssetsRoot) {
  app.use("/email", express.static(emailAssetsRoot, { maxAge: "7d" }));
  app.get("/logo.png", (_req, res) => {
    const f = path.join(emailAssetsRoot, "logo.png");
    if (fs.existsSync(f)) {
      res.sendFile(path.resolve(f));
    } else {
      res.status(404).end();
    }
  });
}

// SPA build output — MUST be before session/json/pino so /assets/*.js does not hit
// connect-pg-simple (Postgres) on every chunk; that caused very slow loads and blank screens.
if (spaEnabled) {
  app.use(
    express.static(spaStaticRoot, {
      index: ["index.html"],
      setHeaders(res, filePath) {
        if (/\/assets\//.test(filePath.replace(/\\/g, "/"))) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
}

app.use(
  pinoHttp({
    logger,
    // HIPAA / PHI: serializers are locked to metadata only.
    // Request bodies (which may contain transcribed speech or translations)
    // are NEVER included in log output under any circumstance.
    serializers: {
      req(req) {
        // Only log safe metadata — never url params that could contain PHI,
        // never headers that could contain auth tokens beyond what pino redacts,
        // and never the request body.
        return {
          id:     req.id,
          method: req.method,
          url:    req.url?.split("?")[0],  // strip query strings
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(createProductionCorsMiddleware());

// Debug diagnostics — registered only in NODE_ENV=development (middleware above still 404s /debug in production).
if (process.env.NODE_ENV === "development") {
  app.get("/debug/db-env", (_req, res) => {
    res.status(200).json(getDebugDbEnvHttpPayload("full_api"));
  });

  app.get("/debug/auth-env", (req, res) => {
    const xfProto = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(xfProto) ? xfProto[0] : xfProto;
    res.status(200).json({
      ok: true,
      message: "Presence only. Set these on the Railway service that runs this container.",
      env: getAuthEnvDiagnostics(),
      sessionStoreMode,
      sessionStoreResolution: getSessionStoreResolution(),
      trustProxy: app.get("trust proxy"),
      requestSecure: req.secure,
      xForwardedProto: proto ?? null,
    });
  });

  app.get("/debug/ai-env", (_req, res) => {
    res.status(200).json({
      ok: true,
      message:
        "See ai.translation for live OpenAI path (/api/transcription/translate). ai.openai must be true or translation stays empty. ai.runtimeFingerprint shows which env names exist in this process.",
      ai: getAiEnvDiagnostics(),
    });
  });

  app.get("/debug/readiness", (_req, res) => {
    const env = getPublicEnvReadiness();
    res.status(200).json({
      ok: true,
      status: "full_api",
      message:
        "If any block below is false, fix Railway vars on this service and redeploy. Use /debug/db-health for row counts.",
      env,
      checklist: {
        database: env.postgres.configured,
        sessionSecret: env.session.SESSION_SECRET || env.session.NEXTAUTH_SECRET,
        sonioxTranscription: env.ai.soniox,
        openaiTranslation: env.ai.openai,
        googleLogin:
          env.googleOAuth.GOOGLE_CLIENT_ID &&
          env.googleOAuth.GOOGLE_CLIENT_SECRET &&
          (env.googleOAuth.NEXTAUTH_URL || env.googleOAuth.APP_URL),
      },
    });
  });
}

// Before session: DB-only probe (dynamic import avoids loading @workspace/db before it is ready).
function databaseFingerprint(connectionString: string): { host: string | null; database: string | null } {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "postgres:"));
    const path = (u.pathname || "").replace(/^\//, "");
    const database = (path.split("?")[0] || "").split("/")[0] || null;
    return { host: u.hostname || null, database };
  } catch {
    return { host: null, database: null };
  }
}

if (process.env.NODE_ENV === "development") {
  app.get("/debug/db-health", async (_req, res, next) => {
    try {
      const { pool, resolvedDatabaseUrl } = await import("@workspace/db");
      await pool.query("SELECT 1");
      const users = await pool.query<{ r: string | null }>(
        `SELECT to_regclass('public.users') AS r`,
      );
      const sessions = await pool.query<{ r: string | null }>(
        `SELECT to_regclass('public.sessions') AS r`,
      );
      const hasUsers    = Boolean(users.rows[0]?.r);
      const hasSessions = Boolean(sessions.rows[0]?.r);
      let counts:
        | {
            usersTotal: number;
            usersNonAdmin: number;
            usersAdmin: number;
            sessionsTotal: number;
          }
        | undefined;
      if (hasUsers) {
        const [ut, una, ua] = await Promise.all([
          pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users`),
          pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users WHERE is_admin = false`),
          pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users WHERE is_admin = true`),
        ]);
        let sessionsTotal = 0;
        if (hasSessions) {
          const st = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM sessions`);
          sessionsTotal = st.rows[0]?.c ?? 0;
        }
        counts = {
          usersTotal:    ut.rows[0]?.c  ?? 0,
          usersNonAdmin: una.rows[0]?.c ?? 0,
          usersAdmin:    ua.rows[0]?.c  ?? 0,
          sessionsTotal,
        };
      }
      res.status(200).json({
        ok: true,
        ping: "ok",
        connection: databaseFingerprint(resolvedDatabaseUrl),
        usersTable: hasUsers,
        sessionsTable: hasSessions,
        counts,
        note:
          "Admin dashboard /api/admin/stats historically counted only non-admin users for totalUsers and many session metrics. " +
          "If you only have admin accounts, those numbers were 0 even with a healthy DB — now fixed to show all users for headline totals.",
      });
    } catch (err) {
      next(err);
    }
  });
}

// ── Stripe webhook — MUST be before express.json() ───────────────────────────
// Stripe requires the raw Buffer body; express.json() would break it.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      return res.status(400).json({ error: "Webhook processing failed" });
    }
  }
);

// ── Body parsing (after webhook route) ───────────────────────────────────────
app.use(express.json({ limit: "1mb", strict: true }));
app.use(jsonParseErrorHandler);
app.use(express.urlencoded({ extended: true }));
// Parse Cookie header into req.cookies before express-session (helps some proxy / Express 5 setups).
app.use(cookieParser());
// Session MUST be registered before any route that uses req.session (e.g. /api/auth/*).
// Order: json/urlencoded → cookieParser → sessionMiddleware → /api rate limits → app.use("/api", router).
app.use(sessionMiddleware);

// ── Rate limiting (see middlewares/apiRateLimits.ts) ───────────────────────────
// Stack: login/signup/forgot → auth → heartbeat → session-start cap → AI/transcription
//        → admin IP → general (60/IP/min) → block unauthenticated AI paths → usage log → router.

// ── Activity tracking — fires on every authenticated API request ──────────────
// Debounced to one DB write per user per 60 s so the users table isn't
// hammered by frequent polling (e.g. /me every few seconds).
app.use("/api", (req, res, next) => {
  const userId: number | undefined = (req as any).session?.userId;
  if (userId) {
    const last = activityDebounce.get(userId) ?? 0;
    if (Date.now() - last > ACTIVITY_DEBOUNCE_MS) {
      activityDebounce.set(userId, Date.now());
      void touchActivity(userId);
    }
  }
  next();
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/2fa/verify", loginLimiter);
// Prefix mount would also match `/api/auth/signup-config`; limit POST signup only.
app.post("/api/auth/signup", signupLimiter);
app.use("/api/auth/resend-verification", resendVerificationLimiter);
app.use("/api/auth/forgot-password", forgotPasswordLimiter);
app.use("/api/auth", authLimiter);
app.use("/api", sessionHeartbeatLimiter);
app.use("/api", transcriptionSessionStartLimiter);
app.use("/api", translationLimiter);
app.use("/api", aiCostLimiter);
app.use("/api/admin", adminIpGuard);
app.use("/api", generalApiLimiter);
app.use("/api", blockUnauthenticatedAiRequests);
app.use("/api", aiUsageMonitorMiddleware);
app.use("/api", errorLoggerMiddleware);
app.use("/api", router);
// Before SPA: any `next(err)` from /api (including session/json/limiters) becomes JSON here.
app.use(apiMountJsonErrorHandler);

// Client-side routes (e.g. /workspace): never send index.html for missing real files —
// that breaks JS/CSS (browser executes HTML as script → white screen).
if (spaEnabled) {
  const assetLikePath =
    /\.(?:js|mjs|css|map|json|ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot|webmanifest)$/i;
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      req.path === "/health" ||
      req.path === "/debug" ||
      req.path.startsWith("/debug/")
    ) {
      return next();
    }
    if (assetLikePath.test(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const absIndex = path.resolve(spaIndexHtml);
    res.sendFile(absIndex, (err) => {
      if (err) {
        console.error("[spa] sendFile failed", { absIndex, cwd: process.cwd(), err });
        next(err);
      }
    });
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).json({ ok: true, service: "api-server" });
  });
}

// Catches `next(err)` from session middleware, sendFile, and rejected async handlers.
// Without this, Express sends plain text "Internal Server Error" with no JSON body.
app.use(globalErrorHandler);

export default app;
