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
  let result = "";
  for (const token of tokens) {
    const text = token.text;
    // Soniox adds a period when it finalizes a token at a pause boundary.
    // If the next token continues mid-sentence (starts with lowercase, digit,
    // apostrophe, or hyphen), that period is spurious — strip it before joining.
    if (result.endsWith(".") && /^\s*[a-z0-9'\-]/.test(text)) {
      result = result.slice(0, -1);
    }
    result += text;
  }
  return result;
}
