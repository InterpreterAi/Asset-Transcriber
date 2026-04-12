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
// Segments close on stabilized speaker_id change (see effectiveSpeakersForTokenBoundaries + ws.onmessage).
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

/** Soniox semantic endpoint token (requires `enable_endpoint_detection` in start config). */
function isSonioxEndpointToken(t: SonioxToken): boolean {
  return t.text.trim().toLowerCase() === "<end>";
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

/** One contiguous span of forward-filled speaker id. */
type _SpeakerRun = { start: number; end: number; sp: string };

function _coalesceAdjacentSpeakerRuns(runs: _SpeakerRun[]): _SpeakerRun[] {
  const out: _SpeakerRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.sp === r.sp) last.end = r.end;
    else out.push({ start: r.start, end: r.end, sp: r.sp });
  }
  return out;
}

function _runsFromForwardSpeakers(forward: (string | undefined)[]): _SpeakerRun[] {
  const runs: _SpeakerRun[] = [];
  let i = 0;
  const n = forward.length;
  while (i < n) {
    while (i < n && forward[i] === undefined) i++;
    if (i >= n) break;
    const sp = forward[i]!;
    const start = i;
    while (i < n && forward[i] === sp) i++;
    runs.push({ start, end: i, sp });
  }
  return runs;
}

/**
 * Soniox diarization often assigns a different speaker_id for a handful of tokens during fast
 * code-switching or overlap noise. That used to open a new segment per flicker. Collapse *short*
 * runs sandwiched between the same speaker (A→B→A), tiny leading runs, and tiny trailing runs so
 * boundaries match stable speaker changes only — same rule as “real” speaker, fewer spurious rows.
 */
function effectiveSpeakersForTokenBoundaries(tokens: SonioxToken[]): (string | undefined)[] {
  const n = tokens.length;
  if (n === 0) return [];
  const forward: (string | undefined)[] = new Array(n).fill(undefined);
  let carry: string | undefined;
  for (let i = 0; i < n; i++) {
    const sp = tokens[i]!.speaker;
    if (sp !== undefined && sp !== null) carry = String(sp);
    forward[i] = carry;
  }
  let runs = _runsFromForwardSpeakers(forward);
  const runChars = (r: _SpeakerRun): number => {
    let c = 0;
    for (let i = r.start; i < r.end; i++) c += (tokens[i]!.text ?? "").length;
    return c;
  };
  const isEphemeralRun = (r: _SpeakerRun): boolean => {
    const tokLen = r.end - r.start;
    const chars = runChars(r);
    return tokLen < 3 && chars < 28;
  };
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k]!;
      if (!isEphemeralRun(r)) continue;
      if (k > 0 && k < runs.length - 1) {
        const prev = runs[k - 1]!;
        const next = runs[k + 1]!;
        if (prev.sp === next.sp && r.sp !== prev.sp) {
          r.sp = prev.sp;
          changed = true;
        }
      } else if (k === 0 && runs.length > 1) {
        const next = runs[1]!;
        if (r.sp !== next.sp) {
          r.sp = next.sp;
          changed = true;
        }
      } else if (k === runs.length - 1 && k > 0) {
        const prev = runs[k - 1]!;
        if (r.sp !== prev.sp) {
          r.sp = prev.sp;
          changed = true;
        }
      }
    }
    runs = _coalesceAdjacentSpeakerRuns(runs);
    if (!changed) break;
  }
  const out: (string | undefined)[] = new Array(n).fill(undefined);
  for (const r of runs) {
    for (let i = r.start; i < r.end; i++) out[i] = r.sp;
  }
  return out;
}

