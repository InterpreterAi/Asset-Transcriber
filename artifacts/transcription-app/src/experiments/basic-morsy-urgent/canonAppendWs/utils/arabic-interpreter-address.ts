/**
 * Arabic gender repairs for interpreter sessions (EN→AR).
 *
 * 1) Interpreter address: Soniox often marks "you" feminine; default male.
 * 2) Ungendered "patient": Soniox often emits مريضة from "a patient" with no
 *    she/her — use masculine/generic مريض unless English marks a female patient.
 * 3) Male addressee (he/him on the line, or sticky session gender): rewrite
 *    feminine 2nd-person forms so the patient is not marked female by default.
 */

const INTERPRETER_DIRECTED_EN =
  /\b(?:translat(?:e|es|ed|ing|ion)?|interpret(?:er|s|ed|ing)?|relay(?:s|ed|ing)?|let (?:her|him|them) know|tell (?:her|him|them)|ask (?:her|him|them)|inform (?:her|him|them)|need you to|want you to|could you|can you(?: please)?|if you could|please (?:tell|ask|let|inform|translate|interpret)|introduce yourself)\b/i;

const FEMALE_PATIENT_EN =
  /\b(?:she|her|hers|herself|female\s+patient|woman\s+patient|lady\s+patient|pregnant(?:\s+patient)?|Ms\.|Mrs\.|girl\b)\b/i;

const MALE_PATIENT_EN =
  /\b(?:he|him|his|himself|male\s+patient|boy|gentleman|Mr\.|sir)\b/i;

/** Strong markers only — "her"/"his" alone are too ambiguous (doctor vs patient). */
const MALE_ADDRESSEE_STRONG =
  /\b(?:he|him|himself|male\s+patient|boy|gentleman)\b/i;
const FEMALE_ADDRESSEE_STRONG =
  /\b(?:she|herself|female\s+patient|woman\s+patient|lady\s+patient|pregnant(?:\s+patient)?)\b/i;

/** Feminine 2nd-person / imperative forms → masculine (patient or interpreter). */
const FEMININE_TO_MASCULINE: readonly [RegExp, string][] = [
  [/أيتها المترجمة/gu, "أيها المترجم"],
  [/أيتها المترجم(?!ة)/gu, "أيها المترجم"],
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
  [/ستتمكنين/gu, "ستتمكن"],
  [/ستتلقين/gu, "ستتلقى"],
  [/تحتاجين/gu, "تحتاج"],
  [/تحتاجي(?=[\s.,!?؟،]|$)/gu, "تحتاج"],
  [/تذهبين/gu, "تذهب"],
  [/تعرّفين؟|تعرفين؟/gu, "تعرف؟"],
  [/تعرّفين?|تعرفين?/gu, "تعرف"],
  [/عرّفي بنفسكِ?|عرفي بنفسكِ?/gu, "عرّف بنفسك"],
  [/تعرّفي بنفسكِ?|تعرفي بنفسكِ?/gu, "تعرف بنفسك"],
  [/يمكنكِ/gu, "يمكنك"],
  [/يناسبكِ/gu, "يناسبك"],
  [/ميلادكِ/gu, "ميلادك"],
  [/عنوانكِ/gu, "عنوانك"],
  [/وزنكِ/gu, "وزنك"],
  [/ساقكِ/gu, "ساقك"],
  [/يومكِ/gu, "يومك"],
  [/ألمكِ/gu, "ألمك"],
  [/لديكِ/gu, "لديك"],
  [/دعيني/gu, "دعني"],
  [/مسجّلة|مسجلة/gu, "مسجّل"],
  [/شكرًا لكِ|شكراً لكِ|شكرا لكِ/gu, "شكرًا لك"],
  [/منكِ/gu, "منك"],
  [/لكِ/gu, "لك"],
  [/عنكِ/gu, "عنك"],
  [/أنتِ/gu, "أنتَ"],
  [/إليكِ/gu, "إليك"],
  [/بنفسكِ/gu, "بنفسك"],
];

/** Feminine patient noun → masculine/generic when English did not mark female. */
const FEMALE_PATIENT_NOUN: readonly [RegExp, string][] = [
  [/للمريضة/gu, "للمريض"],
  [/بالمريضة/gu, "بالمريض"],
  [/والمريضة/gu, "والمريض"],
  [/المريضة/gu, "المريض"],
  [/مريضة/gu, "مريض"],
];

export type ArabicAddresseeGender = "m" | "f";

export type ArabicGenderRepairOpts = {
  /** Sticky gender inferred earlier in the same call. */
  sessionAddresseeGender?: ArabicAddresseeGender;
};

export function isInterpreterDirectedEnglish(original: string): boolean {
  return INTERPRETER_DIRECTED_EN.test(original);
}

export function englishMarksFemalePatient(original: string): boolean {
  return FEMALE_PATIENT_EN.test(original);
}

export function englishMarksMalePatient(original: string): boolean {
  return MALE_PATIENT_EN.test(original);
}

/** Infer addressee gender from one English line (undefined if unclear/conflict). */
export function inferEnglishAddresseeGender(
  original: string,
): ArabicAddresseeGender | undefined {
  const male = MALE_ADDRESSEE_STRONG.test(original);
  const female = FEMALE_ADDRESSEE_STRONG.test(original);
  if (male && !female) return "m";
  if (female && !male) return "f";
  return undefined;
}

function applyFeminineToMasculine(translation: string): string {
  let out = translation;
  for (const [re, rep] of FEMININE_TO_MASCULINE) {
    out = out.replace(re, rep);
  }
  return out;
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
  return applyFeminineToMasculine(translation);
}

/**
 * When English says "a/the/my patient" with no female markers, do not keep
 * Soniox's default مريضة — use مريض.
 */
export function repairArabicUngenderedPatient(
  translation: string,
  originalEnglish: string,
): string {
  if (!translation.trim()) return translation;
  if (!/\bpatients?\b/i.test(originalEnglish)) return translation;
  if (englishMarksFemalePatient(originalEnglish)) return translation;
  let out = translation;
  for (const [re, rep] of FEMALE_PATIENT_NOUN) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Apply all EN→AR Arabic gender session repairs.
 * Male line markers or sticky session male → rewrite feminine 2nd-person.
 * Female markers win for that line (do not masculinize).
 */
export function repairArabicSessionGender(
  translation: string,
  originalEnglish: string,
  opts?: ArabicGenderRepairOpts,
): string {
  let out = repairArabicInterpreterAddress(translation, originalEnglish);
  out = repairArabicUngenderedPatient(out, originalEnglish);

  const lineGender = inferEnglishAddresseeGender(originalEnglish);
  if (lineGender === "f") return out;

  const useMale =
    lineGender === "m" ||
    (lineGender === undefined && opts?.sessionAddresseeGender === "m");
  if (useMale) {
    out = applyFeminineToMasculine(out);
  }
  return out;
}
