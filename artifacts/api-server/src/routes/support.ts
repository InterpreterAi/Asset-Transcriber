import { Router } from "express";
import { db, supportTicketsTable, supportRepliesTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import { sendSupportConfirmationEmail } from "../lib/email.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Submit a new support ticket ──────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { email, subject, message } = req.body as {
    email?: string; subject?: string; message?: string;
  };

  if (!email || !subject || !message) {
    res.status(400).json({ error: "Email, subject, and message are required." });
    return;
  }
  if (message.trim().length < 10) {
    res.status(400).json({ error: "Message must be at least 10 characters." });
    return;
  }

  const [user] = await db.select({ username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, req.session.userId!));

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId:  req.session.userId!,
    email:   email.trim(),
    subject: subject.trim(),
    message: message.trim(),
    status:  "open",
  }).returning();

  // Telegram notification (non-blocking)
  void sendTelegramNotification(
    `🎫 New Support Ticket #${ticket.id}\n` +
    `From: ${user?.username ?? "unknown"} <${email}>\n` +
    `Subject: ${subject}\n` +
    `Message: ${message.substring(0, 200)}${message.length > 200 ? "..." : ""}`,
  );

  // Confirmation email (non-blocking)
  void sendSupportConfirmationEmail(email, ticket.id, subject);

  logger.info({ ticketId: ticket.id }, "Support ticket created");
  res.status(201).json({ ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status } });
});

// ── Get current user's tickets ───────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, req.session.userId!))
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json({ tickets });
});

// ── Get a single ticket with replies (user can only access own) ──────────────
router.get("/:id", requireAuth, async (req, res) => {
  const ticketId = parseInt(String(req.params.id), 10);
  if (isNaN(ticketId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(and(
      eq(supportTicketsTable.id, ticketId),
      eq(supportTicketsTable.userId, req.session.userId!),
    ));

  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const replies = await db
    .select()
    .from(supportRepliesTable)
    .where(eq(supportRepliesTable.ticketId, ticketId))
    .orderBy(supportRepliesTable.createdAt);

  res.json({ ticket, replies });
});

// ── User reply on their own ticket ───────────────────────────────────────────
router.post("/:id/reply", requireAuth, async (req, res) => {
  const ticketId = parseInt(String(req.params.id), 10);
  const { message } = req.body as { message?: string };
  if (isNaN(ticketId) || !message?.trim()) {
    res.status(400).json({ error: "Message is required." }); return;
  }
  if (message.trim().length < 5) {
    res.status(400).json({ error: "Message too short." }); return;
  }

  // Ensure user owns this ticket
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(and(
      eq(supportTicketsTable.id, ticketId),
      eq(supportTicketsTable.userId, req.session.userId!),
    ));

  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return; }

  const [user] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  const [reply] = await db.insert(supportRepliesTable).values({
    ticketId,
    authorId: req.session.userId!,
    isAdmin:  false,
    message:  message.trim(),
  }).returning();

  // Auto-reopen if ticket was resolved
  const wasResolved = ticket.status === "resolved";
  await db.update(supportTicketsTable)
    .set({ status: "open", updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, ticketId));

  // Telegram ping to admin
  void sendTelegramNotification(
    `💬 User Reply on Ticket #${ticketId}\n` +
    `From: ${user?.username ?? "unknown"} <${ticket.email}>\n` +
    `Subject: ${ticket.subject}\n` +
    (wasResolved ? `⚠️ Ticket was resolved — now reopened\n` : "") +
    `Message: ${message.trim().substring(0, 300)}${message.trim().length > 300 ? "..." : ""}`,
  );

  logger.info({ ticketId, userId: req.session.userId }, "User reply added to ticket");
  res.status(201).json({ reply, reopened: wasResolved });
});

export default router;
