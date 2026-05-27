import type { Token } from "../types/tokens";
import type { SonioxFrame } from "./frame-types";

import { stableSonioxTokenId } from "../policies/token-identity";

function isSonioxEndpointPiece(text: unknown): boolean {
  return typeof text === "string" && /<end>/i.test(text);
}

interface RawSonioxToken {
  text?: unknown;
  is_final?: unknown;
  confidence?: unknown;
  start_ms?: unknown;
  end_ms?: unknown;
  speaker?: unknown;
  language?: unknown;
  lang?: unknown;
  token_index?: unknown;
  index?: unknown;
  id?: unknown;
}

function tokenConfidence(t: RawSonioxToken): number {
  const c = t.confidence;
  return typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
}

function stableTokenId(t: RawSonioxToken, messageSeq: number, i: number): string {
  return stableSonioxTokenId({
    token_index: t.token_index,
    index: t.index,
    id: t.id,
    start_ms: t.start_ms,
    end_ms: t.end_ms,
    messageSeq,
    arrIndex: i,
  });
}

function parseLanguageField(t: RawSonioxToken): string | undefined {
  const langRaw = t.language ?? t.lang;
  if (typeof langRaw !== "string" || !langRaw.trim()) return undefined;
  return langRaw.trim().toLowerCase();
}

/**
 * Parses one Soniox websocket payload into normalized {@link SonioxFrame}.
 * Assigns deterministic local ids; never touches DOM.
 */
export function parseSonioxWebSocketPayload(
  rawJson: unknown,
  messageSeq: number,
): SonioxFrame | null {
  let msg: {
    tokens?: RawSonioxToken[];
    finished?: unknown;
    final_audio_proc_ms?: unknown;
    total_audio_proc_ms?: unknown;
  };
  try {
    msg = typeof rawJson === "string" ? (JSON.parse(rawJson) as typeof msg) : (rawJson as typeof msg);
  } catch {
    return null;
  }
  const arr = msg?.tokens ?? [];

  const procNum = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const finalAudioProcMs = procNum(msg.final_audio_proc_ms);
  const totalAudioProcMs = procNum(msg.total_audio_proc_ms);
  if (!Array.isArray(arr)) return null;

  let endpoint = false;
  const tokens: Token[] = [];
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i]!;
    const text = typeof t.text === "string" ? t.text : "";
    const fin = Boolean(t.is_final);
    if (fin && isSonioxEndpointPiece(text)) {
      endpoint = true;
      continue;
    }
    const spkRaw = t.speaker;
    const speakerId =
      spkRaw === undefined || spkRaw === null
        ? undefined
        : typeof spkRaw === "number" || typeof spkRaw === "string"
          ? String(spkRaw)
          : undefined;
    const language = parseLanguageField(t as RawSonioxToken);

    tokens.push({
      id: stableTokenId(t as RawSonioxToken, messageSeq, i),
      text,
      isFinal: fin,
      confidence: tokenConfidence(t as RawSonioxToken),
      startMs: typeof t.start_ms === "number" ? t.start_ms : undefined,
      endMs: typeof t.end_ms === "number" ? t.end_ms : undefined,
      speakerId,
      language,
    });
  }

  let tailSpeaker: string | undefined;
  for (let j = tokens.length - 1; j >= 0; j--) {
    if (tokens[j]!.speakerId) {
      tailSpeaker = tokens[j]!.speakerId;
      break;
    }
  }
  let tailLanguage: string | undefined;
  for (let k = tokens.length - 1; k >= 0; k--) {
    if (tokens[k]!.language) {
      tailLanguage = tokens[k]!.language;
      break;
    }
  }

  return {
    seq: messageSeq,
    tokens,
    endpoint,
    speaker: tailSpeaker,
    language: tailLanguage,
    timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
    final_audio_proc_ms: finalAudioProcMs,
    total_audio_proc_ms: totalAudioProcMs,
  };
}
