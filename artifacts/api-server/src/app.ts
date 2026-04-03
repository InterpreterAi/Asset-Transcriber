import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { WebhookHandlers } from "./lib/webhookHandlers.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./middlewares/session.js";
import { touchActivity } from "./lib/usage.js";
import { errorLoggerMiddleware } from "./middlewares/errorLogger.js";
import { adminIpGuard } from "./middlewares/adminIpGuard.js";
import { getAuthEnvDiagnostics } from "./lib/authEnv.js";

// Per-user debounce: only write last_activity to DB once per 60 s per user.
const activityDebounce = new Map<number, number>();
const ACTIVITY_DEBOUNCE_MS = 60_000;

const app: Express = express();

// Trust one proxy hop (Railway / Replit) for X-Forwarded-For, rate-limit IP, OAuth redirect host.
app.set("trust proxy", 1);

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

app.use(cors({ origin: true, credentials: true }));

// Before session middleware: confirms which auth env keys the process actually sees.
app.get("/debug/auth-env", (_req, res) => {
  res.status(200).json({
    ok: true,
    message: "Presence only. Set these on the Railway service that runs this container.",
    env: getAuthEnvDiagnostics(),
  });
});

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Brute-force protection: 5 failed login attempts per 10 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please wait 10 minutes before trying again." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
  skip: (req) => req.method === "GET" && req.path.startsWith("/api/auth/me"),
});

const transcriptionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
  keyGenerator: (req) => {
    const session = (req as any).session;
    return session?.userId ? `user:${session.userId}` : ipKeyGenerator(req.ip ?? "unknown");
  },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

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
app.use("/api/auth", authLimiter);
app.use("/api/transcription/token", transcriptionLimiter);
app.use("/api/admin", adminIpGuard);
app.use("/api", generalLimiter);
app.use("/api", errorLoggerMiddleware);
app.use("/api", router);

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
      req.path === "/debug/auth-env"
    ) {
      return next();
    }
    if (assetLikePath.test(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.sendFile(spaIndexHtml, (err) => {
      if (err) next(err);
    });
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).json({ ok: true, service: "api-server" });
  });
}

export default app;
