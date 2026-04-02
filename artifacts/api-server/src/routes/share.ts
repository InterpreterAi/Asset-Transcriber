import { Router } from "express";
import { db, shareEventsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

const VALID_PLATFORMS = ["whatsapp", "telegram", "email", "linkedin", "copy", "native"];

router.post("/event", requireAuth, async (req, res) => {
  const { platform } = req.body as { platform?: string };
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  await db.insert(shareEventsTable).values({
    userId:   req.session.userId!,
    platform,
  });

  res.json({ ok: true });
});

export default router;
