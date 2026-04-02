import { Router } from "express";
import { db, feedbackTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendTelegramNotification } from "../lib/telegram.js";

const router = Router();

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

router.post("/", requireAuth, async (req, res) => {
  const { rating, comment } = req.body as { rating?: number; comment?: string };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  await db.insert(feedbackTable).values({
    userId:  req.session.userId!,
    rating,
    comment: comment?.trim() || null,
  });

  const [user] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  const stars = "⭐".repeat(rating);
  void sendTelegramNotification(
    `${stars} New ${STAR_LABELS[rating]} Rating\n` +
    `From: ${user?.username ?? "unknown"}\n` +
    (comment?.trim() ? `Comment: ${comment.trim().substring(0, 300)}` : "No comment"),
  );

  res.json({ message: "Feedback submitted. Thank you!" });
});

export default router;
