import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTranscriptionToken, useStartSession, useStopSession } from "@workspace/api-client-react";
import { buildSonioxInterpreterContext } from "@/lib/interpreter-stt-context";
import {
  getTranslationTypographyMeta,
  wrapAsciiDigitRunsWithLtrSpans,
} from "@/lib/wrap-ltr-numbers";

/** Matches `ApiError` from api-client-react without importing (project ref .d.ts can lag). */
function getTranscriptionTokenFailureCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { name?: string; data?: { code?: string } | null };
  if (e.name !== "ApiError") return undefined;
  const c = e.data?.code;
  return typeof c === "string" ? c : undefined;
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { name?: string; data?: { error?: string } | null };
  if (e.name !== "ApiError") return undefined;
  const msg = e.data?.error;
  return typeof msg === "string" ? msg : undefined;
}

/**
 * Soniox often sends a non-final hypothesis that repeats the tail already committed
 * as finals (e.g. after a question). Concatenating final + NF verbatim duplicates
 * that phrase in `liveBufferRef` and then bakes it into the transcript when NF clears.
 */
function mergeFinalWithNonFinalHypothesis(finalPart: string, nf: string): string {
  const n = nf.trim();
  if (!n) return finalPart;
  const fTrim = finalPart.trimEnd();
  if (!fTrim) return n;
  if (fTrim.endsWith(n)) return fTrim;
  const fLow = fTrim.toLowerCase();
  const nLow = n.toLowerCase();
  if (fLow.endsWith(nLow)) return fTrim;
  if (n.startsWith(fTrim) || nLow.startsWith(fLow)) return n;
  const maxLen = Math.min(fTrim.length, n.length);
  for (let k = maxLen; k >= 1; k--) {
    if (fTrim.slice(-k) === n.slice(0, k)) return fTrim + n.slice(k);
  }
  return fTrim + n;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TARGET_RATE         = 16000;
const SONIOX_WS_URL       = "wss://stt-rt.soniox.com/transcribe-websocket";
const FINAL_TEXT_RENDER_BUFFER_MS = 80;
const EST_TOKENS_PER_CHAR = 0.25;
const OPENAI_INPUT_COST_PER_TOKEN = 0.00000015; // mirrors server constant
const OPENAI_OUTPUT_COST_PER_TOKEN = 0.00000060; // mirrors server constant
// Silence segmentation thresholds.
// - pause < SHORT_PAUSE_MS: keep writing in current segment
// - pause >= LONG_PAUSE_MS: close/finalize current segment
const SHORT_PAUSE_MS = 650;
const SHORT_PAUSE_MS_FAST = 120;
const LONG_PAUSE_MS  = 1200;
const EARLY_HINT_MIN_WORDS = 8;
const LIVE_PREVIEW_WORD_STEP = 8;
// ── Speaker color palette ──────────────────────────────────────────────────────
// Slot numbers start at 1. Index = slot - 1.
const MAX_SPEAKERS = 3;
const SPEAKER_COLORS = [
  // slot 1 — Blue
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1",
  // slot 2 — Green
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100 mb-1",
  // slot 3 — Orange
  "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-100 mb-1",
] as const;

// ── DOM class names ────────────────────────────────────────────────────────────
const CLS = {
  row:         "group relative grid grid-cols-2 gap-6 mb-3 rounded-lg hover:bg-muted/20 px-2 py-1.5 -mx-2 transition-colors",
  colOrig:     "min-w-0",
  colTrans:    "min-w-0",
  textRow:     "flex items-start gap-1",
  // font-size is controlled via --ts-font-size CSS variable (set by workspace)
  textLive:    "ts-text leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0",
  textFin:     "ts-text leading-relaxed text-foreground font-medium flex-1 min-w-0",
  /** Non-final / live hypothesis tail — render with normal style (no grey preview). */
  nf:          "",
  transText:   "ts-text leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transPend:   "ts-text leading-relaxed text-foreground/80 font-medium flex-1 min-w-0",
  transDisabled: "ts-text text-muted-foreground/55 italic flex-1 min-w-0 text-[0.92em] leading-snug",
} as const;

const TRANSLATION_PLATINUM_PLACEHOLDER =
  "InterpreterAI Translation is available on the Platinum plan.";

// ── Soniox v4 types ────────────────────────────────────────────────────────────
interface SonioxToken {
  text:      string;
  is_final:  boolean;
  speaker?:  number | string;
  language?: string;
}

interface SonioxMessage {
  tokens?:        SonioxToken[];
  finished?:      boolean;
  /** Legacy / alternate error shapes from Soniox */
  error?:         string;
  error_message?: string;
  error_code?:    number;
  code?:          number;
  message?:       string;
}

// ── Speaker normalization (temporal-LRU pool) ──────────────────────────────────
// Soniox v4 returns `speaker` as a string (e.g. "1"); older responses used numbers.
const _speakerMap  = new Map<string, number>();
const _slotLastMs  = new Map<number, number>();
let   _slotCount   = 0;

function resetSpeakerMap() { _speakerMap.clear(); _slotLastMs.clear(); _slotCount = 0; }

function speakerKey(rawId: number | string | undefined): string | undefined {
  if (rawId === undefined || rawId === null) return undefined;
  return String(rawId);
}

function normalizeSpeaker(rawId: number | string | undefined): { label: string; slot: number } {
  const key = speakerKey(rawId);
  if (key === undefined) return { label: "", slot: 0 };
  if (_speakerMap.has(key)) {
    const slot = _speakerMap.get(key)!;
    _slotLastMs.set(slot, Date.now());
    return { label: `Speaker ${slot}`, slot };
  }
  if (_slotCount < MAX_SPEAKERS) {
    _slotCount++;
    _speakerMap.set(key, _slotCount);
    _slotLastMs.set(_slotCount, Date.now());
    return { label: `Speaker ${_slotCount}`, slot: _slotCount };
  }
  let lruSlot = 1, lruMs = _slotLastMs.get(1) ?? 0;
  for (let s = 2; s <= _slotCount; s++) {
    const t = _slotLastMs.get(s) ?? 0;
    if (t < lruMs) { lruMs = t; lruSlot = s; }
  }
  _speakerMap.set(key, lruSlot);
  _slotLastMs.set(lruSlot, Date.now());
  return { label: `Speaker ${lruSlot}`, slot: lruSlot };
}

function sameSpeaker(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  return String(a) === String(b);
}

// ── Language-pair helpers ──────────────────────────────────────────────────────
// Compare two BCP-47 codes loosely (e.g. "zh-CN" matches "zh").
function matchesLang(detected: string, selected: string): boolean {
  const d = detected.toLowerCase();
  const s = selected.toLowerCase();
  return d === s || d.split("-")[0] === s.split("-")[0];
}

function langInSelectedPair(lang: string, pair: { a: string; b: string }): boolean {
  return matchesLang(lang, pair.a) || matchesLang(lang, pair.b);
}

// Given a detected language code and the selected {a, b} pair, return the
// target language code: if detected is B → translate to A, otherwise → B.
// This makes the translation always go to the OPPOSITE of what was spoken.
function resolveTarget(detectedLang: string, pair: { a: string; b: string }): string {
  return matchesLang(detectedLang, pair.b) ? pair.a : pair.b;
}

// ── Multi-script Unicode validation ───────────────────────────────────────────
// Soniox occasionally misidentifies spoken language — especially for short or
// accented segments. We cross-validate its language tag against the dominant
// Unicode script of the actual transcribed text, then override only when the
// evidence is strong (≥ 60 % of meaningful script characters) and the correct
// language is present in the user's selected pair.
//
// Works for every language pair, not just Arabic ↔ English.
//
// Applied at TWO points in the pipeline:
//   1. When Soniox reports a language tag on any token  (detection-time fix)
//   2. Inside dispatchTranslation before the API call   (dispatch-time guard)

// Each entry groups one or more Unicode ranges under a canonical script name
// and lists the BCP-47 base codes that primarily use that script.
const UNICODE_SCRIPTS: {
  name:   string;
  ranges: [number, number][];
  langs:  string[];
}[] = [
  // Latin — basic block + full extended Latin block
  {
    name:   "Latin",
    ranges: [[0x0041, 0x007A], [0x00C0, 0x024F]],
    langs:  ["en","fr","de","es","pt","it","nl","pl","cs","ro","tr",
             "vi","id","ms","hu","sv","da","nb","fi","hr","sk","sl",
             "et","lv","lt","ga","cy","eu","ca","gl","af","sw","tl"],
  },
  // Arabic / Persian / Urdu — all use the Arabic script block
  {
    name:   "Arabic",
    ranges: [[0x0600, 0x06FF]],
    langs:  ["ar","fa","ur"],
  },
  // Hebrew
  {
    name:   "Hebrew",
    ranges: [[0x0590, 0x05FF]],
    langs:  ["he"],
  },
  // Greek
  {
    name:   "Greek",
    ranges: [[0x0370, 0x03FF]],
    langs:  ["el"],
  },
  // Cyrillic — Russian, Ukrainian, Bulgarian, Serbian, Macedonian
  {
    name:   "Cyrillic",
    ranges: [[0x0400, 0x04FF]],
    langs:  ["ru","uk","bg","sr","mk","be","kk","ky","mn"],
  },
  // Devanagari — Hindi, Marathi, Nepali
  {
    name:   "Devanagari",
    ranges: [[0x0900, 0x097F]],
    langs:  ["hi","mr","ne"],
  },
  // Thai
  {
    name:   "Thai",
    ranges: [[0x0E00, 0x0E7F]],
    langs:  ["th"],
  },
  // Georgian
  {
    name:   "Georgian",
    ranges: [[0x10A0, 0x10FF]],
    langs:  ["ka"],
  },
  // Armenian
  {
    name:   "Armenian",
    ranges: [[0x0530, 0x058F]],
    langs:  ["hy"],
  },
  // Hangul (Korean syllables + jamo)
  {
    name:   "Hangul",
    ranges: [[0x1100, 0x11FF], [0xAC00, 0xD7AF]],
    langs:  ["ko"],
  },
  // CJK Unified Ideographs — shared by Chinese and Japanese
  {
    name:   "CJK",
    ranges: [[0x4E00, 0x9FFF], [0x3400, 0x4DBF], [0xF900, 0xFAFF]],
    langs:  ["zh","ja"],
  },
  // Hiragana — uniquely Japanese
  {
    name:   "Hiragana",
    ranges: [[0x3040, 0x309F]],
    langs:  ["ja"],
  },
  // Katakana — uniquely Japanese
  {
    name:   "Katakana",
    ranges: [[0x30A0, 0x30FF]],
    langs:  ["ja"],
  },
  // Gujarati
  {
    name:   "Gujarati",
    ranges: [[0x0A80, 0x0AFF]],
    langs:  ["gu"],
  },
  // Bengali
  {
    name:   "Bengali",
    ranges: [[0x0980, 0x09FF]],
    langs:  ["bn"],
  },
  // Tamil
  {
    name:   "Tamil",
    ranges: [[0x0B80, 0x0BFF]],
    langs:  ["ta"],
  },
  // Telugu
  {
    name:   "Telugu",
    ranges: [[0x0C00, 0x0C7F]],
    langs:  ["te"],
  },
  // Kannada
  {
    name:   "Kannada",
    ranges: [[0x0C80, 0x0CFF]],
    langs:  ["kn"],
  },
  // Malayalam
  {
    name:   "Malayalam",
    ranges: [[0x0D00, 0x0D7F]],
    langs:  ["ml"],
  },
];

function scriptEntryLangs(scriptName: string): string[] {
  return UNICODE_SCRIPTS.find((s) => s.name === scriptName)?.langs ?? [];
}

/** BCP-47 bases using Latin script — shared polish with English/Portuguese/Spanish (any en↔X pair). */
const LATIN_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Latin"));
/** ar, fa, ur */
const ARABIC_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Arabic"));
const CYRILLIC_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Cyrillic"));
const HEBREW_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Hebrew"));
const GREEK_SCRIPT_TARGET_LANGS = new Set(scriptEntryLangs("Greek"));
const HANGUL_TARGET_LANG_BASES = new Set(scriptEntryLangs("Hangul"));
/** zh + ja (ideographic/kana output). */
const CJK_TARGET_LANG_BASES = new Set<string>([
  ...scriptEntryLangs("CJK"),
  ...scriptEntryLangs("Hiragana"),
  ...scriptEntryLangs("Katakana"),
]);

// Returns true when `lang` (BCP-47, e.g. "zh-CN") is listed in `langs`.
// Matching is base-code prefix: "zh-CN" matches "zh".
function scriptSupportsLang(langs: string[], lang: string): boolean {
  const base = lang.split("-")[0]!.toLowerCase();
  return langs.some(l => l === base || base.startsWith(l) || l.startsWith(base));
}

// Detects the dominant Unicode script in `text`.
// Returns { name, langs } for the script if it is dominant (≥ 60 % of all
// meaningful script characters), or null if the text is too short / too mixed
// to draw a confident conclusion.
function detectDominantScript(
  text: string,
): { name: string; langs: string[] } | null {
  // Strip whitespace, digits, and common punctuation — count only script chars.
  const stripped = text.replace(/[\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\u200B-\u200F\u2000-\u206F]/g, "");
  if (stripped.length < 4) return null;

  // Accumulate character counts per script (by name, merging multi-range scripts).
  const counts = new Map<string, { count: number; langs: string[] }>();
  for (let i = 0; i < stripped.length; ) {
    const cp = stripped.codePointAt(i)!;
    // Advance past surrogate pairs for supplementary chars.
    i += cp > 0xFFFF ? 2 : 1;

    for (const script of UNICODE_SCRIPTS) {
      let matched = false;
      for (const [lo, hi] of script.ranges) {
        if (cp >= lo && cp <= hi) { matched = true; break; }
      }
      if (matched) {
        const cur = counts.get(script.name);
        if (cur) {
          cur.count += 1;
        } else {
          counts.set(script.name, { count: 1, langs: script.langs });
        }
        break; // each code point belongs to at most one script
      }
    }
  }

  if (counts.size === 0) return null;

  // Find the script with the highest count and compute total.
  let dominant: { name: string; count: number; langs: string[] } | null = null;
  let total = 0;
  for (const [name, { count, langs }] of counts) {
    total += count;
    if (!dominant || count > dominant.count) {
      dominant = { name, count, langs };
    }
  }

  // Require ≥ 60 % dominance — below that the text is too mixed to be certain.
  if (!dominant || dominant.count / total < 0.60) return null;

  return { name: dominant.name, langs: dominant.langs };
}

// Cross-validates Soniox's language tag against the dominant Unicode script of
// the token text.  Only overrides when:
//   1. The dominant script is detected with ≥ 60 % confidence.
//   2. Soniox's tag does NOT use that script.
//   3. Exactly one side of the user's selected pair uses that script.
// Returns the corrected BCP-47 code, or sonioxLang unchanged if no override.
function validateLangByScript(
  sonioxLang: string,
  tokenText:  string,
  pair:       { a: string; b: string },
): string {
  const dominant = detectDominantScript(tokenText);
  if (!dominant) return sonioxLang; // too short / too mixed — trust Soniox

  // If Soniox already agrees with the dominant script, nothing to fix.
  if (scriptSupportsLang(dominant.langs, sonioxLang)) return sonioxLang;

  // Soniox disagrees with the dominant script.
  // Find which side of the pair uses the detected script.
  const aFits = scriptSupportsLang(dominant.langs, pair.a);
  const bFits = scriptSupportsLang(dominant.langs, pair.b);

  // Override only when exactly one side of the pair matches — unambiguous.
  if (aFits && !bFits) return pair.a;
  if (bFits && !aFits) return pair.b;

  // Both or neither pair language uses this script — cannot safely override.
  return sonioxLang;
}

// ── Translation fetch ──────────────────────────────────────────────────────────
// sourceLang: BCP-47 code auto-detected by Soniox (e.g. "en", "ar", "fr").
// targetLang: BCP-47 code resolved from the language pair (always the opposite).
//
// Primary: POST /api/transcription/translate (OpenAI on API server).
// On primary API failure we now skip that update (no public fallback) to avoid
// mixed-language corruption during live interpreter use.
//
// Retry policy (primary only):
//   • Network errors / timeouts  → retry up to MAX_ATTEMPTS with back-off
//   • HTTP 5xx / 429             → retry up to MAX_ATTEMPTS with back-off
//   • HTTP 401 / 403             → try public fallback before surfacing error
//   • Other 4xx                  → no retry (bad request)
//   • Fatal 503 codes            → try public fallback before surfacing error
type PrimaryTranslationResult =
  | { outcome: "ok"; text: string }
  | { outcome: "try_fallback"; userMessage?: string };

type TranslateApiOptions = {
  streamingDelta?: boolean;
  /** Server adds final-segment correction instructions (full utterance after finalize). */
  isFinal?: boolean;
};

async function translateViaPrimaryApi(
  text: string,
  sourceLang: string,
  targetLang: string,
  options?: TranslateApiOptions,
): Promise<PrimaryTranslationResult> {
  const isFinal = Boolean(options?.isFinal);
  const MAX_ATTEMPTS = isFinal ? 2 : 1;
  // Live requests send the full cumulative transcript; long medical turns exceed a flat 2.2s
  // often — abort → empty response → translation column freezes at the last good snapshot.
  const REQUEST_TIMEOUT_MS = isFinal
    ? 9_000
    : Math.min(16_000, 2_800 + text.length * 28);
  const fatal503Codes = new Set([
    "TRANSLATION_NOT_CONFIGURED",
    "OPENAI_AUTH_FAILED",
    "OPENAI_RATE_LIMITED",
    "OPENAI_BILLING",
    "OPENAI_WRONG_LANGUAGE",
  ]);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch("/api/transcription/translate", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        signal:      controller.signal,
        body:        JSON.stringify({
          text,
          srcLang:        sourceLang,
          tgtLang:        targetLang,
          streamingDelta: Boolean(options?.streamingDelta),
          isFinal:        Boolean(options?.isFinal),
        }),
      });
      clearTimeout(timeoutId);
      if (r.ok) {
        const d = await r.json() as { translated?: string };
        return { outcome: "ok", text: d.translated?.trim() ?? "" };
      }

      if (r.status === 503) {
        const raw = await r.text();
        try {
          const j = JSON.parse(raw) as { code?: string; error?: string };
          if (j.code && fatal503Codes.has(j.code)) {
            return {
              outcome:     "try_fallback",
              userMessage: j.error ??
                (j.code === "TRANSLATION_NOT_CONFIGURED"
                  ? "Translation is unavailable: configure OpenAI on the API server."
                  : "Translation is temporarily unavailable."),
            };
          }
        } catch {
          /* fall through to retry */
        }
      }

      if (r.status === 403) {
        const raw403 = await r.text();
        try {
          const j403 = JSON.parse(raw403) as { code?: string };
          if (j403.code === "TRANSLATION_PLAN_REQUIRED") {
            return { outcome: "ok", text: "" };
          }
        } catch {
          /* fall through */
        }
        return {
          outcome:     "try_fallback",
          userMessage: "Session expired or access denied — refresh the page and sign in again.",
        };
      }

      if (r.status === 401) {
        return {
          outcome:     "try_fallback",
          userMessage: "Session expired or access denied — refresh the page and sign in again.",
        };
      }

      if (r.status >= 400 && r.status < 500 && r.status !== 429) {
        return { outcome: "ok", text: "" };
      }

      if (attempt === MAX_ATTEMPTS) {
        return {
          outcome:     "try_fallback",
          userMessage:
            "Translation service returned an error — try again. If it persists, check API logs and OpenAI key/billing.",
        };
      }
    } catch {
      clearTimeout(timeoutId);
      if (attempt === MAX_ATTEMPTS) {
        return {
          outcome:     "try_fallback",
          userMessage:
            "Cannot reach the translation service (timeout or network error). If transcription still works, the API may be paused or OpenAI may be misconfigured on the server.",
        };
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise<void>(res => setTimeout(res, 700 * attempt));
    }
  }
  return {
    outcome:     "try_fallback",
    userMessage: "Translation service unavailable.",
  };
}

