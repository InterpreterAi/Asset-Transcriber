import type { CanonToken, TranscriptRow } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";

import {
  LANGUAGE_SWITCH_HOLD_MS,
  LANGUAGE_SWITCH_MIN_CONFLICT_TOKENS,
  MAX_UTTERANCE_WALL_MS,
  MIN_UTTERANCE_CHARS,
  MIN_UTTERANCE_TOKENS,
  SPEAKER_SWITCH_MIN_CONFLICT_TOKENS,
  SPEAKER_SWITCH_HOLD_MS,
} from "./segmentation-constants";

/** Why a transcript row was sealed (debug ring). */
export type SegmentCloseReason =
  | "endpoint"
  | "silence"
  | "speaker_switch"
  | "language_switch"
  | "manual_finalize"
  | "max_duration";

export type SegmentHoldState = {
  speaker: {
    candidate: string | null;
    firstSeenMs: number;
    consecutive: number;
  };
  language: {
    candidate: string | null;
    firstSeenMs: number;
    consecutive: number;
  };
  deferredSwitchPending: boolean;
};

export function createInitialSegmentHold(): SegmentHoldState {
  return {
    speaker: { candidate: null, firstSeenMs: 0, consecutive: 0 },
    language: { candidate: null, firstSeenMs: 0, consecutive: 0 },
    deferredSwitchPending: false,
  };
}

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

export function tailMeetsMinUtterance(tail: TranscriptRow): boolean {
  const chars = joinCanonText(tail.committedTokens).length;
  const tokCount = tail.committedTokens.length;
  return chars >= MIN_UTTERANCE_CHARS || tokCount >= MIN_UTTERANCE_TOKENS;
}

export function tailExceedsMaxWallDuration(tail: TranscriptRow, wallMs: number): boolean {
  const opened = tail.openedWallMs;
  if (opened === undefined || opened <= 0) return false;
  return wallMs - opened >= MAX_UTTERANCE_WALL_MS;
}

/** Drop live prefix that duplicates committed suffix (final vs live handoff). */
export function stripLivePrefixOverlappingCommittedSuffix(tail: TranscriptRow): TranscriptRow {
  const C = joinCanonText(tail.committedTokens);
  const tokens = tail.liveTokens;
  if (!tokens.length || !C.length) return tail;

  const L = joinCanonText(tokens);
  if (!L.length) return tail;

  let maxOverlap = 0;
  const maxCheck = Math.min(C.length, L.length);
  for (let k = maxCheck; k > 0; k--) {
    if (C.slice(-k) === L.slice(0, k)) {
      maxOverlap = k;
      break;
    }
  }
  if (maxOverlap === 0) return tail;

  let skip = maxOverlap;
  const out: CanonToken[] = [];
  for (const t of tokens) {
    const len = t.text.length;
    if (skip >= len) {
      skip -= len;
      continue;
    }
    const slice = t.text.slice(skip);
    skip = 0;
    if (slice.length) {
      out.push({ ...t, text: slice });
    }
  }

  return { ...tail, liveTokens: out };
}

type HoldEval = {
  segmentHold: SegmentHoldState;
  shouldSplit: boolean;
  splitReason: SegmentCloseReason | null;
};

/**
 * Seal tail before this **final** token only when hold thresholds say so (not on single stray tags).
 */
export function evaluateSegmentHoldForFinal(
  tail: TranscriptRow,
  ct: CanonToken,
  wallMs: number,
  hold: SegmentHoldState,
  hardEndpoint: boolean,
): HoldEval {
  let nextHold: SegmentHoldState = {
    speaker: { ...hold.speaker },
    language: { ...hold.language },
    deferredSwitchPending: hold.deferredSwitchPending,
  };

  const sp = norm(ct.speaker);
  const lg = norm(ct.language);
  const tailSp = norm(tail.speaker);
  const tailLg = norm(tail.language);

  let shouldSplit = false;
  let splitReason: SegmentCloseReason | null = null;

  const resetSpeakerHold = () => {
    nextHold.speaker = { candidate: null, firstSeenMs: 0, consecutive: 0 };
  };
  const resetLangHold = () => {
    nextHold.language = { candidate: null, firstSeenMs: 0, consecutive: 0 };
  };

  if (sp && tailSp && sp !== tailSp) {
    if (nextHold.speaker.candidate !== sp) {
      nextHold.speaker = { candidate: sp, firstSeenMs: wallMs, consecutive: 1 };
    } else {
      nextHold.speaker = {
        ...nextHold.speaker,
        consecutive: nextHold.speaker.consecutive + 1,
      };
    }
    const dwell = wallMs - nextHold.speaker.firstSeenMs;
    const speakerReady =
      nextHold.speaker.consecutive >= SPEAKER_SWITCH_MIN_CONFLICT_TOKENS ||
      dwell >= SPEAKER_SWITCH_HOLD_MS;
    if (speakerReady) {
      if (hardEndpoint || tailMeetsMinUtterance(tail)) {
        shouldSplit = true;
        splitReason = "speaker_switch";
        nextHold.deferredSwitchPending = false;
        resetSpeakerHold();
        resetLangHold();
      } else {
        nextHold.deferredSwitchPending = true;
      }
    }
  } else if (sp && tailSp && sp === tailSp) {
    resetSpeakerHold();
  }

  if (!shouldSplit && lg && tailLg && lg !== tailLg) {
    if (nextHold.language.candidate !== lg) {
      nextHold.language = { candidate: lg, firstSeenMs: wallMs, consecutive: 1 };
    } else {
      nextHold.language = {
        ...nextHold.language,
        consecutive: nextHold.language.consecutive + 1,
      };
    }
    const dwellL = wallMs - nextHold.language.firstSeenMs;
    const langReady =
      nextHold.language.consecutive >= LANGUAGE_SWITCH_MIN_CONFLICT_TOKENS ||
      dwellL >= LANGUAGE_SWITCH_HOLD_MS;
    if (langReady) {
      if (hardEndpoint || tailMeetsMinUtterance(tail)) {
        shouldSplit = true;
        splitReason = "language_switch";
        nextHold.deferredSwitchPending = false;
        resetLangHold();
        resetSpeakerHold();
      } else {
        nextHold.deferredSwitchPending = true;
      }
    }
  } else if (lg && tailLg && lg === tailLg) {
    resetLangHold();
  }

  if (!shouldSplit && nextHold.deferredSwitchPending && tailMeetsMinUtterance(tail)) {
    const spConflict = sp && tailSp && sp !== tailSp;
    const lgConflict = lg && tailLg && lg !== tailLg;
    if (spConflict) {
      shouldSplit = true;
      splitReason = "speaker_switch";
      nextHold.deferredSwitchPending = false;
      resetSpeakerHold();
      resetLangHold();
    } else if (lgConflict) {
      shouldSplit = true;
      splitReason = "language_switch";
      nextHold.deferredSwitchPending = false;
      resetSpeakerHold();
      resetLangHold();
    } else {
      nextHold.deferredSwitchPending = false;
    }
  }

  if (!shouldSplit && tailExceedsMaxWallDuration(tail, wallMs)) {
    shouldSplit = true;
    splitReason = "max_duration";
    nextHold.deferredSwitchPending = false;
    resetSpeakerHold();
    resetLangHold();
  }

  return { segmentHold: nextHold, shouldSplit, splitReason };
}
