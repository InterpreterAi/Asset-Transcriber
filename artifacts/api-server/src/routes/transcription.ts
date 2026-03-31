import { Router } from "express";
import OpenAI from "openai";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired } from "../lib/usage.js";
import { findTermHints } from "../data/terminology.js";

// ── Translation memory ─────────────────────────────────────────────────────
const TRANS_MEM = new Map<string, string>();
const TRANS_MEM_CAP = 2000;

function memKey(srcLang: string, tgtLang: string, text: string): string {
  return `${srcLang.toLowerCase()}:${tgtLang.toLowerCase()}:${text.trim().toLowerCase()}`;
}

function memStore(key: string, value: string): void {
  if (TRANS_MEM.size >= TRANS_MEM_CAP) {
    const oldest = TRANS_MEM.keys().next().value;
    if (oldest !== undefined) TRANS_MEM.delete(oldest);
  }
  TRANS_MEM.set(key, value);
}

// ── Global system safety cap ───────────────────────────────────────────────
// In-memory cache to avoid querying DB on every /token request.
const GLOBAL_CAP_MINUTES = 200 * 60; // 200 hours/day = 12,000 minutes
let globalCapCache = { date: "", minutes: 0, lastChecked: 0 };

async function isGlobalCapReached(): Promise<boolean> {
  const now = Date.now();
  const today = new Date().toDateString();
  // Refresh cache at most once per minute
  if (today !== globalCapCache.date || now - globalCapCache.lastChecked > 60_000) {
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(minutes_used_today), 0)` })
      .from(usersTable);
    globalCapCache = { date: today, minutes: Number(rows[0]?.total ?? 0), lastChecked: now };
  }
  return globalCapCache.minutes >= GLOBAL_CAP_MINUTES;
}

// ── OpenAI ─────────────────────────────────────────────────────────────────
const usingProxy = !process.env.OPENAI_API_KEY && !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  baseURL: usingProxy ? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL : undefined,
  apiKey:  process.env.OPENAI_API_KEY
        ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY
        ?? "placeholder",
});

const router = Router();

// ── /token ─────────────────────────────────────────────────────────────────
router.post("/token", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account is disabled" }); return; }

  // Only block on trial expiry when the user is still on the trial plan
  if (user.planType === "trial" && isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired. Please subscribe to continue." });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached. Please upgrade to continue." });
    return;
  }

  // Global safety cap
  if (await isGlobalCapReached()) {
    res.status(503).json({ error: "System temporarily unavailable. Please try again later." });
    return;
  }

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Transcription service not configured" }); return; }

  res.json({ apiKey, expiresIn: 3600 });
});

// ── /session/start ─────────────────────────────────────────────────────────
router.post("/session/start", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account is disabled" }); return; }

  if (user.planType === "trial" && isTrialExpired(user)) {
    res.status(403).json({ error: "Your trial has expired. Please subscribe to continue." });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily usage limit reached." });
    return;
  }

  // One active session per user
  const openSessions = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, user.id), isNull(sessionsTable.endedAt)))
    .limit(1);

  if (openSessions.length > 0) {
    res.status(409).json({ error: "Another active session is already running." });
    return;
  }

  const result = await db.insert(sessionsTable).values({
    userId: user.id,
    startedAt: new Date(),
  }).returning();

  res.json({ sessionId: result[0]!.id, message: "Session started" });
});

// ── /session/stop ──────────────────────────────────────────────────────────
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
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }

  await db.update(usersTable)
    .set({
      minutesUsedToday: user.minutesUsedToday + minutesUsed,
      totalMinutesUsed: user.totalMinutesUsed + minutesUsed,
      totalSessions: user.totalSessions + 1,
    })
    .where(eq(usersTable.id, user.id));

  // Invalidate global cap cache after a session stops
  globalCapCache.lastChecked = 0;

  res.json({ message: "Session stopped", minutesUsed });
});

// ── /translate ─────────────────────────────────────────────────────────────
router.post("/translate", requireAuth, async (req, res) => {
  const { text, srcLang, tgtLang, isFinal } = req.body as {
    text?: string;
    srcLang?: string;
    tgtLang?: string;
    isFinal?: boolean;
  };

  if (!text?.trim() || !srcLang || !tgtLang) {
    res.status(400).json({ error: "text, srcLang, and tgtLang are required" });
    return;
  }

  const key = memKey(srcLang, tgtLang, text);
  if (!isFinal) {
    const cached = TRANS_MEM.get(key);
    if (cached) { res.json({ translated: cached }); return; }
  }

  const LANG_NAMES: Record<string, string> = {
    "en": "English", "ar": "Arabic", "es": "Spanish", "fr": "French",
    "de": "German", "it": "Italian", "pt": "Portuguese", "ru": "Russian",
    "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
    "ja": "Japanese", "ko": "Korean", "hi": "Hindi", "tr": "Turkish",
    "nl": "Dutch", "pl": "Polish", "sv": "Swedish", "da": "Danish",
    "fi": "Finnish", "nb": "Norwegian", "cs": "Czech", "sk": "Slovak",
    "ro": "Romanian", "hu": "Hungarian", "bg": "Bulgarian", "hr": "Croatian",
    "uk": "Ukrainian", "el": "Greek", "he": "Hebrew", "fa": "Persian",
    "ur": "Urdu", "vi": "Vietnamese", "id": "Indonesian", "ms": "Malay",
    "th": "Thai",
  };

  const srcName = LANG_NAMES[srcLang] ?? srcLang;
  const tgtName = LANG_NAMES[tgtLang] ?? tgtLang;
  const tgtCode = tgtLang.split("-")[0]!;

  const termHints = findTermHints(text, srcLang, tgtLang);
  const arabicRule = tgtCode === "ar"
    ? "- Use Modern Standard Arabic (فصحى) ONLY. Prohibited: dialect words (ليش, شو, مو, هيك, زي, كده, عشان, وين, فين, إزاي, ليه)\n"
    : "";
  const termRule = termHints.length > 0
    ? `- Use these exact glossary translations for domain terminology:\n` +
      termHints.map(h => `  ${h}`).join("\n") + "\n"
    : "";

  const systemPrompt =
    `You are a professional simultaneous interpreter certified in ${srcName} and ${tgtName}. ` +
    "Your output must be complete, accurate, and natural — exactly as a trained human interpreter would produce.\n" +
    "Rules:\n" +
    `- Translate EVERY word in the source text — do not omit, skip, or drop any word\n` +
    `- Do not summarize, compress, or shorten the meaning in any way\n` +
    `- Preserve names, numbers, and technical terms exactly as spoken\n` +
    `- Use natural, idiomatic grammar as a native ${tgtName} speaker would\n` +
    "- Maintain consistent terminology throughout the session\n" +
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
        { role: "user", content: text },
      ],
    });

    const translated = resp.choices[0]?.message?.content?.trim() ?? "";
    if (translated) memStore(key, translated);
    res.json({ translated });
  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

export default router;