// ── Language-pair helpers ──────────────────────────────────────────────────────
// Compare two BCP-47 codes loosely (e.g. "zh-CN" matches "zh").
function matchesLang(detected: string, selected: string): boolean {
  const d = detected.toLowerCase();
  const s = selected.toLowerCase();
  return d === s || d.split("-")[0] === s.split("-")[0];
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

/**
 * THE FINAL BOSS — the one canonical InterpreterAI release (no other “final boss”; earlier baseline is `legacy-final-boss`).
 * Rollback: `git checkout final-boss`. Older pipeline snapshot: `git checkout legacy-final-boss` (superseded; had transcript phrase rewrites).
 * Original column: exact ASR mirror — no client-side rephrasing or “similar meaning” fixes.
 * Translation: live debounce + per-bubble abort; token dedupe on live; speaker-change full final;
 * finals: token + adjacent-paraphrase dedupe then script-family polish (all target languages).
 * Segments: stabilized Soniox speaker ids (fewer spurious rows on fast bilingual turns).
 * Direction: snapSourceLanguageToPair + targetOppositeInPair (target is always the other selected language).
 */

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

/** If `code` matches exactly one side of the pair, return that member's tag; otherwise null. */
function uniquePairMemberForLang(code: string, pair: { a: string; b: string }): string | null {
  const ma = matchesLang(code, pair.a);
  const mb = matchesLang(code, pair.b);
  if (ma && !mb) return pair.a;
  if (mb && !ma) return pair.b;
  return null;
}

/**
 * Map any detected/locked tag onto exactly one of the user's two languages so src/tgt are never wrong-way.
 * Fixes Latin/Latin pairs (e.g. en↔es) when Soniox tags the wrong language but later tokens are correct.
 */
function snapSourceLanguageToPair(
  candidate: string,
  sonioxHint: string,
  text: string,
  pair: { a: string; b: string },
): string {
  // Prefer live Soniox (validated) over segment lock so a wrong first-token lock does not force tgt = same language.
  const vSon = validateLangByScript(sonioxHint, text, pair);
  const uSon = uniquePairMemberForLang(vSon, pair);
  if (uSon !== null) return uSon;
  const vCand = validateLangByScript(candidate, text, pair);
  const uCand = uniquePairMemberForLang(vCand, pair);
  if (uCand !== null) return uCand;
  const uRaw = uniquePairMemberForLang(sonioxHint, pair);
  if (uRaw !== null) return uRaw;
  const ba = pair.a.split("-")[0]!.toLowerCase();
  const bb = pair.b.split("-")[0]!.toLowerCase();
  const bs = sonioxHint.split("-")[0]!.toLowerCase();
  if (bs === ba && bs !== bb) return pair.a;
  if (bs === bb && bs !== ba) return pair.b;
  return pair.a;
}

/** Always the other pair member — translation column must never stay in the spoken language. */
function targetOppositeInPair(sourceMember: string, pair: { a: string; b: string }): string {
  if (matchesLang(sourceMember, pair.a) && !matchesLang(sourceMember, pair.b)) return pair.b;
  if (matchesLang(sourceMember, pair.b) && !matchesLang(sourceMember, pair.a)) return pair.a;
  return matchesLang(sourceMember, pair.a) ? pair.b : pair.a;
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
  /** Abort stops this request (superseded live translate or segment teardown). */
  signal?: AbortSignal;
};

async function translateViaPrimaryApi(
  text: string,
  sourceLang: string,
  targetLang: string,
  options?: TranslateApiOptions,
): Promise<PrimaryTranslationResult> {
  const isFinal = Boolean(options?.isFinal);
  // Live: one retry on transient errors; timeouts scale with length so long turns are not cut off mid-stream.
  const MAX_ATTEMPTS = isFinal ? 2 : 2;
  // Long cumulative live strings — allow full 30s per attempt (product: coverage over cost).
  const REQUEST_TIMEOUT_MS = 30_000;
  const fatal503Codes = new Set([
    "TRANSLATION_NOT_CONFIGURED",
    "LIBRETRANSLATE_FAILED",
    "OPENAI_AUTH_FAILED",
    "OPENAI_RATE_LIMITED",
    "OPENAI_BILLING",
    "OPENAI_WRONG_LANGUAGE",
  ]);

  const externalSignal = options?.signal;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (externalSignal?.aborted) {
      return { outcome: "ok", text: "" };
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
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
        let j: { code?: string; error?: string } | null = null;
        try {
          j = JSON.parse(raw) as { code?: string; error?: string };
        } catch {
          /* ignore */
        }
        if (j?.code && fatal503Codes.has(j.code)) {
          return {
            outcome:     "try_fallback",
            userMessage: j.error ??
              (j.code === "TRANSLATION_NOT_CONFIGURED"
                ? "Translation is unavailable: configure OpenAI on the API server."
                : "Translation is temporarily unavailable."),
          };
        }
        // Never treat 503 as success with empty text.
        if (attempt === MAX_ATTEMPTS) {
          return {
            outcome:     "try_fallback",
            userMessage:
              j?.error ??
              "Translation is temporarily unavailable. Basic/Professional use LibreTranslate — check network or LIBRETRANSLATE_URL on the API server.",
          };
        }
        await new Promise<void>(res => setTimeout(res, 700 * attempt));
        continue;
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

      if (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 503) {
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
      if (externalSignal?.aborted) {
        return { outcome: "ok", text: "" };
      }
      if (attempt === MAX_ATTEMPTS) {
        return {
          outcome:     "try_fallback",
          userMessage:
            "Cannot reach the translation service (timeout or network error). If transcription still works, the API may be paused or OpenAI may be misconfigured on the server.",
        };
      }
    }
    if (attempt < MAX_ATTEMPTS) {
      if (externalSignal?.aborted) {
        return { outcome: "ok", text: "" };
      }
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

/** True when the translation cell already shows text we should treat as a real translation (not blank / placeholder-only). */
function translationCellLooksFilled(el: HTMLParagraphElement): boolean {
  const t = (el.textContent ?? "").trim();
  if (!t) return false;
  if (t === "…") return false;
  return true;
}

/** Append a streaming fragment to what is already shown (placeholder … counts as empty). */
function mergeStreamingTranslation(prevDisplayed: string, newPiece: string): string {
  const piece = newPiece.trim();
  if (!piece) return prevDisplayed.trim();
  const prev = prevDisplayed.trim();
  if (!prev || prev === "…") return piece;
  return `${prev} ${piece}`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function endsWithPhraseBoundary(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /[.!?؟،。！？:;]\s*$/u.test(t);
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

/** Split on closing sentence punctuation (Latin, Arabic, CJK full-width) for paraphrase dedupe. */
const INTERPRETER_SENTENCE_SPLIT_RE = /(?<=[.!?؟。！？])\s+/u;

/**
 * Final translation only (via {@link maybePolishTranslationForTarget}): drop adjacent sentences that
 * paraphrase the same clause (common after rapid NF revisions). Not applied on live streaming merges.
 */
function dedupeAdjacentParaphraseSentences(raw: string): string {
  let t = collapseWs(raw);
  for (let pass = 0; pass < 4; pass++) {
    const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
    if (sents.length < 2) return t;
    const out: string[] = [sents[0]!];
    for (let i = 1; i < sents.length; i++) {
      const cur = sents[i]!;
      const prev = out[out.length - 1]!;
      if (prev.length < 18 || cur.length < 18) {
        out.push(cur);
        continue;
      }
      const r = Math.max(tokenOverlapRatio(prev, cur), tokenOverlapRatio(cur, prev));
      if (r >= 0.52) {
        if (cur.length >= prev.length) {
          out[out.length - 1] = cur;
        }
        continue;
      }
      out.push(cur);
    }
    const joined = collapseWs(out.join(" "));
    if (joined === t) break;
    t = joined;
  }
  return t;
}

/**
 * Dedupe consecutive identical tokens, trim junk leading punctuation, collapse
 * doubled marks, fix split "? … لليوم؟" from incremental errors.
 */
function polishArabicInterpreterTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/^[.؟!،。'"“”\s\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.؟!?])\1+/g, "$1");
  t = t.replace(/([^؟?\n]+)[؟?]\s*لليوم[؟?]\s*$/u, "$1 اليوم؟");
  // Live + final often append two paraphrases of the same closing (e.g. "…وأشعر…" + "كانت هذه واحدة أخرى…").
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    // High threshold only: low values dropped whole closing sentences on valid multi-sentence medical turns.
    if (last.length >= 12 && prev.length >= 12 && tokenOverlapRatio(prev, last) >= 0.82) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/** Hebrew translation column: same token hygiene + ?-tail dedupe as Latin/Cyrillic. */
function polishHebrewInterpreterTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/^[.?!،。'"“”\s\u0590-\u05FF\u200c\u200f\u200e]+/u, "").trim();
  t = t.replace(/([.?!?])\1+/g, "$1");
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14 && tokenOverlapRatio(prev, last) >= 0.82) {
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
  let t = collapseWs(raw);
  if (targetBase === "en") {
    t = t.replace(/\?\s*Complete confidentiality, right\?$/i, "?");
    t = t.replace(/,\s*okay\?\s+Complete confidentiality, right\?$/i, ", okay?");
    t = t.replace(/\bokay\?\s+Complete confidentiality, right\?$/i, "okay?");
  }
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14) {
      const r = tokenOverlapRatio(prev, last);
      if (r >= 0.82) return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

/** Cyrillic, Greek, and similar: ?/. ! tail echoes without English-specific regexes. */
function polishQuestionMarkFamilyTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = trimOverlappingDuplicateQuestionTail(t);
  const sents = t.split(INTERPRETER_SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean);
  if (sents.length >= 2) {
    const last = sents[sents.length - 1]!;
    const prev = sents[sents.length - 2]!;
    if (last.length >= 14 && prev.length >= 14 && tokenOverlapRatio(prev, last) >= 0.82) {
      return collapseWs(sents.slice(0, -1).join(" "));
    }
  }
  return collapseWs(t);
}

function polishCjkTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
  t = t.replace(/([。！？?!])\1+/gu, "$1");
  return collapseWs(t);
}

/** Remaining scripts (th, hi, …): token dedupe + generic doubled sentence punctuation. */
function polishGenericTargetTranslation(raw: string): string {
  let t = collapseWs(raw);
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
 * THE FINAL BOSS (canonical) · final-column polish: shared token + adjacent-paraphrase dedupe, then script-family
 * fixes (same baseline for every target language, e.g. en↔es, en↔ar, ar↔fr).
 */
function maybePolishTranslationForTarget(text: string, targetLang: string): string {
  const base = targetLang.split("-")[0]?.toLowerCase() ?? "";
  if (!base) return text;
  const prepped = dedupeAdjacentParaphraseSentences(dedupeConsecutiveTranslationTokens(text));
  if (ARABIC_SCRIPT_TARGET_LANGS.has(base)) return polishArabicInterpreterTranslation(prepped);
  if (HEBREW_SCRIPT_TARGET_LANGS.has(base)) return polishHebrewInterpreterTranslation(prepped);
  if (LATIN_SCRIPT_TARGET_LANGS.has(base)) return polishLatinScriptInterpreterTranslation(prepped, base);
  if (CYRILLIC_SCRIPT_TARGET_LANGS.has(base) || GREEK_SCRIPT_TARGET_LANGS.has(base)) {
    return polishQuestionMarkFamilyTargetTranslation(prepped);
  }
  if (CJK_TARGET_LANG_BASES.has(base)) return polishCjkTargetTranslation(prepped);
  if (HANGUL_TARGET_LANG_BASES.has(base)) return polishQuestionMarkFamilyTargetTranslation(prepped);
  return polishGenericTargetTranslation(prepped);
}

function hasVisibleText(text: string | null | undefined): boolean {
  return Boolean(text && text.trim().length > 0);
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


/** Live + final: always replace the whole translation cell (innerHTML), never append tokens. */
function applyTranslationTypography(el: HTMLParagraphElement, newTranslation: string): void {
  const { rtl, arabicScript } = getTranslationTypographyMeta(newTranslation);
  el.dir             = rtl ? "rtl" : "ltr";
  el.style.textAlign = rtl ? "right" : "";
  const html = wrapAsciiDigitRunsWithLtrSpans(newTranslation);
  if (rtl) {
    if (arabicScript) {
      el.lang      = "ar";
      el.className = CLS.transText + " ts-arabic";
    } else {
      el.lang      = "he";
      el.className = CLS.transText;
    }
    el.innerHTML = html;
  } else {
    el.removeAttribute("lang");
    el.className = CLS.transText;
    el.innerHTML = html;
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
  /** Abort current live translate when superseded (debounced dispatch / final / close). */
  liveTranslationAbort: AbortController | null;
  /** Last normalized live source seen (final + NF). */
  lastLiveSource:        string;
  /** Timestamp when lastLiveSource changed. */
  lastLiveSourceTs:      number;
  /** One-time early non-final translation hint for this segment. */
  earlyHintSent:         boolean;
  /** Word count at the last non-final preview dispatch (LIVE_PREVIEW_WORD_STEP gating). */
  lastPreviewWordsSent:  number;
  /** Count of finalized tokens committed in this segment. */
  finalTokensSeen:       number;
  /** Last observed raw NF text used for append-only NF rendering. */
  lastNfRawText:         string;
  /** Latest normalized, confirmed (final-only) source text for this segment. */
  lastConfirmedSource:   string;
  /** Last confirmed source already dispatched for live translation. */
  lastConfirmedSourceTranslated: string;
  /** Last live source sent to translator (prevents tight same-text loops). */
  lastRequestedLiveSource: string;
  /** When last live source request was sent. */
  lastRequestedLiveAtMs: number;
  /** Throttle WS hint retries when source matches bookkeeping but translation cell is still empty. */
  lastEmptyCellHintDispatchAtMs: number;
  /** Throttle hint retries when translation may be truncated vs source (same source string). */
  lastTruncationRetryHintAtMs: number;
  /** Latest computed live translation candidate not yet committed to visible UI. */
  pendingDisplayTranslation: string;
  /** Once true, ignore any late interim responses for this segment. */
  hardFinalRequested: boolean;
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
  /**
   * Basic / Professional / trial-libre (LibreTranslate): always send the full segment on finalize — no
   * tail-only delta merge (avoids dropped clauses). Does not apply to OpenAI / Platinum.
   */
  machineTranslationFullSegmentFinals?: boolean;
  /** Server `planType` (e.g. basic, professional, trial-libre). Used with finals so Libre plans always get a full-segment translate even before options hydrate. */
  planType?: string | null;
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useTranscription(isAdmin = false, options?: UseTranscriptionOptions) {
  /** Slower live path: first dispatch after enough finals + words, then every N words (not every WS frame). */
  const EARLY_HINT_MIN_WORDS = 8;
  const LIVE_PREVIEW_WORD_STEP = 8;
  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  const onAdminSnapshotBuffersUpdatedRef = useRef<(() => void) | undefined>(undefined);
  onAdminSnapshotBuffersUpdatedRef.current = options?.onAdminSnapshotBuffersUpdated;

  const translationEnabledRef = useRef(options?.translationEnabled ?? true);
  useEffect(() => {
    translationEnabledRef.current = options?.translationEnabled ?? true;
  }, [options?.translationEnabled]);

  const machineTranslationFullSegmentFinalsRef = useRef(
    Boolean(options?.machineTranslationFullSegmentFinals),
  );
  useEffect(() => {
    machineTranslationFullSegmentFinalsRef.current = Boolean(options?.machineTranslationFullSegmentFinals);
  }, [options?.machineTranslationFullSegmentFinals]);

  const planTypeRef = useRef<string | null>(options?.planType ?? null);
  useEffect(() => {
    planTypeRef.current = options?.planType ?? null;
  }, [options?.planType]);

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
  /** Live debounce; 0 = every dispatch is immediate (streaming / incremental). */
  const OPENAI_LIVE_DEBOUNCE_MS = 0;
  const openaiLiveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openaiLiveDebouncePayloadRef = useRef<{ text: string; lang: string; segmentId: string } | null>(
    null,
  );
  const dispatchTranslationRef = useRef<
    (
      text: string,
      lang: string,
      isFinal?: boolean,
      options?: {
        lockOnFinal?: boolean;
        skipOpenAiLiveDebounce?: boolean;
        suppressEarlyHardFinal?: boolean;
        forceFullSegmentFinal?: boolean;
      },
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

  /** Trailing debounce for live translate API (coalesces WS-driven triggers; not per-frame requests). */
  const LIVE_TRANSLATION_DEBOUNCE_MS = 80;
  const liveTranslationDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTranslationDebouncePayloadRef = useRef<{
    text: string;
    lang: string;
    segmentId: string;
  } | null>(null);

  const cancelOpenAiLiveDebounce = useCallback(() => {
    if (openaiLiveDebounceTimerRef.current !== null) {
      clearTimeout(openaiLiveDebounceTimerRef.current);
      openaiLiveDebounceTimerRef.current = null;
    }
    openaiLiveDebouncePayloadRef.current = null;
    if (liveTranslationDebounceTimerRef.current !== null) {
      clearTimeout(liveTranslationDebounceTimerRef.current);
      liveTranslationDebounceTimerRef.current = null;
    }
    liveTranslationDebouncePayloadRef.current = null;
  }, []);

  const scheduleDebouncedLiveTranslation = useCallback((text: string, lang: string, segmentId: string) => {
    liveTranslationDebouncePayloadRef.current = { text, lang, segmentId };
    if (liveTranslationDebounceTimerRef.current !== null) {
      clearTimeout(liveTranslationDebounceTimerRef.current);
    }
    liveTranslationDebounceTimerRef.current = setTimeout(() => {
      liveTranslationDebounceTimerRef.current = null;
      const p = liveTranslationDebouncePayloadRef.current;
      if (!p) return;
      if (!isRecRef.current) return;
      const st = activeBubbleStateRef.current;
      if (!st || st.segmentId !== p.segmentId || st.translationLocked || st.finalizing) return;
      dispatchTranslationRef.current(
        p.text.trim(),
        p.lang,
        false,
        { skipOpenAiLiveDebounce: true },
        p.segmentId,
      );
    }, LIVE_TRANSLATION_DEBOUNCE_MS);
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

  // ── THE FINAL BOSS (canonical) · dispatchTranslation ─────────────────────────
  // Live: WS ~80ms debounce + per-bubble abort; token dedupe only (adjacent paraphrase dedupe runs in
  // maybePolish on finals for every target — avoids mangling streaming merges on fast speaker changes).
  // Speaker change: softFinalize passes forceFullSegmentFinal so the closing row gets one replace, not tail-append.
  const dispatchTranslation = useCallback((
    text: string,
    lang: string,
    isFinal = false,
    options?: {
      lockOnFinal?: boolean;
      skipOpenAiLiveDebounce?: boolean;
      suppressEarlyHardFinal?: boolean;
      forceFullSegmentFinal?: boolean;
    },
    segmentIdLock?: string,
  ) => {
    const state = activeBubbleStateRef.current;
    if (!state || text.trim().length < 3) return;
    const requestSegmentId = segmentIdLock ?? state.segmentId;
    if (requestSegmentId !== state.segmentId) return;

    if (!translationEnabledRef.current) return;

    if (state.translationLocked) return;
    const lockOnFinal = options?.lockOnFinal ?? true;
    if (isFinal && lockOnFinal && !options?.suppressEarlyHardFinal) {
      state.hardFinalRequested = true;
    }
    const words = countWords(text);
    const chars = text.length;

    const pair = langPairRef.current;
    const sonioxHint = lang;
    const rawCandidate =
      state.segmentSourceLang !== null
        ? state.segmentSourceLang
        : validateLangByScript(sonioxHint, text, pair);
    const vRaw = validateLangByScript(rawCandidate, text, pair);
    const vSon = validateLangByScript(sonioxHint, text, pair);
    if (
      uniquePairMemberForLang(vRaw, pair) === null &&
      uniquePairMemberForLang(vSon, pair) === null &&
      uniquePairMemberForLang(sonioxHint, pair) === null
    ) {
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

    const dispatchLang = snapSourceLanguageToPair(rawCandidate, sonioxHint, text, pair);
    const myTargetLang = targetOppositeInPair(dispatchLang, pair);
    if (!state.translationLocked) {
      state.segmentSourceLang = dispatchLang;
      state.segmentTargetLang = myTargetLang;
    }
    const { transTextEl } = state;

    if (matchesLang(dispatchLang, myTargetLang)) {
      state.seq += 1;
      const mySeq = state.seq;
      if (mySeq > state.lastShownSeq && transTextEl.isConnected && !state.translationLocked) {
        state.lastShownSeq = mySeq;
        state.lastShownLen = text.length;
        applyTranslationTypography(transTextEl, text);
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

    const isLibreTranslationPlan = () => {
      const p = (planTypeRef.current ?? "").toLowerCase();
      return p === "basic" || p === "professional" || p === "trial-libre";
    };

    let requestIsFinal = isFinal;
    let apiText: string;
    let useStreamingDelta = false;
    if (isFinal && options?.forceFullSegmentFinal) {
      apiText = text;
      useStreamingDelta = false;
      requestIsFinal = true;
    } else if (isFinal && (machineTranslationFullSegmentFinalsRef.current || isLibreTranslationPlan())) {
      apiText = text;
      useStreamingDelta = false;
      requestIsFinal = true;
    } else if (isFinal) {
      const committed = collapseWs(state.streamCommittedSource);
      const finalSrc = collapseWs(text);
      const cl = committed.toLowerCase();
      const fl = finalSrc.toLowerCase();
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
        if (monotonic && !tail.trim()) {
          const visibleLen = (state.transTextEl.textContent?.trim() ?? "").length;
          const visiblyTranslated = translationCellLooksFilled(state.transTextEl);
          const sourceLen = text.trim().length;
          if (state.needsFullFinalTranslation || (!visiblyTranslated && sourceLen > 0)) {
            apiText = text;
            useStreamingDelta = false;
            requestIsFinal = true;
          } else if (sourceLen > 24 && visibleLen < 8) {
            apiText = text;
            useStreamingDelta = false;
            requestIsFinal = true;
          } else if (!visiblyTranslated) {
            apiText = text;
            useStreamingDelta = false;
            requestIsFinal = true;
          } else if (isLibreTranslationPlan()) {
            // Libre: never lock without a final full-segment API call (live preview can look "filled" with junk).
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
          apiText = text;
          useStreamingDelta = false;
          requestIsFinal = true;
        }
      }
    } else {
      apiText = text;
      useStreamingDelta = false;
    }

    let liveAbortForThisRequest: AbortController | undefined;
    if (isFinal) {
      state.liveTranslationAbort?.abort();
      state.liveTranslationAbort = null;
    } else {
      state.liveTranslationAbort?.abort();
      state.liveTranslationAbort = new AbortController();
      liveAbortForThisRequest = state.liveTranslationAbort;
    }

    state.seq += 1;
    const mySeq = state.seq;

    void (async () => {
      try {
        const maxFetchAttempts = requestIsFinal ? (isLibreTranslationPlan() ? 5 : 3) : 1;
        let translated = "";
        for (let fetchAttempt = 0; fetchAttempt < maxFetchAttempts; fetchAttempt++) {
          if (fetchAttempt > 0) {
            await new Promise<void>(res => setTimeout(res, 400 * fetchAttempt));
          }
          if (requestSegmentId !== state.segmentId) return;
          if (!transTextEl.isConnected) return;
          if (state.translationLocked) return;
          if (!requestIsFinal && state.hardFinalRequested) return;
          if (!isFinal && state.finalizing) return;
          if (liveAbortForThisRequest?.signal.aborted) return;

          const { text: t } = await fetchTranslation(
            apiText,
            dispatchLang,
            myTargetLang,
            (m) => translationConfigReporterRef.current(m),
            {
              streamingDelta:         useStreamingDelta && !requestIsFinal,
              fullSegmentForFallback: useStreamingDelta && !requestIsFinal ? text : undefined,
              isFinal: requestIsFinal,
              signal:   liveAbortForThisRequest?.signal,
            },
          );
          translated = t;
          if (translated?.trim()) break;
        }
        if (requestSegmentId !== state.segmentId) return;

        if (!transTextEl.isConnected) return;
        if (state.translationLocked) return;
        if (!requestIsFinal && state.hardFinalRequested) return;
        if (!isFinal && state.finalizing) return;

        if (!translated?.trim()) {
          return;
        }

        if (mySeq <= state.lastShownSeq) return;

        if (requestIsFinal) {
          const rawFinal = translated.trim();
          let out = maybePolishTranslationForTarget(rawFinal, myTargetLang);
          if (rawFinal.length > 80 && out.length < Math.floor(rawFinal.length * 0.88)) {
            out = dedupeAdjacentParaphraseSentences(dedupeConsecutiveTranslationTokens(rawFinal));
          }
          state.lastShownSeq = mySeq;
          state.lastShownLen = out.length;
          applyTranslationTypography(transTextEl, out);
          state.pendingDisplayTranslation = "";
          state.streamCommittedSource = text;
          state.needsFullFinalTranslation = false;
          if (!lockOnFinal) {
            state.lastConfirmedSourceTranslated = text;
          }
          if (lockOnFinal) {
            state.hardFinalRequested = true;
            state.translationLocked = true;
            if (translationBufRef.current.length > 0) {
              translationBufRef.current[translationBufRef.current.length - 1] = out.trim();
              onAdminSnapshotBuffersUpdatedRef.current?.();
            }
          }
        } else if (useStreamingDelta) {
          const merged = mergeStreamingTranslation(transTextEl.textContent ?? "", translated.trim());
          state.lastShownSeq = mySeq;
          state.lastShownLen = merged.length;
          applyTranslationTypography(transTextEl, merged);
          state.pendingDisplayTranslation = "";
          const committed = state.streamCommittedSource.trim();
          state.streamCommittedSource = committed ? `${committed} ${text}` : text;
          state.needsFullFinalTranslation = false;
          state.lastConfirmedSourceTranslated = text;
        } else {
          const out = dedupeConsecutiveTranslationTokens(translated.trim());
          if (!out.trim()) {
            return;
          }
          state.lastShownSeq = mySeq;
          state.lastShownLen = out.length;
          applyTranslationTypography(transTextEl, out);
          state.pendingDisplayTranslation = "";
          state.streamCommittedSource = text;
          state.needsFullFinalTranslation = false;
          state.lastConfirmedSourceTranslated = text;
        }

        scrollPanel();
      } catch {
        /* HIPAA — never log speech context */
      } finally {
        if (
          !isFinal &&
          liveAbortForThisRequest &&
          state.liveTranslationAbort === liveAbortForThisRequest
        ) {
          state.liveTranslationAbort = null;
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
      liveTranslationAbort:  null,
      lastLiveSource:        "",
      lastLiveSourceTs:      Date.now(),
      earlyHintSent:         false,
      lastPreviewWordsSent:  0,
      finalTokensSeen:       0,
      lastNfRawText:         "",
      lastConfirmedSource:   "",
      lastConfirmedSourceTranslated: "",
      lastRequestedLiveSource: "",
      lastRequestedLiveAtMs: 0,
      lastEmptyCellHintDispatchAtMs: 0,
      lastTruncationRetryHintAtMs: 0,
      pendingDisplayTranslation: "",
      hardFinalRequested: false,
      segmentSourceLang:     null,
      segmentTargetLang:     null,
      needsFullFinalTranslation: false,
    };
    styleUpgradedRef.current       = false;
    liveBufferRef.current          = "";

    scrollPanel(true);
    return finalSpan;
  }, [scrollPanel]);

  /** session_end = user pressed Stop (not silence timers — those are removed). */
  type SegmentCloseKind = "session_end" | "speaker_change";

  // ── softFinalize ──────────────────────────────────────────────────────────
  // Upgrades the active bubble style (grey/italic → bold) and dispatches a
  // final translation. isFinal=true bypasses the stabilization check.
  // Stops the polling interval FIRST so no in-flight poll requests can race
  // against the final fetch and overwrite the locked translation.
  const softFinalize = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    cancelOpenAiLiveDebounce();
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;

    // Stop polling AND mark as finalizing synchronously, before the async
    // dispatch below. This ensures any poll fetch already in-flight will be
    // rejected by the post-fetch `finalizing` guard when it returns.
    stopTranslationInterval();
    // Speaker change: keep finalizing false so in-flight live responses can still paint this row
    // before the closing final request returns (hardFinalRequested stays off until final succeeds).
    if (activeBubbleStateRef.current && closeKind !== "speaker_change") {
      activeBubbleStateRef.current.finalizing = true;
    }

    if (activeBubbleNFRef.current) {
      activeBubbleNFRef.current.textContent = "";
    }

    // Original column: exact ASR mirror only — no phrase rewrites or “corrections” to similar wording.

    if (!styleUpgradedRef.current) {
      styleUpgradedRef.current = true;
      const p = activeBubbleRef.current.parentElement;
      if (p) p.className = CLS.textFin;
    }

    // Translation source for the final API call:
    // - session_end: prefer liveBuffer (final + merged NF) so trailing NF-only words still translate.
    // - speaker_change: use DOM finals only. liveBufferRef is still from the *previous* WS frame at
    //   this point (this message updates it after the finals loop), so it often still contains the
    //   next speaker's NF tail — locking that onto the closing row duplicates Arabic on Speaker 1.
    //   Also forceFullSegmentFinal on speaker_change so dispatch does not tail-merge onto live preview.
    const domFinal = (activeBubbleRef.current.textContent?.trim() ?? "");
    const finalText =
      closeKind === "speaker_change"
        ? domFinal
        : liveBufferRef.current.trim() || domFinal;
    if (finalText.trim().length > 0) {
      // Accumulate for admin snapshot — one translation row per transcript row (live DOM first,
      // then async final overwrites the same slot). Otherwise translationBuf lags or misses rows
      // and the admin modal looks like a "gap" vs what the user saw in aligned bubbles.
      transcriptBufRef.current.push(finalText);
      const stSnap = activeBubbleStateRef.current;
      translationBufRef.current.push((stSnap?.transTextEl.textContent ?? "").trim());
      onAdminSnapshotBuffersUpdatedRef.current?.();
      // Always pass live Soniox hint; dispatch snaps to the pair + opposite target (never same-lang tgt).
      const segId = activeBubbleStateRef.current?.segmentId;
      // Final pass: on speaker_change, defer hardFinal until response so live in-flight is not dropped.
      dispatchTranslation(
        finalText,
        detectedLangRef.current,
        true,
        {
          lockOnFinal: true,
          suppressEarlyHardFinal: closeKind === "speaker_change",
          skipOpenAiLiveDebounce: true,
          forceFullSegmentFinal: closeKind === "speaker_change",
        },
        segId,
      );
    }
  }, [dispatchTranslation, stopTranslationInterval, flushFinalTextRenderQueue, cancelOpenAiLiveDebounce]);

  // ── finalizeLiveBubble ────────────────────────────────────────────────────
  const finalizeLiveBubble = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    if (!activeBubbleRef.current) return;
    softFinalize(closeKind);
  }, [softFinalize]);

  // Finalize and hard-close the active segment boundary so no later partial text
  // can continue writing into that finalized segment.
  const closeActiveSegmentBoundary = useCallback((closeKind: SegmentCloseKind = "session_end") => {
    flushFinalTextRenderQueue();
    if (!activeBubbleRef.current) return;
    finalizeLiveBubble(closeKind);
    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
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
    stopTranslationInterval();
    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
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

    activeBubbleStateRef.current?.liveTranslationAbort?.abort();
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

  /** Lock segment translation direction from the first visible token that carries a language tag. */
  const tryLockSegmentDirectionFromTokens = useCallback((tokens: SonioxToken[]) => {
    const st = activeBubbleStateRef.current;
    if (!st || st.segmentSourceLang !== null) return;
    const first = tokens.find(
      t =>
        hasVisibleText(t.text) &&
        !isSonioxEndpointToken(t) &&
        t.language !== undefined &&
        t.language !== null &&
        String(t.language).trim() !== "",
    );
    if (!first?.language) return;
    const pair = langPairRef.current;
    const allTokenText = tokens.filter(t => !isSonioxEndpointToken(t)).map(t => t.text).join("");
    const validated = validateLangByScript(first.language, allTokenText, pair);
    const snapped = snapSourceLanguageToPair(validated, first.language, allTokenText, pair);
    st.segmentSourceLang = snapped;
    st.segmentTargetLang = targetOppositeInPair(snapped, pair);
  }, []);

  // ── buildWs ───────────────────────────────────────────────────────────────
  // Soniox streaming: speaker boundaries use effectiveSpeakersForTokenBoundaries() to ignore
  // diarization flicker during fast bilingual turns (short A→B→A runs stay one segment).
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
        enable_endpoint_detection:      true,
        max_endpoint_delay_ms:          800,
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

      const effSpk = effectiveSpeakersForTokenBoundaries(tokens);

      const sawSonioxEndpoint = tokens.some(t => t.is_final && isSonioxEndpointToken(t));
      resetInactivityRef.current?.();

      // ── FINAL tokens (exclude Soniox &lt;end&gt; marker from transcript + counts) ──
      const finals    = tokens.filter(t => t.is_final && !isSonioxEndpointToken(t));
      const newFinals = finals.slice(finalCountRef.current);
      const newFinalSet = new Set(newFinals);

      // Per-token forward pivot using stabilized speaker ids (avoids spurious rows on fast code-switch).
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti]!;
        const sid = effSpk[ti];
        if (sid !== undefined) {
          if (!activeBubbleRef.current) {
            currentSpeakerRef.current = sid;
            activeBubbleRef.current = createBubble(sid);
            setHasTranscript(true);
          } else if (!sameSpeaker(sid, currentSpeakerRef.current)) {
            closeActiveSegmentBoundary("speaker_change");
            currentSpeakerRef.current = sid;
            activeBubbleRef.current = createBubble(sid);
            setHasTranscript(true);
          }
        }
        if (!activeBubbleRef.current) continue;
        if (isSonioxEndpointToken(t)) continue;
        if (t.is_final && newFinalSet.has(t)) {
          finalRenderQueueRef.current.push({ target: activeBubbleRef.current, text: t.text });
          if (activeBubbleStateRef.current) {
            activeBubbleStateRef.current.finalTokensSeen += 1;
          }
        }
      }

      // Detect language from ANY token in this message — final OR non-final.
      // Checking NF tokens too is critical: Soniox often reports language on the
      // first NF chunk, well before any final tokens arrive. Using only finals
      // meant we started translation before the language was known.
      const langToken = tokens.find(t => t.language && !isSonioxEndpointToken(t));
      if (langToken?.language) {
        const allTokenText  = tokens.filter(t => !isSonioxEndpointToken(t)).map(t => t.text).join("");
        const validatedLang = validateLangByScript(
          langToken.language,
          allTokenText,
          langPairRef.current,
        );
        detectedLangRef.current = validatedLang;
      }

      scheduleFinalTextRenderFlush();

      finalCountRef.current = finals.length;
      scrollPanel();

      // ── NF (non-final) — tail hypothesis for stabilized tail speaker only (matches pivot ids)
      let tailSpk: string | undefined;
      for (let i = effSpk.length - 1; i >= 0; i--) {
        if (effSpk[i]) {
          tailSpk = effSpk[i];
          break;
        }
      }
      let nfText = "";
      if (tailSpk !== undefined) {
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i]!;
          if (t.is_final || isSonioxEndpointToken(t)) continue;
          if (effSpk[i] !== tailSpk) continue;
          nfText += t.text;
        }
      } else {
        nfText = tokens.filter(t => !t.is_final && !isSonioxEndpointToken(t)).map(t => t.text).join("");
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

      // Word-step live preview (not every Soniox frame): steadier than full mirror.
      const st = activeBubbleStateRef.current;
      const hintSource = liveBufferRef.current.trim();
      const wordsNow = countWords(hintSource);
      if (
        st &&
        !st.translationLocked &&
        !st.finalizing &&
        st.finalTokensSeen >= 3 &&
        hintSource.length >= 25 &&
        wordsNow >= EARLY_HINT_MIN_WORDS &&
        (!st.earlyHintSent || wordsNow - st.lastPreviewWordsSent >= LIVE_PREVIEW_WORD_STEP)
      ) {
        const lang = st.segmentSourceLang ?? detectedLangRef.current;
        scheduleDebouncedLiveTranslation(hintSource, lang, st.segmentId);
        st.earlyHintSent = true;
        st.lastPreviewWordsSent = wordsNow;
      }

      // Soniox semantic endpoint: &lt;end&gt; triggers a full final translate pass (same bubble; speaker_id unchanged).
      if (sawSonioxEndpoint) {
        const stEnd = activeBubbleStateRef.current;
        const srcEnd = liveBufferRef.current.trim();
        if (stEnd && srcEnd && !stEnd.translationLocked) {
          dispatchTranslation(
            srcEnd,
            detectedLangRef.current,
            true,
            {
              lockOnFinal: false,
              suppressEarlyHardFinal: true,
              forceFullSegmentFinal: true,
              skipOpenAiLiveDebounce: true,
            },
            stEnd.segmentId,
          );
        }
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
    scheduleDebouncedLiveTranslation,
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
