import { Router } from "express";
import OpenAI from "openai";
import { db, usersTable, sessionsTable, glossaryEntriesTable, referralsTable } from "@workspace/db";
import { eq, and, isNull, or, lt, sql, desc, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getUserWithResetCheck, isTrialExpired, touchActivity } from "../lib/usage.js";
import { findTermHints } from "../data/terminology.js";
import { logger } from "../lib/logger.js";
import { sessionStore } from "../lib/session-store.js";

// ── HIPAA / Ephemeral-only processing ─────────────────────────────────────
//
// This server acts ONLY as a real-time interpretation pipeline.
// No patient speech content (transcripts, translations, or audio) is ever
// stored anywhere — in the database, in memory, in logs, or on disk.
//
// Data flow:
//   Audio  → browser mic → Soniox WebSocket (never touches this server)
//   Text   → /api/transcription/translate → OpenAI → response → discarded
//   DB     → sessions table stores metadata ONLY: id, userId, duration, timestamps
//
// Translation cache was INTENTIONALLY REMOVED.
// A translation memory cache would retain patient speech content (PHI) in
// server RAM between requests. All translations are one-shot: request arrives,
// OpenAI processes it, result is returned to the browser, nothing is retained.
//

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
// Always prefer the Replit AI integration proxy when configured.
// OPENAI_API_KEY may exist but be stale — the proxy is the authoritative route.
const hasIntegrationProxy = !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openai = new OpenAI({
  baseURL: hasIntegrationProxy ? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL : undefined,
  apiKey:  hasIntegrationProxy
        ? (process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "placeholder")
        : (process.env.OPENAI_API_KEY ?? "placeholder"),
});

const router = Router();

// ── /token ─────────────────────────────────────────────────────────────────
router.post("/token", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account is disabled" }); return; }

  // Only block on trial expiry when the user is still on the trial plan
  if (user.planType === "trial" && isTrialExpired(user)) {
    res.status(403).json({ error: "Trial expired — please upgrade." });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily trial limit reached (5 hours). Try again tomorrow." });
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

// How old a session's last heartbeat must be before we consider it abandoned.
// Set to 60 s — matches the requirement in the feature spec.
const STALE_SESSION_MS = 60_000;

// ── Stale session cleanup ───────────────────────────────────────────────────
// Runs every 60 s and auto-closes any sessions whose lastActivityAt is older
// than STALE_SESSION_MS. This handles tab closes, page refreshes, and network
// drops where the client never sent an explicit /session/stop.
async function sweepStaleSessions(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_SESSION_MS);
    const stale = await db
      .select({ id: sessionsTable.id, startedAt: sessionsTable.startedAt, userId: sessionsTable.userId })
      .from(sessionsTable)
      .where(and(
        isNull(sessionsTable.endedAt),
        or(isNull(sessionsTable.lastActivityAt), lt(sessionsTable.lastActivityAt, cutoff)),
      ));

    if (stale.length === 0) return;

    const now = new Date();
    for (const s of stale) {
      const durationSeconds = Math.round((now.getTime() - s.startedAt.getTime()) / 1000);
      const minutesUsed = durationSeconds / 60;
      await db
        .update(sessionsTable)
        .set({ endedAt: now, durationSeconds })
        .where(eq(sessionsTable.id, s.id));
      sessionStore.delete(s.id);
      // Credit the minutes to the user so "min today" stays accurate
      await db
        .update(usersTable)
        .set({
          minutesUsedToday: sql`minutes_used_today + ${minutesUsed}`,
          totalMinutesUsed: sql`total_minutes_used + ${minutesUsed}`,
        })
        .where(eq(usersTable.id, s.userId));
    }
    logger.info(`Swept ${stale.length} stale session(s)`);
  } catch (err) {
    logger.error({ err }, "Stale session sweep failed");
  }
}
setInterval(sweepStaleSessions, 5 * 60_000); // every 5 minutes

