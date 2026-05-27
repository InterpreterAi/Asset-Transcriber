import type { CanonToken } from "../types/canon-token";
import type { Token } from "../types/tokens";

import { sonioxTokenToCanon } from "./soniox-to-canon";

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

function isEndpointText(text: string): boolean {
  return /<end>/i.test(text);
}

export function canonTokensFromFrame(tokens: readonly Token[]): CanonToken[] {
  const out: CanonToken[] = [];
  for (const t of tokens) {
    if (typeof t.text !== "string" || !t.text.length || isEndpointText(t.text)) continue;
    out.push(sonioxTokenToCanon(t));
  }
  return out;
}

/** Tail speaker/lang from last token in frame that carries metadata (matches production hook). */
export function inferTailSpeakerLang(tokens: readonly CanonToken[]): {
  speaker?: string;
  language?: string;
} {
  let speaker: string | undefined;
  let language: string | undefined;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (!speaker && norm(t.speaker)) speaker = norm(t.speaker);
    if (!language && norm(t.language)) language = norm(t.language);
    if (speaker && language) break;
  }
  return { speaker, language: language?.split("-")[0]!.toLowerCase() };
}

/** Non-finals for active row — same speaker as row when row speaker is known. */
export function nonFinalsForRow(
  frameNonFinals: readonly CanonToken[],
  rowSpeaker: string | undefined,
): CanonToken[] {
  const rsp = norm(rowSpeaker);
  if (!rsp) return [...frameNonFinals];
  return frameNonFinals.filter(t => {
    const tsp = norm(t.speaker);
    return !tsp || tsp === rsp;
  });
}
