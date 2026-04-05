import { Router, type Request, type Response } from "express";
import {
  db,
  usersTable,
  passwordResetTokensTable,
  emailVerificationTokensTable,
  trialConsumedEmailsTable,
  sessionsTable,
  referralsTable,
  type User,
} from "@workspace/db";
import { and, eq, or, gte, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, buildUserInfo, touchActivity } from "../lib/usage.js";
import { logger } from "../lib/logger.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import {
  sendAccountVerifiedNoTrialEmail,
  sendEmailVerificationEmail,
  sendPostVerificationWelcomeEmail,
} from "../lib/transactional-email.js";
import {
  isDisposableEmailDomain,
  isValidSignupEmail,
  validateSignupPassword,
  SIGNUP_DISPOSABLE_EMAIL,
  SIGNUP_EMAIL_INVALID,
} from "../lib/signup-validation.js";
import { verifyTurnstileForSignup } from "../lib/turnstile.js";
import { getStaticPublicBaseUrl } from "../lib/authEnv.js";
import { logLoginEvent } from "../lib/login-events.js";
import { generateTotpSecret, generateQrDataUrl, verifyTotp } from "../lib/totp.js";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleOAuthRedirectUri,
} from "../lib/authEnv.js";
import { commitSession } from "../lib/commitSession.js";
import { TRIAL_DAILY_LIMIT_MINUTES } from "../lib/trial-constants.js";
import crypto from "node:crypto";

const router = Router();

function errMeta(err: unknown) {
  const e = err as NodeJS.ErrnoException & { code?: string };
  return {
    err,
    errMessage: err instanceof Error ? err.message : String(err),
    errCode: e?.code,
    errStack: err instanceof Error ? err.stack : undefined,
  };
}