// ── Language code → display name lookup ────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  ar: "Arabic", bg: "Bulgarian", "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)", hr: "Croatian", cs: "Czech",
  da: "Danish", nl: "Dutch", en: "English", fa: "Persian (Farsi)",
  fi: "Finnish", fr: "French", de: "German", el: "Greek",
  he: "Hebrew", hi: "Hindi", hu: "Hungarian", id: "Indonesian",
  it: "Italian", ja: "Japanese", ko: "Korean", ms: "Malay",
  nb: "Norwegian", pl: "Polish", pt: "Portuguese", ro: "Romanian",
  ru: "Russian", sk: "Slovak", es: "Spanish", sv: "Swedish",
  th: "Thai", tr: "Turkish", uk: "Ukrainian", ur: "Urdu",
  vi: "Vietnamese",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

// ── /session/start ─────────────────────────────────────────────────────────
router.post("/session/start", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account is disabled" }); return; }

  if (user.planType === "trial" && isTrialExpired(user)) {
    res.status(403).json({ error: "Trial expired — please upgrade." });
    return;
  }

  if (user.minutesUsedToday >= user.dailyLimitMinutes) {
    res.status(403).json({ error: "Daily trial limit reached (5 hours). Try again tomorrow." });
    return;
  }

  // Language pair sent by the client (e.g. { srcLang: "en", tgtLang: "ar" })
  const { srcLang, tgtLang } = (req.body ?? {}) as { srcLang?: string; tgtLang?: string };
  const langPair = (srcLang && tgtLang)
    ? `${langName(srcLang)} → ${langName(tgtLang)}`
    : null;

  // Close any open sessions left behind by a page refresh, tab close,
  // network drop, or a start() that failed after the DB row was created.
  // We never 409: there is no valid reason for a user to have two open
  // sessions, and the old "recent heartbeat = 409" logic caused false
  // positives whenever stop() failed silently before a new attempt.
  const openSessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, user.id), isNull(sessionsTable.endedAt)));

  if (openSessions.length > 0) {
    const now = new Date();
    // Close orphaned sessions and credit their duration so "min today" stays accurate
    for (const orphan of openSessions) {
      const durationSeconds = Math.round((now.getTime() - orphan.startedAt.getTime()) / 1000);
      const minutesUsed = durationSeconds / 60;
      await db
        .update(sessionsTable)
        .set({ endedAt: now, durationSeconds })
        .where(eq(sessionsTable.id, orphan.id));
      sessionStore.delete(orphan.id);
      await db
        .update(usersTable)
        .set({
          minutesUsedToday: sql`minutes_used_today + ${minutesUsed}`,
          totalMinutesUsed: sql`total_minutes_used + ${minutesUsed}`,
        })
        .where(eq(usersTable.id, user.id));
    }
  }

  const result = await db
    .insert(sessionsTable)
    .values({ userId: user.id, startedAt: new Date(), lastActivityAt: new Date(), langPair })
    .returning();

  void touchActivity(user.id);

  void db
    .update(referralsTable)
    .set({ hasStartedSession: true })
    .where(
      and(
        eq(referralsTable.registeredUserId, user.id),
        eq(referralsTable.hasStartedSession, false),
      )
    );

  res.json({ sessionId: result[0]!.id, message: "Session started" });
});

// ── /session/heartbeat ──────────────────────────────────────────────────────
// Frontend calls this every 30 s while recording to keep the session alive.
// Without a heartbeat the session is considered stale after STALE_SESSION_MS.
router.post("/session/heartbeat", requireAuth, async (req, res) => {
  const { sessionId } = req.body as { sessionId?: number };
  if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }

  const rows = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.id, sessionId),
        eq(sessionsTable.userId, req.session.userId!),
        isNull(sessionsTable.endedAt),
      )
    )
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ error: "Session not found or already ended" });
    return;
  }

  await db
    .update(sessionsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(sessionsTable.id, sessionId));

  void touchActivity(req.session.userId!);

  res.json({ ok: true });
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

  // Remove in-memory snapshot — session is over.
  sessionStore.delete(sessionId);

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

