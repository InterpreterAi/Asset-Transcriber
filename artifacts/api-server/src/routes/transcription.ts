import { Router } from "express";
import { db, usersTable, sessionsTable, glossaryEntriesTable, referralsTable } from "@workspace/db";
import { eq, and, isNull, or, lt, sql, desc, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireJsonObjectBody } from "../middlewares/aiRequestValidation.js";
import { getUserWithResetCheck, isTrialExpired, touchActivity } from "../lib/usage.js";
import { findTermHints } from "../data/terminology.js";
import {
  initInterpreterGlossaries,
  applyGlossaryPlaceholders,
  restoreGlossaryPlaceholders,
  glossaryPlaceholderPromptRule,
} from "../lib/interpreter-glossary.js";
import {
  initProtectedTerms,
  applyProtectedTermPlaceholders,
  restoreProtectedTermPlaceholders,
  protectedPlaceholderPromptRule,
} from "../lib/protected-terms.js";
import {
  applyNumberPlaceholders,
  restoreNumberPlaceholders,
  numberPlaceholderPromptRule,
} from "../lib/number-placeholders.js";
import { applyInterpreterPhrasePretranslate } from "../lib/interpreter-phrase-pretranslate.js";
import { logger } from "../lib/logger.js";
import { sessionStore } from "../lib/session-store.js";
import { isOpenAiConfigured } from "../lib/ai-env.js";
import { openai } from "../lib/openai-client.js";
import { getSonioxMasterApiKey } from "../lib/soniox-env.js";
import { TRIAL_DAILY_LIMIT_MINUTES } from "../lib/trial-constants.js";
import { hasSubmittedMandatoryFeedbackToday, isMandatoryFeedbackRequiredByUsage } from "../lib/feedback-gate.js";

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

// ── API cost rates ─────────────────────────────────────────────────────────
// Soniox: $0.0025 per transcription-minute (= per 60 s of audio).
const SONIOX_COST_PER_MIN = 0.0025;
// gpt-4o-mini pricing (per token):
//   Input  $0.15 / 1M tokens → $1.5e-7 per token
//   Output $0.60 / 1M tokens → $6.0e-7 per token
const OPENAI_INPUT_COST_PER_TOKEN  = 0.00000015;
const OPENAI_OUTPUT_COST_PER_TOKEN = 0.00000060;

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

const router = Router();
router.use(requireJsonObjectBody);

/** Daily cap applies only when the account has a positive per-day limit (trial/paid). `dailyLimitMinutes <= 0` must not block (avoids legacy bad rows where `used >= 0` always). */
function isDailyTranscriptionCapReached(user: { minutesUsedToday: number; dailyLimitMinutes: number }): boolean {
  const cap = Number(user.dailyLimitMinutes);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return Number(user.minutesUsedToday) >= cap;
}

type SessionDiagCounters = {
  transcriptionSegments: number;
  translationSegments: number;
  dashboardUpdates: number;
};

const diagCounters = new Map<number, SessionDiagCounters>();
const diagSegmentSeq = new Map<number, number>();
const diagLastTranslatedBySession = new Map<number, { segmentId: string; translated: string }>();

function diagNowIso(): string {
  return new Date().toISOString();
}

function ensureDiagCounter(sessionId: number): SessionDiagCounters {
  const current = diagCounters.get(sessionId);
  if (current) return current;
  const seeded: SessionDiagCounters = {
    transcriptionSegments: 0,
    translationSegments: 0,
    dashboardUpdates: 0,
  };
  diagCounters.set(sessionId, seeded);
  return seeded;
}

function nextDiagSegmentId(sessionId: number): string {
  const n = (diagSegmentSeq.get(sessionId) ?? 0) + 1;
  diagSegmentSeq.set(sessionId, n);
  return `seg-${n}`;
}

const SONIOX_TEMP_KEY_URL = "https://api.soniox.com/v1/auth/temporary-api-key";