/** Railway captures stderr reliably; use alongside pino for auth failures. */
function logAuthToStderr(context: string, err: unknown) {
  console.error(`[auth] ${context}:`, err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

/** Pino can throw when serializing exotic `err` values; never let that block `res.json`. */
function safeAuthLoggerError(context: string, err: unknown) {
  logAuthToStderr(context, err);
  try {
    logger.error(errMeta(err), context);
  } catch (logErr) {
    console.error("[auth] logger.error threw while logging failure:", logErr);
  }
}

/** Returned when connect-pg-simple / Postgres session storage fails (common Railway 500 on login + Google). */
const SESSION_PERSIST_FAILED_JSON = {
  error: "Could not save your session.",
  hint:
    "One instance: set Railway variable SESSION_STORE=memory (or unset SESSION_STORE if the image defaults to memory), redeploy. " +
    "Multiple instances: use SESSION_STORE=postgres and ensure the user_sessions table exists and is writable.",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────
function getClientIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.ip
    ?? "unknown"
  );
}

function signupTrialFields(grantTrial: boolean) {
  if (grantTrial) {
    return {
      trialEndsAt:       new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      dailyLimitMinutes: TRIAL_DAILY_LIMIT_MINUTES,
      trialStartedAt:    new Date(),
    } as const;
  }
  return {
    trialEndsAt:       new Date(0),
    dailyLimitMinutes: 0,
    trialStartedAt:    new Date(),
  } as const;
}

function parseDevice(ua: string | undefined): string {
  if (!ua) return "Unknown";
  if (/iPhone|Android.*Mobile|Windows Phone/i.test(ua)) return "Mobile";
  if (/iPad|Android(?!.*Mobile)/i.test(ua)) return "Tablet";
  return "Desktop";
}

function isPostgresUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ── Login ──────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    if (!req.session) {
      console.error("[auth] POST /api/auth/login: req.session is missing");
      logger.error("POST /api/auth/login: req.session is missing — session middleware order bug?");
      res.status(500).json({
        error: "Session not initialized",
        code: "no_req_session",
      });
      return;
    }

    const { username, password, email } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };

    const ip        = getClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;
    const identifier = (email || username)?.trim().toLowerCase();
    if (!identifier || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.username, identifier), eq(usersTable.email, identifier)))
      .limit(1);
    const user = users[0];

    if (!user) {
      void logLoginEvent({ userId: null, email: identifier, ipAddress: ip, userAgent, success: false, failureReason: "user_not_found" });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.isActive) {
      void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false, failureReason: "account_disabled" });
      res.status(401).json({ error: "Account is disabled" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false, failureReason: "wrong_password" });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.requiresEmailVerification && !user.emailVerified) {
      void logLoginEvent({
        userId:       user.id,
        email:        user.email,
        ipAddress:    ip,
        userAgent,
        success:      false,
        failureReason: "email_not_verified",
      });
      res.status(403).json({
        error:
          "Please verify your email before signing in. Check your inbox for a verification link, or request a new one from the login page.",
        code: "email_not_verified",
      });
      return;
    }

    // ── 2FA check ────────────────────────────────────────────────────────────
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      req.session.pending2faUserId = user.id;
      delete req.session.userId;
      try {
        await commitSession(req);
      } catch (err) {
        safeAuthLoggerError("Login (2FA pending): session.save failed — full stack for Railway", err);
        res.status(500).json({ ...SESSION_PERSIST_FAILED_JSON, code: "session_save_failed" });
        return;
      }
      res.json({ requires2fa: true });
      return;
    }

    // ── Complete login ───────────────────────────────────────────────────────
    req.session.userId  = user.id;
    req.session.isAdmin = Boolean(user.isAdmin);
    delete req.session.pending2faUserId;

    try {
      await commitSession(req);
    } catch (err) {
      safeAuthLoggerError("Login: session.save failed — full stack for Railway", err);
      res.status(500).json({ ...SESSION_PERSIST_FAILED_JSON, code: "session_save_failed" });
      return;
    }

    void touchActivity(user.id).catch((touchErr) => {
      logger.warn({ err: touchErr, userId: user.id }, "touchActivity after login failed");
    });
    void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: true });

    if (user.isAdmin) {
      const device = parseDevice(userAgent ?? undefined);
      const time   = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
      void sendTelegramNotification(
        `🔐 Admin login\n👤 ${user.email}\n🌐 IP: ${ip}\n📱 ${device}\n🕐 ${time}`
      );
    }

    let userPayload: ReturnType<typeof buildUserInfo> & { sessionsToday: number };
    try {
      const freshUser = (await getUserWithResetCheck(user.id)) ?? user;
      let sessionsToday = 0;
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const sessionsTodayRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sessionsTable)
          .where(
            and(eq(sessionsTable.userId, freshUser.id), gte(sessionsTable.startedAt, todayStart)),
          );
        sessionsToday = Number(sessionsTodayRows[0]?.count ?? 0);
      } catch (countErr) {
        logger.warn({ err: countErr, userId: user.id }, "Login: sessionsToday count failed");
      }
      userPayload = { ...buildUserInfo(freshUser), sessionsToday };
    } catch (enrichErr) {
      logger.warn({ err: enrichErr, userId: user.id }, "Login: profile enrichment failed; returning minimal user");
      userPayload = { ...buildUserInfo(user), sessionsToday: 0 };
    }

    try {
      res.json({ user: userPayload });
    } catch (encodeErr) {
      logAuthToStderr("Login res.json", encodeErr);
      logger.error(errMeta(encodeErr), "Login: res.json failed (non-JSON-serializable user payload?)");
      res.status(500).json({
        error: "Login succeeded but response could not be encoded",
        code: "login_response_encode_failed",
      });
    }
  } catch (err) {
    safeAuthLoggerError("POST /api/auth/login failed — full stack (not necessarily session-related)", err);
    const pgCode = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: msg || "Login failed",
      code: "login_uncaught_exception",
      pgCode: typeof pgCode === "string" && /^\d{5}$/.test(pgCode) ? pgCode : undefined,
    });
  }
});

