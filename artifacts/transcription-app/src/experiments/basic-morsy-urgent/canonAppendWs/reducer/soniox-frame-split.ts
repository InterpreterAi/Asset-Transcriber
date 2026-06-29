import type { CanonToken } from "../types/canon-token";
import type { Token } from "../types/tokens";

function isEndpointText(text: string): boolean {
  return text === "<end>" || text === "<eos>" || text === "<eps>";
}

function sonioxTokenToCanon(t: Token, idx: number): CanonToken {
  const start_ms = typeof t.startMs === "number" ? t.startMs : undefined;
  const token_id = start_ms !== undefined ? `t_${start_ms}` : `t_idx_${idx}`;
  return {
    token_id,
    text: t.text ?? "",
    is_final: t.isFinal === true,
    speaker: t.speakerId?.trim() || undefined,
    language: t.language?.trim() || undefined,
    start_ms,
    end_ms: typeof t.endMs === "number" ? t.endMs : undefined,
    confidence: typeof t.confidence === "number" ? t.confidence : undefined,
  };
}

/** Transcription tokens only — translation tokens are stripped out */
export function canonTokensFromFrame(tokens: readonly Token[]): CanonToken[] {
  const out: CanonToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (typeof t.text !== "string" || !t.text.length) continue;
    if (isEndpointText(t.text)) continue;
    if (t.translation_status === "translation") continue;
    out.push(sonioxTokenToCanon(t, i));
  }
  return out;
}

/**
 * Concatenated text of FINALIZED translation tokens in this frame.
 * Only is_final === true tokens are accumulated to prevent
 * double-counting non-final hypotheses that arrive on every frame.
 */
export function translationTextFromFrame(tokens: readonly Token[]): string {
  return tokens
    .filter(
      t =>
        t.translation_status === "translation" &&
        t.isFinal === true &&
        typeof t.text === "string" &&
        t.text.length > 0,
    )
    .map(t => t.text)
    .join("");
}

/** Infer speaker/language from the tail of the token list */
export function inferTailSpeakerLang(tokens: readonly CanonToken[]): {
  speaker?: string;
  language?: string;
} {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t.speaker || t.language) {
      return { speaker: t.speaker, language: t.language };
    }
  }
  return {};
}

/** Non-final tokens attributed to a specific speaker row */
export function nonFinalsForRow(
  nonFinals: CanonToken[],
  rowSpeaker: string | undefined,
): CanonToken[] {
  if (!rowSpeaker) return nonFinals;
  const attributed = nonFinals.filter(t => !t.speaker || t.speaker === rowSpeaker);
  return attributed.length > 0 ? attributed : nonFinals;
}