type FetchTranslationOptions = TranslateApiOptions & {
  /** Full segment source when `text` is a delta — used if public fallback runs (needs whole sentence). */
  fullSegmentForFallback?: string;
};

type FetchTranslationResult = {
  text: string;
  /** Public fallback translated the full segment while we were in delta mode — replace the cell, do not append. */
  replaceStreamColumn: boolean;
};

async function fetchTranslation(
  text: string,
  sourceLang: string,
  targetLang: string,
  onTranslationIssue?: (message: string) => void,
  options?: FetchTranslationOptions,
): Promise<FetchTranslationResult> {
  const primary = await translateViaPrimaryApi(text, sourceLang, targetLang, options);
  if (primary.outcome === "ok") {
    return { text: primary.text, replaceStreamColumn: false };
  }

  // Public fallback can introduce mixed-language or delayed rewrites.
  // Keep interpreter output stable: if primary fails, skip this update.
  if (primary.userMessage) onTranslationIssue?.(primary.userMessage);
  return { text: "", replaceStreamColumn: false };
}

// ── Admin click-to-copy ────────────────────────────────────────────────────────
// For admin users only: clicking any transcription/translation text paragraph
// copies its content to the clipboard and flashes a brief green highlight.
function wireClickToCopy(el: HTMLElement): void {
  el.style.cursor = "pointer";
  el.title        = "Click to copy";
  el.addEventListener("click", () => {
    const text = el.textContent?.trim() ?? "";
    if (!text || text === "…") return;
    void navigator.clipboard.writeText(text).then(() => {
      const prev = el.style.backgroundColor;
      el.style.transition      = "background-color 0.15s";
      el.style.backgroundColor = "rgba(34,197,94,0.15)";
      setTimeout(() => { el.style.backgroundColor = prev; }, 700);
    });
  });
}

// ── Copy button (all users) ────────────────────────────────────────────────────
// Renders a small clipboard icon that appears on row hover. Clicking it copies
// the text returned by getTextFn() and briefly shows a checkmark confirmation.
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function makeCopyBtn(getTextFn: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type      = "button";
  btn.title     = "Copy";
  btn.className = "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start mt-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 focus:outline-none";
  btn.innerHTML = COPY_ICON;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = getTextFn().trim();
    if (!text || text === "…") return;
    void navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add("text-green-500");
      setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove("text-green-500");
      }, 1200);
    });
  });
  return btn;
}