/** Prefer short-lived keys for the browser WebSocket (Soniox-recommended); fall back to master key if the REST call fails. */
async function getSonioxKeyForClient(masterKey: string): Promise<{ apiKey: string; expiresIn: number }> {
  try {
    const res = await fetch(SONIOX_TEMP_KEY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${masterKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: 3600,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, snippet: body.slice(0, 240) },
        "Soniox temporary-api-key failed; using master SONIOX_API_KEY for WebSocket",
      );
      return { apiKey: masterKey, expiresIn: 3600 };
    }
    const data = (await res.json()) as { api_key?: string; expires_at?: string };
    if (!data.api_key) {
      logger.warn("Soniox temporary-api-key: missing api_key in body; using master key");
      return { apiKey: masterKey, expiresIn: 3600 };
    }
    let expiresIn = 3600;
    if (data.expires_at) {
      const t = Date.parse(data.expires_at);
      if (!Number.isNaN(t)) {
        expiresIn = Math.max(60, Math.min(3600, Math.round((t - Date.now()) / 1000)));
      }
    }
    return { apiKey: data.api_key, expiresIn };
  } catch (err) {
    logger.warn({ err }, "Soniox temporary-api-key request error; using master key");
    return { apiKey: masterKey, expiresIn: 3600 };
  }
}

