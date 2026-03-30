import { Router } from "express";
import OpenAI from "openai";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired } from "../lib/usage.js";

// Prefer the user's own OPENAI_API_KEY; fall back to Replit AI integration
const usingProxy = !process.env.OPENAI_API_KEY && !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  baseURL: usingProxy ? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL : undefined,
  apiKey:  process.env.OPENAI_API_KEY
        ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY
        ?? "placeholder",
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

// ── Language name lookup ───────────────────────────────────────────────────
// Maps BCP-47 / Soniox language codes to human-readable names for the prompt.
// Add entries here as new languages are needed — the pipeline is fully generic.
const LANG_NAMES: Record<string, string> = {
  en:    "English",
  ar:    "Arabic",
  es:    "Spanish",
  fr:    "French",
  de:    "German",
  it:    "Italian",
  pt:    "Portuguese",
  ru:    "Russian",
  "zh-cn": "Chinese (Simplified)",
  zh:    "Chinese",
  ja:    "Japanese",
  ko:    "Korean",
  hi:    "Hindi",
  tr:    "Turkish",
  nl:    "Dutch",
  pl:    "Polish",
  he:    "Hebrew",
  uk:    "Ukrainian",
  fa:    "Persian",
  id:    "Indonesian",
  ms:    "Malay",
  th:    "Thai",
  vi:    "Vietnamese",
  sv:    "Swedish",
  da:    "Danish",
  fi:    "Finnish",
  no:    "Norwegian",
  cs:    "Czech",
  ro:    "Romanian",
};

function langName(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return LANG_NAMES[code.toLowerCase()] ?? LANG_NAMES[code.split("-")[0]?.toLowerCase() ?? ""] ?? code;
}

// ── POST /translate ────────────────────────────────────────────────────────
// Translates a finalized transcript segment using GPT-4o-mini.
// sourceLang: BCP-47 code detected by Soniox (auto-detected at runtime).
// targetLang: BCP-47 code selected by the user in the UI.
// Both map through LANG_NAMES for a human-readable prompt.
router.post("/translate", requireAuth, async (req, res) => {
  const { text, sourceLang, targetLang } = req.body as {
    text?: string;
    sourceLang?: string;
    targetLang?: string;
  };
  if (!text || typeof text !== "string" || text.trim().length < 2) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const srcName = langName(sourceLang, "the source language");
  const tgtName = langName(targetLang, "English");

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            `You are a professional simultaneous interpreter with expert fluency in ${srcName} and ${tgtName}. ` +
            "Your goal is to convey meaning naturally, not translate word-for-word. " +
            "Rules:\n" +
            `- Preserve the full meaning and intent of the original ${srcName}\n` +
            `- Use natural, idiomatic grammar and phrasing that a native ${tgtName} speaker would use\n` +
            "- Keep sentences short and conversational\n" +
            "- Never add explanations, parenthetical notes, or the original text\n" +
            "- Return ONLY the translated sentence, nothing else",
        },
        {
          role: "user",
          content:
            `Translate this spoken ${srcName} into natural, fluent ${tgtName}:\n\n${text.trim()}`,
        },
      ],
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
