import type { CanonUtterance } from "../types/canon-utterance";
import { utteranceCommittedText, utteranceLiveText } from "../types/canon-utterance";

/** Wait for Soniox to finalize tail tokens after `<end>` before closing row. */
export const ENDPOINT_ROW_CLOSE_QUIET_MS = 520;

export function endsWithSentenceBoundary(text: string): boolean {
  const t = text.replace(/\s+$/u, "");
  if (!t.length) return false;
  const last = t[t.length - 1]!;
  return (
    last === "." ||
    last === "?" ||
    last === "!" ||
    last === "。" ||
    last === "？" ||
    last === "！" ||
    last === "…"
  );
}

/** Reject endpoint close on dangling fragments like "The." mid-thought (Intercall keeps one block). */
export function endsWithIncompleteSentenceFragment(text: string): boolean {
  const t = text.trimEnd();
  if (!t.length) return false;
  const clauses = t.split(/(?<=[.!?])\s+/u);
  const tail = (clauses[clauses.length - 1] ?? "").trim();
  if (tail.length <= 5 && /^[A-Za-z]{1,4}\.$/u.test(tail)) return true;
  if (tail.length <= 6 && /^[A-Za-z]{1,5},$/u.test(tail)) return true;
  return false;
}

/**
 * Intercall-style row close after endpoint — NOT on every `<end>`.
 * Requires: no live tail, sentence-ending committed text, quiet since last token.
 */
export function shouldCloseRowAfterEndpoint(args: {
  row: CanonUtterance;
  endpointPending: boolean;
  wallMs: number;
  lastTokenActivityWallMs: number;
  minCommittedChars?: number;
}): boolean {
  if (!args.endpointPending) return false;
  const committed = utteranceCommittedText(args.row);
  const live = utteranceLiveText(args.row);
  if (!committed.length || live.length > 0) return false;
  if (!endsWithSentenceBoundary(committed)) return false;
  if (endsWithIncompleteSentenceFragment(committed)) return false;
  const min = args.minCommittedChars ?? 12;
  if (committed.trim().length < min) return false;
  if (args.lastTokenActivityWallMs <= 0) return false;
  return args.wallMs - args.lastTokenActivityWallMs >= ENDPOINT_ROW_CLOSE_QUIET_MS;
}
