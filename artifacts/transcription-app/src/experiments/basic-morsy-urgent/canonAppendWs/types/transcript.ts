import type { CanonUtterance } from "./canon-utterance";

/**
 * Soniox-docs-faithful engine state (Basic · Morsy Urgent canonAppendWs only).
 * @see https://soniox.com/docs/stt/rt/real-time-transcription
 */
export type EngineState = {
  finalizedUtterances: CanonUtterance[];
  activeUtterance: CanonUtterance | null;
  nextUtteranceSeq: number;
  /** Dedupe — Soniox sends each final token once. */
  seenFinalTokenIds: string[];

  lastFrameSeq: number;
  lastFinalAudioProcMs: number | null;
  lastTotalAudioProcMs: number | null;
  lastHypothesisLagMs: number | null;

  metrics: {
    speakerFlipCount: number;
    rowsFrozen: number;
    finalsAppended: number;
  };
};

export function createInitialEngineState(): EngineState {
  return {
    finalizedUtterances: [],
    activeUtterance: null,
    nextUtteranceSeq: 0,
    seenFinalTokenIds: [],

    lastFrameSeq: 0,
    lastFinalAudioProcMs: null,
    lastTotalAudioProcMs: null,
    lastHypothesisLagMs: null,

    metrics: {
      speakerFlipCount: 0,
      rowsFrozen: 0,
      finalsAppended: 0,
    },
  };
}
