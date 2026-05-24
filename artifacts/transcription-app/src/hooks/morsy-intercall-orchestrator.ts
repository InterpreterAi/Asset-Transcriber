/**
 * Morsy isolated sandbox only: live **preview** translate pacing (semantic stabilization).
 * Does not touch fetch, engines, or rendering — see `morsyIntercallSandboxSemanticStabilizeLive` in `use-transcription.ts`.
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

/** Live preview stabilization: only `morsy-intercall-isolated-experiment` when kill switch is off. */
export function morsyUsesSemanticStabilizedLivePreview(segmentBehaviorMode: string): boolean {
  return segmentBehaviorMode === "morsy-intercall-isolated-experiment" && !morsySemanticStabilizeLiveKillSwitchEngaged();
}

/** ~290ms baseline (180–300ms range): absorb NF jitter before translator “speaks.” */
export const MORSY_SEMANTIC_STABILITY_BASE_MS = 290;

/** Floor when clause punctuation earns a quicker release. */
export const MORSY_SEMANTIC_STABILITY_MIN_MS = 170;

/** Extra observe time when hypotheses are unpunctuated and long (thought may still extend). */
export const MORSY_SEMANTIC_LONG_UNPUNCTUATED_TAIL_ADD_MS = 75;

/** Quiet-time after last speech token (“breath”) before live preview fires. */
export const MORSY_SEMANTIC_PAUSE_MS = 280;

/** Trailing intent coalesce after stability + gates — calmer than token-reactive 52ms. */
export const MORSY_SEMANTIC_TRAILING_DEBOUNCE_MS = 620;

/** Reduce required stability when clause punctuation implies a completeness boundary. */
export const MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS = 85;

/**
 * Without meaningful Soniox finals since last preview, require roughly this many new words
 * (blocks +1/+2 token churn).
 */
export const MORSY_SEMANTIC_MIN_WORD_DELTA_WITHOUT_FINAL = 6;

/**
 * Treat Soniox finals as relieving withholding only after at least N new finals since last preview,
 * except for the bootstrap case (first live preview).
 */
export const MORSY_SEMANTIC_MATERIAL_FINAL_DELTA = 2;

/** Dangling-tail / mid-clause comma heuristics apply only once the hypothesis has some substance. */
export const MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS = 10;

const DANGLING_COORD_RE =
  /\b(?:and|or|nor|but|because|although|whether|until|unless|since|than|whose|who|whom|which|what|when|while|where|how|why|if|after|before|once|though|whatever|whenever)\s*$/;

const TRAILING_SPLIT_HYPHEN_RE = /[-–—]\s*$/;

/** Stronger punctuation tail — commit sooner when the hypothesis lands on clear clause boundaries. */
export function endsWithSemanticClausePunctuation(trimmedHint: string): boolean {
  const t = trimmedHint.trimEnd();
  if (!t.length) return false;
  const c = t[t.length - 1];
  return c !== undefined && ".?!…،:".includes(c);
}

/**
 * Incomplete thoughts we withhold from live Arabic: coordinator tails, dangling hyphen, mid-clause commas.
 * Bypass when {@link isMaterialSonioxFinalAdvance} passes (meaningful finalized chunk landed).
 */
export function withholdLivePreviewForUnstableTail(trimmedHint: string, wordsNow: number): boolean {
  const t = trimmedHint.trim();
  if (!t.length || endsWithSemanticClausePunctuation(t)) return false;
  const tc = t.toLowerCase();

  const commaMidClause =
    wordsNow >= MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS && /,\s*$/.test(tc);
  if (commaMidClause) return true;

  if (wordsNow < MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) return false;

  return DANGLING_COORD_RE.test(tc) || TRAILING_SPLIT_HYPHEN_RE.test(t);
}

/** Required stability ms for this hypothesis (clause punct allows slightly faster intentional release). */
export function effectiveSemanticStabilityMs(trimmedHint: string, wordsNow: number): number {
  let ms = MORSY_SEMANTIC_STABILITY_BASE_MS;
  if (endsWithSemanticClausePunctuation(trimmedHint)) {
    ms = Math.max(MORSY_SEMANTIC_STABILITY_MIN_MS, ms - MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS);
    return ms;
  }
  if (wordsNow >= MORSY_SEMANTIC_UNSTABLE_TAIL_MIN_WORDS) {
    ms += MORSY_SEMANTIC_LONG_UNPUNCTUATED_TAIL_ADD_MS;
  }
  return ms;
}

/** Soniox `finalTokensSeen` jump that counts as semantic chunk relief vs micro-token noise. */
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

/**
 * Fewer pointless re-dispatches when NF barely edits the same words (hyphen/spacing twitch).
 * Ignored when a material Soniox final landed since last preview (caller should gate).
 */
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