// ── 2FA: Verify during login ───────────────────────────────────────────────
router.post("/2fa/verify", async (req, res) => {
  try {
    const pending2faUserId = req.session.pending2faUserId;
    if (!pending2faUserId) {
      res.status(400).json({ error: "No pending 2FA session" });
      return;
    }

    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "Verification code is required" });
      return;
    }

    const ip        = getClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, pending2faUserId)).limit(1);
    if (!user || !user.twoFactorSecret) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }

    const valid = verifyTotp(user.twoFactorSecret, token);
    if (!valid) {
      void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: false, failureReason: "invalid_2fa_token", is2fa: true });
      res.status(401).json({ error: "Invalid or expired verification code" });
      return;
    }

    req.session.userId  = user.id;
    req.session.isAdmin = Boolean(user.isAdmin);
    delete req.session.pending2faUserId;

    try {
      await commitSession(req);
    } catch (err) {
      safeAuthLoggerError("2FA verify: session.save failed — full stack for Railway", err);
      res.status(500).json({ ...SESSION_PERSIST_FAILED_JSON, code: "session_save_failed" });
      return;
    }

    void touchActivity(user.id).catch((touchErr) => {
      logger.warn({ err: touchErr, userId: user.id }, "touchActivity after 2FA verify failed");
    });
    void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: true, is2fa: true });

    if (user.isAdmin) {
      const device = parseDevice(userAgent ?? undefined);
      const time   = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
      void sendTelegramNotification(
        `🔐 Admin login (2FA)\n👤 ${user.email}\n🌐 IP: ${ip}\n📱 ${device}\n🕐 ${time}`
      );
    }

    let userPayload: ReturnType<typeof buildUserInfo> & { sessionsToday: number };
    try {
      const freshUser = (await getUserWithResetCheck(user.id)) ?? user;
      let sessionsToday = 0;
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const sessionsTodayRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(sessionsTable)
          .where(
            and(eq(sessionsTable.userId, freshUser.id), gte(sessionsTable.startedAt, todayStart)),
          );
        sessionsToday = Number(sessionsTodayRows[0]?.count ?? 0);
      } catch (countErr) {
        logger.warn({ err: countErr, userId: user.id }, "2FA verify: sessionsToday count failed");
      }
      userPayload = { ...buildUserInfo(freshUser), sessionsToday };
    } catch (enrichErr) {
      logger.warn({ err: enrichErr, userId: user.id }, "2FA verify: enrichment failed");
      userPayload = { ...buildUserInfo(user), sessionsToday: 0 };
    }

    res.json({ user: userPayload });
  } catch (err) {
    safeAuthLoggerError("POST /api/auth/2fa/verify failed — full stack", err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: msg || "Verification failed",
      code: "two_factor_verify_failed",
    });
  }
});

// ── 2FA: Setup (generate secret + QR) ─────────────────────────────────────
router.post("/2fa/setup", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.twoFactorEnabled) { res.status(400).json({ error: "2FA is already enabled" }); return; }

  const email = user.email ?? user.username;
  const { secret, otpauthUrl } = generateTotpSecret(email);
  const qrDataUrl = await generateQrDataUrl(otpauthUrl);

  await db.update(usersTable).set({ twoFactorSecret: secret }).where(eq(usersTable.id, userId));

  res.json({ secret, qrDataUrl });
});

// ── 2FA: Enable (confirm setup with token) ─────────────────────────────────
router.post("/2fa/enable", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: "Verification code is required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.twoFactorSecret) { res.status(400).json({ error: "Run /2fa/setup first" }); return; }
  if (user.twoFactorEnabled) { res.status(400).json({ error: "2FA is already enabled" }); return; }

  if (!verifyTotp(user.twoFactorSecret, token)) {
    res.status(400).json({ error: "Invalid verification code — check your authenticator app" });
    return;
  }

  await db.update(usersTable).set({ twoFactorEnabled: true }).where(eq(usersTable.id, userId));
  res.json({ ok: true, message: "Two-factor authentication enabled" });
});

// ── 2FA: Disable ───────────────────────────────────────────────────────────
router.post("/2fa/disable", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token && !password) {
    res.status(400).json({ error: "Provide your TOTP code or password to disable 2FA" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.twoFactorEnabled) { res.status(400).json({ error: "2FA is not enabled" }); return; }

  let authorized = false;
  if (token && user.twoFactorSecret) {
    authorized = verifyTotp(user.twoFactorSecret, token);
  } else if (password) {
    authorized = await verifyPassword(password, user.passwordHash);
  }

  if (!authorized) {
    res.status(401).json({ error: "Invalid code or password" });
    return;
  }

  await db.update(usersTable)
    .set({ twoFactorEnabled: false, twoFactorSecret: null })
    .where(eq(usersTable.id, userId));

  res.json({ ok: true, message: "Two-factor authentication disabled" });
});

