/**
 * Detect an open row whose committed text still ends inside a word.
 * Soniox emits subword finals (e.g. "mor" then "ning."); freezing the row
 * between them from language/speaker flicker produces "Good mor" / "ning.".
 * Chunk-v2 only — suppress splits until a word boundary is reached.
 */

export function isChunkV2OpenRowMidWord(text: string): boolean {
  const raw = text ?? "";
  if (!raw.length) return false;
  // Trailing whitespace → previous word already closed.
  if (/\s$/u.test(raw)) return false;
  // Sentence / clause punctuation → safe boundary.
  if (/[.!?؟،,;:…]$/u.test(raw)) return false;
  // Letter / digit / combining mark → still inside a word stem.
  return /[\p{L}\p{N}\p{M}]$/u.test(raw);
}
