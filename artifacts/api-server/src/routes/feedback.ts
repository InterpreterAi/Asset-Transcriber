import { Router } from "express";
import { db, feedbackTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const { rating, comment } = req.body as { rating?: number; comment?: string };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  await db.insert(feedbackTable).values({
    userId: req.session.userId!,
    rating,
    comment: comment || null,
  });

  res.json({ message: "Feedback submitted. Thank you!" });
});

export default router;
