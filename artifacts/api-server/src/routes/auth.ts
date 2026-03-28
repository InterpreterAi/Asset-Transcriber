import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, buildUserInfo } from "../lib/usage.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  const user = users[0];

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({ error: "Account is disabled" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
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

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(buildUserInfo(user));
});

export default router;