// Apply inline font-size/line-height that inherit the CSS variables set by workspace.
function applyTextStyle(el: HTMLElement) {
  el.style.fontSize   = "var(--ts-font-size, 14px)";
  el.style.lineHeight = "var(--ts-line-height, 1.625)";
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** If the new fragment repeats the last word of the prior translation, drop that repeat (e.g. شكراً + شكراً لاتصالك). */
function trimDuplicateBoundaryWord(prev: string, piece: string): string {
  const p = piece.trim();
  if (!p) return piece;
  const prevLast = prev.trim().split(/\s+/).pop() ?? "";
  const firstMatch = p.match(/^(\S+)/u);
  const first = firstMatch?.[1] ?? "";
  if (prevLast && first && prevLast === first) {
    return p.slice(first.length).trimStart();
  }
  return piece;
}

/** Consecutive duplicate tokens (all targets — matches Arabic/English hygiene). */
function dedupeConsecutiveTranslationTokens(raw: string): string {
  const t = collapseWs(raw);
  const toks = t.split(/\s+/).filter(Boolean);
  const deduped: string[] = [];
  for (const w of toks) {
    if (deduped.length && deduped[deduped.length - 1] === w) continue;
    deduped.push(w);
  }
  return deduped.join(" ");
}

function tokenOverlapRatio(a: string, b: string): number {
  const ta = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tb = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return 0;
  const setA = new Set(ta);
  let hit = 0;
  for (const w of tb) if (setA.has(w)) hit++;
  return hit / Math.max(ta.length, tb.length);
}

/**
 * Generic trailing sentence dedupe for all languages.
 * Some models emit a paraphrased re-close right after the real final sentence.
 */
export function dropTrailingRepeatedSentence(raw: string): string {
  const t = collapseWs(raw);
  const sents = t.split(/(?<=[.!?؟。！？])\s+/u).map((s) => s.trim()).filter(Boolean);
  if (sents.length < 2) return t;
  const last = sents[sents.length - 1]!;
  const prev = sents[sents.length - 2]!;
  if (last.length < 16 || prev.length < 16) return t;
  const r = tokenOverlapRatio(prev, last);
  if (r >= 0.52) return collapseWs(sents.slice(0, -1).join(" "));
  return t;
}

/**
 * Dedupe consecutive identical tokens, trim junk leading punctuation, collapse
 * doubled marks, fix split "? … لليوم؟" from incremental errors.
 */
function polishArabicInterpreterTranslation(raw: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  t = t.replace(/^[.؟!،。'"“”\s\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.؟!?])\1+/g, "$1");
  t = t.replace(/([^؟?\n]+)[؟?]\s*لليوم[؟?]\s*$/u, "$1 اليوم؟");
  // Live + final often append two paraphrases of the same closing (e.g. "…وأشعر…" + "كانت هذه واحدة أخرى…").
  const sents = t.split(/(?<=[.!?؟])\s+/u).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 12 && prev.length >= 12 && tokenOverlapRatio(prev, last) >= 0.4) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/** Hebrew translation column: same token hygiene + ?-tail dedupe as Latin/Cyrillic. */
function polishHebrewInterpreterTranslation(raw: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  t = t.replace(/^[.?!،。'"“”\s\u0590-\u05FF\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.?!?])\1+/g, "$1");
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(/(?<=[.?!])\s+/u).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14 && tokenOverlapRatio(prev, last) >= 0.48) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/**
 * Latin-script targets (en, fr, de, es, pt, it, nl, …): English-only phrase cleanup +
 * duplicate question/sentence tails (same family of fixes as en↔ar live output).
 */
function polishLatinScriptInterpreterTranslation(raw: string, targetBase: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  if (targetBase === "en") {
    t = t.replace(/\?\s*Complete confidentiality, right\?$/i, "?");
    t = t.replace(/,\s*okay\?\s+Complete confidentiality, right\?$/i, ", okay?");
    t = t.replace(/\bokay\?\s+Complete confidentiality, right\?$/i, "okay?");
  }
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(/(?<=[.?!])\s+/u).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14) {
      const r = tokenOverlapRatio(prev, last);
      if (r >= 0.48) return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/** Cyrillic, Greek, and similar: ?/. ! tail echoes without English-specific regexes. */
function polishQuestionMarkFamilyTargetTranslation(raw: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(/(?<=[.?!])\s+/u).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14 && tokenOverlapRatio(prev, last) >= 0.48) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

function polishCjkTargetTranslation(raw: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  t = t.replace(/([。！？?!])\1+/gu, "$1");
  return collapseWs(t);
}

/** Remaining scripts (th, hi, …): token dedupe + generic doubled sentence punctuation. */
function polishGenericTargetTranslation(raw: string): string {
  let t = dedupeConsecutiveTranslationTokens(raw);
  t = t.replace(/([.!?。！？؟])\1+/gu, "$1");
  return collapseWs(t);
}

/** Drop a trailing clause that repeats the previous question segment (live PT/ES often echoes the closing). */
function trimOverlappingDuplicateQuestionTail(raw: string): string {
  let t = collapseWs(raw);
  for (let pass = 0; pass < 2; pass++) {
    const positions: number[] = [];
    for (let i = 0; i < t.length; i++) if (t[i] === "?") positions.push(i);
    if (positions.length < 2) break;
    const i2 = positions[positions.length - 1];
    const i1 = positions[positions.length - 2];
    const between = t.slice(i1 + 1, i2).trim();
    const after = t.slice(i2 + 1).trim().replace(/\?+$/u, "").trim();
    if (between.length >= 4 && after.length >= 8) {
      const r = tokenOverlapRatio(between, after);
      const bl = between.toLowerCase();
      const al = after.toLowerCase();
      if (r >= 0.38 || al.includes(bl) || bl.includes(al)) {
        t = collapseWs(t.slice(0, i2 + 1));
        continue;
      }
    }
    if (after.length <= 1 && between.length >= 3 && positions.length >= 3) {
      const i0 = positions[positions.length - 3];
      const earlier = t.slice(i0 + 1, i1).trim();
      if (tokenOverlapRatio(earlier, between) >= 0.45) {
        t = collapseWs(t.slice(0, i1 + 1));
        continue;
      }
    }
    break;
  }
  return t;
}

/**
 * Post-process live translation for the *target* column by script family so every
 * language pair (e.g. en↔de, en↔hi, ar↔fr) gets the same class of fixes as en↔ar.
 */
function maybePolishTranslationForTarget(text: string, targetLang: string): string {
  const base = targetLang.split("-")[0]?.toLowerCase() ?? "";
  if (!base) return dropTrailingRepeatedSentence(text);
  let out: string;
  if (ARABIC_SCRIPT_TARGET_LANGS.has(base)) out = polishArabicInterpreterTranslation(text);
  else if (HEBREW_SCRIPT_TARGET_LANGS.has(base)) out = polishHebrewInterpreterTranslation(text);
  else if (LATIN_SCRIPT_TARGET_LANGS.has(base)) out = polishLatinScriptInterpreterTranslation(text, base);
  else if (CYRILLIC_SCRIPT_TARGET_LANGS.has(base) || GREEK_SCRIPT_TARGET_LANGS.has(base)) {
    out = polishQuestionMarkFamilyTargetTranslation(text);
  } else if (CJK_TARGET_LANG_BASES.has(base)) out = polishCjkTargetTranslation(text);
  else if (HANGUL_TARGET_LANG_BASES.has(base)) out = polishQuestionMarkFamilyTargetTranslation(text);
  else out = polishGenericTargetTranslation(text);
  return dropTrailingRepeatedSentence(out);
}

/**
 * Append a streaming fragment. The model often re-echoes prior Arabic or returns an
 * overlapping continuation — merge by suffix/prefix overlap or prefer the longer
 * coherent run when it clearly supersedes what is already shown.
 */
export function mergeStreamingTranslation(prevDisplayed: string, newPiece: string): string {
  const prev = prevDisplayed.trim();
  let piece = trimDuplicateBoundaryWord(prev, newPiece);
  piece = piece.trim();
  if (!piece) return prev;
  if (!prev || prev === "…") return piece;
  if (prev === piece || prev.endsWith(piece)) return prev;
  const prevC = collapseWs(prev);
  const pieceC = collapseWs(piece);
  if (pieceC === prevC) return prev;
  // Full/near-full model rewrites: prefer the newer coherent run instead of appending
  // another copy of the same idea (common in English↔Spanish live turns).
  if (tokenOverlapRatio(prevC, pieceC) >= 0.72 && pieceC.length >= prevC.length * 0.85) {
    return pieceC;
  }
  if (pieceC.startsWith(prevC)) return piece;
  if (prevC.startsWith(pieceC)) return prev;
  // Keep contiguous number chunks together (e.g. "36" + "02" => "3602").
  if (/\d$/.test(prev) && /^\d/.test(piece)) return `${prev}${piece}`;

  const pl = prev.toLowerCase();
  const pil = piece.toLowerCase();
  const maxOverlap = Math.min(prev.length, piece.length, 160);
  for (let len = maxOverlap; len >= 4; len--) {
    if (pl.slice(-len) === pil.slice(0, len)) {
      return collapseWs(prev + piece.slice(len));
    }
  }

  return collapseWs(`${prev} ${piece}`);
}

function hasVisibleText(text: string | null | undefined): boolean {
  return Boolean(text && text.trim().length > 0);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Longest common prefix length between two strings (case-insensitive, per code unit). */
function lcpLenInsensitive(a: string, b: string): number {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  return i;
}

/** Returns the newly appended tail using prefix/overlap matching (case-insensitive). */
function sourceTailAfterPrefix(fullRaw: string, prefixRaw: string): { tail: string; monotonic: boolean } {
  const full = fullRaw.trimStart();
  const prefix = prefixRaw.trimEnd();
  if (!prefix) return { tail: full, monotonic: true };
  if (full.startsWith(prefix)) return { tail: full.slice(prefix.length).trimStart(), monotonic: true };
  const f = full.toLowerCase();
  const p = prefix.toLowerCase();
  if (f.startsWith(p)) return { tail: full.slice(p.length).trimStart(), monotonic: true };
  // Soniox interim hypotheses can revise a little. Accept append overlap:
  // find the largest suffix of previous source that is a prefix of current.
  const maxK = Math.min(prefix.length, full.length);
  for (let k = maxK; k >= 1; k--) {
    const sfx = p.slice(p.length - k);
    if (f.startsWith(sfx)) return { tail: full.slice(k).trimStart(), monotonic: true };
  }
  // Mid-string edits (e.g. punctuation inserted) break strict prefix but share a long LCP.
  const lcp = lcpLenInsensitive(full, prefix);
  const minRecover = Math.max(4, Math.min(32, Math.floor(prefix.length * 0.12) || 8));
  if (lcp >= minRecover && lcp < full.length) {
    const tail = full.slice(lcp).trimStart();
    if (tail.length > 0) return { tail, monotonic: true };
  }
  return { tail: "", monotonic: false };
}


function applyTranslationTypography(el: HTMLParagraphElement, merged: string): void {
  const { rtl, arabicScript } = getTranslationTypographyMeta(merged);
  el.dir             = rtl ? "rtl" : "ltr";
  el.style.textAlign = rtl ? "right" : "";
  if (rtl) {
    if (arabicScript) {
      el.lang      = "ar";
      el.className = CLS.transText + " ts-arabic";
    } else {
      el.lang      = "he";
      el.className = CLS.transText;
    }
    el.innerHTML = wrapAsciiDigitRunsWithLtrSpans(merged);
  } else {
    el.removeAttribute("lang");
    el.className = CLS.transText;
    el.textContent = merged;
  }
}

// ── Per-bubble translation state ───────────────────────────────────────────────
// Each segment gets its own isolated state object. dispatchTranslation closures
// capture the state object at the time of dispatch, so in-flight requests from
// a previous segment can NEVER write into a later segment's DOM element.
interface BubbleTransState {
  segmentId:          string;
  transTextEl:       HTMLParagraphElement;
  seq:               number;   // incremented on every dispatch FOR THIS bubble
  lastShownSeq:      number;   // highest seq whose result was written to DOM
  lastShownLen:      number;   // char length of last shown translation (for stabilization)
  finalizing:        boolean;  // true once softFinalize has been called — blocks in-flight polls
  translationLocked: boolean;  // true after first finalized translation — no further updates
  /** Source prefix already reflected in the translation column (streaming); final pass replaces all. */
  streamCommittedSource: string;
  /** At most one in-flight primary translation per segment while polling (avoids overlapping deltas). */
  streamInflight:        boolean;
  /** Last normalized live source seen (final + NF). */
  lastLiveSource:        string;
  /** Timestamp when lastLiveSource changed. */
  lastLiveSourceTs:      number;
  /** One-time early non-final translation hint for this segment. */
  earlyHintSent:         boolean;
  /** Word count at the last non-final preview dispatch. */
  lastPreviewWordsSent:  number;
  /** Count of finalized tokens committed in this segment. */
  finalTokensSeen:       number;
  /** Last observed raw NF text used for append-only NF rendering. */
  lastNfRawText:         string;
  /** Latest normalized, confirmed (final-only) source text for this segment. */
  lastConfirmedSource:   string;
  /** Last confirmed source already dispatched for live translation. */
  lastConfirmedSourceTranslated: string;
  /** Latest live source queued while a non-final request is in-flight. */
  pendingLiveSource: string;
  /** Locked source language for this segment (set once from first visible token with a language tag). */
  segmentSourceLang:     string | null;
  /** Locked target language (opposite side of selected pair). */
  segmentTargetLang:     string | null;
  /**
   * Live path skipped a truncated API response but still advanced `streamCommittedSource`.
   * Finalize must run a full translate — otherwise `sourceTailAfterPrefix` sees no tail and locks
   * with a partial translation still on screen.
   */
  needsFullFinalTranslation: boolean;
}

type TranslationTriggerReason = "segment_finalize" | "early_hint" | "language_passthrough";

type TranslationDiag = {
  callCount: number;
  estimatedTokensTotal: number;
  perSegmentCalls: Map<string, number>;
  callTimestampsMs: number[];
  lastInputMeta: { segmentId: string; chars: number; words: number } | null;
  redundantCalls: number;
};

export type UseTranscriptionOptions = {
  /** Fired when finalized transcript/translation lines are appended for admin live view (debounce in parent). */
  onAdminSnapshotBuffersUpdated?: () => void;
  /** When false, skips OpenAI translation calls and shows a Platinum upgrade hint in the translation column. */
  translationEnabled?: boolean;
  /** True for Basic/Professional/Trial-Libre plans that use LibreTranslate. */
  useLibreTranslate?: boolean;
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription(isAdmin = false, options?: UseTranscriptionOptions) {
  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  const onAdminSnapshotBuffersUpdatedRef = useRef<(() => void) | undefined>(undefined);
  onAdminSnapshotBuffersUpdatedRef.current = options?.onAdminSnapshotBuffersUpdated;

  const translationEnabledRef = useRef(options?.translationEnabled ?? true);
  useEffect(() => {
    translationEnabledRef.current = options?.translationEnabled ?? true;
  }, [options?.translationEnabled]);

  const useLibreTranslateRef = useRef(options?.useLibreTranslate ?? false);
  useEffect(() => {
    useLibreTranslateRef.current = options?.useLibreTranslate ?? false;
  }, [options?.useLibreTranslate]);

  const [isRecording,   setIsRecording]   = useState(false);
  const [micLevel,      setMicLevel]      = useState(0);
  const [error,         setError]         = useState<string | null>(null);
  const [translationServiceError, setTranslationServiceError] = useState<string | null>(null);
  const [audioInfo,     setAudioInfo]     = useState<string>("");
  const [hasTranscript, setHasTranscript] = useState(false);
  const [sessionId,     setSessionId]     = useState<number | null>(null);
  /** True for the full `start()` path (not just token/session HTTP) so the UI cannot re-enable Start mid-setup. */
  const [startBusy, setStartBusy] = useState(false);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const workletRef   = useRef<AudioWorkletNode | null>(null);
  const streamsRef   = useRef<MediaStream[]>([]);
  const isRecRef     = useRef(false);
  const startInFlightRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  /** PCM sample-seconds sent toward Soniox (mono @ TARGET_RATE) — used for daily limits, not wall clock. */
  const audioPcmSecondsRef = useRef(0);

  // ── Direct-to-DOM transcript refs ─────────────────────────────────────────
  const containerRef      = useRef<HTMLDivElement | null>(null);
  const currentSpeakerRef = useRef<string | undefined>(undefined);
  /** PCM chunks while WebSocket is still CONNECTING — avoids dropped audio and Soniox timeouts. */
  const pcmBacklogRef     = useRef<ArrayBuffer[]>([]);
  const activeBubbleRef   = useRef<HTMLSpanElement | null>(null);  // final-text span
  const activeBubbleNFRef = useRef<HTMLSpanElement | null>(null);  // NF span
  const finalCountRef     = useRef(0);
  const detectedLangRef      = useRef<string>("en");
  // The user's selected language pair {a, b}. Per-segment target is computed
  // dynamically: if detected matches b → translate to a; otherwise translate to b.
  const langPairRef       = useRef<{ a: string; b: string }>({ a: "en", b: "ar" });
  const styleUpgradedRef  = useRef(false);

  // ── Per-bubble translation state ───────────────────────────────────────────
  // Each call to createBubble creates a fresh BubbleTransState. Closures in
  // dispatchTranslation capture it — so old bubbles' in-flight requests stay
  // bound to their own element and can never bleed into a new bubble.
  const activeBubbleStateRef = useRef<BubbleTransState | null>(null);

  // ── Translation polling refs ───────────────────────────────────────────────
  // liveBufferRef: segment text seen so far (finals + NF). Updated every onmessage.
  const liveBufferRef        = useRef<string>("");
  /** Batch OpenAI live full-buffer replaces so the target column does not rephrase every token tick. */
  const OPENAI_LIVE_DEBOUNCE_MS = 160;
  const openaiLiveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openaiLiveDebouncePayloadRef = useRef<{ text: string; lang: string; segmentId: string } | null>(
    null,
  );
  const dispatchTranslationRef = useRef<
    (
      text: string,
      lang: string,
      isFinal?: boolean,
      options?: { lockOnFinal?: boolean; skipOpenAiLiveDebounce?: boolean },
      segmentIdLock?: string,
    ) => void
  >(() => {});
  // setInterval handle.
  const finalRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalRenderQueueRef = useRef<Array<{ target: HTMLSpanElement; text: string }>>([]);
  const segmentSeqRef = useRef(0);
  const translationDiagRef = useRef<TranslationDiag>({
    callCount: 0,
    estimatedTokensTotal: 0,
    perSegmentCalls: new Map(),
    callTimestampsMs: [],
    lastInputMeta: null,
    redundantCalls: 0,
  });

  const cancelOpenAiLiveDebounce = useCallback(() => {
    if (openaiLiveDebounceTimerRef.current !== null) {
      clearTimeout(openaiLiveDebounceTimerRef.current);
      openaiLiveDebounceTimerRef.current = null;
    }
    openaiLiveDebouncePayloadRef.current = null;
  }, []);

  const flushFinalTextRenderQueue = useCallback(() => {
    if (finalRenderTimerRef.current !== null) {
      clearTimeout(finalRenderTimerRef.current);
      finalRenderTimerRef.current = null;
    }
    const q = finalRenderQueueRef.current;
    if (q.length === 0) return;
    finalRenderQueueRef.current = [];
    for (const { target, text } of q) {
      if (!target.isConnected) continue;
      target.textContent = (target.textContent ?? "") + text;
    }
  }, []);

  const scheduleFinalTextRenderFlush = useCallback(() => {
    if (finalRenderTimerRef.current !== null) return;
    finalRenderTimerRef.current = setTimeout(() => {
      finalRenderTimerRef.current = null;
      flushFinalTextRenderQueue();
    }, FINAL_TEXT_RENDER_BUFFER_MS);
  }, [flushFinalTextRenderQueue]);

  const getBufferedFinalTextForActiveBubble = useCallback((): string => {
    const active = activeBubbleRef.current;
    if (!active) return "";
    let pending = "";
    for (const item of finalRenderQueueRef.current) {
      if (item.target === active) pending += item.text;
    }
    return pending;
  }, []);

  // ── Silence / pause detection ──────────────────────────────────────────────
  // Reset every time tokens arrive. Fires softFinalize() + bubble reset only after
  // LONG_PAUSE_MS of no Soniox activity closes/finalizes current segment.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SHORT_PAUSE_MS of no tokens triggers non-final translation preview only.
  const shortPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Snapshot accumulators for admin "View Session" ────────────────────────
  // Finalized transcript/translation lines are appended here on each segment.
  // getSnapshot() returns them joined. Cleared when recording stops.
  const transcriptBufRef  = useRef<string[]>([]);
  const translationBufRef = useRef<string[]>([]);

  // ── Session safety timers ──────────────────────────────────────────────────
  // inactivityTimerRef: fires stop() after 5 min of no speech tokens.
  // maxSessionTimerRef: fires stop() after 3 hours unconditionally.
  // resetInactivityRef: shared function set by start(), called by buildWs onmessage.
  // heartbeatIntervalRef: pings /session/heartbeat every 30 s to prevent the
  //   server from treating the session as stale after a page navigation or
  //   temporary disconnect.
  const inactivityTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxSessionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetInactivityRef   = useRef<(() => void) | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes
  const MAX_SESSION_MS        = 3 * 60 * 60 * 1000; // 3 hours

  const startSessionMut = useStartSession();
  const stopSessionMut  = useStopSession();
  const getTokenMut     = useGetTranscriptionToken();

  const translationConfigReporterRef = useRef<(msg: string) => void>(() => {});
  translationConfigReporterRef.current = (msg: string) => {
    setTranslationServiceError((prev) => prev ?? msg);
  };

  // ── scrollPanel ────────────────────────────────────────────────────────────
  const scrollPanel = useCallback((force = false) => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (force) { el.scrollTop = el.scrollHeight; return; }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // ── dispatchTranslation ────────────────────────────────────────────────────
  // Fires a translation request for the active bubble's text.
  //
  // Isolation: captures `state` (per-bubble object) at call time — old requests
  //   always write to the correct bubble's DOM element even after speaker switch.
  //
  // Monotonic gate (per-bubble): a result is accepted only if its seq number
  //   is greater than the last seq already shown FOR THIS BUBBLE. This handles
  //   out-of-order arrivals while still showing every result in order.
  //
  // Live OpenAI (isFinal=false): full cumulative source + replace column; requests are
  //   debounced ~160ms to limit mid-stream rephrasing. Pause/final/pending use skip debounce.
  // Live Libre: full source per tick, replace. Final OpenAI tail-only may still merge.
  // Final (isFinal=true): tail-only delta when monotonic, else lock rules apply.
  const dispatchTranslation = useCallback((
    text: string,
    lang: string,
    isFinal = false,
    options?: { lockOnFinal?: boolean; skipOpenAiLiveDebounce?: boolean },
    segmentIdLock?: string,
  ) => {
    const state = activeBubbleStateRef.current;
    if (!state || text.length < 3) return;
    const requestSegmentId = segmentIdLock ?? state.segmentId;
    if (requestSegmentId !== state.segmentId) return;

    if (!translationEnabledRef.current) return;
    if (!isFinal && text === state.lastConfirmedSourceTranslated) return;

    // Lock guard: once a finalized translation has been written for this
    // segment, never overwrite it — not from polling, not from re-finalization.
    if (state.translationLocked) return;
    const lockOnFinal = options?.lockOnFinal ?? true;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const chars = text.length;

    const pair = langPairRef.current;
    const detectedLive = detectedLangRef.current;
    const dom = detectDominantScript(text);
    const outOfPairByScript =
      dom !== null &&
      !scriptSupportsLang(dom.langs, pair.a) &&
      !scriptSupportsLang(dom.langs, pair.b);
    let dispatchLangRaw = validateLangByScript(detectedLive, text, pair);
    if (!langInSelectedPair(dispatchLangRaw, pair)) {
      const domNow = detectDominantScript(text);
      if (domNow) {
        const aFits = scriptSupportsLang(domNow.langs, pair.a);
        const bFits = scriptSupportsLang(domNow.langs, pair.b);
        if (aFits !== bFits) dispatchLangRaw = aFits ? pair.a : pair.b;
      }
    }
    if (!state.segmentSourceLang && langInSelectedPair(dispatchLangRaw, pair)) {
      state.segmentSourceLang = dispatchLangRaw;
    }
    const dispatchLang = state.segmentSourceLang ?? dispatchLangRaw;

    // Third language (not A or B): mirror transcript in the translation column — no API.
    // Use live Soniox detection + dominant script so a locked "English" segment does not
    // keep translating after the speaker switches to Arabic (or any script outside the pair).
    if (outOfPairByScript || !langInSelectedPair(dispatchLang, pair)) {
      console.info(
        "[translation_call]",
        `time=${new Date(Date.now()).toISOString()}`,
        `segment_id=${state.segmentId}`,
        "reason=language_passthrough",
        `is_final=${isFinal ? "true" : "false"}`,
        `buffer_words=${words}`,
        `buffer_chars=${chars}`,
        "estimated_tokens=0",
      );
      state.seq += 1;
      const mySeq = state.seq;
      const { transTextEl } = state;
      if (mySeq > state.lastShownSeq && transTextEl.isConnected && !state.translationLocked) {
        state.lastShownSeq = mySeq;
        state.lastShownLen = text.length;
        applyTranslationTypography(transTextEl, text);
        state.streamCommittedSource = text;
        if (isFinal && lockOnFinal) {
          state.translationLocked = true;
          if (translationBufRef.current.length > 0) {
            translationBufRef.current[translationBufRef.current.length - 1] = text.trim();
            onAdminSnapshotBuffersUpdatedRef.current?.();
          }
        }
        scrollPanel();
      }
      return;
    }

    // Source/target follow the current in-pair language (stable per segment once locked).
    const myTargetLang = resolveTarget(dispatchLang, pair);
    state.segmentSourceLang = dispatchLang;
    state.segmentTargetLang = myTargetLang;
    const { transTextEl } = state;

    // ── Same-language guard (Rule 5/6) ────────────────────────────────────────
    if (matchesLang(dispatchLang, myTargetLang)) {
      state.seq += 1;
      const mySeq = state.seq;
      if (mySeq > state.lastShownSeq && transTextEl.isConnected && !state.translationLocked) {
        state.lastShownSeq = mySeq;
        state.lastShownLen = text.length;
        transTextEl.dir             = "";
        transTextEl.style.textAlign = "";
        transTextEl.removeAttribute("lang");
        transTextEl.className       = CLS.transText;
        transTextEl.textContent     = text;
        state.streamCommittedSource = text;
        if (isFinal) {
          state.translationLocked = true;
          if (translationBufRef.current.length > 0) {
            translationBufRef.current[translationBufRef.current.length - 1] = text.trim();
            onAdminSnapshotBuffersUpdatedRef.current?.();
          }
        }
        scrollPanel();
      }
      return;
    }

    const reason: TranslationTriggerReason = isFinal ? "segment_finalize" : "early_hint";
    const estimatedTokens = Math.max(1, Math.round(chars * EST_TOKENS_PER_CHAR));
    const nowMs = Date.now();
    const diag = translationDiagRef.current;
    diag.callCount += 1;
    diag.estimatedTokensTotal += estimatedTokens;
    diag.callTimestampsMs.push(nowMs);
    diag.perSegmentCalls.set(
      state.segmentId,
      (diag.perSegmentCalls.get(state.segmentId) ?? 0) + 1,
    );
    if (diag.lastInputMeta?.segmentId === state.segmentId) {
      const cDiff = Math.abs(diag.lastInputMeta.chars - chars);
      const wDiff = Math.abs(diag.lastInputMeta.words - words);
      if (cDiff <= 8 && wDiff <= 2) {
        diag.redundantCalls += 1;
        console.info(
          "[translation_redundant]",
          `time=${new Date(nowMs).toISOString()}`,
          `segment_id=${state.segmentId}`,
          `chars_prev=${diag.lastInputMeta.chars}`,
          `chars_now=${chars}`,
          `words_prev=${diag.lastInputMeta.words}`,
          `words_now=${words}`,
        );
      }
    }
    diag.lastInputMeta = { segmentId: state.segmentId, chars, words };
    console.info(
      "[translation_call]",
      `time=${new Date(nowMs).toISOString()}`,
      `segment_id=${state.segmentId}`,
      `reason=${reason}`,
      `is_final=${isFinal ? "true" : "false"}`,
      `buffer_words=${words}`,
      `buffer_chars=${chars}`,
      `estimated_tokens=${estimatedTokens}`,
    );

    if (
      !isFinal &&
      !useLibreTranslateRef.current &&
      !options?.skipOpenAiLiveDebounce
    ) {
      openaiLiveDebouncePayloadRef.current = { text, lang, segmentId: requestSegmentId };
      if (openaiLiveDebounceTimerRef.current !== null) {
        clearTimeout(openaiLiveDebounceTimerRef.current);
      }
      openaiLiveDebounceTimerRef.current = setTimeout(() => {
        openaiLiveDebounceTimerRef.current = null;
        const p = openaiLiveDebouncePayloadRef.current;
        openaiLiveDebouncePayloadRef.current = null;
        if (!p) return;
        if (!isRecRef.current) return;
        const stNow = activeBubbleStateRef.current;
        if (!stNow || stNow.segmentId !== p.segmentId) return;
        if (stNow.translationLocked || stNow.finalizing) return;
        dispatchTranslationRef.current(
          p.text,
          p.lang,
          false,
          { skipOpenAiLiveDebounce: true },
          p.segmentId,
        );
      }, OPENAI_LIVE_DEBOUNCE_MS);
      return;
    }

    const useLibre = useLibreTranslateRef.current;
    // Only gate on in-flight for Libre mode. OpenAI live requests can be slow for long
    // utterances; waiting for one slow response causes "first lines then late catch-up".
    // Allow overlapping OpenAI live calls and rely on per-segment seq ordering to keep
    // only the newest coherent result visible.
    if (!isFinal && useLibre && state.streamInflight) {
      state.pendingLiveSource = text;
      return;
    }

    let requestIsFinal = isFinal;
    let apiText: string;
    let useStreamingDelta = false;
    if (isFinal) {
      const committed = collapseWs(state.streamCommittedSource);
      const finalSrc = collapseWs(text);
      const cl = committed.toLowerCase();
      const fl = finalSrc.toLowerCase();
      // Diarization often shortens the segment: live preview had another speaker's words in the
      // buffer, then the finalized transcript is only the first speaker's line. `streamCommittedSource`
      // still holds the longer string — tail-only logic would be non-monotonic and used to lock
      // without updating, leaving Arabic/English for removed text on the wrong row.
      const finalizedIsPrefixTruncation =
        finalSrc.length >= 1 &&
        committed.length > finalSrc.length &&
        (committed.startsWith(finalSrc) || cl.startsWith(fl));

      if (finalizedIsPrefixTruncation) {
        apiText = text;
        useStreamingDelta = false;
        requestIsFinal = true;
      } else {
        const { tail, monotonic } = sourceTailAfterPrefix(text, state.streamCommittedSource);
        // Final pass: if we already translated all seen source, just lock; if there is a tail, translate tail only.
        if (monotonic && !tail.trim()) {
          if (state.needsFullFinalTranslation) {
            apiText = text;
            useStreamingDelta = false;
            requestIsFinal = true;
          } else {
            state.translationLocked = true;
            return;
          }
        }
        if (monotonic && tail.trim()) {
          apiText = tail;
          useStreamingDelta = true;
          requestIsFinal = false;
        } else {
          // Any other non-monotonic finalize (revision, punctuation, etc.) — full replace from authoritative text.
          apiText = text;
          useStreamingDelta = false;
          requestIsFinal = true;
        }
      }
    } else if (!useLibre) {
      // OpenAI live: send full cumulative source and replace the translation cell.
      apiText = text;
      useStreamingDelta = false;
    } else {
      // Live mode translates the full current partial transcript every poll tick.
      apiText = text;
      useStreamingDelta = false;
    }

    state.seq += 1;
    const mySeq = state.seq;
    const trackInflight = !isFinal && useLibre;
    if (trackInflight) state.streamInflight = true;

    void (async () => {
      try {
        const { text: translated, replaceStreamColumn } = await fetchTranslation(
          apiText,
          dispatchLang,
          myTargetLang,
          (m) => translationConfigReporterRef.current(m),
          {
            streamingDelta:         useStreamingDelta && !requestIsFinal,
            fullSegmentForFallback: useStreamingDelta && !requestIsFinal ? text : undefined,
            isFinal: requestIsFinal,
          },
        );
        const responseSegmentId = requestSegmentId;
        if (responseSegmentId !== state.segmentId) return;

        if (mySeq <= state.lastShownSeq) return;
        if (!transTextEl.isConnected) return;
        if (state.translationLocked) return;
        if (!isFinal && state.finalizing) return;

        if (!translated) {
          return;
        }

        if (requestIsFinal) {
          const prevT = (transTextEl.textContent ?? "").trim();
          let out = maybePolishTranslationForTarget(translated, myTargetLang);
          // Only merge *tiny* final fragments onto live text. Larger finals are full rewrites — merging
          // concatenates a second paraphrase of the same ending (duplicate Arabic closure).
          if (
            prevT.length > 28 &&
            out.length > 0 &&
            out.length <= 56 &&
            out.length < prevT.length * 0.28 &&
            text.trim().length >= (state.streamCommittedSource ?? "").trim().length * 0.85
          ) {
            out = mergeStreamingTranslation(prevT, out);
            out = maybePolishTranslationForTarget(out, myTargetLang);
          }
          state.lastShownSeq = mySeq;
          state.lastShownLen = out.length;
          applyTranslationTypography(transTextEl, out);
          state.streamCommittedSource = text;
          state.needsFullFinalTranslation = false;
          if (lockOnFinal) {
            state.translationLocked = true;
            if (translationBufRef.current.length > 0) {
              translationBufRef.current[translationBufRef.current.length - 1] = out.trim();
              onAdminSnapshotBuffersUpdatedRef.current?.();
            }
          }
        } else if (useStreamingDelta) {
          if (replaceStreamColumn) {
            const prevT = (transTextEl.textContent ?? "").trim();
            let out = maybePolishTranslationForTarget(translated, myTargetLang);
            if (
              !requestIsFinal &&
              prevT.length > 16 &&
              out.length > 0 &&
              out.length < prevT.length * 0.4
            ) {
              // Don't freeze on short live snapshots; merge into what's already shown.
              out = maybePolishTranslationForTarget(
                mergeStreamingTranslation(prevT, out),
                myTargetLang,
              );
              state.needsFullFinalTranslation = false;
            } else {
              state.needsFullFinalTranslation = false;
            }
            state.lastShownSeq = mySeq;
            state.lastShownLen = out.length;
            applyTranslationTypography(transTextEl, out);
          } else {
            const merged = mergeStreamingTranslation(transTextEl.textContent ?? "", translated);
            const out = maybePolishTranslationForTarget(merged, myTargetLang);
            state.lastShownSeq = mySeq;
            state.lastShownLen = out.length;
            applyTranslationTypography(transTextEl, out);
            state.needsFullFinalTranslation = false;
          }
          state.streamCommittedSource = text;
          state.lastConfirmedSourceTranslated = text;
          if (isFinal && lockOnFinal) {
            // Final caller, but we intentionally handled it as delta append-only.
            state.translationLocked = true;
            if (translationBufRef.current.length > 0) {
              translationBufRef.current[translationBufRef.current.length - 1] = (
                transTextEl.textContent ?? ""
              ).trim();
              onAdminSnapshotBuffersUpdatedRef.current?.();
            }
          }
        } else {
          const prevT = (transTextEl.textContent ?? "").trim();
          let out = maybePolishTranslationForTarget(translated, myTargetLang);
          // Live full-cell refresh: ignore truncated snapshots while the source is still growing (timeouts/partials).
          if (
            !requestIsFinal &&
            prevT.length > 16 &&
            out.length > 0 &&
            out.length < prevT.length * 0.4 &&
            text.trim().length >= (state.streamCommittedSource ?? "").trim().length * 0.88
          ) {
            // Keep real-time flow: merge short snapshot instead of skipping updates.
            out = maybePolishTranslationForTarget(
              mergeStreamingTranslation(prevT, out),
              myTargetLang,
            );
            state.needsFullFinalTranslation = false;
          }
          state.lastShownSeq = mySeq;
          state.lastShownLen = out.length;
          applyTranslationTypography(transTextEl, out);
          state.streamCommittedSource = text;
          state.needsFullFinalTranslation = false;
          if (!requestIsFinal) state.lastConfirmedSourceTranslated = text;
        }

        scrollPanel();
      } catch {
        /* HIPAA — never log speech context */
      } finally {
        if (trackInflight) {
          state.streamInflight = false;
          const pending = state.pendingLiveSource.trim();
          state.pendingLiveSource = "";
          if (pending && pending !== state.lastConfirmedSourceTranslated && !state.finalizing && !state.translationLocked) {
            const langRetry = detectedLangRef.current;
            dispatchTranslation(pending, langRetry, false, { skipOpenAiLiveDebounce: true }, state.segmentId);
          }
        }
      }
    })();
  }, [scrollPanel]);

  useEffect(() => {
    dispatchTranslationRef.current = dispatchTranslation;
  }, [dispatchTranslation]);

  // ── stopTranslationInterval ────────────────────────────────────────────────
  const stopTranslationInterval = useCallback(() => {
  }, []);

  // ── createBubble ──────────────────────────────────────────────────────────
  // Builds a two-column segment row with color-coded speaker tags.
  // Creates a fresh BubbleTransState for the new bubble so all translation
  // requests for previous bubbles are structurally isolated.
  const createBubble = useCallback((rawSpeaker: number | string | undefined): HTMLSpanElement => {
    const container = containerRef.current!;
    const { label, slot } = normalizeSpeaker(rawSpeaker);
    const tagCls = slot > 0
      ? SPEAKER_COLORS[Math.min(slot - 1, SPEAKER_COLORS.length - 1)]
      : undefined;

    const row = document.createElement("div");
    row.className = CLS.row;

    // ── LEFT COLUMN: original ────────────────────────────────────────────────
    const colOrig = document.createElement("div");
    colOrig.className = CLS.colOrig;

    // ── RIGHT COLUMN: translation ────────────────────────────────────────────
    const colTrans = document.createElement("div");
    colTrans.className = CLS.colTrans;

    if (label && tagCls) {
      const tagOrig = document.createElement("span");
      tagOrig.className   = tagCls;
      tagOrig.textContent = label;
      colOrig.appendChild(tagOrig);

      const tagTrans = document.createElement("span");
      tagTrans.className   = tagCls;
      tagTrans.textContent = label;
      colTrans.appendChild(tagTrans);
    }

    const origRow = document.createElement("div");
    origRow.className = CLS.textRow;

    const p = document.createElement("p");
    p.className = CLS.textFin;
    applyTextStyle(p);
    const finalSpan = document.createElement("span");
    const nfSpan    = document.createElement("span");
    nfSpan.className = CLS.nf;
    p.appendChild(finalSpan);
    p.appendChild(nfSpan);
    origRow.appendChild(p);
    origRow.appendChild(makeCopyBtn(() => p.textContent ?? ""));
    colOrig.appendChild(origRow);

    const transRow = document.createElement("div");
    transRow.className = CLS.textRow;

    const transTextP = document.createElement("p");
    const translationOn = translationEnabledRef.current;
    transTextP.className   = translationOn ? CLS.transPend : CLS.transDisabled;
    transTextP.textContent = translationOn ? "" : TRANSLATION_PLATINUM_PLACEHOLDER;
    applyTextStyle(transTextP);
    transRow.appendChild(transTextP);
    transRow.appendChild(makeCopyBtn(() => transTextP.textContent ?? ""));

    colTrans.appendChild(transRow);

    row.appendChild(colOrig);
    row.appendChild(colTrans);
    container.appendChild(row);

    // Fresh per-bubble translation state — replaces the previous bubble's state.
    // Old in-flight requests captured the OLD state object in their closure, so
    // they will always write to the old bubble's elements (or discard if already
    // shown a newer result).
    activeBubbleNFRef.current      = nfSpan;
    activeBubbleStateRef.current   = {
      segmentId: `seg-${++segmentSeqRef.current}`,
      transTextEl:  transTextP,
      seq:          0,
      lastShownSeq:      0,
      lastShownLen:      0,
      finalizing:        false,
      translationLocked: false,
      streamCommittedSource: "",
      streamInflight:        false,
      lastLiveSource:        "",
      lastLiveSourceTs:      Date.now(),
      earlyHintSent:         false,
      lastPreviewWordsSent:  0,
      finalTokensSeen:       0,
      lastNfRawText:         "",
      lastConfirmedSource:   "",
      lastConfirmedSourceTranslated: "",
      pendingLiveSource: "",
      segmentSourceLang:     null,
      segmentTargetLang:     null,
      needsFullFinalTranslation: false,
    };
    styleUpgradedRef.current       = false;
    liveBufferRef.current          = "";

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  type SegmentCloseKind = "silence" | "speaker_change";

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // final translation. isFinal=true bypasses the stabilization check.
  // Stops the polling interval FIRST so no in-flight poll requests can race
  // against the final fetch and overwrite the locked translation.
  const softFinalize = useCallback((closeKind: SegmentCloseKind = "silence") => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;

    // Stop polling AND mark as finalizing synchronously, before the async
    // dispatch below. This ensures any poll fetch already in-flight will be
    // rejected by the post-fetch `finalizing` guard when it returns.
    stopTranslationInterval();
    if (activeBubbleStateRef.current) {
      activeBubbleStateRef.current.finalizing = true;
    }

    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Keep source transcript as pure Soniox output across all languages/dialects.
    // Do not rewrite/normalize user speech text at finalize.

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    // Translation source for the final API call:
    // Always use DOM finals only. Using liveBuffer at boundaries can leak the next utterance
    // into the previous segment, then it appears again on the next segment (duplicate question).
    const domFinal = (activeBubbleRef.current.textContent?.trim() ?? "");
    const finalText = domFinal;
    if (finalText.length > 2) {
      // Accumulate for admin snapshot — one translation row per transcript row (live DOM first,
      // then async final overwrites the same slot). Otherwise translationBuf lags or misses rows
      // and the admin modal looks like a "gap" vs what the user saw in aligned bubbles.
      transcriptBufRef.current.push(finalText);
      const stSnap = activeBubbleStateRef.current;
      translationBufRef.current.push((stSnap?.transTextEl.textContent ?? "").trim());
      onAdminSnapshotBuffersUpdatedRef.current?.();
      // Use the per-segment locked language. Fall back to the global detected
      // language only if Soniox never reported one for this segment at all.
      const langFromState = activeBubbleStateRef.current?.segmentSourceLang ?? detectedLangRef.current;
      const lang = validateLangByScript(langFromState, finalText, langPairRef.current);
      const segId = activeBubbleStateRef.current?.segmentId;
      // Always run a final full-source pass so the model can correct the whole utterance.
      dispatchTranslation(finalText, lang, true, undefined, segId);
    }
  }, [dispatchTranslation, stopTranslationInterval, flushFinalTextRenderQueue, cancelOpenAiLiveDebounce]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  const finalizeLiveBubble = useCallback((closeKind: SegmentCloseKind = "silence") => {
    if (!activeBubbleRef.current) return;
    softFinalize(closeKind);
  }, [softFinalize]);

  // Finalize and hard-close the active segment boundary so no later partial text
  // can continue writing into that finalized segment.
  const closeActiveSegmentBoundary = useCallback((closeKind: SegmentCloseKind = "silence") => {
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;
    finalizeLiveBubble(closeKind);
    currentSpeakerRef.current = undefined;
    activeBubbleRef.current   = null;
    activeBubbleNFRef.current = null;
    activeBubbleStateRef.current = null;
    styleUpgradedRef.current  = false;
  }, [finalizeLiveBubble, flushFinalTextRenderQueue]);

  // ── doClear ────────────────────────────────────────────────────────────────
  // Wipes all transcript/translation DOM content and resets every per-bubble
  // ref. Used by the exported `clear` (manual Clear button) and by the
  // inactivity / max-session auto-stop for non-admin users.
  const doClear = useCallback(() => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (shortPauseTimerRef.current !== null) {
      clearTimeout(shortPauseTimerRef.current);
      shortPauseTimerRef.current = null;
    }
    stopTranslationInterval();
    activeBubbleStateRef.current   = null;
    currentSpeakerRef.current      = undefined;
    activeBubbleRef.current        = null;
    activeBubbleNFRef.current      = null;
    styleUpgradedRef.current       = false;
    liveBufferRef.current          = "";
    finalCountRef.current          = 0;
    transcriptBufRef.current       = [];
    translationBufRef.current      = [];
    translationDiagRef.current = {
      callCount: 0,
      estimatedTokensTotal: 0,
      perSegmentCalls: new Map(),
      callTimestampsMs: [],
      lastInputMeta: null,
      redundantCalls: 0,
    };
    if (containerRef.current) containerRef.current.innerHTML = "";
    setHasTranscript(false);
    setTranslationServiceError(null);
    resetSpeakerMap();
  }, [stopTranslationInterval, flushFinalTextRenderQueue, cancelOpenAiLiveDebounce]);

  const stop = useCallback(async () => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (!isRecRef.current) return;
    isRecRef.current = false;
    setIsRecording(false);

    // Cancel all pending timers before finalizing.
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (shortPauseTimerRef.current !== null) {
      clearTimeout(shortPauseTimerRef.current);
      shortPauseTimerRef.current = null;
    }
    if (inactivityTimerRef.current !== null) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (maxSessionTimerRef.current !== null) {
      clearTimeout(maxSessionTimerRef.current);
      maxSessionTimerRef.current = null;
    }
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    stopTranslationInterval();
    finalizeLiveBubble();

    currentSpeakerRef.current     = undefined;
    activeBubbleRef.current       = null;
    activeBubbleNFRef.current     = null;
    activeBubbleStateRef.current  = null;  // drop all in-flight translation closures
    finalCountRef.current         = 0;

    workletRef.current?.disconnect();
    workletRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.send(new ArrayBuffer(0)); } catch (_) { /* eof */ }
      wsRef.current.close();
      wsRef.current = null;
    }
    pcmBacklogRef.current = [];

    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
    setMicLevel(0);

    if (sessionIdRef.current) {
      const wallSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const pcmSec = Math.floor(audioPcmSecondsRef.current);
      const durationSeconds = Math.max(0, Math.min(pcmSec, wallSec));
      try {
        await stopSessionMut.mutateAsync({
          data: { sessionId: sessionIdRef.current, durationSeconds },
        });
      } catch { /* session stop error — silenced (HIPAA) */ }
      sessionIdRef.current = null;
      setSessionId(null);
    }

    const diag = translationDiagRef.current;
    const nowMs = Date.now();
    const sessionMinutes = Math.max(1 / 60, (nowMs - startTimeRef.current) / 60_000);
    const callsPerMinute = diag.callCount / sessionMinutes;
    const avgTokensPerRequest =
      diag.callCount > 0 ? diag.estimatedTokensTotal / diag.callCount : 0;
    const tokensPerMinute = diag.estimatedTokensTotal / sessionMinutes;
    const estimatedHourlyCost =
      (diag.estimatedTokensTotal * (OPENAI_INPUT_COST_PER_TOKEN + OPENAI_OUTPUT_COST_PER_TOKEN)) *
      (60 / sessionMinutes);
    const perSegment = [...diag.perSegmentCalls.entries()]
      .map(([segmentId, calls]) => `${segmentId}:${calls}`)
      .join(",");
    console.info(
      "[translation_diagnostic_summary]",
      `calls_total=${diag.callCount}`,
      `calls_per_min=${callsPerMinute.toFixed(2)}`,
      `avg_tokens_per_request=${avgTokensPerRequest.toFixed(1)}`,
      `tokens_per_min=${tokensPerMinute.toFixed(1)}`,
      `estimated_tokens_total=${diag.estimatedTokensTotal}`,
      `redundant_calls=${diag.redundantCalls}`,
      `estimated_cost_per_hour_usd=${estimatedHourlyCost.toFixed(4)}`,
      `calls_per_segment=${perSegment || "none"}`,
    );
    translationDiagRef.current = {
      callCount: 0,
      estimatedTokensTotal: 0,
      perSegmentCalls: new Map(),
      callTimestampsMs: [],
      lastInputMeta: null,
      redundantCalls: 0,
    };
    // Clear snapshot accumulators — session is over.
    transcriptBufRef.current  = [];
    translationBufRef.current = [];

    // Clear columns for regular users when they manually stop a session.
    if (!isAdminRef.current) doClear();
    setTranslationServiceError(null);
  }, [
    stopSessionMut,
    finalizeLiveBubble,
    stopTranslationInterval,
    doClear,
    flushFinalTextRenderQueue,
    cancelOpenAiLiveDebounce,
  ]);

  /** Keep segment A/B direction in sync with Soniox for the CURRENT active segment only. */
  const tryLockSegmentDirectionFromTokens = useCallback((tokens: SonioxToken[]) => {
    const st = activeBubbleStateRef.current;
    if (!st) return;
    const last = [...tokens].reverse().find(
      t =>
        hasVisibleText(t.text) &&
        t.language !== undefined &&
        t.language !== null &&
        String(t.language).trim() !== "",
    );
    const pair = langPairRef.current;
    const sourceNow = (
      (activeBubbleRef.current?.textContent ?? "") +
      getBufferedFinalTextForActiveBubble() +
      (activeBubbleNFRef.current?.textContent ?? "")
    ).trim();
    const baseLang = (last?.language ?? detectedLangRef.current ?? "").trim();
    if (!baseLang) return;
    const validated = validateLangByScript(baseLang, sourceNow || tokens.map(t => t.text).join(""), pair);
    if (!langInSelectedPair(validated, pair)) return;
    st.segmentSourceLang = validated;
    st.segmentTargetLang = resolveTarget(validated, pair);
  }, [getBufferedFinalTextForActiveBubble]);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // !! Soniox pipeline — do NOT modify the streaming / segmentation logic !!
  const buildWs = useCallback((apiKey: string): WebSocket => {
    const ws = new WebSocket(SONIOX_WS_URL);

    ws.onopen = () => {
      const pair = langPairRef.current;
      const base = (c: string) => (c || "en").split("-")[0]!.toLowerCase();
      const language_hints = [...new Set([base(pair.a), base(pair.b), "en"])].filter(Boolean);
      const interpreterCtx = buildSonioxInterpreterContext(pair);
      ws.send(JSON.stringify({
        api_key:                        apiKey,
        model:                          "stt-rt-v4",
        audio_format:                   "pcm_s16le",
        sample_rate:                    TARGET_RATE,
        num_channels:                   1,
        language_hints,
        context:                        interpreterCtx,
        enable_language_identification: true,
        enable_speaker_diarization:     true,
      }));
      const w = wsRef.current;
      if (w && w.readyState === WebSocket.OPEN) {
        for (const buf of pcmBacklogRef.current) w.send(buf);
        pcmBacklogRef.current = [];
      }
    };

    ws.onmessage = (evt: MessageEvent) => {
      if (!isRecRef.current) return;

      let msg: SonioxMessage;
      try { msg = JSON.parse(evt.data as string); } catch { return; }

      const errText =
        typeof msg.error_message === "string" && msg.error_message.trim()
          ? msg.error_message.trim()
          : typeof msg.error === "string" && msg.error.trim()
            ? msg.error.trim()
            : typeof msg.message === "string" && msg.message.trim()
              ? msg.message.trim()
              : null;
      const errCode = msg.error_code ?? msg.code;
      if (errText) {
        setError(errCode ? `${errText} (${errCode})` : errText);
        void stop();
        return;
      }
      if (msg.finished) { void stop(); return; }

      const tokens = msg.tokens ?? [];
      if (tokens.length === 0) return;
      const hasNonFinalTokens = tokens.some(t => !t.is_final);

      // ── Silence / pause-based timers ───────────────────────────────────────
      // Every message with tokens resets both pause timers:
      // - SHORT_PAUSE_MS: dispatch non-final translation preview (no close)
      // - LONG_PAUSE_MS: finalize/close current segment
      // Also reset the 5-min inactivity auto-stop timer on every speech event.
      resetInactivityRef.current?.();
      if (shortPauseTimerRef.current !== null) clearTimeout(shortPauseTimerRef.current);
      const shortPauseMs = useLibreTranslateRef.current ? SHORT_PAUSE_MS : SHORT_PAUSE_MS_FAST;
      shortPauseTimerRef.current = setTimeout(() => {
        shortPauseTimerRef.current = null;
        if (!activeBubbleRef.current) return;
        flushFinalTextRenderQueue();
        const st = activeBubbleStateRef.current;
        if (!st || st.translationLocked || st.finalizing) return;
        const source = liveBufferRef.current.trim();
        if (source.length < 1) return;
        if (source === st.lastConfirmedSourceTranslated) return;
        const lang = st.segmentSourceLang ?? detectedLangRef.current;
        dispatchTranslation(source, lang, false, { skipOpenAiLiveDebounce: true }, st.segmentId);
        st.earlyHintSent = true;
        st.lastPreviewWordsSent = countWords(source);
      }, shortPauseMs);
      // Reset finalization timer only while speech is still active (NF tokens).
      // Soniox may continue emitting final-only stabilization updates after
      // speech stops; those must not postpone segment closure.
      if (hasNonFinalTokens) {
        if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (!activeBubbleRef.current) return;  // nothing open — nothing to do
          closeActiveSegmentBoundary();
          // NOTE: finalCountRef stays as-is; the Soniox stream is cumulative,
          // so slicing from the current count will correctly pick up only new finals.
        }, LONG_PAUSE_MS);
      }

      // ── FINAL tokens ─────────────────────────────────────────────────────
      const finals    = tokens.filter(t => t.is_final);
      const newFinals = finals.slice(finalCountRef.current);

      // Detect language from ANY token in this message — final OR non-final.
      // Checking NF tokens too is critical: Soniox often reports language on the
      // first NF chunk, well before any final tokens arrive. Using only finals
      // meant we started translation before the language was known.
      const langToken = tokens.find(t => t.language);
      if (langToken?.language) {
        const allTokenText  = tokens.map(t => t.text).join("");
        const validatedLang = validateLangByScript(
          langToken.language,
          allTokenText,
          langPairRef.current,
        );
        detectedLangRef.current = validatedLang;
      }

      for (const token of newFinals) {
        const tokenHasText = hasVisibleText(token.text);
        if (
          activeBubbleRef.current &&
          tokenHasText &&
          !sameSpeaker(token.speaker, currentSpeakerRef.current)
        ) {
          closeActiveSegmentBoundary("speaker_change");
          currentSpeakerRef.current =
            token.speaker !== undefined && token.speaker !== null ? String(token.speaker) : undefined;
          activeBubbleRef.current = createBubble(token.speaker);
          setHasTranscript(true);
        } else if (!activeBubbleRef.current) {
          currentSpeakerRef.current =
            token.speaker !== undefined && token.speaker !== null ? String(token.speaker) : undefined;
          finalCountRef.current     = finals.length - newFinals.length +
            newFinals.indexOf(token);
          if (tokenHasText) {
            activeBubbleRef.current = createBubble(token.speaker);
            setHasTranscript(true);
          }
        }
        if (!activeBubbleRef.current) continue;
        finalRenderQueueRef.current.push({ target: activeBubbleRef.current, text: token.text });
        if (activeBubbleStateRef.current) {
          activeBubbleStateRef.current.finalTokensSeen += 1;
        }
      }
      scheduleFinalTextRenderFlush();

      finalCountRef.current = finals.length;
      scrollPanel();

      // ── NF (non-final) tokens — transcript UI only (does not call dispatchTranslation) ──
      const nfText = tokens.filter(t => !t.is_final).map(t => t.text).join("");
      const nfSpeaker = [...tokens]
        .reverse()
        .find(t => !t.is_final && t.speaker !== undefined && t.speaker !== null)?.speaker;

      // Open a row on NF-first messages. Once createBubble runs, activeBubbleNFRef is set — we must still
      // update that span on every message (the old guard `!activeBubbleNFRef` blocked all later NF updates).
      if (nfText && containerRef.current && !activeBubbleRef.current) {
        const spk =
          nfSpeaker ??
          tokens.find(t => t.speaker !== undefined && t.speaker !== null)?.speaker;
        currentSpeakerRef.current =
          spk !== undefined && spk !== null ? String(spk) : undefined;
        if (hasVisibleText(nfText)) {
          activeBubbleRef.current = createBubble(spk);
          setHasTranscript(true);
        }
      }

      const nfEl = activeBubbleNFRef.current;
      if (nfText) {
        const stNf = activeBubbleStateRef.current;
        if (nfEl && stNf) {
          const prev = stNf.lastNfRawText;
          if (nfText.startsWith(prev)) {
            const suffix = nfText.slice(prev.length);
            if (suffix) nfEl.textContent = (nfEl.textContent ?? "") + suffix;
          } else {
            // Revised hypothesis (not a strict extension of the last NF string).
            nfEl.textContent = nfText;
          }
          stNf.lastNfRawText = nfText;
        }
      } else if (nfEl) {
        nfEl.textContent = "";
        const stNf = activeBubbleStateRef.current;
        if (stNf) stNf.lastNfRawText = "";
      }

      // ── Update live translation buffer ────────────────────────────────────
      const finalText = (activeBubbleRef.current?.textContent ?? "") + getBufferedFinalTextForActiveBubble();
      const rawLive   = mergeFinalWithNonFinalHypothesis(finalText, nfText).trim();
      liveBufferRef.current = rawLive;
      const confirmedSource = finalText.trim();
      if (activeBubbleStateRef.current) {
        activeBubbleStateRef.current.lastConfirmedSource = confirmedSource;
      }
      if (activeBubbleStateRef.current) {
        if (liveBufferRef.current !== activeBubbleStateRef.current.lastLiveSource) {
          activeBubbleStateRef.current.lastLiveSource = liveBufferRef.current;
          activeBubbleStateRef.current.lastLiveSourceTs = Date.now();
        }
      }

      tryLockSegmentDirectionFromTokens(tokens);

      flushFinalTextRenderQueue();

      // Non-final preview translation while the segment is open:
      // dispatch on each newly confirmed source extension (no batching).
      const st = activeBubbleStateRef.current;
      const hintSource = liveBufferRef.current.trim();
      const wordsNow = countWords(hintSource);
      if (
        st &&
        !st.translationLocked &&
        !st.finalizing &&
        hintSource.length >= 1 &&
        hintSource !== st.lastConfirmedSourceTranslated
      ) {
        const lang = st.segmentSourceLang ?? detectedLangRef.current;
        dispatchTranslation(hintSource, lang, false, undefined, st.segmentId);
        st.earlyHintSent = true;
        st.lastPreviewWordsSent = wordsNow;
      }
    };

    ws.onerror = () => { setError("WebSocket error"); void stop(); };

    ws.onclose = (e) => {
      if (isRecRef.current && e.code !== 1000) {
        setError(`Connection closed (${e.code})`);
        void stop();
      }
    };

    return ws;
  }, [
    stop,
    closeActiveSegmentBoundary,
    createBubble,
    scrollPanel,
    scheduleFinalTextRenderFlush,
    getBufferedFinalTextForActiveBubble,
    flushFinalTextRenderQueue,
    tryLockSegmentDirectionFromTokens,
  ]);

  // ── start ─────────────────────────────────────────────────────────────────
  // Pass providedStream to skip getUserMedia (e.g. for tab audio captured via
  // getDisplayMedia in the UI layer). All audio processing is identical.
  const start = useCallback(async (deviceId: string, providedStream?: MediaStream) => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setStartBusy(true);
    let sessionStartPromise: ReturnType<typeof startSessionMut.mutateAsync> | undefined;
    try {
      setError(null);
      setTranslationServiceError(null);
      setAudioInfo("");
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (shortPauseTimerRef.current !== null) {
        clearTimeout(shortPauseTimerRef.current);
        shortPauseTimerRef.current = null;
      }
      currentSpeakerRef.current      = undefined;
      activeBubbleRef.current        = null;
      activeBubbleNFRef.current      = null;
      activeBubbleStateRef.current   = null;
      styleUpgradedRef.current       = false;
      liveBufferRef.current          = "";
      finalCountRef.current          = 0;
      detectedLangRef.current        = "en";
      resetSpeakerMap();
      pcmBacklogRef.current          = [];

      // Run in parallel for lower latency; if one fails, still await the session
      // promise in `catch` so we can close a DB row that may have been created first.
      sessionStartPromise = startSessionMut.mutateAsync({
        data: {
          srcLang: langPairRef.current.a,
          tgtLang: langPairRef.current.b,
        },
      });
      const [tokenRes, sessionRes] = await Promise.all([
        getTokenMut.mutateAsync(undefined as any),
        sessionStartPromise,
      ]);
      sessionIdRef.current = sessionRes.sessionId;
      setSessionId(sessionRes.sessionId);
      transcriptBufRef.current  = [];
      translationBufRef.current = [];
      startTimeRef.current = Date.now();
      audioPcmSecondsRef.current = 0;

      // ── Session heartbeat ─────────────────────────────────────────────────
      // Ping every 30 s so the server knows the session is still alive.
      // Without this, a page refresh leaves the session open and the next
      // Start press gets a false 409 until the 60 s stale window expires.
      const sendHeartbeat = () => {
        const sid = sessionIdRef.current;
        if (!sid) return;
        fetch("/api/transcription/session/heartbeat", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({
            sessionId: sid,
            audioSecondsProcessed: Math.floor(audioPcmSecondsRef.current),
          }),
        }).catch(() => { /* best-effort — ignore network errors */ });
      };
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30_000);
      sendHeartbeat();

      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;

      if (ctx.state === "suspended") await ctx.resume();

      setAudioInfo(`${ctx.sampleRate} Hz → ${TARGET_RATE} Hz`);

      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-processor.js`);

      // ── Audio source isolation ────────────────────────────────────────────
      // Tab Audio mode: providedStream is the tab-only MediaStream captured by
      //   getDisplayMedia() in the workspace UI. getUserMedia (microphone) is
      //   never called — the short-circuit `??` ensures that.
      // Mic mode: providedStream is undefined, so getUserMedia is called with
      //   the selected device ID and mic-optimised constraints.
      // These two paths are mutually exclusive by design.
      const stream = providedStream !== null && providedStream !== undefined
        ? providedStream
        : await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: deviceId ? { exact: deviceId } : undefined,
              echoCancellation:  false,
              noiseSuppression:  false,
              autoGainControl:   false,
              channelCount:      1,
            },
          });
      streamsRef.current.push(stream);

      const ws = buildWs(tokenRes.apiKey);
      wsRef.current = ws;

      const audioSource = ctx.createMediaStreamSource(stream);
      const analyser    = ctx.createAnalyser();
      analyser.fftSize  = 256;
      audioSource.connect(analyser);

      const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      workletRef.current = worklet;
      analyser.connect(worklet);
      worklet.connect(ctx.destination);

      worklet.port.onmessage = (e) => {
        const raw = e.data as ArrayBuffer;
        const w = wsRef.current;
        if (w?.readyState === WebSocket.OPEN) {
          w.send(raw);
        } else {
          pcmBacklogRef.current.push(raw.slice(0));
          if (pcmBacklogRef.current.length > 200) {
            pcmBacklogRef.current.splice(0, pcmBacklogRef.current.length - 200);
          }
        }
        const samples = new Int16Array(raw);
        audioPcmSecondsRef.current += samples.length / TARGET_RATE;
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = (samples[i] ?? 0) / 32768;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.sqrt(sum / (samples.length || 1)) * 500));
      };

      isRecRef.current = true;
      setIsRecording(true);

      // ── 5-minute inactivity auto-stop ────────────────────────────────────
      // Reset every time a speech token arrives (see buildWs onmessage handler).
      const scheduleInactivity = () => {
        if (inactivityTimerRef.current !== null) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          inactivityTimerRef.current = null;
          setError("Session stopped due to inactivity.");
          void stop();
          // Clear columns for regular users only on inactivity auto-stop.
          // Admin keeps their transcript until they manually press Clear.
          if (!isAdminRef.current) doClear();
        }, INACTIVITY_TIMEOUT_MS);
      };
      resetInactivityRef.current = scheduleInactivity;
      scheduleInactivity();

      // ── 3-hour max session auto-stop ─────────────────────────────────────
      maxSessionTimerRef.current = setTimeout(() => {
        maxSessionTimerRef.current = null;
        setError("Session time limit reached (3 hours). Please start a new session.");
        void stop();
        if (!isAdminRef.current) doClear();
      }, MAX_SESSION_MS);

    } catch (err: unknown) {
      let orphanSessionId: number | null = null;
      if (sessionStartPromise) {
        try {
          const sr = await sessionStartPromise;
          orphanSessionId = sr.sessionId;
        } catch {
          /* session start failed */
        }
      }

      const errCode = getTranscriptionTokenFailureCode(err);
      let msg =
        getApiErrorMessage(err) ??
        (err instanceof Error ? err.message : "Failed to start transcription");
      if (errCode === "TRANSCRIPTION_NOT_CONFIGURED") {
        msg =
          "Live transcription is off: the server is missing SONIOX_API_KEY. Add it in Railway (or .env for local API), then redeploy.";
      } else if (errCode === "FEEDBACK_REQUIRED") {
        msg = "Daily feedback is required before you can start another session.";
      }
      // Error object intentionally not logged to console (HIPAA)
      setError(msg);
      // If the session was created in the DB before the failure, close it
      // explicitly. stop() returns early when isRecRef is false, so this
      // ghost-session cleanup must happen here to prevent the next start()
      // from getting a stale open session. `orphanSessionId` covers parallel
      // token+session where the session won the race before the other failed.
      const ghostId = sessionIdRef.current ?? orphanSessionId;
      if (ghostId != null) {
        const wallSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const pcmSec = Math.floor(audioPcmSecondsRef.current);
        const durationSeconds = Math.max(0, Math.min(pcmSec, wallSec));
        try {
          await stopSessionMut.mutateAsync({
            data: { sessionId: ghostId, durationSeconds },
          });
        } catch { /* ignore — server will auto-close on next start */ }
        sessionIdRef.current = null;
        setSessionId(null);
      }
      void stop();
    } finally {
      startInFlightRef.current = false;
      setStartBusy(false);
    }
  }, [getTokenMut, startSessionMut, stopSessionMut, buildWs, stop]);

  // ── setLangPair ────────────────────────────────────────────────────────────
  // Called by workspace whenever the user changes either language selector.
  // Per-segment target is resolved at dispatchTranslation time: if Soniox
  // detected language matches B → translate to A, otherwise → translate to B.
  const setLangPair = useCallback((a: string, b: string) => {
    langPairRef.current = { a, b };
  }, []);

  // ── getSnapshot ────────────────────────────────────────────────────────────
  // Returns accumulated finalized transcript and translation text for this
  // session. Used by workspace to push snapshots to the server every 5 s.
  const getSnapshot = useCallback((): { transcript: string; translation: string } => ({
    transcript:  transcriptBufRef.current.join("\n"),
    translation: translationBufRef.current.join("\n"),
  }), []);

  /** Billable audio minutes in the current open session (PCM sent ÷ 60). Server `minutesUsedToday` excludes until stop. */
  const getApproxBillableMinutesThisSession = useCallback(
    () => audioPcmSecondsRef.current / 60,
    [],
  );

  return {
    isRecording,
    audioInfo,
    micLevel,
    error,
    translationServiceError,
    hasTranscript,
    sessionId,
    containerRef,
    start,
    stop,
    setLangPair,
    getSnapshot,
    getApproxBillableMinutesThisSession,
    clear: doClear,
    isStarting:
      startBusy || getTokenMut.isPending || startSessionMut.isPending,
  };
}
