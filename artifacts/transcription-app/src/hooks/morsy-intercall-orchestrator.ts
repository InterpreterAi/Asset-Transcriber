/**
 * Morsy isolated sandbox only: live preview semantic pacing + resolution-aware withhold.
 * Does not touch fetch, engines, or rendering — `morsyIntercallSandboxSemanticStabilizeLive` in use-transcription.
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
/** Trailing coalesce after stabilization + gates. */
export const MORSY_SEMANTIC_TRAILING_DEBOUNCE_MS = 620;
/** Discount when EOS clause punctuation implies boundary. */
export const MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS = 85;

/** Without material Soniox finals, require ≥ this many words since last dispatched preview. */
export const MORSY_SEMANTIC_MIN_WORD_DELTA_WITHOUT_FINAL = 8;

/** ≥ this many finals since last preview ⇒ relax resolution withhold (thin “chunk landed” proxy). */
export const MORSY_SEMANTIC_MATERIAL_FINAL_DELTA = 2;

/** Substantive dangling / pronoun cliffs only after hypothesis has bulk. */
export const MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS = 10;

/** Unpunctuated: need interpretation proxy iff below verbose threshold. */
export const MORSY_SEMANTIC_RESOLUTION_BODY_MIN_WORDS = 14;

/** Very long uninterrupted tail may infer thought-complete despite no punct (last resort). */
export const MORSY_SEMANTIC_RESOLUTION_VERBOSE_UNPUNCT_WORDS = 24;

const DANGLING_COORD_RE =
  /\b(?:and|or|nor|but|because|although|whether|until|unless|since|than|whose|who|whom|which|what|when|while|where|how|why|if|after|before|once|though|whatever|whenever)\s*$/;

const TRAILING_SPLIT_HYPHEN_RE = /[-–—]\s*$/;

const AND_ARTICLE_TAIL_RE =
  /\band\s+(?:the|a|an)\s+[a-zA-ZÀ-ÖØ-öø-ÿ\d'\u0600-\u06FF-]{2,}\s*$/;

const WHO_AUX_OPEN_TAIL_RE =
  /\bwho\s+(?:was|were|is|are|had|having|would|could|might|must|may|will|gonna)\s*$/i;

/** “because …” with only opener token after “because” (causal VP not yet landed). */
const BECAUSE_OPENER_TAIL_RE =
  /\bbecause\s+(?:they|we|you|he|she|it|i|those|these|there|people|everything|nothing|things|nobody|someone)\s*$/i;

const WHILE_PROGRESSIVE_TAIL_RE =
  /\bwhile\s+(?:they|we|you|he|she|it|i|those|these|there)\s+(?:were|was|had|been|having|are|did|got)\s*$/i;

/** Coordinator + pron cliff (“… and they”). */
const AND_PRON_TAIL_RE =
  /\band\s+(?:he|she|they|we|you|it|i|them|those|these)\s*$/i;

/**
 * Incomplete auxiliary / modal scaffolds at EOS (VP still projecting for ASR).
 * Deliberately excludes common participles (“going”, “doing”) whose tails are often intentional.
 */
const AUX_TAIL_RE =
  /\b(?:could|would|should|might|must|had|been|having|were|was|being)\s*$/i;

/** Pronoun / deictic cliffs when nothing follows (listener still waiting). */
const PRON_DEICTIC_TAIL_RE =
  /\b(?:them|those|these|hers?|herself|himself|themselves|everything|nothing|somewhere|nobody)\s*$/;

/** Loose “clause partly landed without punct” heuristic (Arabic/live proxy only). */
const INTERPRETER_TAIL_CUE_RE =
  /\b(?:said|happened|came|went|stopped|finished|wanted|heard|thought|knew|thinks?s?|looks?|looks like|stopped|started|shows?|wanted|means?|thought|left|entered|happened)\s*[.!?…]?$/i;

const GERUND_OR_FINITEISH_RE = /\w{3,}(?:ed|ing|en)\b\s*[.!?…]?\s*$/i;

export function endsWithSemanticClausePunctuation(trimmedHint: string): boolean {
  const t = trimmedHint.trimEnd();
  if (!t.length) return false;
  const c = t[t.length - 1];
  return c !== undefined && ".?!…،:".includes(c);
}

/**
 * Syntactic + thin resolution withhold—coordinators, dangling relatives, causal scaffolds, pron/aux cliffs,
 * hyphen splits, mid‑comma tails. Bypass when EOS carries clause punctuation; mid‑comma catches list/appositive drift.
 */
export function withholdLivePreviewForUnresolvedThought(trimmedHint: string, wordsNow: number): boolean {
  const t = trimmedHint.trim();
  if (!t.length || endsWithSemanticClausePunctuation(t)) return false;
  const tc = t.toLowerCase();

  if (wordsNow < MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) return false;

  const commaMidClause = /,\s*$/.test(tc);
  if (commaMidClause) return true;

  if (
    AND_ARTICLE_TAIL_RE.test(tc) ||
    WHO_AUX_OPEN_TAIL_RE.test(tc) ||
    BECAUSE_OPENER_TAIL_RE.test(tc) ||
    WHILE_PROGRESSIVE_TAIL_RE.test(tc) ||
    AND_PRON_TAIL_RE.test(tc) ||
    AUX_TAIL_RE.test(tc) ||
    PRON_DEICTIC_TAIL_RE.test(tc) ||
    DANGLING_COORD_RE.test(tc) ||
    TRAILING_SPLIT_HYPHEN_RE.test(t)
  ) {
    return true;
  }

  return false;
}

/**
 * Without punctuation or Soniox material chunk, refuse “stable text” releases until the hypothesis
 * plausibly “lands” — human-interpreter-ish confidence proxy only.
 */
export function hasResolutionConfidenceForUnpunctuatedLive(trimmedHint: string, wordsNow: number): boolean {
  const t = trimmedHint.trimEnd();
  if (!t.length) return false;

  if (endsWithSemanticClausePunctuation(trimmedHint)) return true;

  if (wordsNow >= MORSY_SEMANTIC_RESOLUTION_VERBOSE_UNPUNCT_WORDS) return true;

  if (wordsNow < MORSY_SEMANTIC_RESOLUTION_BODY_MIN_WORDS) return false;

  return INTERPRETER_TAIL_CUE_RE.test(t) || GERUND_OR_FINITEISH_RE.test(t);
}

export function effectiveSemanticStabilityMs(trimmedHint: string, wordsNow: number): number {
  let ms = MORSY_SEMANTIC_STABILITY_BASE_MS;
  if (endsWithSemanticClausePunctuation(trimmedHint)) {
    return Math.max(MORSY_SEMANTIC_STABILITY_MIN_MS, ms - MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS);
  }
  if (wordsNow >= MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) {
    ms += MORSY_SEMANTIC_LONG_UNPUNCTUATED_TAIL_ADD_MS;
    if (
      !endsWithSemanticClausePunctuation(trimmedHint) &&
      !hasResolutionConfidenceForUnpunctuatedLive(trimmedHint, wordsNow) &&
      wordsNow < MORSY_SEMANTIC_RESOLUTION_VERBOSE_UNPUNCT_WORDS
    ) {
      ms += 95;
    }
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
