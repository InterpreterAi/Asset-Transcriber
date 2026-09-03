import type { CanonToken } from "./canon-token";
import type { CanonUtterance } from "./canon-utterance";

/**
 * Soniox-docs-faithful engine state (Basic · Morsy Urgent canonAppendWs only).
 * @see https://soniox.com/docs/stt/rt/real-time-transcription
 */
export type EngineState = {
  finalizedUtterances: CanonUtterance[];
  activeUtterance: CanonUtterance | null;
  activeTranslationText: string;
  activeTranslationPreviewText: string;
  speakerChangeConsecutive: number;
  /** First new-speaker finals held off the old row until the handoff is real. */
  pendingSpeakerId: string | undefined;
  pendingSpeakerFinals: CanonToken[];
  nextUtteranceSeq: number;
  /** Dedupe — Soniox sends each final token once. */
  seenFinalTokenIds: string[];

  lastFrameSeq: number;
  lastFinalAudioProcMs: number | null;
  lastTotalAudioProcMs: number | null;
  lastHypothesisLagMs: number | null;

  /** Soniox `<end>` seen — row closes only after quiet + finalized tail (Intercall-style). */
  endpointPending: boolean;
  endpointPendingAtMs: number;
  lastTokenActivityWallMs: number;

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
    activeTranslationText: "",
    activeTranslationPreviewText: "",
    speakerChangeConsecutive: 0,
    pendingSpeakerId: undefined,
    pendingSpeakerFinals: [],
    nextUtteranceSeq: 0,
    seenFinalTokenIds: [],

    lastFrameSeq: 0,
    lastFinalAudioProcMs: null,
    lastTotalAudioProcMs: null,
    lastHypothesisLagMs: null,

    endpointPending: false,
    endpointPendingAtMs: 0,
    lastTokenActivityWallMs: 0,

    metrics: {
      speakerFlipCount: 0,
      rowsFrozen: 0,
      finalsAppended: 0,
    },
  };
}
