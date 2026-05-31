/**
 * Basic · Morsy Urgent — chunk append translation (client-side state helpers).
 */

export type ChunkV2TranslateTrigger = "first_chunk" | "debounce" | "freeze";

export type MorsyChunkTranslationRowState = {
  committedSource: string;
  committedTranslation: string;
  preservedLiterals: string[];
};

export function emptyMorsyChunkTranslationRowState(): MorsyChunkTranslationRowState {
  return {
    committedSource: "",
    committedTranslation: "",
    preservedLiterals: [],
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

/** Append a translated chunk without re-translating prior committed text. */
export function appendTranslationChunk(committed: string, chunk: string): string {
  const left = committed.trimEnd();
  const right = chunk.trim();
  if (!right) return left;
  if (!left) return right;
  const needsSpace = !/^[\s,.!?;:)]/.test(chunk) && !/[\s([\-–—]$/.test(left);
  return needsSpace ? `${left} ${right}` : `${left}${chunk.startsWith(" ") ? chunk.trimStart() : chunk}`;
}

export function countChunkWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export type SelectStableChunkResult = {
  chunk: string;
  trigger: ChunkV2TranslateTrigger;
};

/** Pending stable delta to translate on debounce / first grow (append-only). */
export function selectPendingStableDelta(args: {
  pending: string;
  committedSource: string;
  firstChunk?: boolean;
  debounceFlush?: boolean;
}): SelectStableChunkResult | null {
  const pending = args.pending;
  if (!pending.trim()) return null;
  if (args.firstChunk && !args.committedSource.trim() && pending.trim().length >= 3) {
    return { chunk: pending, trigger: "first_chunk" };
  }
  if (args.debounceFlush && pending.trim().length >= 3) {
    return { chunk: pending, trigger: "debounce" };
  }
  return null;
}

/** Advance committedSource by translated chunk; returns new committed source prefix. */
export function advanceCommittedSource(
  committedSource: string,
  stableText: string,
  translatedChunkSource: string,
): string {
  const next = committedSource + translatedChunkSource;
  if (stableText.startsWith(next)) return next;
  if (stableText.startsWith(committedSource)) {
    return stableText.slice(0, committedSource.length + translatedChunkSource.length);
  }
  return next;
}

export function mergePreservedLiterals(existing: string[], added: string[]): string[] {
  const seen = new Set(existing);
  const out = [...existing];
  for (const lit of added) {
    const t = lit.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.sort((a, b) => b.length - a.length);
}

export function validateChunkV2Invariants(args: {
  rowId: string;
  committedSource: string;
  committedTranslation: string;
  stableText: string;
  prevCommittedSource: string;
  prevCommittedTranslation: string;
}): void {
  const violations: string[] = [];
  if (args.committedSource.length > args.stableText.length) {
    violations.push("committedSource.length > stableText.length");
  }
  if (
    args.committedSource.length > 0 &&
    args.stableText.length > 0 &&
    !args.stableText.startsWith(args.committedSource)
  ) {
    violations.push("committedSource is not a prefix of stableText");
  }
  if (args.committedTranslation.length < args.prevCommittedTranslation.length) {
    violations.push("committedTranslation decreased");
  }
  if (args.committedSource.length < args.prevCommittedSource.length) {
    violations.push("committedSource shrank");
  }
  if (violations.length > 0) {
    console.error("[chunk_v2_invariant_violation]", {
      rowId: args.rowId,
      violations,
      committedSourceLen: args.committedSource.length,
      stableTextLen: args.stableText.length,
      prevCommittedSourceLen: args.prevCommittedSource.length,
      prevCommittedTranslationLen: args.prevCommittedTranslation.length,
      committedTranslationLen: args.committedTranslation.length,
    });
  }
}
