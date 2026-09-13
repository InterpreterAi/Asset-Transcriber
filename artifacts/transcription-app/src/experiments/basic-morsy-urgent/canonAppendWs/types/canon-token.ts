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

/**
 * Concatenate text parts the way Soniox tokens join: preserve each part's
 * own spacing, but never emit a double space when both sides already have one.
 * Does not insert a separator — callers rely on trailing/leading spaces in the parts.
 */
function isArabicLetter(ch: string | undefined): boolean {
  return !!ch && /[\u0600-\u06FF]/.test(ch);
}

export function joinCanonTextParts(parts: readonly string[]): string {
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    const txt = parts[i]!;
    if (!txt) continue;
    if (txt.startsWith(" ") && result.endsWith(" ")) {
      result += txt.slice(1);
      continue;
    }
    // Soniox tokens carry their own spaces (docs: " morn" + "ing").
    // Arabic tokens often arrive without a space between words — insert one
    // so we do not glue فحصها into تتأكهذه-style runs.
    if (
      result.length > 0 &&
      !result.endsWith(" ") &&
      !txt.startsWith(" ") &&
      isArabicLetter(result[result.length - 1]) &&
      isArabicLetter(txt[0])
    ) {
      result += ` ${txt}`;
      continue;
    }
    result += txt;
  }
  return result;
}

export function joinCanonText(tokens: readonly CanonToken[]): string {
  return joinCanonTextParts(tokens.map(t => t.text));
}