// ── /token ─────────────────────────────────────────────────────────────────
router.post("/token", requireAuth, async (req, res) => {
  try {
    const user = await getUserWithResetCheck(req.session.userId!);
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    if (!user.isActive) { res.status(403).json({ error: "Account is disabled" }); return; }

    // Only block on trial expiry when the user is still on the trial plan
    if (user.planType === "trial" && isTrialExpired(user)) {
      res.status(403).json({ error: "Trial expired — please upgrade." });
      return;
    }

    if (isDailyTranscriptionCapReached(user)) {
      res.status(403).json({
        error:
          user.planType === "trial"
            ? `Daily trial limit reached (${TRIAL_DAILY_LIMIT_MINUTES / 60} hours). Try again tomorrow.`
            : "Daily usage limit reached. Try again tomorrow.",
      });
      return;
    }
    if (isMandatoryFeedbackRequiredByUsage(user)) {
      const submitted = await hasSubmittedMandatoryFeedbackToday(user.id);
      if (!submitted) {
        res.status(403).json({
          error: "Daily feedback required before starting another session.",
          code: "FEEDBACK_REQUIRED",
        });
        return;
      }
    }

    // Global safety cap
    if (await isGlobalCapReached()) {
      res.status(503).json({ error: "System temporarily unavailable. Please try again later." });
      return;
    }

    const masterKey = getSonioxMasterApiKey();
    if (!masterKey) {
      res.status(503).json({
        error:
          "Transcription is unavailable: set SONIOX_API_KEY (or SONIOX_STT_API_KEY) on this API service in Railway, then redeploy.",
        code: "TRANSCRIPTION_NOT_CONFIGURED",
      });
      return;
    }

    const { apiKey, expiresIn } = await getSonioxKeyForClient(masterKey);
    res.json({ apiKey, expiresIn });
  } catch (err) {
    logger.error({ err }, "POST /api/transcription/token failed");
    res.status(503).json({
      error: "Could not issue a transcription token. Try again or contact support.",
      code: "TRANSCRIPTION_TOKEN_ERROR",
    });
  }
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
      // Do not bill wall-clock time: the client never reported processed audio (tab close / refresh).
      // Daily limits must reflect only audio seconds credited via POST /session/stop.
      await db
        .update(sessionsTable)
        .set({
          endedAt:               now,
          durationSeconds:        0,
          audioSecondsProcessed: 0,
          sonioxCost:            "0",
          totalSessionCost:      sql`COALESCE(translation_cost, 0)`,
        })
        .where(eq(sessionsTable.id, s.id));
      sessionStore.delete(s.id);
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

/** When true, the client sends only a newly appended source tail; model must return only that fragment's translation. */
const STREAMING_FRAGMENT_RULES =
  `STREAMING FRAGMENT MODE:\n` +
  `The user message is ONLY a newly appended tail of a longer live utterance (not the full sentence).\n` +
  `Translate ONLY that tail. Output ONLY the translation of the tail — no quotation marks, labels, or preamble.\n` +
  `Do NOT repeat or restate text that would duplicate translations already shown for earlier words.\n` +
  `If the tail is grammatically incomplete, translate it literally without inventing subjects, objects, or context the speaker did not say.\n\n`;

/** Neutral professional output register for the target language (medical/legal interpreting). */
const OUTPUT_REGISTER_ZH_CN =
  "Standard Mandarin in Simplified Chinese script (简体), professional register — no regional slang.";
const OUTPUT_REGISTER_ZH_TW =
  "Standard Mandarin in Traditional Chinese script (繁體), professional register — no regional slang.";

const OUTPUT_REGISTER_BY_BASE: Record<string, string> = {
  ar: "Modern Standard Arabic (MSA / فصحى). Do NOT use dialect particles such as: ليش، شو، مو، هيك، زي، كده، عشان، وين، فين، إزاي، ليه.",
  bg: "Standard Bulgarian — professional medical/legal register, no regional slang.",
  hr: "Standard Croatian — professional medical/legal register.",
  cs: "Standard Czech — professional medical/legal register.",
  da: "Standard Danish — professional medical/legal register.",
  nl: "Standard Dutch (Netherlands norm) — professional medical/legal register.",
  en: "Standard international English — professional medical/legal register.",
  fa: "Standard Iranian Persian (Farsi) — professional medical/legal register.",
  fi: "Standard Finnish — professional medical/legal register.",
  fr: "Neutral international French — professional medical/legal register, avoid heavy regional slang.",
  de: "Standard High German (Hochdeutsch) — professional medical/legal register.",
  el: "Standard Modern Greek — professional medical/legal register.",
  he: "Standard Modern Hebrew — professional medical/legal register.",
  hi: "Standard Hindi — professional medical/legal register.",
  hu: "Standard Hungarian — professional medical/legal register.",
  id: "Formal standard Indonesian (Bahasa Indonesia) — professional medical/legal register.",
  it: "Standard Italian — professional medical/legal register.",
  ja: "Standard Japanese, polite neutral form — professional medical/legal register.",
  ko: "Standard Korean (Seoul norm) — professional medical/legal register.",
  ms: "Standard Bahasa Melayu — professional medical/legal register.",
  nb: "Standard Norwegian Bokmål — professional medical/legal register.",
  pl: "Standard Polish — professional medical/legal register.",
  pt: "Neutral international Portuguese — avoid strong regional slang; professional medical/legal register.",
  ro: "Standard Romanian — professional medical/legal register.",
  ru: "Standard Russian — professional medical/legal register.",
  sk: "Standard Slovak — professional medical/legal register.",
  es: "Neutral Latin American Spanish — professional medical/legal register, avoid heavy regional slang.",
  sv: "Standard Swedish — professional medical/legal register.",
  th: "Standard Thai — professional medical/legal register.",
  tr: "Standard Turkish — professional medical/legal register.",
  uk: "Standard Ukrainian — professional medical/legal register.",
  ur: "Standard Urdu — professional medical/legal register.",
  vi: "Standard Vietnamese — professional medical/legal register.",
};

function targetOutputRegisterInstructions(tgtLangCode: string, tgtDisplayName: string): string {
  const lc = tgtLangCode.toLowerCase();
  const base = lc.split("-")[0] ?? lc;
  if (base === "zh") {
    const line =
      lc.includes("tw") || lc.includes("hant") ? OUTPUT_REGISTER_ZH_TW : OUTPUT_REGISTER_ZH_CN;
    return `TARGET OUTPUT REGISTER: ${line}\n\n`;
  }
  const spec =
    OUTPUT_REGISTER_BY_BASE[base] ??
    `Standard professional ${tgtDisplayName} suitable for medical/legal interpreting — avoid regional slang and colloquialisms.`;
  return `TARGET OUTPUT REGISTER: ${spec}\n\n`;
}

// ── Translation output language validator ──────────────────────────────────
// Maps BCP-47 base codes to the Unicode ranges that MUST dominate the output
// text for that language. Latin-script languages are omitted (no reliable
// range check — they overlap too much).
const SCRIPT_RANGES: Record<string, [number, number][]> = {
  ar:  [[0x0600, 0x06FF]],
  fa:  [[0x0600, 0x06FF]],
  ur:  [[0x0600, 0x06FF]],
  he:  [[0x0590, 0x05FF]],
  hi:  [[0x0900, 0x097F]],
  mr:  [[0x0900, 0x097F]],
  ne:  [[0x0900, 0x097F]],
  ru:  [[0x0400, 0x04FF]],
  uk:  [[0x0400, 0x04FF]],
  bg:  [[0x0400, 0x04FF]],
  el:  [[0x0370, 0x03FF]],
  th:  [[0x0E00, 0x0E7F]],
  ko:  [[0xAC00, 0xD7AF], [0x1100, 0x11FF]],
  zh:  [[0x4E00, 0x9FFF], [0x3400, 0x4DBF]],
  ja:  [[0x3040, 0x30FF], [0x4E00, 0x9FFF]],
  ka:  [[0x10A0, 0x10FF]],
  hy:  [[0x0530, 0x058F]],
};

// Returns true if the translated text is written in the expected script for
// tgtCode, or if we have no script expectation for that code (Latin etc.).
// Threshold: ≥ 50 % of non-ASCII meaningful characters must be in the range.
function matchesTargetScript(text: string, tgtCode: string): boolean {
  const ranges = SCRIPT_RANGES[tgtCode];
  if (!ranges) return true; // Latin-script target — cannot validate by script

  const nonAscii = [...text].filter(c => (c.codePointAt(0) ?? 0) > 0x007F);
  if (nonAscii.length < 3) return true; // too short to evaluate reliably

  const inRange = nonAscii.filter(c => {
    const cp = c.codePointAt(0)!;
    return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  });

  return inRange.length / nonAscii.length >= 0.50;
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

  if (isDailyTranscriptionCapReached(user)) {
    res.status(403).json({
      error:
        user.planType === "trial"
          ? `Daily trial limit reached (${TRIAL_DAILY_LIMIT_MINUTES / 60} hours). Try again tomorrow.`
          : "Daily usage limit reached. Try again tomorrow.",
    });
    return;
  }
  if (isMandatoryFeedbackRequiredByUsage(user)) {
    const submitted = await hasSubmittedMandatoryFeedbackToday(user.id);
    if (!submitted) {
      res.status(403).json({
        error: "Daily feedback required before starting another session.",
        code: "FEEDBACK_REQUIRED",
      });
      return;
    }
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
    // Close orphaned rows (refresh / lost stop) without billing wall-clock time — only
    // POST /session/stop with client-reported audio seconds updates daily usage.
    for (const orphan of openSessions) {
      await db
        .update(sessionsTable)
        .set({
          endedAt:               now,
          durationSeconds:        0,
          audioSecondsProcessed: 0,
          sonioxCost:            "0",
          totalSessionCost:      sql`COALESCE(translation_cost, 0)`,
        })
        .where(eq(sessionsTable.id, orphan.id));
      sessionStore.delete(orphan.id);
    }
  }

  const result = await db
    .insert(sessionsTable)
    .values({ userId: user.id, startedAt: new Date(), lastActivityAt: new Date(), langPair })
    .returning();

  void touchActivity(user.id);

  void db
    .update(referralsTable)
    .set({
      status: "active",
      sessionsCount: sql`COALESCE(${referralsTable.sessionsCount}, 0) + 1`,
    })
    .where(
      and(
        eq(referralsTable.referredUserId, user.id),
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

  // Billable duration = audio seconds processed in this session (client measures PCM sent to Soniox).
  const audioSeconds = Math.min(Math.max(0, Math.floor(Number(durationSeconds) || 0)), 3 * 60 * 60);
  const minutesUsed = audioSeconds / 60;
  const sonioxCost  = +(minutesUsed * SONIOX_COST_PER_MIN).toFixed(6);

  await db.update(sessionsTable)
    .set({
      endedAt:               new Date(),
      durationSeconds:       audioSeconds,
      audioSecondsProcessed: audioSeconds,
      sonioxCost:            String(sonioxCost),
      // totalSessionCost = soniox + whatever translation cost was accumulated during the session
      totalSessionCost: sql`${sonioxCost} + COALESCE(translation_cost, 0)`,
    })
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

  const diagCounter = ensureDiagCounter(sessionId);
  diagCounter.dashboardUpdates += 1;
  const lastTranslated = diagLastTranslatedBySession.get(sessionId);
  const dashboardHasLastSegment =
    Boolean(lastTranslated?.translated) && (translation ?? "").includes(lastTranslated!.translated);
  logger.info(
    {
      ts: diagNowIso(),
      stage: "broadcast_to_dashboard",
      sessionId,
      segmentId: lastTranslated?.segmentId ?? null,
      dashboardHasLastSegment,
      counters: diagCounter,
    },
    "TRANSCRIPTION_DIAG",
  );

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
  const {
    text,
    srcLang,
    tgtLang,
    sessionId: incomingSessionId,
    segmentId: incomingSegmentId,
    streamingDelta: rawStreamingDelta,
  } = req.body as {
    text?: string;
    srcLang?: string;
    tgtLang?: string;
    sessionId?: number;
    segmentId?: string;
    /** Client sends only a new source tail while live-transcribing; model returns only that fragment's translation. */
    streamingDelta?: boolean;
    isFinal?: boolean; // accepted but unused — kept for API compatibility
  };
  const streamingDelta = Boolean(rawStreamingDelta);

  if (!text?.trim() || !srcLang || !tgtLang) {
    res.status(400).json({ error: "text, srcLang, and tgtLang are required" });
    return;
  }

  if (!isOpenAiConfigured()) {
    res.status(503).json({
      error:
        "Translation is unavailable: set OPENAI_API_KEY, or AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY on the API server.",
      code: "TRANSLATION_NOT_CONFIGURED",
    });
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
    res.json({ translated: applyInterpreterPhrasePretranslate(text) });
    return;
  }

  // Pipeline: phrase cleanup → protected brands → interpreter glossary → digit placeholders → OpenAI.
  const phraseNormalized = applyInterpreterPhrasePretranslate(text);

  initProtectedTerms();
  const prot = applyProtectedTermPlaceholders(phraseNormalized);

  initInterpreterGlossaries();
  const { masked: afterGlossary, slotToEntryIndex, hadPlaceholders } = applyGlossaryPlaceholders(
    prot.masked,
  );
  const numMask = applyNumberPlaceholders(afterGlossary);
  const textForOpenAI = numMask.masked;

  const protMaxSlot =
    prot.slotToEntryIndex.size === 0 ? 0 : Math.max(...prot.slotToEntryIndex.keys());
  const glossaryMaxSlot =
    slotToEntryIndex.size === 0 ? 0 : Math.max(...slotToEntryIndex.keys());
  const numMaxSlot =
    numMask.slotToDigits.size === 0 ? 0 : Math.max(...numMask.slotToDigits.keys());

  const placeholderRules =
    (prot.hadPlaceholders && protMaxSlot > 0 ? protectedPlaceholderPromptRule(protMaxSlot) : "") +
    (hadPlaceholders && glossaryMaxSlot > 0 ? glossaryPlaceholderPromptRule(glossaryMaxSlot) : "") +
    (numMask.hadPlaceholders && numMaxSlot > 0 ? numberPlaceholderPromptRule(numMaxSlot) : "");

  function restoreTranslationOutput(raw: string): string {
    let t = raw;
    t = restoreNumberPlaceholders(t, numMask.slotToDigits);
    t = restoreGlossaryPlaceholders(t, slotToEntryIndex, tgtLang);
    t = restoreProtectedTermPlaceholders(t, prot.slotToEntryIndex, tgtLang);
    return t;
  }

  const termHints = findTermHints(phraseNormalized, srcLang, tgtLang);

  // ── User personal glossary ─────────────────────────────────────────────────
  // Load the user's saved glossary entries and add any that match the current text
  const userId = req.session.userId!;

  // Diagnostics only: resolve active session and segment IDs, then count stage events.
  let diagSessionId: number | null =
    typeof incomingSessionId === "number" && Number.isFinite(incomingSessionId) ? incomingSessionId : null;
  if (diagSessionId == null) {
    const [openSession] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.endedAt)))
      .orderBy(desc(sessionsTable.id))
      .limit(1);
    diagSessionId = openSession?.id ?? null;
  }
  const diagSid = diagSessionId ?? -1;
  const diagSegId =
    typeof incomingSegmentId === "string" && incomingSegmentId.trim()
      ? incomingSegmentId.trim()
      : nextDiagSegmentId(diagSid);
  const diagCounter = ensureDiagCounter(diagSid);
  diagCounter.transcriptionSegments += 1;
  logger.info(
    {
      ts: diagNowIso(),
      stage: "transcription_segment_received",
      sessionId: diagSid,
      segmentId: diagSegId,
      counters: diagCounter,
    },
    "TRANSCRIPTION_DIAG",
  );

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
  const lowerText = phraseNormalized.toLowerCase();
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

  const termRule = termHints.length > 0
    ? `- Use these exact glossary translations for the following terms:\n` +
      termHints.map(h => `  ${h}`).join("\n") + "\n"
    : "";

  // ── Build system prompt helper ─────────────────────────────────────────────
  // Accepts an optional forceOverride flag for the retry path; when true the
  // language-lock instruction is elevated to the very top of the prompt with
  // even stronger wording, and all domain-specific rules are stripped to keep
  // the model focused solely on getting the target language right.
  const buildSystemPrompt = (forceOverride: boolean, forStreamingDelta: boolean): string => {
    const frag = forStreamingDelta ? STREAMING_FRAGMENT_RULES : "";
    // Hard target-language lock — placed at the very start so it cannot be
    // overridden by anything later in the prompt.
    const langLock =
      `CRITICAL OUTPUT LANGUAGE RULE:\n` +
      `You MUST write your entire response in ${tgtName} — and ONLY in ${tgtName}.\n` +
      `Do NOT output any language other than ${tgtName}. ` +
      `Even if the input text resembles or contains words from another language, ` +
      `your translation output MUST be written exclusively in ${tgtName}.\n\n`;

    if (forceOverride) {
      return (
        langLock +
        frag +
        `You are a professional interpreter. ` +
        `Translate the following text from ${srcName} to ${tgtName}. ` +
        `Output ONLY the translated text in ${tgtName}. ` +
        `Do not use any other language. ` +
        `Return ONLY the translated text, nothing else.`
      );
    }

    return (
      langLock +
      frag +
      `You are a professional simultaneous interpreter in a live medical/legal call. ` +
      `Preserve the speaker's full meaning and intent accurately — do not summarize, simplify, omit nuance, or editorialize. ` +
      `Use correct medical and legal terminology in ${tgtName} when the speaker uses those domains (never invent terms they did not say).\n\n` +
      `SOURCE LANGUAGE: ${srcName}\n` +
      `TARGET LANGUAGE: ${tgtName} — ALL output must be in ${tgtName} only.\n\n`
    );
  };

  const systemPrompt =
    buildSystemPrompt(false, streamingDelta) +
    placeholderRules +
    targetOutputRegisterInstructions(tgtLang, tgtName) +
    `CORE RULE: Translate only what the speaker said. NEVER add facts, context, explanations, or assumptions they did not utter.\n\n` +

    `PRESERVE AMBIGUITY:\n` +
    `- If a word is ambiguous (e.g. "number", "case", "file", "account"), translate it with the same ambiguity.\n` +
    `- Do NOT resolve ambiguity by guessing. Examples:\n` +
    `  "my number" → "رقمي"  (NOT "رقم هاتفي" — the speaker did not say "phone number")\n` +
    `  "my case"   → "قضيتي" (NOT "حالتي الطبية" or "حالتي القانونية" — keep it neutral)\n` +
    `  "my file"   → "ملفي"  (NOT "ملفي الطبي" or "ملفي القانوني")\n\n` +

    `PROPER NAMES AND GEOGRAPHIC ENTITIES:\n` +
    `- Do NOT semantically translate personal names, city names, hospital/clinic names, or organization names.\n` +
    `- Transliterate them phonetically into the target script so they remain recognizable (e.g. "Las Vegas" → Arabic: لاس فيغاس).\n` +
    `- Ordinary common nouns and job titles are translated normally unless they are part of a proper name.\n\n` +

    `ACRONYMS AND ABBREVIATIONS:\n` +
    `- When the speaker uses an acronym or letter sequence that stands for a known concept (e.g. SSI, DNA, MRI), translate the MEANING into ${tgtName}.\n` +
    `- Use the full established term in the target language where one exists (e.g. Social Security benefits/SSI concept → appropriate ${tgtName} term).\n` +
    `- You may add a brief parenthetical with the original English acronym only if it helps clarity for the interpreter.\n` +
    `- If the meaning is truly unknown, transliterate the letters phonetically and do not invent an expansion.\n\n` +

    `NUMBERS, DATES, DOSAGES, AND UNITS:\n` +
    `- If the input contains NUM_1, NUM_2, … tokens, those mark exact digit strings from speech — copy each token exactly in place; never spell them as words and never use localized digit shapes for them.\n` +
    `- For all other numbers in plain text, preserve every digit and magnitude: do not round, merge, or reformat unless the target language requires a standard script-specific numeral form.\n` +
    `- Keep medical doses and measurement units accurate (e.g. "500 milligrams" must stay 500 mg equivalent in ${tgtName}, not an approximate amount).\n` +
    `- Reproduce IDs and codes exactly as spoken.\n\n` +

    `INTERPRETER INTRODUCTIONS:\n` +
    `- Interpreters often introduce themselves: "my name is X and my number is 3602"\n` +
    `- "my number" in this context is an interpreter ID, not a phone number.\n` +
    `- Translate exactly as spoken: "اسمي X ورقمي هو 3602" — never add "هاتفي" or "تليفوني"\n\n` +

    `WHEN IN DOUBT:\n` +
    `- Prefer faithful literal rendering over creative paraphrase.\n` +
    `- For full-sentence input, translate the complete utterance; in STREAMING FRAGMENT MODE, only the tail is provided — follow that mode strictly.\n\n` +

    `CONSISTENCY:\n` +
    `- Use the SAME word choice every time for the same term within the segment. Never swap synonyms mid-utterance without cause.\n\n` +

    `DOMAIN TERMINOLOGY (only when explicitly spoken):\n` +
    `- Medical: use precise clinical or lay equivalents in ${tgtName} matching the register the speaker used.\n` +
    `- Legal: use precise legal equivalents in ${tgtName} when the speaker uses legal language.\n` +
    `- Insurance/accident: use standard terms (collision, liability, claim, deductible, at-fault) only when the speaker uses them.\n` +
    arabicSourceRule +
    termRule +
    `OUTPUT:\n` +
    `- Return ONLY the translated text.\n` +
    `- No explanations, notes, alternatives, or the original source text.`;

  // ── OpenAI call with output-language validation + single retry ────────────
  // Returns the translated text and the real token counts for cost tracking.
  // Hard 12-second timeout per attempt — if OpenAI hangs, return 503.
  // Validation: after receiving the translation we check that the output
  // script matches the expected target language.  If it doesn't, we retry
  // once with a maximally-explicit override prompt.
  interface CallResult { text: string; promptTokens: number; completionTokens: number }

  async function callOpenAI(prompt: string, userContent: string): Promise<CallResult> {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 12_000);
    try {
      const resp = await openai.chat.completions.create(
        {
          model:       "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: prompt },
            { role: "user",   content: userContent },
          ],
        },
        { signal: controller.signal },
      );
      clearTimeout(timeoutId);
      return {
        text:             resp.choices[0]?.message?.content?.trim() ?? "",
        promptTokens:     resp.usage?.prompt_tokens     ?? 0,
        completionTokens: resp.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Fire-and-forget: accumulate real translation cost onto the user's open session.
  // We look up the open session by userId so the client never needs to pass sessionId.
  // Runs async — does not block the translate response.
  function accumulateCost(promptTokens: number, completionTokens: number): void {
    const callCost = +(
      promptTokens     * OPENAI_INPUT_COST_PER_TOKEN +
      completionTokens * OPENAI_OUTPUT_COST_PER_TOKEN
    ).toFixed(8);
    void db
      .update(sessionsTable)
      .set({
        translationTokens: sql`COALESCE(translation_tokens, 0) + ${promptTokens + completionTokens}`,
        translationCost:   sql`COALESCE(translation_cost,   0) + ${callCost}`,
      })
      .where(and(
        eq(sessionsTable.userId, userId),
        isNull(sessionsTable.endedAt),
      ));
  }

  try {
    logger.info(
      {
        ts: diagNowIso(),
        stage: "translation_request_sent",
        sessionId: diagSid,
        segmentId: diagSegId,
      },
      "TRANSCRIPTION_DIAG",
    );
    let result = await callOpenAI(systemPrompt, textForOpenAI);
    result = {
      ...result,
      text: restoreTranslationOutput(result.text),
    };

    // ── Output language validation ───────────────────────────────────────────
    // If the response is not in the expected script (e.g. Arabic returned when
    // target is Hindi), discard the bad output and retry once with the minimal
    // force-override prompt that has the language lock at the very top.
    // Restore placeholders before validation so TERM_n tokens do not skew script checks.
    if (result.text && !matchesTargetScript(result.text, tgtCode)) {
      logger.warn(
        { srcLang, tgtLang, tgtCode, textLen: text.length },
        "Translation output failed script validation — retrying with force-override prompt",
      );
      const retryPrompt = buildSystemPrompt(true, streamingDelta) + placeholderRules;
      const retry = await callOpenAI(retryPrompt, textForOpenAI);
      // Accumulate cost for the retry attempt regardless of its output quality.
      accumulateCost(retry.promptTokens, retry.completionTokens);

      const retryRestored = restoreTranslationOutput(retry.text);

      if (retryRestored && matchesTargetScript(retryRestored, tgtCode)) {
        result = { ...retry, text: retryRestored };
      } else if (retryRestored) {
        logger.warn(
          { srcLang, tgtLang, tgtCode, textLen: text.length },
          "Force-override retry also failed script validation — using retry output",
        );
        result = { ...retry, text: retryRestored };
      }
    }

    // Accumulate cost for the primary call (after validation so we always count it).
    accumulateCost(result.promptTokens, result.completionTokens);

    diagCounter.translationSegments += 1;
    diagLastTranslatedBySession.set(diagSid, { segmentId: diagSegId, translated: result.text });
    logger.info(
      {
        ts: diagNowIso(),
        stage: "translation_response_received",
        sessionId: diagSid,
        segmentId: diagSegId,
        translatedLength: result.text.length,
        counters: diagCounter,
      },
      "TRANSCRIPTION_DIAG",
    );

    res.json({ translated: result.text }); // result returned to browser; nothing retained server-side
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const upstreamStatus =
      err && typeof err === "object"
        ? (() => {
            const o = err as { status?: unknown; response?: { status?: unknown } };
            if (typeof o.status === "number" && Number.isFinite(o.status)) return o.status;
            const rs = o.response?.status;
            if (typeof rs === "number" && Number.isFinite(rs)) return rs;
            return undefined;
          })()
        : undefined;

    let statusCode = 500;
    let body: { error: string; code?: string } = { error: "Translation failed" };

    if (isTimeout) {
      statusCode = 503;
      body = { error: "Translation timed out — please retry" };
    } else if (upstreamStatus === 401 || upstreamStatus === 403) {
      statusCode = 503;
      body = {
        code: "OPENAI_AUTH_FAILED",
        error:
          "Translation is unavailable: OpenAI rejected the API key (401/403). Check OPENAI_API_KEY or integration keys on this Railway service and redeploy.",
      };
    } else if (upstreamStatus === 429) {
      statusCode = 503;
      body = {
        code: "OPENAI_RATE_LIMITED",
        error: "Translation is temporarily unavailable (OpenAI rate limit). Try again in a minute.",
      };
    } else if (upstreamStatus === 402) {
      statusCode = 503;
      body = {
        code: "OPENAI_BILLING",
        error: "Translation is unavailable: OpenAI returned a billing/payment error. Check your OpenAI account billing.",
      };
    }

    logger.error(
      { err, srcLang, tgtLang, textLen: text.length, isTimeout, upstreamStatus },
      isTimeout ? "Translation timed out (>12 s)" : "Translation failed",
    );
    res.status(statusCode).json(body);
  }
});

export default router;