// ── /session/snapshot ──────────────────────────────────────────────────────
// Client pushes a live snapshot every 5 s so admin can view the session.
// The snapshot is held in-memory only (sessionStore) — never persisted to DB.
// langPair is recorded to the sessions table for historical reporting.
router.put("/session/snapshot", requireAuth, async (req, res) => {
  const { sessionId, langA, langB, micLabel, transcript, translation } = req.body as {
    sessionId?:   number;
    langA?:       string;
    langB?:       string;
    micLabel?:    string;
    transcript?:  string;
    translation?: string;
  };

  if (!sessionId || !langA || !langB) {
    res.status(400).json({ error: "sessionId, langA, and langB are required" });
    return;
  }

  // Verify this session belongs to the requesting user and is still open.
  const rows = await db
    .select({ id: sessionsTable.id, langPair: sessionsTable.langPair })
    .from(sessionsTable)
    .where(and(
      eq(sessionsTable.id, sessionId),
      eq(sessionsTable.userId, req.session.userId!),
      isNull(sessionsTable.endedAt),
    ))
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const pair = `${langName(langA)} → ${langName(langB)}`;

  // Write the lang pair to DB the first time we see it.
  if (!rows[0]!.langPair) {
    await db.update(sessionsTable)
      .set({ langPair: pair })
      .where(eq(sessionsTable.id, sessionId));
  }

  // Update in-memory snapshot (admin-visible only, never persisted).
  sessionStore.set(sessionId, {
    langA,
    langB,
    micLabel:    micLabel    ?? "Microphone",
    transcript:  transcript  ?? "",
    translation: translation ?? "",
    updatedAt:   Date.now(),
  });

  res.json({ ok: true });
});

// ── /sessions — user session history ──────────────────────────────────────
router.get("/sessions", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const limit  = Math.min(Number(req.query.limit) || 50, 200);

  // ── period filter: today | week | month | all (default)
  const period = String(req.query.period ?? "all");
  const now    = new Date();

  function periodStart(p: string): Date | null {
    const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (p === "today") return utcToday;
    if (p === "week")  { const d = new Date(utcToday); d.setUTCDate(d.getUTCDate() - 6); return d; }
    if (p === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return null; // "all"
  }

  const fromDate = periodStart(period);

  // Sessions list filtered by period
  const baseWhere = fromDate
    ? and(eq(sessionsTable.userId, userId), gte(sessionsTable.startedAt, fromDate))
    : eq(sessionsTable.userId, userId);

  const sessions = await db
    .select({
      id:              sessionsTable.id,
      startedAt:       sessionsTable.startedAt,
      endedAt:         sessionsTable.endedAt,
      durationSeconds: sessionsTable.durationSeconds,
      langPair:        sessionsTable.langPair,
    })
    .from(sessionsTable)
    .where(baseWhere)
    .orderBy(desc(sessionsTable.startedAt))
    .limit(limit);

  // Aggregate stats for the selected period (+ always compute today & week for sidebar widgets)
  const todayUTC   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekAgoUTC = new Date(todayUTC); weekAgoUTC.setUTCDate(weekAgoUTC.getUTCDate() - 6);

  const aggCols = {
    count:        sql<number>`count(*)::int`,
    totalSeconds: sql<number>`coalesce(sum(duration_seconds),0)::int`,
  };

  const [[periodAgg], [lifetime], [today], [week]] = await Promise.all([
    fromDate
      ? db.select(aggCols).from(sessionsTable).where(and(eq(sessionsTable.userId, userId), gte(sessionsTable.startedAt, fromDate)))
      : db.select(aggCols).from(sessionsTable).where(eq(sessionsTable.userId, userId)),
    db.select(aggCols).from(sessionsTable).where(eq(sessionsTable.userId, userId)),
    db.select(aggCols).from(sessionsTable).where(and(eq(sessionsTable.userId, userId), gte(sessionsTable.startedAt, todayUTC))),
    db.select(aggCols).from(sessionsTable).where(and(eq(sessionsTable.userId, userId), gte(sessionsTable.startedAt, weekAgoUTC))),
  ]);

  const periodCount   = periodAgg?.count       ?? 0;
  const periodSeconds = periodAgg?.totalSeconds ?? 0;
  const todayCount    = today?.count            ?? 0;
  const todaySeconds  = today?.totalSeconds     ?? 0;

  res.json({
    sessions,
    period,
    // Period-filtered stats (used by the filter tabs)
    periodSessions:      periodCount,
    periodMinutes:       Math.round(periodSeconds / 60),
    periodAvgMinutes:    periodCount > 0 ? Math.round(periodSeconds / periodCount / 60) : 0,
    // Always-present for sidebar widgets
    totalSessions:       lifetime?.count ?? 0,
    totalMinutes:        Math.round((lifetime?.totalSeconds ?? 0) / 60),
    todaySessions:       todayCount,
    todayMinutes:        Math.round(todaySeconds / 60),
    avgSessionMinutes:   todayCount > 0 ? Math.round(todaySeconds / todayCount / 60) : 0,
    weekSessions:        week?.count ?? 0,
    weekMinutes:         Math.round((week?.totalSeconds ?? 0) / 60),
  });
});

