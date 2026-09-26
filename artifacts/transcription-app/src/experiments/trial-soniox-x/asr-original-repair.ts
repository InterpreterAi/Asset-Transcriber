/**
 * Trial · Soniox X only.
 *
 * Soniox STT often substitutes a more-common lookalike for what was spoken
 * (هايج → هاجي, أتنك → أتنى). That corrupts the ORIGINAL column before any
 * translation pin runs. These repairs restore the spoken form when context
 * makes the swap unambiguous — they do not invent new content.
 */

/** Sexual / arousal cues that make هاجي→هايج safe (not travel “I’ll come”). */
const SEXUAL_OR_AROUSAL_CTX =
  /أتنك|أتناك|أتنى|اتنك|تتناك|أنيك|انيك|ينيك|تنيك|زبي|زب[ّ]?|كس[ّ]?|نيك|شرموطة|قحبة|عايزة\s*أ?تن|عايز\s*أ?تن|هيج|هيّج|هايج/u;

const AROUSAL_FEEL =
  /(?:حاسة|حاسه|حاسّة|حاسس|حاسيس)\s*إن\s*(?:أنا\s*)?هاجي/u;

/**
 * Fix known Soniox original-column ASR swaps. Display + pin path only —
 * never softens meaning; only restores likely spoken forms.
 */
export function repairSpokenOriginalAsr(original: string): string {
  if (!original.trim()) return original;
  let out = original;

  // Truncated sexual verb (أتنى ← أتنك / أتناك)
  out = out.replace(/أتنى(?!ك)/gu, "أتنك");
  out = out.replace(/اتنى(?!ك)/gu, "اتنك");

  const hayjiCount = (out.match(/هاجي/gu) ?? []).length;
  const sexual = SEXUAL_OR_AROUSAL_CTX.test(out) || AROUSAL_FEEL.test(out) || hayjiCount >= 3;

  if (sexual) {
    // هايج (horny) is routinely mis-heard as هاجي (I will come).
    out = out.replace(/هاجي/gu, "هايج");
  } else {
    // Soft arousal framing without other sexual words yet.
    out = out.replace(AROUSAL_FEEL, (m) => m.replace(/هاجي/u, "هايج"));
  }

  // هيجي (will come, 3rd person) next to arousal slang — leave alone unless
  // clearly "أنا هيجي" self-arousal mishear (rare). Skip.

  return out;
}
