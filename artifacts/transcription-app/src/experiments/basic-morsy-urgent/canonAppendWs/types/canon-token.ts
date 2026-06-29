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
    result += tokens[i].text;
    const next = tokens[i + 1]?.text;
    // If this token ends with a period AND the next token continues mid-sentence,
    // the period is a spurious Soniox boundary marker — remove it.
    if (result.endsWith(".") && next !== undefined && /^\s*[a-z0-9''\u0027\-]/.test(next)) {
      result = result.slice(0, -1);
    }
  }
  return result;
}
