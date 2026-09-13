/**
 * Arabic 2nd-person gender when English addresses the *interpreter*.
 *
 * Soniox often defaults "you" → feminine (منكِ / تترجمي) even when the
 * interpreter is male. Patient-directed "you" must keep clinical gender —
 * only rewrite clear interpreter-directed lines.
 *
 * Default: app interpreter is male until a UI preference exists.
 */

const INTERPRETER_DIRECTED_EN =
  /\b(?:translat(?:e|es|ed|ing|ion)?|interpret(?:er|s|ed|ing)?|relay(?:s|ed|ing)?|let (?:her|him|them) know|tell (?:her|him|them)|ask (?:her|him|them)|inform (?:her|him|them)|need you to|want you to|could you|can you(?: please)?|if you could|please (?:tell|ask|let|inform|translate|interpret)|introduce yourself)\b/i;

/** Feminine 2nd-person / imperative forms → masculine (interpreter default). */
const FEMININE_TO_MASCULINE: readonly [RegExp, string][] = [
  [/تترجمين?/gu, "تترجم"],
  [/ترجمي/gu, "ترجم"],
  [/تبلّغين?|تبلغين?/gu, "تبلغ"],
  [/تُبلغي|تبلغي/gu, "تبلغ"],
  [/تخبرين?/gu, "تخبر"],
  [/أخبريني/gu, "أخبرني"],
  [/أخبري/gu, "أخبر"],
  [/تقولين?/gu, "تقول"],
  [/قولي/gu, "قل"],
  [/تسألين?/gu, "تسأل"],
  [/اسألي|أسألي/gu, "اسأل"],
  [/تعرّفين؟|تعرفين؟/gu, "تعرف؟"],
  [/تعرّفين?|تعرفين?/gu, "تعرف"],
  [/عرّفي بنفسكِ?|عرفي بنفسكِ?/gu, "عرّف بنفسك"],
  [/تعرّفي بنفسكِ?|تعرفي بنفسكِ?/gu, "تعرف بنفسك"],
  [/منكِ/gu, "منك"],
  [/لكِ/gu, "لك"],
  [/عنكِ/gu, "عنك"],
  [/أنتِ/gu, "أنتَ"],
  [/إليكِ/gu, "إليك"],
  [/بنفسكِ/gu, "بنفسك"],
];

export function isInterpreterDirectedEnglish(original: string): boolean {
  return INTERPRETER_DIRECTED_EN.test(original);
}

/**
 * When EN→AR and the English line addresses the interpreter, force masculine
 * 2nd-person forms so a male interpreter is not marked female.
 */
export function repairArabicInterpreterAddress(
  translation: string,
  originalEnglish: string,
): string {
  if (!translation.trim() || !isInterpreterDirectedEnglish(originalEnglish)) {
    return translation;
  }
  let out = translation;
  for (const [re, rep] of FEMININE_TO_MASCULINE) {
    out = out.replace(re, rep);
  }
  return out;
}
