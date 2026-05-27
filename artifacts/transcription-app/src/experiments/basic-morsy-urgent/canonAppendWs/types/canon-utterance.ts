import type { CanonToken } from "./canon-token";

/**
 * Immutable-prefix streaming row — Intercall-shaped conversational unit.
 * `committedText` is append-only and never rewritten; `mutableTail` is the sole mutable hypothesis.
 */
export type CanonUtterance = {
  utterance_id: string;
  /** Append-only immutable prefix — NEVER rewritten after advance. */
  committedText: string;
  /** Visual-only hypothesis tail; replaced/shrunk relative to committedText only. */
  mutableTail: string;
  speaker?: string;
  language?: string;
  /** When true, only matching speaker/lang paint may update mutableTail. */
  ownershipLocked: boolean;
  /** Monotonic UTF-16 cursor == committedText.length after each advance. */
  commitCursorUtf16: number;
  /** Stabilized final token ids already merged into committedText. */
  committedTokenIds: string[];
  start_ms?: number;
  end_ms?: number;
  is_final: boolean;
  utteranceOpenedWallMs?: number;
};

/** @deprecated Legacy token rollup — use committedText on frozen rows. */
export type LegacyCommittedTokens = CanonToken[];
