import { Router } from "express";
import OpenAI from "openai";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired } from "../lib/usage.js";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder",
});

const router = Router();

router.post("/token", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }

  if (isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired" });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached" });
    return;
  }

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Transcription service not configured" });
    return;
  }

  res.json({ apiKey, expiresIn: 3600 });
});

router.post("/session/start", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "Account is disabled" });
    return;
  }

  if (isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired" });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached" });
    return;
  }

  const result = await db.insert(sessionsTable).values({
    userId: user.id,
    startedAt: new Date(),
  }).returning();

  const session = result[0];
  res.json({ sessionId: session!.id, message: "Session started" });
});

router.post("/session/stop", requireAuth, async (req, res) => {
  const { sessionId, durationSeconds } = req.body as { sessionId?: number; durationSeconds?: number };
  if (!sessionId || durationSeconds === undefined) {
    res.status(400).json({ error: "sessionId and durationSeconds are required" });
    return;
  }

  const minutesUsed = durationSeconds / 60;

  await db.update(sessionsTable)
    .set({ endedAt: new Date(), durationSeconds })
    .where(eq(sessionsTable.id, sessionId));

  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const newMinutesToday = user.minutesUsedToday + minutesUsed;
  const newTotalMinutes = user.totalMinutesUsed + minutesUsed;
  const newTotalSessions = user.totalSessions + 1;

  await db.update(usersTable)
    .set({
      minutesUsedToday: newMinutesToday,
      totalMinutesUsed: newTotalMinutes,
      totalSessions: newTotalSessions,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Session stopped" });
});

// ── POST /translate ────────────────────────────────────────────────────────
// Translates a finalized transcript segment using gpt-4o-mini.
// Auto-detects language and translates: EN↔AR.
router.post("/translate", requireAuth, async (req, res) => {
  const { text } = req.body as { text?: string; sourceLang?: string };
  if (!text || typeof text !== "string" || text.trim().length < 2) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const prompt = `Translate the following speech segment.

Detect the language automatically.
If the text is English translate it into Arabic.
If the text is Arabic translate it into English.

Return ONLY the translation.
Do not add explanations.

Text:
${text.trim()}`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 512,
    });
    const translation = resp.choices[0]?.message?.content?.trim() ?? "";
    res.json({ translation });
  } catch (err) {
    console.error("[translate]", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
