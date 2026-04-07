import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, adminActivityEventsTable, usersTable } from "@workspace/db";
import { verifyEmailReminderUnsubscribeToken } from "../lib/email-reminder-unsubscribe.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/**
 * One-click unsubscribe from trial reminder campaign emails only.
 * Token is signed with SESSION_SECRET (see email-reminder-unsubscribe.ts).
 */
router.get("/unsubscribe-reminders", async (req, res) => {
  const tokenRaw = typeof req.query["token"] === "string" ? req.query["token"] : "";
  const userId = verifyEmailReminderUnsubscribeToken(tokenRaw);
  if (userId == null) {
    res
      .status(400)
      .type("html")
      .send(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Unsubscribe</title></head><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;\"><p>This unsubscribe link is invalid or has expired.</p></body></html>",
      );
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      emailRemindersEnabled: usersTable.emailRemindersEnabled,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res
      .status(404)
      .type("html")
      .send(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Unsubscribe</title></head><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;\"><p>Account not found.</p></body></html>",
      );
    return;
  }

  if (!user.emailRemindersEnabled) {
    res
      .type("html")
      .send(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Unsubscribe</title></head><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;\"><p>You are already unsubscribed from trial reminder emails. Other account emails (such as verification or billing) are not affected.</p></body></html>",
      );
    return;
  }

  await db.update(usersTable).set({ emailRemindersEnabled: false }).where(eq(usersTable.id, userId));

  await db.insert(adminActivityEventsTable).values({
    eventType: "email_reminder_unsubscribe",
    userId,
    detail: user.email ? `Unsubscribed trial reminders (${user.email})` : "Unsubscribed trial reminders",
  });

  logger.info({ userId }, "email_reminder_unsubscribe: user disabled trial reminder emails");

  res
    .type("html")
    .send(
      "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Unsubscribe</title></head><body style=\"font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;\"><p>You have been unsubscribed from trial reminder emails.</p><p style=\"color:#6b7280;font-size:14px;\">Verification, billing, and other transactional messages may still be sent when needed.</p></body></html>",
    );
});

export default router;
