/**
 * **Basic · Morsy Urgent + `morsy-intercall-isolated-experiment` only:**
 * volatile (non-final) **visible** smoothing — entity-aware holds + monotone visibility hull so numeric tails
 * do not “blank → dump” or aggressively shrink every Soniox frame.
 *
 * Does **not** mutate `lockedCommittedFinalOriginal`, queues, overlap on finals, or `liveBufferRef` verbatim tail
 * (`lastNfRawText` / translation source should remain full Soniox NF concatenation upstream of this layer).
 */

import type { NfEntityTailClass } from "@/hooks/morsy-urgent-nf-entity-instrumentation";

export type MorsyUrgentNfPresentationScratch = {
  ticks: number;
  lastPartial: string;
  lastHidden: string;
  sinceMs: number;
  /** Monotonic hull: first frame we started holding visible length over a shorter smoother candidate (entity tail). */
  entityShrinkHoldSinceMs: number | null;
};

/** Consecutive unchanged (partial + hidden fingerprint) ticks before exposing full hypothesis. */
const NF_PRES_REQUIRE_STABLE_TICKS = 4;
/** Strong-entity tails: allow one more tick before full expose — reduces “chunk dump” feel. */
const NF_PRES_REQUIRE_STABLE_TICKS_ENTITY = 5;
/** Idle time on same partial/hidden pairing before exposing full hypothesis (ms). */
const NF_PRES_MAX_HOLD_MS = 220;
/** Strong entity: slightly longer hold before dumping entire hidden tail. */
const NF_PRES_MAX_HOLD_MS_ENTITY = 280;
/** After smoother suggests a shrink on an entity tail, keep prior visible this long unless raw grows again. */
const ENTITY_SHRINK_HOLD_MS = 340;

/** Reset scratch (speaker pivot, NF cleared, segment init). */
export function resetMorsyUrgentNfPresentationScratch(s: MorsyUrgentNfPresentationScratch): void {
  s.ticks = 0;
  s.lastPartial = "";
  s.lastHidden = "";
  s.sinceMs = 0;
  s.entityShrinkHoldSinceMs = null;
}

function splitWhitespaceTokens(s: string): string[] {
  const t = s.trim();
  return t.length > 0 ? t.split(/\s+/) : [];
}

