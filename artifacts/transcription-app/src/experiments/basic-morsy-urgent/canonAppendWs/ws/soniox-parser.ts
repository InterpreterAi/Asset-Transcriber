import type { Token } from "../types/tokens";
import type { SonioxFrame } from "./frame-types";

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
}

function tokenConfidence(t: RawSonioxToken): number {
  const c = t.confidence;
  return typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 1;
}

/**
 * Parses one Soniox websocket payload into normalized {@link SonioxFrame}.
 * Assigns deterministic local ids; never touches DOM.
 */
export function parseSonioxWebSocketPayload(
  rawJson: unknown,
  messageSeq: number,
): SonioxFrame | null {
  let msg: { tokens?: RawSonioxToken[]; finished?: unknown };
  try {
    msg = typeof rawJson === "string" ? (JSON.parse(rawJson) as typeof msg) : (rawJson as typeof msg);
  } catch {
    return null;
  }
  const arr = msg?.tokens ?? [];
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
    tokens.push({
      id: `t-${messageSeq}-${i}-${fin ? "F" : "N"}`,
      text,
      isFinal: fin,
      confidence: tokenConfidence(t),
      startMs: typeof t.start_ms === "number" ? t.start_ms : undefined,
      endMs: typeof t.end_ms === "number" ? t.end_ms : undefined,
      speakerId,
    });
  }

  let tailSpeaker: string | undefined;
  for (let j = tokens.length - 1; j >= 0; j--) {
    if (tokens[j]!.speakerId) {
      tailSpeaker = tokens[j]!.speakerId;
      break;
    }
  }

  return {
    seq: messageSeq,
    tokens,
    endpoint,
    speaker: tailSpeaker,
    timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
  };
}
