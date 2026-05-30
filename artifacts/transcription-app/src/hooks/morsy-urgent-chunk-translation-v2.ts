/**
 * Basic · Morsy Urgent — chunk append translation (client-side state helpers).
 */

export type MorsyChunkTranslationRowState = {
  committedSource: string;
  committedTranslation: string;
  liveSource: string;
  liveTranslation: string;
};

export function emptyMorsyChunkTranslationRowState(): MorsyChunkTranslationRowState {
  return {
    committedSource: "",
    committedTranslation: "",
    liveSource: "",
    liveTranslation: "",
  };
}

/** New Soniox finals since last committed stable source (append-only). */
export function extractNewStableChunk(stableText: string, committedSource: string): string {
  const stable = stableText;
  const committed = committedSource;
  if (!stable.length) return "";
  if (!committed.length) return stable;
  if (stable.startsWith(committed)) {
    return stable.slice(committed.length);
  }
  return stable;
}

/** Non-final NF tail after committed Soniox finals. */
export function extractLiveTail(visibleText: string, stableText: string): string {
  const visible = visibleText;
  const stable = stableText;
  if (!visible.length) return "";
  if (!stable.length) return visible;
  if (visible.startsWith(stable)) {
    return visible.slice(stable.length);
  }
  return visible;
}

/** Append a translated chunk without re-translating prior committed text. */
export function appendTranslationChunk(committed: string, chunk: string): string {
  const left = committed.trimEnd();
  const right = chunk.trim();
  if (!right) return left;
  if (!left) return right;
  const needsSpace = !/^[\s,.!?;:)]/.test(chunk) && !/[\s([\-–—]$/.test(left);
  return needsSpace ? `${left} ${right}` : `${left}${chunk.startsWith(" ") ? chunk.trimStart() : chunk}`;
}
