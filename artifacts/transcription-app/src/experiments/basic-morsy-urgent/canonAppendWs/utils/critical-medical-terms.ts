/**
 * Critical medical EN↔L2 pins for Soniox chunk-v2 `translation_terms`.
 *
 * Keep this list small and high-stakes only. Full medical packs blow Soniox's
 * ~10k-char context budget and get rejected entirely (worse than no pins).
 *
 * Convention: store as { source: L2, target: EN }. `getInterpreterContext`
 * flips both directions for EN↔L2 pairs.
 */

export type CriticalMedicalTerm = {
  /** English lemma (lowercase match key). */
  en: string;
  /** Curated target forms by ISO base language. */
  translations: Record<string, string>;
  /**
   * Known wrong L2 forms Soniox sometimes invents for this EN lemma.
   * Only used when the EN lemma is in the original and the confused EN
   * sibling is NOT (e.g. cholesterol present, anemia absent).
   */
  confusedL2?: Record<string, string[]>;
};

/**
 * Highest-priority clinical terms that must not be free-translated wrongly.
 * Expand carefully — each row costs context budget on every session that
 * includes that language.
 */
export const CRITICAL_MEDICAL_TERMS: readonly CriticalMedicalTerm[] = [
  {
    en: "cholesterol",
    translations: {
      ar: "الكوليسترول",
      es: "colesterol",
      pt: "colesterol",
      pl: "cholesterol",
      zh: "胆固醇",
      fr: "cholestérol",
      de: "Cholesterin",
      ru: "холестерин",
      hi: "कोलेस्ट्रॉल",
      it: "colesterolo",
      tr: "kolesterol",
      nl: "cholesterol",
      uk: "холестерин",
      vi: "cholesterol",
      ko: "콜레스테롤",
      ja: "コレステロール",
    },
    confusedL2: {
      // User-reported: "for cholesterol" → "لفقر الدم" (anemia).
      ar: ["لفقر الدم", "فقر الدم"],
    },
  },
  {
    en: "anemia",
    translations: {
      ar: "فقر الدم",
      es: "anemia",
      pt: "anemia",
      pl: "anemia",
      zh: "贫血",
      fr: "anémie",
      de: "Anämie",
      ru: "анемия",
      hi: "एनीमिया",
      it: "anemia",
      tr: "anemi",
      nl: "anemie",
      uk: "анемія",
      vi: "thiếu máu",
      ko: "빈혈",
      ja: "貧血",
    },
  },
  {
    en: "atorvastatin",
    translations: {
      ar: "أتورفاستاتين",
      es: "atorvastatina",
      pt: "atorvastatina",
      pl: "atorwastatyna",
      zh: "阿托伐他汀",
      fr: "atorvastatine",
      de: "Atorvastatin",
      ru: "аторвастатин",
      hi: "एटोरवास्टैटिन",
      it: "atorvastatina",
      tr: "atorvastatin",
      nl: "atorvastatine",
      uk: "аторвастатин",
      vi: "atorvastatin",
      ko: "아토르바스타틴",
      ja: "アトルバスタチン",
    },
  },
  {
    en: "warfarin",
    translations: {
      ar: "الوارفارين",
      es: "warfarina",
      pt: "varfarina",
      pl: "warfaryna",
      zh: "华法林",
      fr: "warfarine",
      de: "Warfarin",
      ru: "варфарин",
      hi: "वारफेरिन",
      it: "warfarin",
      tr: "varfarin",
      nl: "warfarine",
      uk: "варфарин",
      vi: "warfarin",
      ko: "와파린",
      ja: "ワルファリン",
    },
  },
  {
    en: "heparin",
    translations: {
      ar: "الهيبارين",
      es: "heparina",
      pt: "heparina",
      pl: "heparyna",
      zh: "肝素",
      fr: "héparine",
      de: "Heparin",
      ru: "гепарин",
      hi: "हेपरिन",
      it: "eparina",
      tr: "heparin",
      nl: "heparine",
      uk: "гепарин",
      vi: "heparin",
      ko: "헤파린",
      ja: "ヘパリン",
    },
  },
  {
    en: "sepsis",
    translations: {
      ar: "تسمم الدم",
      es: "sepsis",
      pt: "sepse",
      pl: "sepsa",
      zh: "败血症",
      fr: "sepsis",
      de: "Sepsis",
      ru: "сепсис",
      hi: "सेप्सिस",
      it: "sepsi",
      tr: "sepsis",
      nl: "sepsis",
      uk: "сепсис",
      vi: "nhiễm trùng huyết",
      ko: "패혈증",
      ja: "敗血症",
    },
  },
  {
    en: "hypoglycemia",
    translations: {
      ar: "نقص سكر الدم",
      es: "hipoglucemia",
      pt: "hipoglicemia",
      pl: "hipoglikemia",
      zh: "低血糖",
      fr: "hypoglycémie",
      de: "Hypoglykämie",
      ru: "гипогликемия",
      hi: "हाइपोग्लाइसीमिया",
      it: "ipoglicemia",
      tr: "hipoglisemi",
      nl: "hypoglykemie",
      uk: "гіпоглікемія",
      vi: "hạ đường huyết",
      ko: "저혈당",
      ja: "低血糖",
    },
  },
  {
    en: "hyperglycemia",
    translations: {
      ar: "ارتفاع سكر الدم",
      es: "hiperglucemia",
      pt: "hiperglicemia",
      pl: "hiperglikemia",
      zh: "高血糖",
      fr: "hyperglycémie",
      de: "Hyperglykämie",
      ru: "гипергликемия",
      hi: "हाइपरग्लाइसीमिया",
      it: "iperglicemia",
      tr: "hiperglisemi",
      nl: "hyperglykemie",
      uk: "гіперглікемія",
      vi: "tăng đường huyết",
      ko: "고혈당",
      ja: "高血糖",
    },
  },
  {
    en: "aspirin",
    translations: {
      ar: "الأسبرين",
      es: "aspirina",
      pt: "aspirina",
      pl: "aspiryna",
      zh: "阿司匹林",
      fr: "aspirine",
      de: "Aspirin",
      ru: "аспирин",
      hi: "एस्पिरिन",
      it: "aspirina",
      tr: "aspirin",
      nl: "aspirine",
      uk: "аспірин",
      vi: "aspirin",
      ko: "아스피린",
      ja: "アスピリン",
    },
  },
  {
    en: "ibuprofen",
    translations: {
      ar: "الإيبوبروفين",
      es: "ibuprofeno",
      pt: "ibuprofeno",
      pl: "ibuprofen",
      zh: "布洛芬",
      fr: "ibuprofène",
      de: "Ibuprofen",
      ru: "ибупрофен",
      hi: "इबुप्रोफेन",
      it: "ibuprofene",
      tr: "ibuprofen",
      nl: "ibuprofen",
      uk: "ібупрофен",
      vi: "ibuprofen",
      ko: "이부프로펜",
      ja: "イブプロフェン",
    },
  },
  {
    en: "vaccine",
    translations: {
      ar: "لقاح",
      es: "vacuna",
      pt: "vacina",
      pl: "szczepionka",
      zh: "疫苗",
      fr: "vaccin",
      de: "Impfstoff",
      ru: "вакцина",
      hi: "वैक्सीन",
      it: "vaccino",
      tr: "aşı",
      nl: "vaccin",
      uk: "вакцина",
      vi: "vắc xin",
      ko: "백신",
      ja: "ワクチン",
    },
  },
  {
    en: "vaccination",
    translations: {
      ar: "تطعيم",
      es: "vacunación",
      pt: "vacinação",
      pl: "szczepienie",
      zh: "疫苗接种",
      fr: "vaccination",
      de: "Impfung",
      ru: "вакцинация",
      hi: "टीकाकरण",
      it: "vaccinazione",
      tr: "aşılama",
      nl: "vaccinatie",
      uk: "вакцинація",
      vi: "tiêm chủng",
      ko: "예방접종",
      ja: "予防接種",
    },
  },
  {
    en: "MMR",
    translations: {
      ar: "لقاح الحصبة والنكاف والحصبة الألمانية",
      es: "triple vírica",
      pt: "tríplice viral",
      pl: "MMR",
      zh: "麻腮风疫苗",
      fr: "ROR",
      de: "MMR",
      ru: "КПК",
      hi: "एमएमआर",
      it: "MPR",
      tr: "KKK",
      nl: "BMR",
      uk: "КПК",
      vi: "MMR",
      ko: "MMR",
      ja: "MMR",
    },
  },
  {
    en: "metformin",
    translations: {
      ar: "الميتفورمين",
      es: "metformina",
      pt: "metformina",
      pl: "metformina",
      zh: "二甲双胍",
      fr: "metformine",
      de: "Metformin",
      ru: "метформин",
      hi: "मेटफॉर्मिन",
      it: "metformina",
      tr: "metformin",
      nl: "metformine",
      uk: "метформін",
      vi: "metformin",
      ko: "메트포르민",
      ja: "メトホルミン",
    },
  },
  {
    en: "insulin",
    translations: {
      ar: "الأنسولين",
      es: "insulina",
      pt: "insulina",
      pl: "insulina",
      zh: "胰岛素",
      fr: "insuline",
      de: "Insulin",
      ru: "инсулин",
      hi: "इंसुलिन",
      it: "insulina",
      tr: "insülin",
      nl: "insuline",
      uk: "інсулін",
      vi: "insulin",
      ko: "인슐린",
      ja: "インスリン",
    },
  },
];

