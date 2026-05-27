/**
 * Immutable-prefix streaming — committed text is append-only; only mutableTail may change.
 * Basic · Morsy Urgent canonAppendWs ONLY.
 */

import type { CanonToken } from "../types/canon-token";
import { joinCanonText } from "../types/canon-token";

/** Strip hypothesis that replays already-finalized committed blocks. */
export function stripReplayFromHypothesis(hypothesis: string, consumedBlocks: readonly string[]): string {
  let p = hypothesis;
  if (!p.length) return p;

  for (const block of consumedBlocks) {
    if (!block.length) continue;
    if (p.startsWith(block)) {
      p = p.slice(block.length);
    }
  }

  const allConsumed = consumedBlocks.join("");
  if (allConsumed.length) {
    let maxOverlap = 0;
    const maxCheck = Math.min(allConsumed.length, p.length);
    for (let k = maxCheck; k > 0; k--) {
      if (allConsumed.slice(-k) === p.slice(0, k)) {
        maxOverlap = k;
        break;
      }
    }
    p = p.slice(maxOverlap);
  }

  return p;
}

/**
 * Compute mutable tail relative to immutable committed prefix.
 * NEVER returns text that would rewrite committedText.
 */
export function computeMutableTail(committedText: string, paintHypothesis: string): string {
  const stripped = paintHypothesis;
  if (!stripped.length) return "";

  if (!committedText.length) return stripped;

  if (stripped.startsWith(committedText)) {
    return stripped.slice(committedText.length);
  }

  let maxOverlap = 0;
  const maxCheck = Math.min(committedText.length, stripped.length);
  for (let k = maxCheck; k > 0; k--) {
    if (committedText.slice(-k) === stripped.slice(0, k)) {
      maxOverlap = k;
      break;
    }
  }
  return stripped.slice(maxOverlap);
}

/** Append-only merge of mutable tail into committed at freeze boundary. */
export function appendReconciledSuffix(committedText: string, mutableTail: string): string {
  if (!mutableTail.length) return committedText;
  const tail = computeMutableTail(committedText, mutableTail);
  if (!tail.length) return committedText;
  return committedText + tail;
}

function norm(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t?.length ? t : undefined;
}

/**
 * Cross-speaker / cross-language paint must NOT mutate a locked row.
 * Returns tokens eligible to update this row's mutableTail.
 */
export function filterPaintByOwnership(
  tokens: readonly CanonToken[],
  rowSpeaker: string | undefined,
  rowLanguage: string | undefined,
  ownershipLocked: boolean,
): CanonToken[] {
  if (!ownershipLocked) return [...tokens];

  const sp = norm(rowSpeaker);
  const lg = norm(rowLanguage);
  if (!sp && !lg) return [...tokens];

  return tokens.filter(t => {
    const ts = norm(t.speaker);
    const tl = norm(t.language);
    if (sp && ts && ts !== sp) return false;
    if (lg && tl && tl !== lg) return false;
    return true;
  });
}

export function paintJoinFiltered(
  tokens: readonly CanonToken[],
  rowSpeaker: string | undefined,
  rowLanguage: string | undefined,
  ownershipLocked: boolean,
): string {
  return joinCanonText(filterPaintByOwnership(tokens, rowSpeaker, rowLanguage, ownershipLocked));
}

/** Append-only structural advance from one stabilized final token. */
export function appendFinalTextToCommitted(committedText: string, finalText: string): string | null {
  if (!finalText.length) return null;
  if (!committedText.length) return finalText;
  if (committedText === finalText || committedText.endsWith(finalText)) return null;

  if (finalText.startsWith(committedText) && finalText.length > committedText.length) {
    return finalText;
  }

  let maxOverlap = 0;
  const maxCheck = Math.min(committedText.length, finalText.length);
  for (let k = maxCheck; k > 0; k--) {
    if (committedText.slice(-k) === finalText.slice(0, k)) {
      maxOverlap = k;
      break;
    }
  }
  const delta = finalText.slice(maxOverlap);
  if (!delta.length) return null;

  if (committedText.includes(delta) && !committedText.endsWith(delta)) return null;

  return committedText + delta;
}
