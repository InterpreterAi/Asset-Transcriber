/**
 * ## Morsy Urgent V3 — isolated transcript engine (hard-fork scaffold)
 *
 * **Eligible:** `plan_type === "morsy-urgent"` AND `segmentBehaviorMode === "morsy-intercall-isolated-experiment"`.
 * **Not wired** into `{@link use-transcription.ts}` yet — integration replaces hybrid branches with:
 * WS → single reducer tick → canon + hypothesis → dumb DOM reflect → downstream translation-only consumer.
 *
 * ### Invariants (target)
 * - **One reducer** owns committed canon and live hypothesis; no parallel canon from DOM, queues, or overlap trim.
 * - **Canon:** append-only verbatim final deltas (`canon += delta`); no `dropSonioxFinalReplayAlreadyCommitted`, no k-overlap.
 * - **NF:** verbatim tail-speaker concatenation (`morsyIsolatedVerbatimRawNfHypothesis`); no token-aware subtraction, no strip.
 * - **Translation:** observes reducer output only; must not reshape canon boundaries (see eventual adapter).
 */

import type { MorsyIsolatedCanonToken } from "@/hooks/morsy-isolated-transcript-canonical";
import { morsyIsolatedVerbatimRawNfHypothesis } from "@/hooks/morsy-isolated-transcript-canonical";

export interface MorsyUrgentV3ReducerSegmentState {
  /** Append-only finalized transcript (UTF-16 string mirror of Soniox finals), reducer-owned only. */
  lockedCommittedCanon: string;
}

export interface MorsyUrgentV3WsFrameInput {
  tokens: readonly MorsyIsolatedCanonToken[];
  effSpk: readonly (string | undefined)[];
  /** Per-final `.text` pieces new in this message only, Soniox order — no replay/dedupe here. */
  finalizedTextDeltas: readonly string[];
  isEndpointToken: (t: MorsyIsolatedCanonToken) => boolean;
}

export interface MorsyUrgentV3WsFrameResult {
  nextSegment: MorsyUrgentV3ReducerSegmentState;
  nfHypothesisVerbatim: string;
}

export function applyFinalDeltasAppendOnlyCanon(priorCanon: string, deltas: readonly string[]): string {
  let s = priorCanon;
  for (const piece of deltas) s += piece ?? "";
  return s;
}

/**
 * Pure single-frame reducer: one WebSocket payload worth of deltas + current token hypothesis.
 * Caller merges `nextSegment` into segment store and paints DOM from these strings only.
 */
export function reduceMorsyUrgentV3WsFrame(
  prev: MorsyUrgentV3ReducerSegmentState,
  frame: MorsyUrgentV3WsFrameInput,
): MorsyUrgentV3WsFrameResult {
  const nextLocked = applyFinalDeltasAppendOnlyCanon(prev.lockedCommittedCanon, frame.finalizedTextDeltas);
  const { nfRaw } = morsyIsolatedVerbatimRawNfHypothesis({
    tokens: frame.tokens,
    effSpk: frame.effSpk,
    isEndpointToken: frame.isEndpointToken,
  });
  return {
    nextSegment: { lockedCommittedCanon: nextLocked },
    nfHypothesisVerbatim: nfRaw,
  };
}
