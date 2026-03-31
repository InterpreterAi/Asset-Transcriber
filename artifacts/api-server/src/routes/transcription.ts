import { Router } from "express";
import OpenAI from "openai";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired } from "../lib/usage.js";
import { findTermHints } from "../data/terminology.js";

// ── Translation memory ─────────────────────────────────────────────────────
// In-memory cache: `${srcLang}:${tgtLang}:${normalizedText}` → translation.
// Persists for the lifetime of the server process. Capped at MAX_MEM entries;
// oldest entries are evicted when the cap is reached.
const TRANS_MEM = new Map<string, string>();
const TRANS_MEM_CAP = 2000;

function memKey(srcLang: string, tgtLang: string, text: string): string {
  return `${srcLang.toLowerCase()}:${tgtLang.toLowerCase()}:${text.trim().toLowerCase()}`;
}

function memStore(key: string, value: string): void {
  if (TRANS_MEM.size >= TRANS_MEM_CAP) {
    // Evict the oldest entry (Map preserves insertion order).
    const oldest = TRANS_MEM.keys().next().value;
    if (oldest !== undefined) TRANS_MEM.delete(oldest);
  }
  TRANS_MEM.set(key, value);
}

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
// Pipeline:
//   1. Check translation memory (exact match → return cached result instantly)
//   2. Find domain-specific terminology hints from the glossary
//   3. Call GPT-4o-mini with interpreter-style + MSA prompt + glossary hints
//   4. Store result in translation memory for future reuse
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

  const normalizedText = text.trim();
  const srcCode = sourceLang ?? "en";
  const tgtCode = targetLang ?? "en";
  const srcName = langName(srcCode, "the source language");
  const tgtName = langName(tgtCode, "English");

  // ── Step 1: Translation memory ────────────────────────────────────────────
  const cacheKey = memKey(srcCode, tgtCode, normalizedText);
  const cached = TRANS_MEM.get(cacheKey);
  if (cached) {
    res.json({ translation: cached, fromMemory: true });
    return;
  }

  // ── Step 2: Terminology hints ─────────────────────────────────────────────
  const termHints = findTermHints(normalizedText, srcCode, tgtCode);

  // ── Step 3: Build system prompt ───────────────────────────────────────────
  const isArabicTarget = tgtCode.split("-")[0]?.toLowerCase() === "ar";

  const arabicRule = isArabicTarget
    ? "- Output MUST be in Modern Standard Arabic (العربية الفصحى / فصيح). " +
      "Never use dialectal forms (Egyptian, Levantine, Gulf, Maghrebi). " +
      "Forbidden dialect words: كويس، عايز، ليه، إزاي، ماقدرتش. " +
      "Always use formal equivalents: جيد، أريد، لماذا، كيف، لم أستطع.\n"
    : "";

  const termRule = termHints.length > 0
    ? `- Use these exact glossary translations for domain terminology:\n` +
      termHints.map(h => `  ${h}`).join("\n") + "\n"
    : "";

  const systemPrompt =
    `You are a professional simultaneous interpreter certified in ${srcName} and ${tgtName}. ` +
    "Your output must sound exactly like a trained human interpreter — accurate, natural, and concise.\n" +
    "Rules:\n" +
    `- Preserve the full meaning of the ${srcName} source — do NOT omit, condense, or summarize any part\n` +
    `- Use natural, idiomatic grammar as a native ${tgtName} speaker would\n` +
    "- Keep sentences short and conversational — do not expand or paraphrase excessively\n" +
    "- Maintain consistent terminology throughout the session\n" +
    "- Reproduce ALL numbers, dates, quantities, and proper nouns exactly as spoken (do not round, spell out, or change them)\n" +
    arabicRule +
    termRule +
    "- Never add explanations, notes, or the original text\n" +
    "- Return ONLY the translated sentence, nothing else";

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Translate the following spoken ${srcName} into natural, fluent ${tgtName}:\n\n${normalizedText}`,
        },
      ],
      max_completion_tokens: 512,
    });

    const translation = resp.choices[0]?.message?.content?.trim() ?? "";

    // ── Step 4: Store in translation memory ───────────────────────────────────
    if (translation) memStore(cacheKey, translation);

    res.json({ translation });
  } catch (err) {
    console.error("[translate]", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