// ── 2FA: Status ────────────────────────────────────────────────────────────
router.get("/2fa/status", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const [user] = await db.select({ twoFactorEnabled: usersTable.twoFactorEnabled })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ enabled: user?.twoFactorEnabled ?? false });
});

// ── Signup: public Turnstile site key (safe to expose) ───────────────────────
router.get("/signup-config", (_req, res) => {
  res.json({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() ?? null });
});

// ── Sign Up ────────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const { email, password, referralId, turnstileToken } = req.body as {
    email?: string;
    password?: string;
    referralId?: number;
    turnstileToken?: string;
  };

  const turnstile = await verifyTurnstileForSignup(turnstileToken, getClientIp(req));
  if (!turnstile.ok) {
    res.status(400).json({ error: turnstile.error ?? "Verification failed." });
    return;
  }

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (!isValidSignupEmail(email)) {
    res.status(400).json({ error: SIGNUP_EMAIL_INVALID });
    return;
  }

  const normalized = email.trim().toLowerCase();

  if (isDisposableEmailDomain(normalized)) {
    res.status(400).json({ error: SIGNUP_DISPOSABLE_EMAIL });
    return;
  }

  const pwErr = validateSignupPassword(password);
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.username, normalized), eq(usersTable.email, normalized)))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  const [consumed] = await db
    .select({ email: trialConsumedEmailsTable.email })
    .from(trialConsumedEmailsTable)
    .where(eq(trialConsumedEmailsTable.email, normalized))
    .limit(1);
  const grantTrial = !consumed;

  const passwordHash = await hashPassword(password);
  const trial = signupTrialFields(grantTrial);

  let newUser: User;
  try {
    newUser = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(usersTable)
        .values({
          username: normalized,
          email: normalized,
          passwordHash,
          isAdmin: false,
          isActive: true,
          emailVerified: false,
          requiresEmailVerification: true,
          planType: "trial",
          trialStartedAt: trial.trialStartedAt,
          trialEndsAt: trial.trialEndsAt,
          dailyLimitMinutes: trial.dailyLimitMinutes,
          minutesUsedToday: 0,
          totalMinutesUsed: 0,
          totalSessions: 0,
          lastUsageResetAt: new Date(),
        })
        .returning();
      if (!u) throw new Error("User insert failed");
      if (grantTrial) {
        await tx.insert(trialConsumedEmailsTable).values({ email: normalized }).onConflictDoNothing();
      }
      return u;
    });
  } catch (err) {
    safeAuthLoggerError("POST /api/auth/signup transaction failed", err);
    res.status(500).json({ error: "Could not create account. Please try again." });
    return;
  }

  if (referralId) {
    void db
      .update(referralsTable)
      .set({ registeredUserId: newUser.id, registeredAt: new Date() })
      .where(eq(referralsTable.id, referralId));
  }

  void sendTelegramNotification(
    `🆕 New InterpreterAI user\nEmail: ${normalized}\nMethod: Email Registration\nPlan: ${grantTrial ? "Free Trial (14 days)" : "No trial (email previously used)"}`,
  );

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, newUser.id));
  await db.insert(emailVerificationTokensTable).values({
    userId: newUser.id,
    token: verifyToken,
    expiresAt: verifyExpires,
  });

  void sendEmailVerificationEmail(normalized, verifyToken).catch((err) => {
    logger.error({ err, userId: newUser.id }, "Signup: sendEmailVerificationEmail failed");
  });

  res.status(201).json({
    needsEmailVerification: true,
    email: normalized,
    message: "Check your email to verify your account before signing in.",
  });
});

