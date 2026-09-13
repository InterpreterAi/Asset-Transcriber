/**
 * Small AR↔EN intent / clinical phrase repairs for chunk-v2 native translation.
 * Paint-time only — does not rewrite Original.
 */

/** Levantine/Gulf "تبعتلي / ابعثلي" = imperative "send me", not past "you sent me". */
const SEND_ME_AR =
  /(?:^|[\s،,])(?:أنا\s+)?(?:تبع(?:ت)?لي|تبعتلي|ابعثلي|أبعثلي|ارسليلي|أرسليلي|رسليلي)/u;

/**
 * When Original is Arabic asking to be sent something, fix Soniox EN past tense.
 */
export function repairArabicSendMeImperativeEnglish(
  translation: string,
  originalArabic: string,
): string {
  if (!translation.trim() || !originalArabic.trim()) return translation;
  if (!SEND_ME_AR.test(originalArabic) && !/تبعتلي|ابعثلي|أرسلي\s*لي/u.test(originalArabic)) {
    return translation;
  }
  return translation.replace(/\bYou sent me\b/g, "Send me").replace(/\byou sent me\b/g, "send me");
}

/**
 * "burp and fart" must not become القيء والبثور (vomit / pimples).
 */
export function repairArabicBurpFartMistranslation(
  translation: string,
  originalEnglish: string,
): string {
  if (!translation.trim() || !originalEnglish.trim()) return translation;
  const hasBurpOrFart = /\b(?:burp|burps|burping|fart|farts|farting)\b/i.test(originalEnglish);
  if (!hasBurpOrFart) return translation;
  // Same line about real vomiting — leave vomit wording alone.
  if (/\b(?:vomit|vomiting|nauseous|nausea|throw up|threw up)\b/i.test(originalEnglish)) {
    return translation;
  }

  let out = translation;
  out = out.replace(/القيء والبثور/g, "التجشؤ وإخراج الريح");
  out = out.replace(/على القيء/g, "على التجشؤ");
  if (/\bburp/i.test(originalEnglish)) {
    out = out.replace(/القيء/g, "التجشؤ");
  }
  if (/\bfart/i.test(originalEnglish)) {
    out = out.replace(/والبثور/g, "وإخراج الريح");
    out = out.replace(/البثور/g, "إخراج الريح");
    out = out.replace(/بثور/g, "إخراج الريح");
  }
  return out;
}
