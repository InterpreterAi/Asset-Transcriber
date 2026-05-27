import type { CanonToken } from "../types/canon-token";
import type { Token } from "../types/tokens";

/** Map normalized Soniox {@link Token} into experiment {@link CanonToken}. */
export function sonioxTokenToCanon(t: Token): CanonToken {
  const spRaw = (t.speakerId ?? "").trim();
  const lgRaw = (t.language ?? "").trim();
  const c = t.confidence;
  const confidence = typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : undefined;
  return {
    token_id: t.id,
    text: t.text,
    is_final: t.isFinal,
    confidence,
    start_ms: t.startMs,
    end_ms: t.endMs,
    speaker: spRaw.length ? spRaw : undefined,
    language: lgRaw.length ? lgRaw.toLowerCase() : undefined,
  };
}
