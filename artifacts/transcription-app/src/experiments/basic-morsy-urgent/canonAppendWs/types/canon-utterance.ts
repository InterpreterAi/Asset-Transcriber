import type { CanonToken, TranscriptRow } from "./canon-token";

/**
 * Conversational utterance tier (Soniox SDK-ish `RealtimeUtterance`): aggregates low-level segment rows before UI.
 * Rows in the transcript projection derive from utterances — not raw websocket segment churn.
 */
export type CanonUtterance = {
  utterance_id: string;
  speaker?: string;
  language?: string;
  /** Frozen Soniox-style segment primitives inside this conversational unit. */
  segments: TranscriptRow[];
  /** Rollup mirrors {@link segments} — kept explicit for stabilization / exporters. */
  committedTokens: CanonToken[];
  liveTokens: CanonToken[];
  start_ms?: number;
  end_ms?: number;
  is_final: boolean;
  /** Wall-clock when this utterance started (confidence / silence heuristics). */
  utteranceOpenedWallMs?: number;
};
