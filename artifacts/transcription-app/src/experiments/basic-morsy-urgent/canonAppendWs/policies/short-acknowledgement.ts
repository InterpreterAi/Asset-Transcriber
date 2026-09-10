/**
 * Short interpreter backchannels / acknowledgements.
 * Used only on chunk-v2 row splits so "ها؟" / "Okay." / "Huh?" do not
 * hard-cut every language flicker into its own bubble.
 */

const EXACT =
  /^(?:uh-?huh|mm-?hm+|mhm|yeah|yep|yes|no|ok|okay|right|so|ready|hi|hello|hey|good|great|cool|thanks|thank you|sorry|please|huh|what|نعم|لا|تمام|حسنًا|حسنا|طيب|أها|اه|آه|أيوه|ايوه|ها|إيه|ايه|كويس|حلو|صح|يلا|مرحبا|مرحباً|أهلا|اهلا|مم-?هم+|شوية|شوي)\.?$/iu;

/** Very short punct-only or single glyph acknowledgements. */
const TINY = /^[\s.?؟!,،…\-–—]*$/u;

export function isChunkV2ShortAcknowledgement(text: string): boolean {
  const raw = (text ?? "").trim();
  if (!raw) return true;
  if (TINY.test(raw)) return true;
  const t = raw
    .replace(/^[\s"'«»]+|[\s"'«»]+$/g, "")
    .replace(/[!?؟،,.…]+$/gu, "")
    .trim();
  if (!t) return true;
  if (EXACT.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && t.length <= 8) return true;
  if (words.length === 2 && t.length <= 14 && words.every((w) => w.length <= 8)) {
    return words.every((w) => EXACT.test(w.replace(/[!?؟،,.]+$/gu, "")));
  }
  return false;
}
