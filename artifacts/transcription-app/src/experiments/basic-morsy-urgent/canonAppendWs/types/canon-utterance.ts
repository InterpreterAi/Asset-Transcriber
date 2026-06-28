import type { CanonToken } from "./canon-token";
import { joinCanonText } from "./canon-token";

/**
 * One Intercall-style row — Soniox docs model per row:
 * - `finalTokens` append once each (never rewritten)
 * - `nonFinalTokens` replaced every websocket frame while row is active
 */
export type CanonUtterance = {
  utterance_id: string;
  /** Confirmed Soniox finals for this row — append-only. */
  finalTokens: CanonToken[];
  /** Current-frame non-finals — full replace each response. */
  nonFinalTokens: CanonToken[];
  speaker?: string;
  language?: string;
  start_ms?: number;
  end_ms?: number;
  is_final: boolean;
};

export function utteranceCommittedText(u: CanonUtterance): string {
  return joinCanonText(u.finalTokens);
}

export function utteranceLiveText(u: CanonUtterance): string {
  return joinCanonText(u.nonFinalTokens);
}

export function utteranceVisibleText(u: CanonUtterance): string {
  return utteranceCommittedText(u) + utteranceLiveText(u);
}
