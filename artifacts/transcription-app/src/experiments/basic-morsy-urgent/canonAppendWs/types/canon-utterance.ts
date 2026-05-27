import type { CanonToken } from "./canon-token";

/**
 * Structural conversational unit — committed stabilized text only.
 * Live hypothesis lives exclusively in {@link PaintBuffer} on {@link EngineState}.
 */
export type CanonUtterance = {
  utterance_id: string;
  /** Derived ONLY from committed stabilized finals (never paint). */
  speaker?: string;
  language?: string;
  committedTokens: CanonToken[];
  start_ms?: number;
  end_ms?: number;
  is_final: boolean;
  utteranceOpenedWallMs?: number;
};
