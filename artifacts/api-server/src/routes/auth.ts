import { Router } from "express";
import { db, usersTable, passwordResetTokensTable, sessionsTable, referralsTable } from "@workspace/db";
import { eq, or, gte, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, buildUserInfo, touchActivity } from "../lib/usage.js";
import { logger } from "../lib/logger.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { sendWelcomeEmail } from "../lib/email.js";
import { logLoginEvent } from "../lib/login-events.js";
import { generateTotpSecret, generateQrDataUrl, verifyTotp } from "../lib/totp.js";
import crypto from "node:crypto";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────
function getClientIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.ip
    ?? "unknown"
  );
}

function parseDevice(ua: string | undefined): string {
  if (!ua) return "Unknown";
  if (/iPhone|Android.*Mobile|Windows Phone/i.test(ua)) return "Mobile";
  if (/iPad|Android(?!.*Mobile)/i.test(ua)) return "Tablet";
  return "Desktop";
}

// ── Login ──────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password, email } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };

  const ip        = getClientIp(req);
  const userAgent = req.headers["user-agent"] ?? null;
  const identifier = email || username;

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

  // ── 2FA check ──────────────────────────────────────────────────────────────
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    req.session.pending2faUserId = user.id;
    delete req.session.userId;
    res.json({ requires2fa: true });
    return;
  }

  // ── Complete login ─────────────────────────────────────────────────────────
  req.session.userId  = user.id;
  req.session.isAdmin = user.isAdmin;
  delete req.session.pending2faUserId;

  void touchActivity(user.id);
  void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: true });

  // Admin login Telegram alert
  if (user.isAdmin) {
    const device = parseDevice(userAgent ?? undefined);
    const time   = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
    void sendTelegramNotification(
      `🔐 Admin login\n👤 ${user.email}\n🌐 IP: ${ip}\n📱 ${device}\n🕐 ${time}`
    );
  }

  const freshUser = await getUserWithResetCheck(user.id);
  if (!freshUser) {
    res.status(500).json({ error: "User not found" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionsTodayRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, freshUser.id) && gte(sessionsTable.startedAt, todayStart));
  const sessionsToday = sessionsTodayRows[0]?.count ?? 0;

  res.json({ user: { ...buildUserInfo(freshUser), sessionsToday } });
});

// ── 2FA: Verify during login ───────────────────────────────────────────────
router.post("/2fa/verify", async (req, res) => {
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
  req.session.isAdmin = user.isAdmin;
  delete req.session.pending2faUserId;

  void touchActivity(user.id);
  void logLoginEvent({ userId: user.id, email: user.email, ipAddress: ip, userAgent, success: true, is2fa: true });

  if (user.isAdmin) {
    const device = parseDevice(userAgent ?? undefined);
    const time   = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
    void sendTelegramNotification(
      `🔐 Admin login (2FA)\n👤 ${user.email}\n🌐 IP: ${ip}\n📱 ${device}\n🕐 ${time}`
    );
  }

  const freshUser = await getUserWithResetCheck(user.id);
  if (!freshUser) { res.status(500).json({ error: "User not found" }); return; }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionsTodayRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, freshUser.id) && gte(sessionsTable.startedAt, todayStart));

  res.json({ user: { ...buildUserInfo(freshUser), sessionsToday: sessionsTodayRows[0]?.count ?? 0 } });
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

// ── Sign Up ────────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const { email, password, referralId } = req.body as { email?: string; password?: string; referralId?: number };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(or(eq(usersTable.username, email.toLowerCase()), eq(usersTable.email, email.toLowerCase())))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [user] = await db
    .insert(usersTable)
    .values({
      username: email.toLowerCase(),
      email: email.toLowerCase(),
      passwordHash,
      isAdmin: false,
      isActive: true,
      emailVerified: false,
      planType: "trial",
      trialStartedAt: new Date(),
      trialEndsAt,
      dailyLimitMinutes: 300,
      minutesUsedToday: 0,
      totalMinutesUsed: 0,
      totalSessions: 0,
      lastUsageResetAt: new Date(),
    })
    .returning();

  req.session.userId = user!.id;
  req.session.isAdmin = false;

  if (referralId) {
    void db
      .update(referralsTable)
      .set({ registeredUserId: user!.id, registeredAt: new Date() })
      .where(eq(referralsTable.id, referralId));
  }

  void sendTelegramNotification(
    `🆕 New InterpreterAI user\nEmail: ${email.toLowerCase()}\nMethod: Email Registration\nPlan: Free Trial (14 days)`
  );
  void sendWelcomeEmail(email.toLowerCase());

  res.status(201).json({ user: buildUserInfo(user!) });
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
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionsTodayRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, user.id) && gte(sessionsTable.startedAt, todayStart));
  const sessionsToday = sessionsTodayRows[0]?.count ?? 0;
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

  // In production: send email with reset link
  // For now: return token directly in dev (remove in production)
  const isDev = process.env.NODE_ENV !== "production";
  res.json({
    message: "If an account exists, a reset link has been sent",
    ...(isDev ? { devToken: token } : {}),
  });
});

