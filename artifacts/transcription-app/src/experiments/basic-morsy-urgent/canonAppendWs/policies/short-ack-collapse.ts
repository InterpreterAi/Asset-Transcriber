/**
 * Collapse Soniox short-ack spam on chunk-v2.
 *
 * Root cause: final token IDs are message-scoped, so the same short
 * "تمام" / "لا" can append once per websocket frame. Also a single final
 * can already contain dozens of repeated acks.
 */
import type { CanonToken } from "../types/canon-token";
import type { EngineState } from "../types/transcript";
import { isChunkV2ShortAcknowledgement } from "./short-acknowledgement";

/** Max audio gap (ms) between identical short acks still treated as one loop. */
export const SHORT_ACK_DUP_MAX_GAP_MS = 500;

export function normalizeShortAckText(text: string): string {
  return (text ?? "")
    .trim()
    .replace(/^[\s"'«»]+|[\s"'«»]+$/g, "")
    .replace(/[!?؟،,.…]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * If a final is ONLY the same short ack repeated (e.g. "لا لا. لا لا. …"
 * or "تمام. تمام. تمام."), keep a single copy of what was really said.
 */
export function collapseInternalShortAckSpam(text: string): string {
  const raw = text ?? "";
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const sentenceParts = trimmed.split(/(?<=[.!?؟])\s+/u).map((p) => p.trim()).filter(Boolean);
  if (sentenceParts.length >= 3) {
    const norms = sentenceParts.map(normalizeShortAckText);
    const first = norms[0]!;
    if (
      first &&
      isChunkV2ShortAcknowledgement(sentenceParts[0]!) &&
      norms.every((n) => n === first)
    ) {
      return sentenceParts[0]!;
    }
  }

  const words = trimmed
    .replace(/[.!?؟،,]+/gu, " ")
    .split(/\s+/u)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length >= 4) {
    const firstNorm = normalizeShortAckText(words[0]!);
    if (
      firstNorm &&
      isChunkV2ShortAcknowledgement(words[0]!) &&
      words.every((w) => normalizeShortAckText(w) === firstNorm)
    ) {
      // Keep a natural double ("لا لا" / "No no") at most — never a storm.
      const kept = words.slice(0, 2).join(" ");
      const trail = /[.!?؟]$/u.test(trimmed) ? trimmed.match(/[.!?؟]$/u)![0]! : "";
      return `${kept}${trail}`;
    }
  }

  return raw;
}

function lastActiveFinal(state: EngineState): CanonToken | undefined {
  const toks = state.activeUtterance?.finalTokens;
  if (!toks?.length) return undefined;
  return toks[toks.length - 1];
}

function tokenEndMs(t: CanonToken): number | undefined {
  if (typeof t.end_ms === "number" && Number.isFinite(t.end_ms)) return t.end_ms;
  if (typeof t.start_ms === "number" && Number.isFinite(t.start_ms)) return t.start_ms;
  return undefined;
}

function tokenStartMs(t: CanonToken): number | undefined {
  if (typeof t.start_ms === "number" && Number.isFinite(t.start_ms)) return t.start_ms;
  if (typeof t.end_ms === "number" && Number.isFinite(t.end_ms)) return t.end_ms;
  return undefined;
}

/**
 * Skip appending when the open row's last final is the same short ack and
 * audio timing overlaps / is within a tiny gap (ASR loop), or timings missing.
 */
export function shouldSkipDuplicateShortAckFinal(
  state: EngineState,
  incoming: CanonToken,
): boolean {
  if (!isChunkV2ShortAcknowledgement(incoming.text)) return false;
  const last = lastActiveFinal(state);
  if (!last || !isChunkV2ShortAcknowledgement(last.text)) return false;
  if (normalizeShortAckText(last.text) !== normalizeShortAckText(incoming.text)) {
    return false;
  }

  const prevEnd = tokenEndMs(last);
  const nextStart = tokenStartMs(incoming);
  if (prevEnd === undefined || nextStart === undefined) {
    // No timings — identical consecutive short acks are almost always loops.
    return true;
  }
  const gap = nextStart - prevEnd;
  return gap <= SHORT_ACK_DUP_MAX_GAP_MS;
}

/**
 * Collapse consecutive identical short-ack sentences in translation text
 * (native TX has no per-token id dedupe).
 */
export function collapseConsecutiveShortAckSegments(text: string): string {
  const raw = text ?? "";
  if (!raw.trim()) return raw;
  const collapsedOnce = collapseInternalShortAckSpam(raw);
  const parts = collapsedOnce.split(/(?<=[.!?؟])\s+/u);
  if (parts.length < 2) return collapsedOnce;

  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      isChunkV2ShortAcknowledgement(trimmed) &&
      isChunkV2ShortAcknowledgement(prev) &&
      normalizeShortAckText(prev) === normalizeShortAckText(trimmed)
    ) {
      continue;
    }
    out.push(trimmed);
  }
  return out.join(" ");
}