// ── /translate ─────────────────────────────────────────────────────────────
router.post("/translate", requireAuth, async (req, res) => {
  // isFinal was previously used to bypass the translation cache.
  // The cache has been removed entirely (HIPAA). isFinal is accepted
  // for API compatibility but ignored — every request is processed ephemerally.
  const { text, srcLang, tgtLang } = req.body as {
    text?: string;
    srcLang?: string;
    tgtLang?: string;
    isFinal?: boolean; // accepted but unused — kept for API compatibility
  };

  if (!text?.trim() || !srcLang || !tgtLang) {
    res.status(400).json({ error: "text, srcLang, and tgtLang are required" });
    return;
  }

  const srcName = langName(srcLang);
  const tgtName = langName(tgtLang);
  const srcCode = srcLang.split("-")[0]!;
  const tgtCode = tgtLang.split("-")[0]!;

  // ── Same-language guard (server-side failsafe) ─────────────────────────────
  // If the resolved source and target share the same base language code, no
  // translation is possible — return the original text immediately without
  // calling OpenAI. This is the hard backstop for any client-side direction
  // logic that slips through (e.g. wrong segment lock on a Latin-Latin pair).
  if (srcCode === tgtCode) {
    res.json({ translated: text });
    return;
  }

  const termHints = findTermHints(text, srcLang, tgtLang);

  // ── User personal glossary ─────────────────────────────────────────────────
  // Load the user's saved glossary entries and add any that match the current text
  const userId = req.session.userId!;

  // Capture lang pair on the user's open session (fire-and-forget, no await)
  // Uses full language names so history shows "English → Arabic" not "en → ar".
  void db
    .update(sessionsTable)
    .set({ langPair: `${srcName} → ${tgtName}` })
    .where(and(
      eq(sessionsTable.userId, userId),
      isNull(sessionsTable.endedAt),
      isNull(sessionsTable.langPair),
    ));

  const userGlossary = await db
    .select()
    .from(glossaryEntriesTable)
    .where(eq(glossaryEntriesTable.userId, userId));
  const lowerText = text.toLowerCase();
  for (const entry of userGlossary) {
    if (lowerText.includes(entry.term.toLowerCase())) {
      termHints.push(`"${entry.term}" → "${entry.translation}"`);
    }
  }

  // Arabic dialect understanding — source text may be any regional dialect
  const arabicSourceRule = srcCode === "ar"
    ? "- The source text may be in any Arabic dialect (Egyptian, Levantine, Gulf, Moroccan, Iraqi, etc.). " +
      "Understand and translate dialect vocabulary faithfully — do not reject or misread colloquial words.\n"
    : "";

  // Arabic output standard — professional interpretation output is MSA
  const arabicTargetRule = tgtCode === "ar"
    ? "- Write Modern Standard Arabic (فصحى) suitable for professional interpretation. " +
      "Do NOT use dialect output words such as: ليش, شو, مو, هيك, زي, كده, عشان, وين, فين, إزاي, ليه\n"
    : "";

  const termRule = termHints.length > 0
    ? `- Use these exact glossary translations for the following terms:\n` +
      termHints.map(h => `  ${h}`).join("\n") + "\n"
    : "";

  const systemPrompt =
    `You are a professional simultaneous interpreter in a live interpreter call-center. ` +
    `Your only job is to translate what the speaker literally said — nothing more, nothing less. ` +
    `Translate from ${srcName} into ${tgtName}.\n\n` +

    `CORE RULE: Translate only the exact words spoken. NEVER add words, context, or assumptions that the speaker did not say.\n\n` +

    `PRESERVE AMBIGUITY:\n` +
    `- If a word is ambiguous (e.g. "number", "case", "file", "account"), translate it with the same ambiguity.\n` +
    `- Do NOT resolve ambiguity by guessing. Examples:\n` +
    `  "my number" → "رقمي"  (NOT "رقم هاتفي" — the speaker did not say "phone number")\n` +
    `  "my case"   → "قضيتي" (NOT "حالتي الطبية" or "حالتي القانونية" — keep it neutral)\n` +
    `  "my file"   → "ملفي"  (NOT "ملفي الطبي" or "ملفي القانوني")\n\n` +

    `INTERPRETER INTRODUCTIONS:\n` +
    `- Interpreters often introduce themselves: "my name is X and my number is 3602"\n` +
    `- "my number" in this context is an interpreter ID, not a phone number.\n` +
    `- Translate exactly as spoken: "اسمي X ورقمي هو 3602" — never add "هاتفي" or "تليفوني"\n\n` +

    `NUMBERS AND IDENTIFIERS:\n` +
    `- Reproduce every number exactly as spoken. Never infer its purpose.\n` +
    `- "my number is 3602" → "رقمي هو 3602"\n` +
    `- "case number 4417" → "رقم القضية 4417"\n\n` +

    `WHEN IN DOUBT:\n` +
    `- Always keep the literal translation. Never expand meaning.\n` +
    `- The text may be an incomplete sentence still being spoken. Translate exactly what is there; never predict or complete the sentence.\n\n` +

    `CONSISTENCY:\n` +
    `- Use the SAME word choice every time for the same word. Never swap synonyms mid-sentence.\n` +
    `- Names must appear exactly as spoken.\n\n` +

    `DOMAIN TERMINOLOGY (only when explicitly spoken):\n` +
    `- Accident/insurance: use terms like collision, liability, claim, deductible, at-fault — only when the speaker uses them.\n` +
    `- Medical: use clinical terms only when the speaker uses medical language.\n` +
    `- Legal: use legal terms only when the speaker uses legal language.\n` +
    arabicSourceRule +
    arabicTargetRule +
    termRule +
    `OUTPUT:\n` +
    `- Return ONLY the translated text.\n` +
    `- No explanations, notes, alternatives, or the original text.`;

  // Hard 12-second timeout — if OpenAI hangs, return 503 so the client can
  // retry instead of blocking indefinitely and stalling the translation stream.
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 12_000);

  try {
    const resp = await openai.chat.completions.create(
      {
        model:       "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: text },
        ],
      },
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    const translated = resp.choices[0]?.message?.content?.trim() ?? "";
    res.json({ translated }); // result returned to browser; nothing retained server-side
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.error(
      { err, srcLang, tgtLang, textLen: text.length, isTimeout },
      isTimeout ? "Translation timed out (>12 s)" : "Translation failed",
    );
    res.status(isTimeout ? 503 : 500).json({
      error: isTimeout ? "Translation timed out — please retry" : "Translation failed",
    });
  }
});

export default router;