/** EN lemmas that must win context budget over lower-priority body-part dumps. */
export const CRITICAL_MEDICAL_EN_SET = new Set(
  CRITICAL_MEDICAL_TERMS.map((t) => t.en.toLowerCase()),
);

export type SonioxBidiTerm = { source: string; target: string };

/** L2→EN rows for one language (builder flips for EN→L2). */
export function criticalMedicalTermsForLang(lang: string): SonioxBidiTerm[] {
  const base = lang.split("-")[0]!.toLowerCase();
  const out: SonioxBidiTerm[] = [];
  for (const row of CRITICAL_MEDICAL_TERMS) {
    const l2 = row.translations[base];
    if (!l2) continue;
    out.push({ source: l2, target: row.en });
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEnLemma(text: string, lemma: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(lemma)}(?![A-Za-z0-9])`, "i");
  return re.test(text);
}

function replacePhrase(text: string, from: string, to: string): string {
  const re = new RegExp(escapeRegExp(from), "gi");
  return text.replace(re, to);
}

/**
 * Thin safety net after Soniox native translation:
 * 1) Replace Latin EN leaks of critical terms with curated L2.
 * 2) Replace known confusion phrases (cholesterol→فقر الدم) only when the
 *    EN lemma is present in the original and the confused sibling is not.
 *
 * Does not touch Libre/OpenAI paths — callers are chunk-v2 only.
 */
export function applyCriticalMedicalNativeRepair(
  translationText: string,
  originalText: string,
  targetLang: string,
): string {
  const tgt = targetLang.split("-")[0]!.toLowerCase();
  const original = originalText.trim();
  let out = translationText;
  if (!original || !out.trim()) return translationText;

  for (const row of CRITICAL_MEDICAL_TERMS) {
    const correct = row.translations[tgt];
    if (!correct) continue;
    if (!hasEnLemma(original, row.en)) continue;

    // Latin leak of the EN lemma still sitting in the translation column.
    if (hasEnLemma(out, row.en)) {
      out = out.replace(
        new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(row.en)}(?![A-Za-z0-9])`, "gi"),
        correct,
      );
    }

    const confused = row.confusedL2?.[tgt];
    if (!confused?.length) continue;

    // Do not apply confusion repair if original also contains a sibling that
    // legitimately maps to the confused phrase (e.g. both cholesterol + anemia).
    const siblingConflict = CRITICAL_MEDICAL_TERMS.some(
      (other) =>
        other.en !== row.en &&
        hasEnLemma(original, other.en) &&
        (other.translations[tgt] === confused[0] ||
          confused.some((c) => other.translations[tgt] === c)),
    );
    if (siblingConflict) continue;

    if (out.includes(correct)) continue;

    for (const wrong of confused) {
      if (out.includes(wrong)) {
        out = replacePhrase(out, wrong, correct);
      }
    }
  }

  return out;
}