// ── Verify email (link from transactional email; 24h token) ───────────────
router.get("/verify-email", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  const base = getStaticPublicBaseUrl().replace(/\/+$/, "");
  if (!token) {
    res.redirect(`${base}/login?verify=missing`);
    return;
  }

  try {
    const rows = await db
      .select()
      .from(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.token, token))
      .limit(1);
    const row = rows[0];
    if (!row || new Date() > row.expiresAt) {
      res.redirect(`${base}/login?verify=invalid`);
      return;
    }

    const [acct] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    if (!acct?.email) {
      res.redirect(`${base}/login?verify=invalid`);
      return;
    }

    await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.id, row.id));
    await db
      .update(usersTable)
      .set({ emailVerified: true, requiresEmailVerification: false })
      .where(eq(usersTable.id, acct.id));

    const trialActive =
      new Date(acct.trialEndsAt).getTime() > Date.now() && Number(acct.dailyLimitMinutes) > 0;
    if (trialActive) {
      void sendPostVerificationWelcomeEmail(acct.email, acct.trialEndsAt, null).catch((err) => {
        logger.error({ err, userId: acct.id }, "verify-email: welcome email failed");
      });
    } else {
      void sendAccountVerifiedNoTrialEmail(acct.email).catch((err) => {
        logger.error({ err, userId: acct.id }, "verify-email: no-trial confirmation email failed");
      });
    }

    res.redirect(`${base}/login?verify=ok`);
  } catch (err) {
    safeAuthLoggerError("GET /api/auth/verify-email failed", err);
    res.redirect(`${base}/login?verify=error`);
  }
});

// ── Resend verification email ──────────────────────────────────────────────
router.post("/resend-verification", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const ident = email.trim().toLowerCase();
  const users = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, ident), eq(usersTable.username, ident)))
    .limit(1);

  if (users.length === 0) {
    res.json({ ok: true, message: "If an account exists and needs verification, we sent an email." });
    return;
  }

  const u = users[0]!;
  if (!u.requiresEmailVerification || u.emailVerified || !u.email) {
    res.json({ ok: true, message: "If an account exists and needs verification, we sent an email." });
    return;
  }

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.delete(emailVerificationTokensTable).where(eq(emailVerificationTokensTable.userId, u.id));
  await db.insert(emailVerificationTokensTable).values({
    userId: u.id,
    token: verifyToken,
    expiresAt: verifyExpires,
  });

  void sendEmailVerificationEmail(u.email, verifyToken).catch((err) => {
    logger.error({ err, userId: u.id }, "resend-verification: send failed");
  });

  res.json({ ok: true, message: "If an account exists and needs verification, we sent an email." });
});

// ── Logout ─────────────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

// ── Me ─────────────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!user.emailVerified && !user.isAdmin) {
    res.status(403).json({
      error: "Please verify your email before accessing InterpreterAI.",
      code:  "email_not_verified",
    });
    return;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionsTodayRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(
      and(eq(sessionsTable.userId, user.id), gte(sessionsTable.startedAt, todayStart)),
    );
  const sessionsToday = Number(sessionsTodayRows[0]?.count ?? 0);
  res.json({ ...buildUserInfo(user), sessionsToday });
});

// ── Change Password ────────────────────────────────────────────────────────
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!))
    .limit(1);
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, req.session.userId!));

  res.json({ message: "Password updated" });
});

// ── Forgot Password ────────────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, email.toLowerCase())))
    .limit(1);

  // Always return success to avoid user enumeration
  if (users.length === 0) {
    res.json({ message: "If an account exists, a reset link has been sent" });
    return;
  }

  const user = users[0]!;
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const typed = email.trim().toLowerCase();
  const recipient =
    user.email?.trim().toLowerCase() ??
    (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed) ? typed : null);
  if (recipient) {
    void sendPasswordResetEmail(recipient, token).catch((err) => {
      logger.error({ err, userId: user.id }, "Forgot password: sendPasswordResetEmail failed");
    });
  } else {
    logger.warn({ userId: user.id }, "Forgot password: user has no email address; reset link not emailed");
  }

  const isDev = process.env.NODE_ENV !== "production";
  res.json({
    message: "If an account exists, a reset link has been sent",
    ...(isDev ? { devToken: token } : {}),
  });
});

// ── Google OAuth (Express — not NextAuth.js; there is no GoogleProvider/authOptions in this repo) ──
// Credentials: getGoogleClientId() / getGoogleClientSecret() in production read only
// process.env.GOOGLE_CLIENT_ID and process.env.GOOGLE_CLIENT_SECRET (see authEnv.ts).
// Callback: GET /api/auth/google/callback and GET /api/auth/callback/google (same handler).
// redirect_uri from getGoogleOAuthRedirectUri(req) — must match Google Cloud Console.