// ── Google OAuth ───────────────────────────────────────────────────────────
// Resolves the public-facing base URL from Replit proxy headers so the
// redirect_uri always matches regardless of dev vs production environment.
function getRedirectUri(req: import("express").Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host  = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "";
  return `${proto}://${host}/api/auth/google/callback`;
}

// Step 1 — redirect to Google's consent screen.
router.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).send("Google login is not configured. Please add GOOGLE_CLIENT_ID.");
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  getRedirectUri(req),
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Step 2 — Google redirects back here with ?code=...
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code) {
    res.redirect("/login?error=google_cancelled");
    return;
  }
  if (!state || state !== req.session.oauthState) {
    res.redirect("/login?error=invalid_state");
    return;
  }
  delete req.session.oauthState;

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect("/login?error=not_configured");
    return;
  }

  try {
    // Exchange authorisation code for access token.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  getRedirectUri(req),
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      logger.error({ tokens }, "Google token exchange failed");
      res.redirect("/login?error=token_failed");
      return;
    }

    // Fetch the Google user profile.
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as {
      sub?: string; email?: string; name?: string; email_verified?: boolean;
    };

    const googleId    = profile.sub;
    const googleEmail = profile.email?.toLowerCase();
    if (!googleId || !googleEmail) {
      res.redirect("/login?error=profile_failed");
      return;
    }

    // Find an existing account by Google ID or email.
    let [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.googleAccountId, googleId), eq(usersTable.email, googleEmail)))
      .limit(1);

    let isNewUser = false;
    if (user) {
      // Back-fill googleAccountId if the user previously signed up with email.
      if (!user.googleAccountId) {
        await db
          .update(usersTable)
          .set({ googleAccountId: googleId })
          .where(eq(usersTable.id, user.id));
      }
    } else {
      // Create a new account — same 14-day trial as email signup.
      isNewUser = true;
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const baseUsername = googleEmail.split("@")[0]!.replace(/[^a-z0-9._-]/gi, "_");

      [user] = await db
        .insert(usersTable)
        .values({
          username:         baseUsername,
          email:            googleEmail,
          // Placeholder hash — never matches bcrypt; password login is blocked
          // for Google-only accounts.
          passwordHash:     `$google$${googleId}`,
          googleAccountId:  googleId,
          isAdmin:          false,
          isActive:         true,
          emailVerified:    true,
          planType:         "trial",
          trialStartedAt:   new Date(),
          trialEndsAt,
          dailyLimitMinutes: 300,
          minutesUsedToday:  0,
          totalMinutesUsed:  0,
          totalSessions:     0,
          lastUsageResetAt:  new Date(),
        })
        .returning();
    }

    void sendTelegramNotification(
      isNewUser
        ? `🆕 New InterpreterAI user\nEmail: ${googleEmail}\nMethod: Google Sign-Up\nPlan: Free Trial (14 days)`
        : `🔑 InterpreterAI Google Login\nEmail: ${googleEmail}\nMethod: Google Login`
    );
    if (isNewUser) void sendWelcomeEmail(googleEmail);
    void touchActivity(user!.id);

    req.session.userId  = user!.id;
    req.session.isAdmin = user!.isAdmin;

    res.redirect("/workspace");
  } catch (err) {
    logger.error({ err }, "Google OAuth callback error");
    res.redirect("/login?error=auth_failed");
  }
});

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
