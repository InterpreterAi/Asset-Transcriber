/**
 * Detect spelled emails / usernames / IDs so Soniox-native rows stay one unit.
 * Used only when chunk-v2 Soniox translation is on.
 */

const SPOKEN_PUNCT = /^(dot|period|at|underscore|dash|com|org|net|edu|gov)(?:\s+com)?\.?$/i;
const LETTER_CHUNK = /^(?:[A-Za-z](?:-[A-Za-z])+\.?|[A-Za-z]{1,4}\.?|[A-Za-z]\s+[A-Za-z]\.?)$/;
const SHORT_HANDLE = /^(?:[A-Za-z][A-Za-z0-9.\-]{0,14})\.?$/;
const SPELLING_CLARIFIER = /^[A-Za-z]\s+is\.?$/i;
const BACKCHANNEL = /^(uh-?huh|mm-?hm|mmhmm|mhm|yeah|yes|ok|okay|أها|مم-?هم)\.?$/iu;

export function looksLikeBackchannel(text: string): boolean {
  return BACKCHANNEL.test(text.trim());
}

export function looksLikeSpelledAlphanumeric(text: string): boolean {
  const t = text.trim().replace(/[?!؟]+$/u, "").trim();
  if (!t || t.length > 28) return false;
  if (looksLikeBackchannel(t)) return false;
  if (SPOKEN_PUNCT.test(t) || SPELLING_CLARIFIER.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return words.every(
    (w) => SPOKEN_PUNCT.test(w) || LETTER_CHUNK.test(w) || SHORT_HANDLE.test(w),
  );
}

/** Keep the current row open when the next scrap is still spelling (same speaker). */
export function shouldHoldSpelledAlphanumericRow(
  committed: string,
  incoming: string,
): boolean {
  const src = committed.trim();
  const next = incoming.trim();
  if (!src || !looksLikeSpelledAlphanumeric(src)) return false;
  if (!next) return true;
  if (looksLikeBackchannel(next)) return false;
  return looksLikeSpelledAlphanumeric(next) || looksLikeSpelledAlphanumeric(`${src} ${next}`);
}

/**
 * When the original is a spelled fragment, restore email punctuation in the
 * Soniox translation instead of leaving spoken words (نقطة / dot).
 */
export function repairSpokenEmailTranslation(source: string, translation: string): string {
  if (!translation || !looksLikeSpelledAlphanumeric(source)) return translation;
  let t = translation;
  t = t.replace(/نقطة\s+كوم\.?/giu, ".com");
  t = t.replace(/\bdot\s+com\.?/gi, ".com");
  t = t.replace(/نقطة/gu, ".");
  t = t.replace(/\bdot\b/gi, ".");
  t = t.replace(/\s*يعني\s*\??/gu, "");
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([.])/g, "$1").replace(/\.{2,}/g, ".").trim();
  return t;
}
