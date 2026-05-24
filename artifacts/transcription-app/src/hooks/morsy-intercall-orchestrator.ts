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

/** ~220ms baseline; punctuation shortens requirement (bonus), floored — not mandatory for dispatch. */
export const MORSY_SEMANTIC_STABILITY_BASE_MS = 220;

export const MORSY_SEMANTIC_STABILITY_MIN_MS = 140;

/** Quiet-time after last speech token before live translate preview. */
export const MORSY_SEMANTIC_PAUSE_MS = 200;

/** Trailing coalesce after stabilization + gates (replaces reactive 52ms path for isolated Morsy). */
export const MORSY_SEMANTIC_TRAILING_DEBOUNCE_MS = 550;

/** Reduce required stability window when clause-like punctuation ends the hypothesis. */
export const MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS = 90;

/** Without a new Soniox final, require roughly this many new words vs last live dispatch snapshot. */
export const MORSY_SEMANTIC_MIN_WORD_DELTA_WITHOUT_FINAL = 3;

/** Bonus: hypothesis ends like a clause — stabilization may commit sooner (still not required). */
export function endsWithSemanticClausePunctuation(trimmedHint: string): boolean {
  const t = trimmedHint.trimEnd();
  if (!t.length) return false;
  const c = t[t.length - 1];
  return c !== undefined && ".?!…،:".includes(c);
}

export function effectiveSemanticStabilityMs(trimmedHint: string): number {
  const base = MORSY_SEMANTIC_STABILITY_BASE_MS;
  if (!endsWithSemanticClausePunctuation(trimmedHint)) return base;
  return Math.max(MORSY_SEMANTIC_STABILITY_MIN_MS, base - MORSY_SEMANTIC_PUNCT_STABILITY_DISCOUNT_MS);
}

/**
 * Fewer pointless re-dispatches when NF barely edits the same words (hyphen/spacing twitch).
 * When a new Soniox final landed, callers should bypass this gate (never suppress on `finalAdvanced`).
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
  if (Math.abs(nb - la) > 6) return false;
  return nextNorm.startsWith(lastDispatchedNorm) || lastDispatchedNorm.startsWith(nextNorm);
}
