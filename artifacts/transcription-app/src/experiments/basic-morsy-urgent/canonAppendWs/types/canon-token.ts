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
  for (let i = 0; i < tokens.length; i++) {
    const txt = tokens[i]!.text;
    // Prevent double spacing but preserve explicit token spacing.
    if (txt.startsWith(" ") && result.endsWith(" ")) {
      result += txt.slice(1);
    } else {
      result += txt;
    }
  }
  return result;
}
