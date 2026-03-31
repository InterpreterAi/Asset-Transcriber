import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { WebhookHandlers } from "./lib/webhookHandlers.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./middlewares/session.js";
import { touchActivity } from "./lib/usage.js";

// Per-user debounce: only write last_activity to DB once per 60 s per user.
const activityDebounce = new Map<number, number>();
const ACTIVITY_DEBOUNCE_MS = 60_000;

const app: Express = express();

// Trust the first proxy hop (Replit's edge) so express-rate-limit can read
// the real client IP from X-Forwarded-For without throwing a ValidationError.
app.set("trust proxy", 1);

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
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  }
);

// ── Body parsing (after webhook route) ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// ── Rate limiting ─────────────────────────────────────────────────────────────
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
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const session = (req as any).session;
    return session?.userId ? `user:${session.userId}` : (req.ip ?? "unknown");
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

app.use("/api/auth", authLimiter);
app.use("/api/transcription/token", transcriptionLimiter);
app.use("/api", generalLimiter);
app.use("/api", router);

export default app;
