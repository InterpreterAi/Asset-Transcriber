import { Router } from "express";
import { db, feedbackTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendTelegramNotification } from "../lib/telegram.js";

const router = Router();

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
const RECOMMEND_EMOJI: Record<string, string> = { yes: "👍", no: "👎", maybe: "🤷" };

router.post("/", requireAuth, async (req, res) => {
  const { rating, comment, recommend, source } = req.body as {
    rating?: number; comment?: string; recommend?: string; source?: string;
  };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }
  if (recommend && !["yes", "no", "maybe"].includes(recommend)) {
    res.status(400).json({ error: "Invalid recommend value" });
    return;
  }

  await db.insert(feedbackTable).values({
    userId:    req.session.userId!,
    rating,
    recommend: recommend ?? null,
    comment:   comment?.trim() || null,
    source:    source ?? null,
  });

  const [user] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  const stars = "⭐".repeat(rating);
  const recLine = recommend ? `Recommend: ${RECOMMEND_EMOJI[recommend]} ${recommend}` : "";
  const srcLine = source ? `Source: ${source}` : "";
  void sendTelegramNotification(
    [
      `${stars} New ${STAR_LABELS[rating]} Rating`,
      `From: ${user?.username ?? "unknown"}`,
      recLine,
      srcLine,
      comment?.trim() ? `Comment: ${comment.trim().substring(0, 300)}` : "No comment",
    ].filter(Boolean).join("\n"),
  );

  res.json({ message: "Feedback submitted. Thank you!" });
});

export default router;
