/**
 * Canonical Soniox token shape for Basic · Morsy Urgent (canonAppendWs) only.
 * Normalized from websocket payloads — UI never renders raw packets.
 */

export type CanonToken = {
  token_id: string;
  text: string;
  is_final: boolean;
  confidence?: number;
  start_ms?: number;
  end_ms?: number;
  speaker?: string;
  language?: string;
};

export type TranscriptRow = {
  row_id: string;
  speaker?: string;
  language?: string;
  /** From Soniox token timings when present */
  start_ms?: number;
  end_ms?: number;
  committedTokens: CanonToken[];
  /**
   * Current non-final hypothesis only — **replaced** on every SONIOX response, never pushed across frames.
   */
  liveTokens: CanonToken[];
  finalized: boolean;
  openedWallMs?: number;
};

export function joinCanonText(tokens: readonly CanonToken[]): string {
  let result = tokens.map(t => t.text).join("");
  // Remove spurious period inserted at Soniox utterance boundaries
  // when the next token starts with a lowercase letter or digit.
  // e.g. "Today. 's meeting" → "Today's meeting"
  // "The patient. was" → "The patient was"
  result = result.replace(/\.\s+([a-z0-9'\u0027\u2019\-])/g, " $1");
  return result;
}