// Step 1 — redirect to Google's consent screen.
router.get("/google", async (req, res) => {
  try {
    if (!req.session) {
      console.error("[auth] GET /api/auth/google: req.session missing");
      res.status(500).json({
        error: "Session not initialized",
        code: "no_req_session",
      });
      return;
    }
    const clientId = getGoogleClientId();
    if (!clientId) {
      logger.warn(
        "GET /api/auth/google: GOOGLE_CLIENT_ID missing " +
          (process.env.NODE_ENV === "production" ? "(production reads only GOOGLE_CLIENT_ID)." : "(see authEnv aliases in dev)."),
      );
      res.status(503).json({
        error: "Google login is not configured. Add GOOGLE_CLIENT_ID.",
        code: "google_not_configured",
      });
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;

    const redirectUri = getGoogleOAuthRedirectUri(req);

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: "code",
      scope:         "openid email profile",
      state,
      access_type:   "online",
      prompt:        "select_account",
    });
    await commitSession(req);
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (err) {
    safeAuthLoggerError("GET /api/auth/google: failed — full stack for Railway", err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: msg || "Could not start Google login",
      code: "google_oauth_start_failed",
      hint: SESSION_PERSIST_FAILED_JSON.hint,
    });
  }
});

// Step 2 — Google redirects back with ?code=...
// Registered at both paths so Google Console can use either our default or NextAuth’s URI shape.
const handleGoogleOAuthCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code) {
    res.redirect("/login?error=google_cancelled");
    return;
  }
  if (!req.session) {
    console.error("[auth] GET /api/auth/google/callback: req.session missing");
    res.redirect("/login?error=session_failed");
    return;
  }
  if (!state || state !== req.session.oauthState) {
    res.redirect("/login?error=invalid_state");
    return;
  }
  delete req.session.oauthState;

  try {
    await commitSession(req);
  } catch (err) {
    safeAuthLoggerError(
      "Google callback: session.save after clearing oauth state failed — full stack for Railway",
      err,
    );
    res.redirect("/login?error=session_failed");
    return;
  }

  const clientId     = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    logger.error("Google OAuth callback: client id or secret missing after authorize step");
    res.redirect("/login?error=not_configured");
    return;
  }

  const redirectUri = getGoogleOAuthRedirectUri(req);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokens.access_token) {
      logger.error({ status: tokenRes.status, tokens }, "Google token exchange failed");
      res.redirect("/login?error=token_failed");
      return;
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub?: string; email?: string; name?: string; email_verified?: boolean;
    };
    if (!profileRes.ok) {
      logger.error({ status: profileRes.status, profile }, "Google userinfo failed");
      res.redirect("/login?error=profile_failed");
      return;
    }

    const googleId    = profile.sub;
    const googleEmail = profile.email?.toLowerCase();
    if (!googleId || !googleEmail) {
      res.redirect("/login?error=profile_failed");
      return;
    }

    let [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.googleAccountId, googleId), eq(usersTable.email, googleEmail)))
      .limit(1);

    let isNewUser = false;
    if (user) {
      if (!user.googleAccountId) {
        try {
          await db
            .update(usersTable)
            .set({ googleAccountId: googleId })
            .where(eq(usersTable.id, user.id));
          const [refetched] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);
          if (refetched) user = refetched;
        } catch (linkErr) {
          logger.warn({ err: linkErr, userId: user.id }, "Google callback: googleAccountId back-fill failed");
        }
      }
    } else {
      isNewUser = true;
      if (isDisposableEmailDomain(googleEmail)) {
        res.redirect("/login?error=disposable_email");
        return;
      }
      const [consumedGoogle] = await db
        .select({ email: trialConsumedEmailsTable.email })
        .from(trialConsumedEmailsTable)
        .where(eq(trialConsumedEmailsTable.email, googleEmail))
        .limit(1);
      const grantGoogleTrial = !consumedGoogle;
      const googleTrial      = signupTrialFields(grantGoogleTrial);

      const localPart    = googleEmail.split("@")[0] ?? "user";
      const baseUsername = localPart.replace(/[^a-z0-9._-]/gi, "_").slice(0, 48) || "user";

      let created: User | undefined;
      for (let n = 0; n < 12; n++) {
        const username = n === 0 ? baseUsername : `${baseUsername}_${n}`;
        try {
          created = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(usersTable)
              .values({
                username,
                email:            googleEmail,
                passwordHash:     `$google$${googleId}`,
                googleAccountId:  googleId,
                isAdmin:          false,
                isActive:         true,
                emailVerified:    true,
                requiresEmailVerification: false,
                planType:         "trial",
                trialStartedAt:   googleTrial.trialStartedAt,
                trialEndsAt:      googleTrial.trialEndsAt,
                dailyLimitMinutes: googleTrial.dailyLimitMinutes,
                minutesUsedToday:  0,
                totalMinutesUsed:  0,
                totalSessions:     0,
                lastUsageResetAt:  new Date(),
              })
              .returning();
            if (!row) throw new Error("Google user insert failed");
            if (grantGoogleTrial) {
              await tx.insert(trialConsumedEmailsTable).values({ email: googleEmail }).onConflictDoNothing();
            }
            return row;
          });
          break;
        } catch (insErr) {
          if (!isPostgresUniqueViolation(insErr)) throw insErr;
        }
      }
      if (!created) {
        logger.error({ googleEmail, baseUsername }, "Google signup: could not allocate unique username");
        res.redirect("/login?error=auth_failed");
        return;
      }
      user = created;
    }

    const googleGrantTrial =
      isNewUser &&
      new Date(user!.trialEndsAt).getTime() > Date.now() &&
      Number(user!.dailyLimitMinutes) > 0;
    void sendTelegramNotification(
      isNewUser
        ? `🆕 New InterpreterAI user\nEmail: ${googleEmail}\nMethod: Google Sign-Up\nPlan: ${googleGrantTrial ? "Free Trial (14 days)" : "No trial (email previously used)"}`
        : `🔑 InterpreterAI Google Login\nEmail: ${googleEmail}\nMethod: Google Login`,
    );
    if (isNewUser) {
      if (googleGrantTrial) {
        void sendPostVerificationWelcomeEmail(googleEmail, user!.trialEndsAt, profile.name ?? null).catch(
          (err) => {
            logger.error({ err, userId: user!.id }, "Google signup: welcome email failed");
          },
        );
      } else {
        void sendAccountVerifiedNoTrialEmail(googleEmail).catch((err) => {
          logger.error({ err, userId: user!.id }, "Google signup: no-trial confirmation email failed");
        });
      }
    }
    void touchActivity(user!.id).catch((touchErr) => {
      logger.warn({ err: touchErr, userId: user!.id }, "touchActivity after Google login failed");
    });

    req.session.userId  = user!.id;
    req.session.isAdmin = Boolean(user!.isAdmin);

    try {
      await commitSession(req);
    } catch (sessErr) {
      safeAuthLoggerError(
        "Google callback: session.save after login failed — full stack for Railway",
        sessErr,
      );
      res.redirect("/login?error=session_failed");
      return;
    }

    res.redirect("/workspace");
  } catch (err) {
    safeAuthLoggerError("Google OAuth callback error — full stack for Railway", err);
    res.redirect("/login?error=auth_failed");
  }
};

router.get("/google/callback", handleGoogleOAuthCallback);
router.get("/callback/google", handleGoogleOAuthCallback);

// ── Reset Password ─────────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: string;
    newPassword?: string;
  };

  if (!token || !newPassword) {
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const rows = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, token))
    .limit(1);

  const resetToken = rows[0];
  if (!resetToken) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  if (resetToken.usedAt) {
    res.status(400).json({ error: "Reset token has already been used" });
    return;
  }

  if (new Date() > resetToken.expiresAt) {
    res.status(400).json({ error: "Reset token has expired" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  await db.update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, resetToken.userId));

  await db.update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, resetToken.id));

  res.json({ message: "Password reset successfully" });
});

// ── Session heartbeat — keeps session alive during active use ─────────────────
router.post("/heartbeat", requireAuth, (req, res) => {
  req.session.touch();
  res.json({ ok: true, expiresAt: req.session.cookie.expires });
});

export default router;
