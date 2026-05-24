/**
 * Morsy isolated sandbox only: live preview pacing (NF stability + trailing debounce).
 * Continuity-first: avoids starving progressive interpreter chunks; only light twitch suppression.
 */

/** Build: `VITE_KILL_MORSY_SEMANTIC_STABILIZE_LIVE=1` or `true` disables this layer. */
const LS_KILL_MORSY_SEMANTIC_STABILIZE_LIVE = "interpreterai_kill_morsy_semantic_stabilize_live";

export function morsySemanticStabilizeLiveKillSwitchEngaged(): boolean {
  try {
    const v = import.meta.env?.VITE_KILL_MORSY_SEMANTIC_STABILIZE_LIVE;
    if (v === "1" || v === "true") return true;
  } catch {
    /* import.meta unavailable */
  }
  try {
    const ls =
      typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage.getItem(LS_KILL_MORSY_SEMANTIC_STABILIZE_LIVE)
        : null;
    if (ls === "1" || ls === "true") return true;
  } catch {
    /* private mode */
  }
  return false;
}

export function morsyUsesSemanticStabilizedLivePreview(segmentBehaviorMode: string): boolean {
  return segmentBehaviorMode === "morsy-intercall-isolated-experiment" && !morsySemanticStabilizeLiveKillSwitchEngaged();
}

/** ~290ms baseline: NF absorption before translator “speaks”. */
export const MORSY_SEMANTIC_STABILITY_BASE_MS = 290;
/** Floor when clause punctuation earns quicker release. */
export const MORSY_SEMANTIC_STABILITY_MIN_MS = 170;
/** Extra observe for long unpunctuated tails. */
export const MORSY_SEMANTIC_LONG_UNPUNCTUATED_TAIL_ADD_MS = 75;
/** Breath after last speech activity. */
export const MORSY_SEMANTIC_PAUSE_MS = 280;
/** Trailing intent coalesce after stabilization + gates. */
export const MORSY_SEMANTIC_TRAILING_DEBOUNCE_MS = 620;
/** Discount when EOS clause punctuation implies boundary. */
export const MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS = 85;

/** Without material Soniox finals since last preview, require ≥ this many words since last dispatch. */
export const MORSY_SEMANTIC_MIN_WORD_DELTA_WITHOUT_FINAL = 6;

/** ≥ this many finals since last preview ⇒ relax starvation gates (chunk landed). */
export const MORSY_SEMANTIC_MATERIAL_FINAL_DELTA = 2;

/** Only apply minimal twitch withhold after enough words (avoid petty early holds). */
export const MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS = 10;

const TRAILING_SPLIT_HYPHEN_RE = /[-–—]\s*$/;

export function endsWithSemanticClausePunctuation(trimmedHint: string): boolean {
  const t = trimmedHint.trimEnd();
  if (!t.length) return false;
  const c = t[t.length - 1];
  return c !== undefined && ".?!…،:".includes(c);
}

/**
 * **Continuity-first:** only withhold obvious truncation junk (hyphen-split ASR tails), not clauses or pronouns.
 * Most “semantic resolution” judgments stay out — Intercall‑style accumulation must not stall here.
 */
export function withholdLivePreviewForUnresolvedThought(trimmedHint: string, wordsNow: number): boolean {
  const t = trimmedHint.trim();
  if (!t.length || endsWithSemanticClausePunctuation(t)) return false;
  if (wordsNow < MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) return false;
  return TRAILING_SPLIT_HYPHEN_RE.test(t);
}

export function effectiveSemanticStabilityMs(trimmedHint: string, wordsNow: number): number {
  let ms = MORSY_SEMANTIC_STABILITY_BASE_MS;
  if (endsWithSemanticClausePunctuation(trimmedHint)) {
    return Math.max(MORSY_SEMANTIC_STABILITY_MIN_MS, ms - MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS);
  }
  if (wordsNow >= MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) {
    ms += MORSY_SEMANTIC_LONG_UNPUNCTUATED_TAIL_ADD_MS;
  }
  return ms;
}

export function isMaterialSonioxFinalAdvance(
  finalTokensSeen: number,
  lastDispatchedFinalTokensSeen: number,
  hasPriorLivePreview: boolean,
): boolean {
  const d = finalTokensSeen - lastDispatchedFinalTokensSeen;
  if (d >= MORSY_SEMANTIC_MATERIAL_FINAL_DELTA) return true;
  if (!hasPriorLivePreview && d >= 1) return true;
  return false;
}

export function suppressNearDuplicateLivePreview(
  lastDispatchedNorm: string,
  nextNorm: string,
  wordsNow: number,
  lastDispatchedWords: number,
): boolean {
  if (!lastDispatchedNorm) return false;
  if (lastDispatchedNorm === nextNorm) return true;
  if (wordsNow !== lastDispatchedWords) return false;
  const la = lastDispatchedNorm.length;
  const nb = nextNorm.length;
  if (Math.abs(nb - la) > 14) return false;
  return nextNorm.startsWith(lastDispatchedNorm) || lastDispatchedNorm.startsWith(nextNorm);
}
