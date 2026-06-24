/**
 * Lightweight post-MT fixes for medical / legal / insurance terminology (Hetzner Libre + NLLB).
 * Applied after machine translation returns, before client response.
 */

function baseLang(code: string): string {
  return (code || "en").split("-")[0]!.toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace leftover English domain terms in Arabic output with formal Arabic equivalents. */
function fixEnglishLeakageInArabicOutput(text: string): string {
  const pairs: readonly [RegExp, string][] = [
    [/\bblood pressure\b/gi, "ضغط الدم"],
    [/\bdiabetes\b/gi, "مرض السكري"],
    [/\bprescription\b/gi, "وصفة طبية"],
    [/\binsurance\b/gi, "تأمين"],
    [/\bsurgery\b/gi, "عملية جراحية"],
    [/\bdiagnosis\b/gi, "تشخيص"],
    [/\bsymptoms\b/gi, "أعراض"],
    [/\bsymptom\b/gi, "عرض"],
    [/\binflammation\b/gi, "التهاب"],
    [/\bfracture\b/gi, "كسر"],
    [/\bX-?ray\b/gi, "أشعة سينية"],
  ];
  let out = text;
  for (const [re, replacement] of pairs) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Common Arabic→English MT errors on the Hetzner/Libre path. */
function fixArabicToEnglishErrors(translated: string, sourceText: string): string {
  let out = translated;
  const src = sourceText;

  if (/\bرجل\b/u.test(src) && /\bmy man\b/i.test(out)) {
    out = out.replace(/\bmy man\b/gi, "my leg");
  }

  if (/\bمو\b/u.test(src)) {
    out = out.replace(/\bMoe\b/g, "not");
  }

  if (/\bرجعي\b/u.test(src)) {
    out = out.replace(new RegExp(`\\b${escapeRegex("retroactivity")}\\b`, "gi"), "come back");
  }

  if (/\b(يمين|على اليمين)\b/u.test(src)) {
    out = out.replace(/\bAmen\b/g, "to the right");
  }

  return out;
}

/**
 * Correct common medical/legal/insurance terminology failures after machine translation.
 * @param sourceText — original segment (for context-sensitive ar→en fixes).
 */
export function applyProfessionalTerminologyFixes(
  text: string,
  sourceLang: string,
  targetLang: string,
  opts?: { sourceText?: string },
): string {
  if (!text.trim()) return text;

  const src = baseLang(sourceLang);
  const tgt = baseLang(targetLang);
  let out = text;

  if (tgt === "ar") {
    out = fixEnglishLeakageInArabicOutput(out);
  }

  if (src === "ar" && tgt === "en") {
    out = fixArabicToEnglishErrors(out, opts?.sourceText ?? "");
  }

  // Spanish → English corrections (Hetzner-specific failures)
  if (src === "es" && tgt === "en") {
    out = out.replace(/\boctopist\b/gi, "ophthalmologist");
    out = out.replace(/\bocupist\b/gi, "ophthalmologist");
    out = out.replace(/\bokulist\b/gi, "ophthalmologist");
    out = out.replace(/\bany\.\./gi, "");
    out = out.replace(/\bCualquier\b/g, "Any");
  }

  if (src === "en" && tgt === "es") {
    out = out.replace(/\bophthalmologist\b/gi, "oftalmólogo");
    out = out.replace(/\beye doctor\b/gi, "oftalmólogo");
  }

  return out;
}
