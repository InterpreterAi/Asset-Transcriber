import { Router } from "express";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, buildUserInfo } from "../lib/usage.js";
import crypto from "node:crypto";

const router = Router();

// ── Login ──────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { username, password, email } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };

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
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ error: "Account is disabled" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.userId = user.id;
  req.session.isAdmin = user.isAdmin;

  const freshUser = await getUserWithResetCheck(user.id);
  if (!freshUser) {
    res.status(500).json({ error: "User not found" });
    return;
  }

  res.json({ user: buildUserInfo(freshUser) });
});

// ── Sign Up ────────────────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

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
  res.json(buildUserInfo(user));
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

export default router;