/** Structured / numeric volatility (trailing tails Soniox often retracts during streaming). */
export function tokenVolatileTier(tok: string): 0 | 1 | 2 {
  const t = tok.trim();
  if (!t) return 0;
  // Strong — dates, clocks, dense IDs, money symbols, phone-like, invoice-ish
  if (/^[$€£₪¢]/.test(t)) return 2;
  if (/\b\d{1,2}:\d{2}(:\d{2})?\s*(?:[AP]M)?\b/i.test(t)) return 2;
  if (/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/.test(t) || /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/.test(t)) return 2;
  if (/\d{5,}/.test(t)) return 2;
  if (/[#]/.test(t) && /\d/.test(t)) return 2;
  if (/[/@]/.test(t) && /\d/.test(t)) return 2;
  // Phone-like digit runs
  if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t)) return 2;
  if (/^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(t)) return 2;
  // Mixed alnum IDs (invoice, order)
  if (/\b(?:INV|inv|PO|po|ORD|ord)[-#]?\s*[A-Z0-9]{4,}\b/i.test(t)) return 2;
  if (/^[A-Z]{1,4}[-_]?\d{3,}$/i.test(t)) return 2;
  // Weak — any digit-heavy token
  if (/\d/.test(t)) return 1;
  return 0;
}

/** Classify NF tail volatility for monotone hull + telemetry (last non-empty token heuristic). */
export function classifyNfTailEntity(nfRaw: string): NfEntityTailClass {
  const toks = splitWhitespaceTokens(nfRaw);
  if (toks.length === 0) return "none";
  const tier = tokenVolatileTier(toks[toks.length - 1]!);
  if (tier >= 2) return "strong_entity";
  if (tier === 1) return "weak_digits";
  const scan = nfRaw.trim().slice(Math.max(0, nfRaw.trim().length - 96));
  if (/\d/.test(scan) && (/[$€£₪¢]|\d{2}:\d{2}|\/\d{4}\b|[#/@].*\d/).test(scan)) return "weak_digits";
  return "none";
}

/** Length of contiguous volatile-token suffix (from last token inward). */
function volatileSuffixTokenLen(tokens: string[]): number {
  let n = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokenVolatileTier(tokens[i]!) === 0) break;
    n++;
  }
  return n;
}

/** How many whitespace-separated tokens to hold back visually — softer for numeric/entity-heavy tails (progressive reveal). */
function holdTokenCount(tokens: string[]): number {
  const run = volatileSuffixTokenLen(tokens);
  if (run === 0) return 0;
  const lastT = tokens[tokens.length - 1]!;
  const lastTier = tokenVolatileTier(lastT);

  /** Strong trailing token alone: suppress full-token strip avalanche (hold at most whitespace before it). */
  if (run === 1 && lastTier >= 2) {
    return 0;
  }
  if (lastTier >= 2) {
    return Math.min(1, run);
  }
  /** Weak-digit cluster: strip at most 2 tokens (was up to 3) to shrink hidden-tail dumps. */
  let k = Math.min(2, run);
  let strongInRun = 0;
  for (let i = tokens.length - 1; i >= 0 && i >= tokens.length - run; i--) {
    if (tokenVolatileTier(tokens[i]!) >= 2) strongInRun++;
  }
  if (strongInRun > 0) k = Math.min(1, run);
  return k;
}

/** Drop last `count` whitespace tokens from `s`; preserve intra-token content. */
function stripLastWhitespaceTokens(s: string, count: number): string {
  if (count <= 0 || !s) return s;
  let end = s.length;
  let dropped = 0;
  while (dropped < count && end > 0) {
    while (end > 0 && /\s/.test(s.charAt(end - 1))) end--;
    if (end <= 0) break;
    while (end > 0 && !/\s/.test(s.charAt(end - 1))) end--;
    dropped++;
  }
  let slice = end <= 0 ? "" : s.slice(0, end);
  slice = slice.replace(/\s+$/, "");
  return slice;
}

export function createMorsyUrgentNfPresentationScratch(nowMs: number): MorsyUrgentNfPresentationScratch {
  return { ticks: 0, lastPartial: "", lastHidden: "", sinceMs: nowMs, entityShrinkHoldSinceMs: null };
}

function tailClassEntityHeavy(tail: NfEntityTailClass): boolean {
  return tail === "strong_entity" || tail === "weak_digits";
}

/**
 * Map verbatim Soniox NF (`nfRaw`) to a **smoothed** visible candidate using lighter token withholding on entities.
 */
export function morsyUrgentVolatileHypothesisDomPaintSmooth(args: {
  nfRaw: string;
  nowMs: number;
  speakerTailKeyChanged?: boolean;
  scratch: MorsyUrgentNfPresentationScratch;
}): string {
  const { nfRaw, nowMs } = args;
  const s = args.scratch;

  if (args.speakerTailKeyChanged || !nfRaw) {
    resetMorsyUrgentNfPresentationScratch(s);
    return nfRaw;
  }

  const tailClass = classifyNfTailEntity(nfRaw);
  const stableNeed = tailClassEntityHeavy(tailClass) ? NF_PRES_REQUIRE_STABLE_TICKS_ENTITY : NF_PRES_REQUIRE_STABLE_TICKS;
  const maxHold = tailClassEntityHeavy(tailClass) ? NF_PRES_MAX_HOLD_MS_ENTITY : NF_PRES_MAX_HOLD_MS;

  const tokens = splitWhitespaceTokens(nfRaw);
  const k = holdTokenCount(tokens);
  if (k <= 0) {
    resetMorsyUrgentNfPresentationScratch(s);
    return nfRaw;
  }

  const partial = stripLastWhitespaceTokens(nfRaw, k);
  const hidden = partial.length <= nfRaw.length ? nfRaw.slice(partial.length) : "";

  if (partial === s.lastPartial && hidden === s.lastHidden) {
    s.ticks += 1;
  } else {
    s.lastPartial = partial;
    s.lastHidden = hidden;
    s.ticks = 1;
    s.sinceMs = nowMs;
  }

  const ageExpose = nowMs - s.sinceMs >= maxHold;
  const tickExpose = s.ticks >= stableNeed;

  if (tickExpose || ageExpose) {
    resetMorsyUrgentNfPresentationScratch(s);
    return nfRaw;
  }

  return partial;
}

/** Map verbatim NF to calmer NF span — smoothing only (combine with monotone hull upstream for entity stability). */
export function morsyUrgentVolatileHypothesisDomPaint(args: {
  nfRaw: string;
  nowMs: number;
  speakerTailKeyChanged?: boolean;
  scratch: MorsyUrgentNfPresentationScratch;
}): string {
  return morsyUrgentVolatileHypothesisDomPaintSmooth(args);
}

/**
 * Monotone visibility hull: prevents rapid visible shrink when the smoother withholds/rescans numeric tails —
 * freezes prior visible briefly, then releases.
 */
export function morsyUrgentNfMonotoneEntityHull(args: {
  nfRaw: string;
  smoothed: string;
  prevHullVisible: string;
  tailClass: NfEntityTailClass;
  nowMs: number;
  scratch: MorsyUrgentNfPresentationScratch;
  speakerTailKeyChanged: boolean;
}): {
  hull: string;
  monotoneHoldSkippedShrink: boolean;
} {
  const { nfRaw, smoothed, prevHullVisible, tailClass, nowMs, scratch, speakerTailKeyChanged } = args;

  if (speakerTailKeyChanged || !nfRaw) {
    scratch.entityShrinkHoldSinceMs = null;
    return { hull: smoothed, monotoneHoldSkippedShrink: false };
  }

  if (smoothed === nfRaw) {
    scratch.entityShrinkHoldSinceMs = null;
    return { hull: nfRaw, monotoneHoldSkippedShrink: false };
  }

  if (!tailClassEntityHeavy(tailClass) || !prevHullVisible.length) {
    scratch.entityShrinkHoldSinceMs = null;
    return { hull: smoothed, monotoneHoldSkippedShrink: false };
  }

  // Growth / extension — always follow smoother forward.
  if (smoothed.startsWith(prevHullVisible)) {
    scratch.entityShrinkHoldSinceMs = null;
    return { hull: smoothed, monotoneHoldSkippedShrink: false };
  }

  // Smoothing suggests a retract (typically held tokens came back shorter).
  if (prevHullVisible.startsWith(smoothed) && smoothed !== prevHullVisible) {
    if (scratch.entityShrinkHoldSinceMs === null) scratch.entityShrinkHoldSinceMs = nowMs;
    const elapsed = nowMs - scratch.entityShrinkHoldSinceMs;
    if (elapsed < ENTITY_SHRINK_HOLD_MS) {
      return { hull: prevHullVisible, monotoneHoldSkippedShrink: true };
    }
    scratch.entityShrinkHoldSinceMs = null;
    return { hull: smoothed, monotoneHoldSkippedShrink: false };
  }

  scratch.entityShrinkHoldSinceMs = null;
  return { hull: smoothed, monotoneHoldSkippedShrink: false };
}
