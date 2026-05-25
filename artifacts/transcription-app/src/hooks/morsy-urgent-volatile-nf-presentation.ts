/**
 * **Basic · Morsy Urgent + `morsy-intercall-isolated-experiment` only:**
 * volatile (non-final) **visible** smoothing — trims trailing unstable tokens until they stabilize or age out.
 *
 * Does **not** mutate `lockedCommittedFinalOriginal`, queues, overlap on finals, or `liveBufferRef` verbatim tail
 * (`lastNfRawText` / translation source should remain full Soniox NF concatenation upstream of this layer).
 */

export type MorsyUrgentNfPresentationScratch = {
  ticks: number;
  lastPartial: string;
  lastHidden: string;
  sinceMs: number;
};

/** Consecutive unchanged (partial + hidden fingerprint) ticks before exposing full hypothesis. Fixed — not UX tuning knobs. */
const NF_PRES_REQUIRE_STABLE_TICKS = 4;
/** Idle time on same partial/hidden pairing before exposing full hypothesis (ms). */
const NF_PRES_MAX_HOLD_MS = 220;

/** Reset scratch (speaker pivot, NF cleared, segment init). */
export function resetMorsyUrgentNfPresentationScratch(s: MorsyUrgentNfPresentationScratch): void {
  s.ticks = 0;
  s.lastPartial = "";
  s.lastHidden = "";
  s.sinceMs = 0;
}

function splitWhitespaceTokens(s: string): string[] {
  const t = s.trim();
  return t.length > 0 ? t.split(/\s+/) : [];
}

/** Structured / numeric volatility (trailing tails Soniox often retracts during streaming). */
function tokenVolatileTier(tok: string): 0 | 1 | 2 {
  const t = tok.trim();
  if (!t) return 0;
  // Strong — dates, clocks, dense IDs, money symbols
  if (/^[$€£₪]/.test(t)) return 2;
  if (/\b\d{1,2}:\d{2}(:\d{2})?\s*(?:[AP]M)?\b/i.test(t)) return 2;
  if (/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/.test(t) || /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/.test(t)) return 2;
  if (/\d{5,}/.test(t)) return 2;
  if (/[#]/.test(t) && /\d/.test(t)) return 2;
  if (/[/@]/.test(t) && /\d/.test(t)) return 2;
  // Weak — any digit-heavy token
  if (/\d/.test(t)) return 1;
  return 0;
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

/** How many whitespace-separated tokens to hold back visually (1–3), or 0 if tail is calm. */
function holdTokenCount(tokens: string[]): number {
  const run = volatileSuffixTokenLen(tokens);
  if (run === 0) return 0;
  let k = Math.min(3, run);
  let strongInRun = 0;
  for (let i = tokens.length - 1; i >= 0 && i >= tokens.length - run; i--) {
    if (tokenVolatileTier(tokens[i]!) === 2) strongInRun++;
  }
  if (strongInRun > 0) k = Math.min(3, Math.max(k, Math.min(run, 3)));
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
  return { ticks: 0, lastPartial: "", lastHidden: "", sinceMs: nowMs };
}

/**
 * Map verbatim Soniox NF concatenation (`nfRaw`) to calmer NF **span text** without touching canon.
 *
 * Uses trailing structured/digit suppression + stability/age latch to reveal the held suffix (~Intercall-ish calm tail).
 */
export function morsyUrgentVolatileHypothesisDomPaint(args: {
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

  const ageExpose = nowMs - s.sinceMs >= NF_PRES_MAX_HOLD_MS;
  const tickExpose = s.ticks >= NF_PRES_REQUIRE_STABLE_TICKS;

  if (tickExpose || ageExpose) {
    resetMorsyUrgentNfPresentationScratch(s);
    s.sinceMs = nowMs;
    return nfRaw;
  }

  return partial;
}
